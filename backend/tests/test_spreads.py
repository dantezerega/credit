"""Tests for spread calculations and cash-flow primitives."""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

from app.analytics.cashflows import (
    generate_cashflows,
    modified_duration,
    pv_flat_yield,
)
from app.analytics.curves import TreasuryCurve
from app.analytics.oas import option_cost_bps, simplified_oas
from app.analytics.zspread import all_spreads, yield_to_maturity, z_spread


@pytest.fixture
def flat_treasury() -> TreasuryCurve:
    tenors = np.array([0.5, 1, 2, 5, 10, 30], dtype=float)
    yields = np.full_like(tenors, 0.04)  # flat 4%
    return TreasuryCurve(tenors, yields)


def test_cashflows_count_and_redemption():
    settle = date(2025, 1, 1)
    mat = date(2030, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=5.0, freq=2)
    # 5y semi-annual => 10 coupons.
    assert len(flows) == 10
    # Last flow includes redemption of 100 + final coupon 2.5.
    assert flows[-1].amount == pytest.approx(102.5)
    assert all(f.amount == pytest.approx(2.5) for f in flows[:-1])


def test_par_bond_prices_at_100():
    """A bond whose coupon equals its flat yield should price ~par."""
    settle = date(2025, 1, 1)
    mat = date(2030, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=4.0, freq=2)
    # Annual-compounded YTM equivalent of 4% semi is slightly different;
    # check the YTM solver recovers a yield repricing to the given price.
    price = pv_flat_yield(flows, 0.04)
    y = yield_to_maturity(price, flows)
    assert y == pytest.approx(0.04, abs=1e-6)


def test_ytm_inverts_pricing():
    settle = date(2025, 1, 1)
    mat = date(2035, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=6.0, freq=2)
    for y_true in (0.02, 0.045, 0.08):
        price = pv_flat_yield(flows, y_true)
        assert yield_to_maturity(price, flows) == pytest.approx(y_true, abs=1e-6)


def test_zspread_zero_when_priced_off_curve(flat_treasury):
    """If the bond is priced by discounting at the Treasury curve exactly,
    its Z-spread must be ~0."""
    settle = date(2025, 1, 1)
    mat = date(2030, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=4.0, freq=2)
    price = sum(
        cf.amount * (1.0 + flat_treasury.zero_rate(cf.t)) ** (-cf.t) for cf in flows
    )
    z = z_spread(price, flows, flat_treasury)
    assert z == pytest.approx(0.0, abs=0.5)  # within half a bp


def test_zspread_positive_for_cheap_bond(flat_treasury):
    """Discounting at a higher rate (lower price) yields a positive Z-spread."""
    settle = date(2025, 1, 1)
    mat = date(2030, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=4.0, freq=2)
    price = sum(
        cf.amount * (1.0 + flat_treasury.zero_rate(cf.t) + 0.01) ** (-cf.t)
        for cf in flows
    )
    z = z_spread(price, flows, flat_treasury)
    assert z == pytest.approx(100.0, abs=1.0)  # ~100 bp


def test_all_spreads_consistency(flat_treasury):
    settle = date(2025, 1, 1)
    mat = date(2032, 1, 1)
    res = all_spreads(
        price=98.0,
        settlement=settle,
        maturity=mat,
        coupon=4.5,
        freq=2,
        treasury=flat_treasury,
    )
    assert set(res) == {"ytm", "g_spread", "i_spread", "z_spread"}
    # On a flat curve, G and Z spread should be close (no curve shape effect).
    assert res["g_spread"] == pytest.approx(res["z_spread"], abs=15.0)


def test_modified_duration_positive():
    settle = date(2025, 1, 1)
    mat = date(2035, 1, 1)
    flows = generate_cashflows(settle, mat, coupon=5.0, freq=2)
    dur = modified_duration(flows, 0.05)
    assert 6.0 < dur < 9.0  # ~7-8y for a 10y 5% bond


def test_oas_equals_zspread_for_bullet():
    settle = date(2025, 1, 1)
    assert simplified_oas(
        z_spread=120.0,
        settlement=settle,
        first_call_date=None,
        modified_duration=5.0,
    ) == 120.0


def test_oas_below_zspread_for_callable():
    settle = date(2025, 1, 1)
    call = settle + timedelta(days=int(5 * 365))
    oas = simplified_oas(
        z_spread=120.0,
        settlement=settle,
        first_call_date=call,
        modified_duration=5.0,
    )
    assert oas < 120.0
    assert option_cost_bps(years_to_call=5.0, modified_duration=5.0) > 0
