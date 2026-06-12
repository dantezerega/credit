"""Backtesting framework for the mean-reversion signal.

Strategy
--------
Entry  : open a position when |residual z| crosses the entry threshold
         (cheap ⇒ long the spread tightening, rich ⇒ short).
Exit   : close when the residual z reverts through the exit threshold
         (default 0) — i.e. the dislocation has normalised. A position is also
         force-closed at the end of the sample.

PnL is measured in basis points of *spread* captured (sign-adjusted so a
correct call is positive):

    pnl_bps = entry_residual − exit_residual     for a CHEAP (long) trade
    pnl_bps = exit_residual  − entry_residual     for a RICH  (short) trade

(equivalently ``sign(entry_z) · (entry_residual − exit_residual)``).

Metrics
-------
hit_rate          fraction of trades with pnl > 0
avg_reversion_bps mean pnl per trade
sharpe            mean(pnl) / std(pnl) · √(annualisation), per-trade Sharpe
max_drawdown_bps  largest peak-to-trough drop of the cumulative pnl curve
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Trade:
    cusip: str
    entry_date: object
    exit_date: object
    direction: str
    entry_residual: float
    exit_residual: float
    pnl_bps: float


@dataclass
class BacktestReport:
    entry_z: float
    exit_z: float
    n_trades: int
    hit_rate: float
    avg_reversion_bps: float
    sharpe: float
    max_drawdown_bps: float
    trades: list[Trade]


def _walk_bond(
    grp: pd.DataFrame, entry_z: float, exit_z: float
) -> list[Trade]:
    """Generate non-overlapping trades for one bond's residual time series."""
    grp = grp.sort_values("trade_date")
    dates = grp["trade_date"].tolist()
    z = grp["z_score"].to_numpy(dtype=float)
    resid = grp["residual"].to_numpy(dtype=float)
    cusip = grp["cusip"].iloc[0]

    trades: list[Trade] = []
    open_idx: int | None = None
    direction = ""

    for i in range(len(z)):
        if open_idx is None:
            if z[i] > entry_z:
                open_idx, direction = i, "CHEAP"
            elif z[i] < -entry_z:
                open_idx, direction = i, "RICH"
        else:
            reverted = abs(z[i]) <= exit_z or (
                np.sign(z[i]) != np.sign(z[open_idx]) and z[open_idx] != 0
            )
            if reverted or i == len(z) - 1:
                entry_r, exit_r = resid[open_idx], resid[i]
                pnl = entry_r - exit_r if direction == "CHEAP" else exit_r - entry_r
                trades.append(
                    Trade(
                        cusip=cusip,
                        entry_date=dates[open_idx],
                        exit_date=dates[i],
                        direction=direction,
                        entry_residual=float(entry_r),
                        exit_residual=float(exit_r),
                        pnl_bps=float(pnl),
                    )
                )
                open_idx = None
    return trades


def run_backtest(
    panel: pd.DataFrame,
    entry_z: float = 2.0,
    exit_z: float = 0.0,
    periods_per_year: int = 252,
) -> BacktestReport:
    """Backtest the mean-reversion strategy over a residual panel.

    ``panel`` needs columns ``[cusip, trade_date, z_score, residual]``.
    """
    trades: list[Trade] = []
    for _, grp in panel.groupby("cusip"):
        trades.extend(_walk_bond(grp, entry_z, exit_z))

    if not trades:
        return BacktestReport(entry_z, exit_z, 0, 0.0, 0.0, 0.0, 0.0, [])

    pnl = np.array([t.pnl_bps for t in trades], dtype=float)
    hit_rate = float(np.mean(pnl > 0))
    avg = float(np.mean(pnl))
    sd = float(np.std(pnl, ddof=1)) if pnl.size > 1 else 0.0
    sharpe = 0.0 if sd == 0 else (avg / sd) * math.sqrt(periods_per_year)

    # Max drawdown of the cumulative (sequential) pnl curve.
    ordered = sorted(trades, key=lambda t: t.exit_date)
    cum = np.cumsum([t.pnl_bps for t in ordered])
    running_max = np.maximum.accumulate(cum)
    drawdowns = running_max - cum
    max_dd = float(np.max(drawdowns)) if drawdowns.size else 0.0

    return BacktestReport(
        entry_z=entry_z,
        exit_z=exit_z,
        n_trades=len(trades),
        hit_rate=hit_rate,
        avg_reversion_bps=avg,
        sharpe=sharpe,
        max_drawdown_bps=max_dd,
        trades=trades,
    )
