"""Tests for the relative-value, signal and backtest engines."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.analytics.backtest import run_backtest
from app.analytics.relative_value import (
    compute_issuer_residuals,
    zscore_and_percentile,
)
from app.analytics.sector import sector_narrative, sector_stats
from app.analytics.signals import (
    generate_signal,
    reversion_frequency,
    signal_strength,
)


# --------------------------------------------------------------------------- #
# Residuals
# --------------------------------------------------------------------------- #
def test_residuals_sum_near_zero_on_curve_fit():
    """An issuer's residuals should roughly average out (curve through points)."""
    df = pd.DataFrame(
        {
            "cusip": ["A1", "A2", "A3", "A4", "A5"],
            "issuer": ["X"] * 5,
            "maturity_years": [2, 5, 10, 20, 30],
            "z_spread": [80, 95, 110, 125, 130],
        }
    )
    out = compute_issuer_residuals(df, method="auto")
    assert "residual" in out
    assert abs(out["residual"].mean()) < 10.0


def test_residual_flags_outlier_bond():
    df = pd.DataFrame(
        {
            "cusip": ["A1", "A2", "A3", "A4", "A5"],
            "issuer": ["X"] * 5,
            "maturity_years": [2, 5, 10, 20, 30],
            # 10y bond is 60bp cheap to the smooth curve.
            "z_spread": [80, 95, 170, 125, 130],
        }
    )
    out = compute_issuer_residuals(df, method="auto").set_index("cusip")
    assert out.loc["A3", "residual"] > out.loc["A1", "residual"]


def test_zscore_and_percentile():
    hist = pd.Series([0, 0, 0, 0, 10])  # last point is a big outlier
    z, pct, cls = zscore_and_percentile(hist, threshold=2.0)
    assert z > 0
    assert pct == pytest.approx(100.0)


def test_zscore_insufficient_history_is_fair():
    z, pct, cls = zscore_and_percentile(pd.Series([5.0]), threshold=2.0)
    assert cls == "FAIR"
    assert z == 0.0


# --------------------------------------------------------------------------- #
# Signals
# --------------------------------------------------------------------------- #
def test_signal_buy_when_cheap():
    sig = generate_signal(cusip="A", z_score=2.5, residual=40.0, volume=10.0)
    assert sig.direction == "BUY"
    assert sig.expected_reversion_bps == pytest.approx(-40.0)  # tightening
    assert 1 <= sig.signal_strength <= 100


def test_signal_sell_when_rich():
    sig = generate_signal(cusip="A", z_score=-3.0, residual=-50.0, volume=20.0)
    assert sig.direction == "SELL"
    assert sig.expected_reversion_bps == pytest.approx(50.0)  # widening


def test_signal_flat_within_band():
    sig = generate_signal(cusip="A", z_score=1.0, residual=10.0)
    assert sig.direction == "FLAT"
    assert sig.signal_strength == 0


def test_signal_strength_monotonic_in_z():
    s1 = signal_strength(2.0, volume=10.0)
    s2 = signal_strength(3.5, volume=10.0)
    assert s2 > s1
    assert 1 <= s1 <= 100 and 1 <= s2 <= 100


def test_signal_strength_rewards_liquidity():
    illiquid = signal_strength(3.0, volume=0.0)
    liquid = signal_strength(3.0, volume=25.0)
    assert liquid > illiquid


def test_reversion_frequency_bounds():
    rng = np.random.default_rng(0)
    series = list(rng.normal(0, 1, 100))
    f = reversion_frequency(series)
    assert 0.0 <= f <= 1.0


# --------------------------------------------------------------------------- #
# Sector RV
# --------------------------------------------------------------------------- #
def test_sector_stats_and_narrative():
    df = pd.DataFrame(
        {
            "sector": ["Energy"] * 3 + ["Industrials"] * 3,
            "z_spread": [200, 210, 205, 100, 95, 105],
        }
    )
    stats = sector_stats(df)
    assert set(stats["sector"]) == {"Energy", "Industrials"}
    # Energy wider => higher z, should rank first.
    assert stats.iloc[0]["sector"] == "Energy"
    narrative = sector_narrative(stats)
    assert any("Energy" in line and "cheap" in line for line in narrative)


# --------------------------------------------------------------------------- #
# Backtest
# --------------------------------------------------------------------------- #
def test_backtest_captures_reversion():
    """A clean cheap->revert path should produce a profitable trade."""
    panel = pd.DataFrame(
        {
            "cusip": ["A"] * 5,
            "trade_date": pd.date_range("2025-01-01", periods=5).date,
            "z_score": [0.5, 2.5, 1.5, 0.2, 0.0],  # entry at idx1, exit at idx3/4
            "residual": [10, 50, 30, 5, 0],
        }
    )
    report = run_backtest(panel, entry_z=2.0, exit_z=0.5)
    assert report.n_trades == 1
    assert report.avg_reversion_bps > 0  # cheap bond tightened => profit
    assert report.hit_rate == 1.0


def test_backtest_empty_panel():
    panel = pd.DataFrame(columns=["cusip", "trade_date", "z_score", "residual"])
    report = run_backtest(panel)
    assert report.n_trades == 0
    assert report.sharpe == 0.0
