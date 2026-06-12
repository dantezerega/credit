"""Daily ingestion + analytics pipeline.

Orchestrates the full chain:

    generate/ingest  ->  validate  ->  persist raw  ->  compute spreads
                     ->  fit issuer curves / residuals  ->  generate signals

Each stage is idempotent (upsert by natural key) so the pipeline can be re-run
for a date without creating duplicates — the same contract a real daily batch
needs.
"""
from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.analytics.cashflows import generate_cashflows, modified_duration
from app.analytics.oas import simplified_oas
from app.analytics.relative_value import build_residual_panel
from app.analytics.signals import generate_signal, reversion_frequency
from app.analytics.zspread import all_spreads, yield_to_maturity
from app.analytics.curves import TreasuryCurve
from app.config import settings
from app.ingestion.sample_data import generate_sample_dataset
from app.ingestion.validation import (
    forward_fill_prices,
    validate_bond_reference,
    validate_market_data,
)
from app.models import (
    Bond,
    MarketData,
    Residual,
    Signal,
    Spread,
    TreasuryCurve as TreasuryCurveModel,
)

logger = logging.getLogger("pipeline")


# --------------------------------------------------------------------------- #
# Stage 1: ingest raw data
# --------------------------------------------------------------------------- #
def load_sample_data(db: Session, days: int = 180, asof: date | None = None) -> None:
    """Generate the synthetic dataset, validate it, and persist raw tables."""
    data = generate_sample_dataset(asof=asof, days=days)

    ref_report = validate_bond_reference(data.bonds)
    if not ref_report.ok:
        raise ValueError(f"bond reference invalid: {ref_report.errors}")

    md_clean, md_report = validate_market_data(data.market_data)
    md_clean, n_missing = forward_fill_prices(md_clean)
    logger.info(
        "market data validated: rows=%s dropped=%s filled=%s warnings=%s",
        md_report.n_rows,
        md_report.n_dropped,
        n_missing,
        md_report.warnings,
    )

    # Wipe and reload (sample loader is a full refresh).
    for model in (Signal, Residual, Spread, MarketData, TreasuryCurveModel, Bond):
        db.execute(delete(model))
    db.commit()

    db.add_all(
        Bond(
            cusip=r.cusip,
            issuer=r.issuer,
            sector=r.sector,
            rating=r.rating,
            coupon=float(r.coupon),
            maturity=r.maturity,
            issue_date=r.issue_date,
            face_value=float(r.face_value),
            coupon_freq=int(r.coupon_freq),
        )
        for r in data.bonds.itertuples()
    )
    db.add_all(
        TreasuryCurveModel(
            curve_date=r.curve_date,
            tenor_years=float(r.tenor_years),
            par_yield=float(r.par_yield),
        )
        for r in data.treasury.itertuples()
    )
    db.add_all(
        MarketData(
            cusip=r.cusip,
            trade_date=r.trade_date,
            price=float(r.price),
            yield_to_maturity=float(r.yield_to_maturity),
            volume=float(r.volume),
        )
        for r in md_clean.itertuples()
    )
    db.commit()
    logger.info("raw data loaded: %s bonds, %s market rows", len(data.bonds), len(md_clean))


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _treasury_curves_by_date(db: Session) -> dict[date, TreasuryCurve]:
    """Build a ``TreasuryCurve`` object for every curve date in the DB."""
    rows = db.execute(
        select(
            TreasuryCurveModel.curve_date,
            TreasuryCurveModel.tenor_years,
            TreasuryCurveModel.par_yield,
        )
    ).all()
    by_date: dict[date, list[tuple[float, float]]] = {}
    for d, tenor, y in rows:
        by_date.setdefault(d, []).append((tenor, y))
    curves: dict[date, TreasuryCurve] = {}
    for d, pts in by_date.items():
        pts.sort()
        tenors = np.array([p[0] for p in pts])
        yields = np.array([p[1] for p in pts])
        curves[d] = TreasuryCurve(tenors, yields)
    return curves


# --------------------------------------------------------------------------- #
# Stage 2: spreads
# --------------------------------------------------------------------------- #
def compute_and_store_spreads(db: Session) -> int:
    """Compute G/I/Z spreads + OAS for every market-data row and upsert them."""
    bonds = {b.cusip: b for b in db.execute(select(Bond)).scalars()}
    curves = _treasury_curves_by_date(db)
    md_rows = db.execute(select(MarketData)).scalars().all()

    db.execute(delete(Spread))
    out: list[Spread] = []
    for md in md_rows:
        bond = bonds[md.cusip]
        curve = curves.get(md.trade_date)
        if curve is None:
            continue
        res = all_spreads(
            price=md.price,
            settlement=md.trade_date,
            maturity=bond.maturity,
            coupon=bond.coupon,
            freq=bond.coupon_freq,
            treasury=curve,
        )
        # OAS: treat the longest-tenor (>=10y) bonds as callable for variety.
        flows = generate_cashflows(
            md.trade_date, bond.maturity, bond.coupon, bond.coupon_freq
        )
        dur = modified_duration(flows, res["ytm"]) if flows else 1.0
        years_to_mat = (bond.maturity - md.trade_date).days / 365.0
        first_call = None
        if years_to_mat >= 8.0:  # long bonds modelled with a call ~ in 5y
            from datetime import timedelta

            first_call = md.trade_date + timedelta(days=int(5 * 365))
        oas = simplified_oas(
            z_spread=res["z_spread"],
            settlement=md.trade_date,
            first_call_date=first_call,
            modified_duration=dur,
        )
        out.append(
            Spread(
                cusip=md.cusip,
                trade_date=md.trade_date,
                g_spread=round(res["g_spread"], 4),
                i_spread=round(res["i_spread"], 4),
                z_spread=round(res["z_spread"], 4),
                oas=round(oas, 4),
            )
        )
    db.add_all(out)
    db.commit()
    logger.info("computed %s spread rows", len(out))
    return len(out)


