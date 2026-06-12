"""Query/service layer sitting between the API routes and the database.

Keeps SQL + dataframe assembly out of the route handlers so the same helpers
can be unit-tested without spinning up FastAPI.
"""
from __future__ import annotations

from datetime import date

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.backtest import run_backtest
from app.analytics.sector import sector_narrative, sector_stats
from app.models import Bond, MarketData, Residual, Signal, Spread
from app.schemas import (
    BacktestOut,
    CurvePoint,
    IssuerCurveOut,
    RVRow,
    SectorComparison,
    SectorStat,
)


def latest_trade_date(db: Session) -> date | None:
    return db.execute(select(func.max(Spread.trade_date))).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Relative-value tables
# --------------------------------------------------------------------------- #
def _residual_join_today(db: Session, asof: date) -> pd.DataFrame:
    rows = db.execute(
        select(
            Residual.cusip,
            Residual.actual_spread,
            Residual.model_spread,
            Residual.residual,
            Residual.z_score,
            Residual.percentile,
            Bond.issuer,
            Bond.rating,
            Bond.sector,
            Bond.maturity,
        )
        .join(Bond, Bond.cusip == Residual.cusip)
        .where(Residual.trade_date == asof)
    ).all()
    return pd.DataFrame(
        rows,
        columns=[
            "cusip", "actual_spread", "model_spread", "residual",
            "z_score", "percentile", "issuer", "rating", "sector", "maturity",
        ],
    )


def _classify(z: float, threshold: float = 2.0) -> str:
    return "CHEAP" if z > threshold else "RICH" if z < -threshold else "FAIR"


def rv_rows(db: Session, asof: date, cheapest: bool, limit: int = 20) -> list[RVRow]:
    df = _residual_join_today(db, asof)
    if df.empty:
        return []
    df = df.sort_values("z_score", ascending=not cheapest)
    df = df.head(limit)
    return [
        RVRow(
            cusip=r.cusip,
            issuer=r.issuer,
            rating=r.rating,
            sector=r.sector,
            maturity=r.maturity,
            current_spread=round(r.actual_spread, 2),
            model_spread=round(r.model_spread, 2),
            residual=round(r.residual, 2),
            z_score=round(r.z_score, 3),
            percentile=round(r.percentile, 1),
            classification=_classify(r.z_score),
        )
        for r in df.itertuples()
    ]


# --------------------------------------------------------------------------- #
# Issuer curve viewer
# --------------------------------------------------------------------------- #
def issuer_curve(db: Session, issuer: str, asof: date) -> IssuerCurveOut | None:
    from app.analytics.curves import fit_issuer_curve

    rows = db.execute(
        select(
            Spread.cusip,
            Spread.z_spread,
            Bond.maturity,
        )
        .join(Bond, Bond.cusip == Spread.cusip)
        .where(Spread.trade_date == asof, Bond.issuer == issuer)
    ).all()
    if not rows:
        return None

    import numpy as np

    points: list[CurvePoint] = []
    tenors, spreads = [], []
    for cusip, zsp, maturity in rows:
        ty = (maturity - asof).days / 365.0
        tenors.append(ty)
        spreads.append(zsp)
    curve = fit_issuer_curve(np.array(tenors), np.array(spreads), method="auto")

    for cusip, zsp, maturity in rows:
        ty = (maturity - asof).days / 365.0
        model = float(curve(ty))
        points.append(
            CurvePoint(
                cusip=cusip,
                maturity_years=round(ty, 2),
                actual_spread=round(zsp, 2),
                model_spread=round(model, 2),
                residual=round(zsp - model, 2),
            )
        )
    points.sort(key=lambda p: p.maturity_years)

    dense = np.linspace(min(tenors), max(tenors), 50)
    fitted = curve(dense)
    return IssuerCurveOut(
        issuer=issuer,
        trade_date=asof,
        method=curve.method,
        points=points,
        fitted_tenors=[round(float(t), 3) for t in dense],
        fitted_spreads=[round(float(s), 2) for s in fitted],
    )


# --------------------------------------------------------------------------- #
# Sector RV
# --------------------------------------------------------------------------- #
def sector_comparison(db: Session, asof: date) -> SectorComparison:
    rows = db.execute(
        select(Bond.sector, Spread.z_spread)
        .join(Bond, Bond.cusip == Spread.cusip)
        .where(Spread.trade_date == asof)
    ).all()
    df = pd.DataFrame(rows, columns=["sector", "z_spread"])
    stats = sector_stats(df)
    return SectorComparison(
        trade_date=asof,
        sectors=[
            SectorStat(
                sector=r.sector,
                avg_spread=round(r.avg_spread, 2),
                z_score=round(r.z_score, 3),
                percentile=round(r.percentile, 1),
                n_bonds=int(r.n_bonds),
            )
            for r in stats.itertuples()
        ],
        narrative=sector_narrative(stats),
    )


# --------------------------------------------------------------------------- #
# Backtest
# --------------------------------------------------------------------------- #
def backtest(db: Session, entry_z: float = 2.0, exit_z: float = 0.0) -> BacktestOut:
    rows = db.execute(
        select(Residual.cusip, Residual.trade_date, Residual.z_score, Residual.residual)
    ).all()
    panel = pd.DataFrame(rows, columns=["cusip", "trade_date", "z_score", "residual"])
    report = run_backtest(panel, entry_z=entry_z, exit_z=exit_z)
    return BacktestOut(
        entry_z=report.entry_z,
        exit_z=report.exit_z,
        n_trades=report.n_trades,
        hit_rate=round(report.hit_rate, 4),
        avg_reversion_bps=round(report.avg_reversion_bps, 2),
        sharpe=round(report.sharpe, 3),
        max_drawdown_bps=round(report.max_drawdown_bps, 2),
    )


def spread_history(db: Session, cusip: str) -> list[dict]:
    rows = db.execute(
        select(
            Spread.trade_date,
            Spread.g_spread,
            Spread.i_spread,
            Spread.z_spread,
            Spread.oas,
        )
        .where(Spread.cusip == cusip)
        .order_by(Spread.trade_date)
    ).all()
    return [
        {
            "trade_date": d.isoformat(),
            "g_spread": g,
            "i_spread": i,
            "z_spread": z,
            "oas": o,
        }
        for d, g, i, z, o in rows
    ]


def residual_distribution(db: Session, asof: date) -> list[float]:
    rows = db.execute(
        select(Residual.z_score).where(Residual.trade_date == asof)
    ).scalars().all()
    return [round(float(z), 3) for z in rows]
