"""FastAPI route definitions — the typed HTTP surface."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import service
from app.database import get_db
from app.models import Bond, MarketData, Residual, Signal, Spread
from app.schemas import (
    BacktestOut,
    BondOut,
    DashboardSummary,
    IssuerCurveOut,
    RVRow,
    SectorComparison,
    SignalEnriched,
    SpreadOut,
)

router = APIRouter()


def _resolve_asof(db: Session, asof: date | None) -> date:
    resolved = asof or service.latest_trade_date(db)
    if resolved is None:
        raise HTTPException(404, "no data loaded; run the pipeline first")
    return resolved


# --------------------------------------------------------------------------- #
# Reference / market data
# --------------------------------------------------------------------------- #
@router.get("/bonds", response_model=list[BondOut])
def get_bonds(
    issuer: str | None = None,
    sector: str | None = None,
    rating: str | None = None,
    db: Session = Depends(get_db),
) -> list[Bond]:
    """List bonds, optionally filtered by issuer / sector / rating."""
    stmt = select(Bond)
    if issuer:
        stmt = stmt.where(Bond.issuer == issuer)
    if sector:
        stmt = stmt.where(Bond.sector == sector)
    if rating:
        stmt = stmt.where(Bond.rating == rating)
    return list(db.execute(stmt.order_by(Bond.issuer, Bond.maturity)).scalars())


@router.get("/issuers", response_model=list[str])
def get_issuers(db: Session = Depends(get_db)) -> list[str]:
    """Distinct issuer names."""
    return list(db.execute(select(Bond.issuer).distinct().order_by(Bond.issuer)).scalars())


@router.get("/sectors/list", response_model=list[str])
def get_sector_names(db: Session = Depends(get_db)) -> list[str]:
    return list(db.execute(select(Bond.sector).distinct().order_by(Bond.sector)).scalars())


@router.get("/spreads", response_model=list[SpreadOut])
def get_spreads(
    asof: date | None = None,
    cusip: str | None = None,
    db: Session = Depends(get_db),
) -> list[Spread]:
    """Spread metrics for a date (or full history for one CUSIP)."""
    stmt = select(Spread)
    if cusip:
        stmt = stmt.where(Spread.cusip == cusip).order_by(Spread.trade_date)
        return list(db.execute(stmt).scalars())
    asof = _resolve_asof(db, asof)
    stmt = stmt.where(Spread.trade_date == asof)
    return list(db.execute(stmt).scalars())


@router.get("/spreads/history/{cusip}")
def get_spread_history(cusip: str, db: Session = Depends(get_db)) -> list[dict]:
    """Full G/I/Z/OAS time series for one bond (for the time-series chart)."""
    hist = service.spread_history(db, cusip)
    if not hist:
        raise HTTPException(404, f"no spread history for {cusip}")
    return hist


# --------------------------------------------------------------------------- #
# Relative value
# --------------------------------------------------------------------------- #
@router.get("/rv/cheapest", response_model=list[RVRow])
def get_cheapest(
    asof: date | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[RVRow]:
    """Top-N cheapest bonds (highest positive residual z-score)."""
    return service.rv_rows(db, _resolve_asof(db, asof), cheapest=True, limit=limit)


@router.get("/rv/richest", response_model=list[RVRow])
def get_richest(
    asof: date | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[RVRow]:
    """Top-N richest bonds (most negative residual z-score)."""
    return service.rv_rows(db, _resolve_asof(db, asof), cheapest=False, limit=limit)


@router.get("/residuals/distribution", response_model=list[float])
def get_residual_distribution(
    asof: date | None = None, db: Session = Depends(get_db)
) -> list[float]:
    """Residual z-score distribution for the histogram chart."""
    return service.residual_distribution(db, _resolve_asof(db, asof))


# --------------------------------------------------------------------------- #
# Signals
# --------------------------------------------------------------------------- #
def _enrich_signals(db: Session, signals: list[Signal]) -> list[SignalEnriched]:
    bonds = {b.cusip: b for b in db.execute(select(Bond)).scalars()}
    out = []
    for s in signals:
        b = bonds.get(s.cusip)
        if not b:
            continue
        out.append(
            SignalEnriched(
                cusip=s.cusip,
                trade_date=s.trade_date,
                direction=s.direction,
                z_score=s.z_score,
                residual=s.residual,
                expected_reversion_bps=s.expected_reversion_bps,
                signal_strength=s.signal_strength,
                issuer=b.issuer,
                rating=b.rating,
                sector=b.sector,
                maturity=b.maturity,
            )
        )
    return out


@router.get("/signals", response_model=list[SignalEnriched])
def get_signals(
    asof: date | None = None,
    direction: str | None = None,
    db: Session = Depends(get_db),
) -> list[SignalEnriched]:
    """Active signals for a date, optionally filtered by BUY/SELL."""
    asof = _resolve_asof(db, asof)
    stmt = select(Signal).where(Signal.trade_date == asof)
    if direction:
        stmt = stmt.where(Signal.direction == direction.upper())
    sigs = list(db.execute(stmt.order_by(Signal.signal_strength.desc())).scalars())
    return _enrich_signals(db, sigs)


@router.get("/signals/top", response_model=list[SignalEnriched])
def get_top_signals(
    asof: date | None = None,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[SignalEnriched]:
    """Highest-conviction signals by strength score."""
    asof = _resolve_asof(db, asof)
    stmt = (
        select(Signal)
        .where(Signal.trade_date == asof)
        .order_by(Signal.signal_strength.desc())
        .limit(limit)
    )
    return _enrich_signals(db, list(db.execute(stmt).scalars()))


# --------------------------------------------------------------------------- #
# Issuer curve
# --------------------------------------------------------------------------- #
@router.get("/issuer/{issuer}", response_model=IssuerCurveOut)
def get_issuer_curve(
    issuer: str, asof: date | None = None, db: Session = Depends(get_db)
) -> IssuerCurveOut:
    """Fitted spread curve + residual points for one issuer."""
    curve = service.issuer_curve(db, issuer, _resolve_asof(db, asof))
    if curve is None:
        raise HTTPException(404, f"no curve data for issuer {issuer}")
    return curve


# --------------------------------------------------------------------------- #
# Sector RV
# --------------------------------------------------------------------------- #
@router.get("/sectors", response_model=SectorComparison)
def get_sectors(asof: date | None = None, db: Session = Depends(get_db)) -> SectorComparison:
    """Cross-sector relative-value statistics + narrative."""
    return service.sector_comparison(db, _resolve_asof(db, asof))


# --------------------------------------------------------------------------- #
# Backtest
# --------------------------------------------------------------------------- #
@router.get("/backtest", response_model=BacktestOut)
def get_backtest(
    entry_z: float = Query(2.0, ge=0.5, le=5.0),
    exit_z: float = Query(0.0, ge=0.0, le=2.0),
    db: Session = Depends(get_db),
) -> BacktestOut:
    """Backtest the mean-reversion strategy over stored residuals."""
    return service.backtest(db, entry_z=entry_z, exit_z=exit_z)


# --------------------------------------------------------------------------- #
# Dashboard summary
# --------------------------------------------------------------------------- #
@router.get("/dashboard/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    asof: date | None = None, db: Session = Depends(get_db)
) -> DashboardSummary:
    """Headline cards for the main dashboard."""
    asof = _resolve_asof(db, asof)
    total_bonds = db.execute(select(Bond.cusip)).scalars().all()
    active = (
        db.execute(select(Signal).where(Signal.trade_date == asof)).scalars().all()
    )
    cheapest = service.rv_rows(db, asof, cheapest=True, limit=1)
    richest = service.rv_rows(db, asof, cheapest=False, limit=1)
    return DashboardSummary(
        as_of=asof,
        total_bonds=len(total_bonds),
        active_signals=len(active),
        cheapest=cheapest[0] if cheapest else None,
        richest=richest[0] if richest else None,
    )


# --------------------------------------------------------------------------- #
# Operations: run pipeline / send alerts
# --------------------------------------------------------------------------- #
@router.post("/pipeline/run")
def run_pipeline(db: Session = Depends(get_db)) -> dict[str, int]:
    """Re-run spreads -> residuals -> signals over ingested data."""
    from app.ingestion.pipeline import run_daily_pipeline

    return run_daily_pipeline(db)


@router.post("/alerts/send")
def send_alerts(asof: date | None = None, db: Session = Depends(get_db)) -> dict[str, bool]:
    """Dispatch current signals to configured Slack / email channels."""
    from app.alerting import dispatch_alerts

    asof = _resolve_asof(db, asof)
    sigs = list(
        db.execute(select(Signal).where(Signal.trade_date == asof)).scalars()
    )
    return dispatch_alerts(_enrich_signals(db, sigs))
