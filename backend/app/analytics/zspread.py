"""G-spread, I-spread, Z-spread and yield-to-maturity calculations.

Definitions (all quoted in basis points unless noted)
-----------------------------------------------------
* **YTM**       single flat rate ``y`` solving ``price = Σ CF_i (1+y)^{-t_i}``.
* **G-spread**  YTM minus the Treasury par yield interpolated at the bond's
                maturity:   ``G = YTM - y_treasury(T)``.
* **I-spread**  YTM minus the Treasury yield interpolated at the bond's
                *duration* point (par-swap proxy). With a clean benchmark
                curve this differs from G-spread only by the curve slope
                between the duration and maturity tenors.
* **Z-spread**  the constant spread ``z`` added to every Treasury zero rate so
                the discounted cash flows reprice the bond:
                ``price = Σ CF_i (1 + r(t_i) + z)^{-t_i}``.
                Unlike G-spread it accounts for the full shape of the curve.

YTM and Z-spread are found with a robust Brent root-finder.
"""
from __future__ import annotations

from datetime import date

from scipy.optimize import brentq

from app.analytics.cashflows import (
    CashFlow,
    generate_cashflows,
    modified_duration,
    present_value,
    pv_flat_yield,
)
from app.analytics.curves import TreasuryCurve

BP = 10_000.0  # decimal -> basis-points scale


def yield_to_maturity(
    price: float,
    flows: list[CashFlow],
    guess: float = 0.05,
) -> float:
    """Solve for the flat annually-compounded YTM (decimal) given clean price.

    We treat ``price`` as the full invoice price for simplicity (zero accrued
    on coupon dates); the sample data is generated on coupon-aligned grids so
    this holds. Brent is bracketed on a wide, economically valid yield range.
    """
    if not flows:
        return 0.0

    def objective(y: float) -> float:
        return pv_flat_yield(flows, y) - price

    lo, hi = -0.50, 1.50  # -50% to +150% yield bracket
    f_lo, f_hi = objective(lo), objective(hi)
    if f_lo * f_hi > 0:
        # Price outside attainable range; fall back to the closer bound.
        return lo if abs(f_lo) < abs(f_hi) else hi
    return float(brentq(objective, lo, hi, xtol=1e-10, maxiter=200))


def g_spread(ytm: float, treasury: TreasuryCurve, maturity_years: float) -> float:
    """G-spread in bps: YTM over the maturity-matched Treasury par yield."""
    return (ytm - treasury.yield_at(maturity_years)) * BP


def i_spread(
    ytm: float,
    treasury: TreasuryCurve,
    flows: list[CashFlow],
    ytm_for_duration: float | None = None,
) -> float:
    """I-spread in bps: YTM over the Treasury yield at the bond's duration.

    The interpolation point is the modified duration (a standard par-swap
    proxy), capturing where the bond's risk actually sits on the curve.
    """
    y = ytm if ytm_for_duration is None else ytm_for_duration
    dur = modified_duration(flows, y)
    return (ytm - treasury.yield_at(dur)) * BP


def z_spread(
    price: float,
    flows: list[CashFlow],
    treasury: TreasuryCurve,
) -> float:
    """Solve for the Z-spread (bps) repricing the bond off the Treasury curve.

    ``price = Σ CF_i · (1 + r(t_i) + z)^{-t_i}``  solved for ``z`` (decimal),
    returned ×10,000.
    """
    if not flows:
        return 0.0

    def objective(z: float) -> float:
        pv = present_value(
            flows, lambda t: (1.0 + treasury.zero_rate(t) + z) ** (-t)
        )
        return pv - price

    lo, hi = -0.20, 0.50  # -2000 to +5000 bps
    f_lo, f_hi = objective(lo), objective(hi)
    if f_lo * f_hi > 0:
        return (lo if abs(f_lo) < abs(f_hi) else hi) * BP
    return float(brentq(objective, lo, hi, xtol=1e-12, maxiter=200)) * BP


def all_spreads(
    *,
    price: float,
    settlement: date,
    maturity: date,
    coupon: float,
    freq: int,
    treasury: TreasuryCurve,
) -> dict[str, float]:
    """Compute YTM and the G/I/Z spread family for one bond observation.

    Returns a dict with keys ``ytm`` (decimal) and ``g_spread`` / ``i_spread``
    / ``z_spread`` (bps). OAS is computed separately (see ``oas.py``) because
    it layers an optionality adjustment on top of the Z-spread.
    """
    flows = generate_cashflows(settlement, maturity, coupon, freq)
    mat_years = (maturity - settlement).days / 365.0
    ytm = yield_to_maturity(price, flows)
    return {
        "ytm": ytm,
        "g_spread": g_spread(ytm, treasury, mat_years),
        "i_spread": i_spread(ytm, treasury, flows),
        "z_spread": z_spread(price, flows, treasury),
    }
