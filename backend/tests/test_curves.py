"""Tests for curve fitting (Nelson-Siegel, spline, linear fallback)."""
from __future__ import annotations

import numpy as np
import pytest

from app.analytics.curves import (
    NelsonSiegelParams,
    TreasuryCurve,
    fit_issuer_curve,
    fit_nelson_siegel,
)


def test_treasury_interpolation():
    tc = TreasuryCurve(np.array([1.0, 5.0, 10.0]), np.array([0.03, 0.04, 0.045]))
    assert tc.yield_at(1.0) == pytest.approx(0.03)
    assert tc.yield_at(5.0) == pytest.approx(0.04)
    # Midpoint linear interpolation.
    assert tc.yield_at(3.0) == pytest.approx(0.035, abs=1e-9)
    # Flat extrapolation beyond the ends.
    assert tc.yield_at(30.0) == pytest.approx(0.045)


def test_treasury_requires_two_points():
    with pytest.raises(ValueError):
        TreasuryCurve(np.array([1.0]), np.array([0.03]))


def test_nelson_siegel_recovers_known_curve():
    true = NelsonSiegelParams(beta0=100, beta1=-40, beta2=20, tau=2.5)
    tenors = np.array([1, 2, 3, 5, 7, 10, 20, 30], dtype=float)
    spreads = true(tenors)
    fit = fit_nelson_siegel(tenors, spreads)
    # Fitted curve should reproduce the spreads closely.
    assert np.allclose(fit(tenors), spreads, atol=1.0)


def test_nelson_siegel_needs_four_points():
    with pytest.raises(ValueError):
        fit_nelson_siegel(np.array([2.0, 5.0, 10.0]), np.array([80, 100, 120]))


def test_fit_issuer_curve_auto_picks_ns_with_enough_points():
    tenors = np.array([2, 5, 10, 20, 30], dtype=float)
    spreads = np.array([80, 95, 110, 125, 130], dtype=float)
    curve = fit_issuer_curve(tenors, spreads, method="auto")
    assert curve.method == "nelson_siegel"
    # Fitted values land near observations.
    assert np.allclose(curve(tenors), spreads, atol=15.0)


def test_fit_issuer_curve_linear_fallback_few_points():
    tenors = np.array([2.0, 10.0], dtype=float)
    spreads = np.array([80.0, 120.0], dtype=float)
    curve = fit_issuer_curve(tenors, spreads, method="auto")
    assert curve.method == "linear"
    assert curve(6.0) == pytest.approx(100.0)  # midpoint


def test_fit_issuer_curve_single_point_is_flat():
    curve = fit_issuer_curve(np.array([5.0]), np.array([90.0]))
    assert curve.method == "flat"
    assert float(curve(2.0)) == pytest.approx(90.0)
    assert float(curve(30.0)) == pytest.approx(90.0)


def test_cubic_spline_interpolates_knots():
    tenors = np.array([2, 5, 10, 20], dtype=float)
    spreads = np.array([80, 100, 115, 125], dtype=float)
    curve = fit_issuer_curve(tenors, spreads, method="cubic_spline")
    assert curve.method == "cubic_spline"
    assert np.allclose(curve(tenors), spreads, atol=1e-6)  # passes through knots


def test_duplicate_tenors_averaged():
    tenors = np.array([5.0, 5.0, 10.0], dtype=float)
    spreads = np.array([90.0, 110.0, 120.0], dtype=float)
    curve = fit_issuer_curve(tenors, spreads, method="linear")
    assert curve(5.0) == pytest.approx(100.0)  # averaged the duplicate
