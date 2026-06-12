"""SQLAlchemy ORM models — the persistent domain schema.

Tables
------
bonds              Static reference data for each security (one row per CUSIP).
market_data        Daily observed price / yield / volume per CUSIP.
treasury_curve     Daily risk-free (UST) par yields by tenor.
spreads            Daily computed spread metrics (G/I/Z/OAS) per CUSIP.
residuals          Daily issuer-curve residual + z-score / percentile per CUSIP.
signals            Mean-reversion trade signals (entry events).
backtest_results   Aggregate performance of the signal strategy per run.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Bond(Base):
    """Static reference data for a corporate bond."""

    __tablename__ = "bonds"

    cusip: Mapped[str] = mapped_column(String(9), primary_key=True)
    issuer: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    sector: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    rating: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    coupon: Mapped[float] = mapped_column(Float, nullable=False)  # annual %, e.g. 4.5
    maturity: Mapped[date] = mapped_column(Date, nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    face_value: Mapped[float] = mapped_column(Float, default=100.0)
    coupon_freq: Mapped[int] = mapped_column(Integer, default=2)  # payments / year

    market_data: Mapped[list["MarketData"]] = relationship(
        back_populates="bond", cascade="all, delete-orphan"
    )
    spreads: Mapped[list["Spread"]] = relationship(
        back_populates="bond", cascade="all, delete-orphan"
    )


class MarketData(Base):
    """A single daily market observation for a bond."""

    __tablename__ = "market_data"
    __table_args__ = (UniqueConstraint("cusip", "trade_date", name="uq_md_cusip_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cusip: Mapped[str] = mapped_column(
        ForeignKey("bonds.cusip"), index=True, nullable=False
    )
    trade_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)  # clean price per 100
    yield_to_maturity: Mapped[float] = mapped_column(Float, nullable=False)  # decimal
    volume: Mapped[float] = mapped_column(Float, default=0.0)  # notional traded ($mm)

    bond: Mapped["Bond"] = relationship(back_populates="market_data")


class TreasuryCurve(Base):
    """Daily risk-free par-yield curve point (US Treasury)."""

    __tablename__ = "treasury_curve"
    __table_args__ = (
        UniqueConstraint("curve_date", "tenor_years", name="uq_ust_date_tenor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    curve_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    tenor_years: Mapped[float] = mapped_column(Float, nullable=False)
    par_yield: Mapped[float] = mapped_column(Float, nullable=False)  # decimal, e.g. 0.04


class Spread(Base):
    """Computed spread metrics for a bond on a given date (basis points)."""

    __tablename__ = "spreads"
    __table_args__ = (
        UniqueConstraint("cusip", "trade_date", name="uq_spread_cusip_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cusip: Mapped[str] = mapped_column(
        ForeignKey("bonds.cusip"), index=True, nullable=False
    )
    trade_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    g_spread: Mapped[float] = mapped_column(Float, nullable=False)
    i_spread: Mapped[float] = mapped_column(Float, nullable=False)
    z_spread: Mapped[float] = mapped_column(Float, nullable=False)
    oas: Mapped[float] = mapped_column(Float, nullable=False)

    bond: Mapped["Bond"] = relationship(back_populates="spreads")


class Residual(Base):
    """Issuer-curve residual diagnostics for a bond on a date."""

    __tablename__ = "residuals"
    __table_args__ = (
        UniqueConstraint("cusip", "trade_date", name="uq_resid_cusip_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cusip: Mapped[str] = mapped_column(
        ForeignKey("bonds.cusip"), index=True, nullable=False
    )
    trade_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    actual_spread: Mapped[float] = mapped_column(Float, nullable=False)  # bps
    model_spread: Mapped[float] = mapped_column(Float, nullable=False)  # bps
    residual: Mapped[float] = mapped_column(Float, nullable=False)  # actual - model
    z_score: Mapped[float] = mapped_column(Float, nullable=False)
    percentile: Mapped[float] = mapped_column(Float, nullable=False)  # 0..100


class Signal(Base):
    """A mean-reversion trade signal generated on a date."""

    __tablename__ = "signals"
    __table_args__ = (
        UniqueConstraint("cusip", "trade_date", name="uq_signal_cusip_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cusip: Mapped[str] = mapped_column(
        ForeignKey("bonds.cusip"), index=True, nullable=False
    )
    trade_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)  # BUY/SELL/FLAT
    z_score: Mapped[float] = mapped_column(Float, nullable=False)
    residual: Mapped[float] = mapped_column(Float, nullable=False)
    expected_reversion_bps: Mapped[float] = mapped_column(Float, nullable=False)
    signal_strength: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..100
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BacktestResult(Base):
    """Aggregate performance metrics for one backtest run."""

    __tablename__ = "backtest_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    entry_z: Mapped[float] = mapped_column(Float, nullable=False)
    exit_z: Mapped[float] = mapped_column(Float, nullable=False)
    n_trades: Mapped[int] = mapped_column(Integer, nullable=False)
    hit_rate: Mapped[float] = mapped_column(Float, nullable=False)  # 0..1
    avg_reversion_bps: Mapped[float] = mapped_column(Float, nullable=False)
    sharpe: Mapped[float] = mapped_column(Float, nullable=False)
    max_drawdown_bps: Mapped[float] = mapped_column(Float, nullable=False)
