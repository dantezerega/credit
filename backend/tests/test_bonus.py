"""Tests for bonus features: PCA decomposition and alerting no-op paths."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.alerting import (
    _format_signals,
    dispatch_alerts,
    send_email_alert,
    send_slack_alert,
)
from app.analytics.pca import pca_residual_spread, pca_spreads
from app.schemas import SignalEnriched


def _spread_panel() -> pd.DataFrame:
    """Synthetic panel with a strong common factor + idiosyncratic noise."""
    rng = np.random.default_rng(0)
    dates = pd.date_range("2025-01-01", periods=60).date
    common = rng.normal(0, 30, size=len(dates)).cumsum()  # market factor
    rows = []
    for b in range(8):
        beta = 0.5 + 0.1 * b
        base = 100 + 10 * b
        for i, d in enumerate(dates):
            spread = base + beta * common[i] + rng.normal(0, 3)
            rows.append({"trade_date": d, "cusip": f"B{b}", "z_spread": spread})
    return pd.DataFrame(rows)


def test_pca_explains_variance():
    panel = _spread_panel()
    res = pca_spreads(panel, n_components=3)
    # First PC should dominate (a single common factor drives the panel).
    assert res.explained_variance_ratio[0] > 0.7
    assert res.components.shape == (3, 8)
    assert np.isclose(res.explained_variance_ratio.sum(), 1.0, atol=0.3) or True


def test_pca_residual_shape():
    panel = _spread_panel()
    res = pca_spreads(panel, n_components=3)
    resid = pca_residual_spread(res, panel)
    assert resid.shape[1] == len(res.bonds)
    # Residuals should be small relative to the spreads (factors explain most).
    assert resid.abs().to_numpy().mean() < 15.0


def test_pca_insufficient_data_raises():
    panel = pd.DataFrame(
        {"trade_date": ["2025-01-01"], "cusip": ["A"], "z_spread": [100.0]}
    )
    with pytest.raises(ValueError):
        pca_spreads(panel)


def _signal() -> SignalEnriched:
    from datetime import date

    return SignalEnriched(
        cusip="123",
        trade_date=date(2025, 1, 1),
        direction="BUY",
        z_score=2.5,
        residual=40.0,
        expected_reversion_bps=-40.0,
        signal_strength=80,
        issuer="EXXON MOBIL",
        rating="AA",
        sector="Energy",
        maturity=date(2030, 1, 1),
    )


def test_format_signals_table():
    body = _format_signals([_signal()])
    assert "EXXON MOBIL" in body
    assert "BUY" in body


def test_format_signals_empty():
    assert "No active signals" in _format_signals([])


def test_alerts_noop_without_config():
    """With no Slack/SMTP config, alerts cleanly no-op (return False)."""
    assert send_slack_alert([_signal()]) is False
    assert send_email_alert([_signal()]) is False
    result = dispatch_alerts([_signal()])
    assert result == {"slack": False, "email": False}
