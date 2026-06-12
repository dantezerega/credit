"""Pydantic response/request schemas (the typed API contract)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Base allowing construction directly from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Reference / market data
# --------------------------------------------------------------------------- #
class BondOut(ORMModel):
    cusip: str
    issuer: str
    sector: str
    rating: str
    coupon: float
    maturity: date
    issue_date: date
    coupon_freq: int


class MarketDataOut(ORMModel):
    cusip: str
    trade_date: date
    price: float
    yield_to_maturity: float
    volume: float


class TreasuryPointOut(ORMModel):
    curve_date: date
    tenor_years: float
    par_yield: float


# --------------------------------------------------------------------------- #
# Spread analytics
# --------------------------------------------------------------------------- #
class SpreadOut(ORMModel):
    cusip: str
    trade_date: date
    g_spread: float
    i_spread: float
    z_spread: float
    oas: float


class ResidualOut(ORMModel):
    cusip: str
    trade_date: date
    actual_spread: float
    model_spread: float
    residual: float
    z_score: float
    percentile: float


# --------------------------------------------------------------------------- #
# Relative value / signals
# --------------------------------------------------------------------------- #
class RVRow(BaseModel):
    """One row in a rich/cheap ranking table."""

    cusip: str
    issuer: str
    rating: str
    sector: str
    maturity: date
    current_spread: float
    model_spread: float
    residual: float
    z_score: float
    percentile: float
    classification: str  # CHEAP / RICH / FAIR


class SignalOut(ORMModel):
    cusip: str
    trade_date: date
    direction: str
    z_score: float
    residual: float
    expected_reversion_bps: float
    signal_strength: int


class SignalEnriched(SignalOut):
    issuer: str
    rating: str
    sector: str
    maturity: date


# --------------------------------------------------------------------------- #
# Issuer curve viewer
# --------------------------------------------------------------------------- #
class CurvePoint(BaseModel):
    cusip: str
    maturity_years: float
    actual_spread: float
    model_spread: float
    residual: float


class IssuerCurveOut(BaseModel):
    issuer: str
    trade_date: date
    method: str  # nelson_siegel / cubic_spline / linear
    points: list[CurvePoint]
    # Dense fitted curve for plotting a smooth line.
    fitted_tenors: list[float]
    fitted_spreads: list[float]


# --------------------------------------------------------------------------- #
# Sector RV
# --------------------------------------------------------------------------- #
class SectorStat(BaseModel):
    sector: str
    avg_spread: float
    z_score: float
    percentile: float
    n_bonds: int


class SectorComparison(BaseModel):
    trade_date: date
    sectors: list[SectorStat]
    # Human-readable headline, e.g. "Energy trading 1.8σ cheap to Industrials".
    narrative: list[str]


# --------------------------------------------------------------------------- #
# Backtest
# --------------------------------------------------------------------------- #
class BacktestOut(ORMModel):
    entry_z: float
    exit_z: float
    n_trades: int
    hit_rate: float
    avg_reversion_bps: float
    sharpe: float
    max_drawdown_bps: float


# --------------------------------------------------------------------------- #
# Dashboard summary
# --------------------------------------------------------------------------- #
class DashboardSummary(BaseModel):
    as_of: date
    total_bonds: int
    active_signals: int
    cheapest: RVRow | None
    richest: RVRow | None