# --------------------------------------------------------------------------- #
# Stage 3: residuals
# --------------------------------------------------------------------------- #
def _spread_panel(db: Session, spread_col: str = "z_spread") -> pd.DataFrame:
    """Assemble the long spread panel joined with bond reference + maturity."""
    rows = db.execute(
        select(
            Spread.cusip,
            Spread.trade_date,
            Spread.z_spread,
            Spread.oas,
            Bond.issuer,
            Bond.sector,
            Bond.rating,
            Bond.maturity,
        ).join(Bond, Bond.cusip == Spread.cusip)
    ).all()
    df = pd.DataFrame(rows, columns=[
        "cusip", "trade_date", "z_spread", "oas",
        "issuer", "sector", "rating", "maturity",
    ])
    if df.empty:
        return df
    df["maturity_years"] = df.apply(
        lambda r: (r["maturity"] - r["trade_date"]).days / 365.0, axis=1
    )
    return df


def compute_and_store_residuals(db: Session) -> pd.DataFrame:
    """Fit issuer curves, compute residual panel, upsert residual rows."""
    panel = _spread_panel(db)
    if panel.empty:
        return panel
    resid = build_residual_panel(
        panel,
        spread_col="z_spread",
        method="auto",
        threshold=settings.signal_z_threshold,
        lookback=settings.zscore_lookback_days,
    )
    db.execute(delete(Residual))
    db.add_all(
        Residual(
            cusip=r.cusip,
            trade_date=r.trade_date,
            actual_spread=round(float(r.z_spread), 4),
            model_spread=round(float(r.model_spread), 4),
            residual=round(float(r.residual), 4),
            z_score=round(float(r.z_score), 4),
            percentile=round(float(r.percentile), 2),
        )
        for r in resid.itertuples()
    )
    db.commit()
    logger.info("computed %s residual rows", len(resid))
    return resid


# --------------------------------------------------------------------------- #
# Stage 4: signals (latest date)
# --------------------------------------------------------------------------- #
def generate_and_store_signals(db: Session, resid_panel: pd.DataFrame | None = None) -> int:
    """Generate mean-reversion signals for the most recent trade date."""
    if resid_panel is None or resid_panel.empty:
        resid_panel = _residual_panel_from_db(db)
    if resid_panel.empty:
        return 0

    latest = resid_panel["trade_date"].max()
    today = resid_panel[resid_panel["trade_date"] == latest]

    # Volume lookup for the latest date (liquidity factor).
    vol_rows = db.execute(
        select(MarketData.cusip, MarketData.volume).where(
            MarketData.trade_date == latest
        )
    ).all()
    vol_by_cusip = {c: v for c, v in vol_rows}

    db.execute(delete(Signal).where(Signal.trade_date == latest))
    n = 0
    for _, row in today.iterrows():
        hist = resid_panel[resid_panel["cusip"] == row["cusip"]]["residual"].tolist()
        rev_freq = reversion_frequency(hist, settings.signal_z_threshold)
        sig = generate_signal(
            cusip=row["cusip"],
            z_score=float(row["z_score"]),
            residual=float(row["residual"]),
            volume=float(vol_by_cusip.get(row["cusip"], 0.0)),
            reversion_freq=rev_freq,
            threshold=settings.signal_z_threshold,
        )
        if sig.direction == "FLAT":
            continue
        db.add(
            Signal(
                cusip=sig.cusip,
                trade_date=latest,
                direction=sig.direction,
                z_score=round(sig.z_score, 4),
                residual=round(sig.residual, 4),
                expected_reversion_bps=round(sig.expected_reversion_bps, 4),
                signal_strength=sig.signal_strength,
            )
        )
        n += 1
    db.commit()
    logger.info("generated %s signals for %s", n, latest)
    return n


def _residual_panel_from_db(db: Session) -> pd.DataFrame:
    rows = db.execute(
        select(
            Residual.cusip,
            Residual.trade_date,
            Residual.residual,
            Residual.z_score,
        )
    ).all()
    return pd.DataFrame(rows, columns=["cusip", "trade_date", "residual", "z_score"])


# --------------------------------------------------------------------------- #
# Full pipeline
# --------------------------------------------------------------------------- #
def run_daily_pipeline(db: Session) -> dict[str, int]:
    """Run spreads -> residuals -> signals over already-ingested raw data."""
    n_spreads = compute_and_store_spreads(db)
    resid = compute_and_store_residuals(db)
    n_signals = generate_and_store_signals(db, resid)
    return {"spreads": n_spreads, "residuals": len(resid), "signals": n_signals}


def bootstrap(db: Session, days: int = 180) -> dict[str, int]:
    """One-shot: load sample data then run the full analytics pipeline."""
    load_sample_data(db, days=days)
    return run_daily_pipeline(db)
