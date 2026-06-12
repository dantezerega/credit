"""Bond cash-flow scheduling and present-value primitives.

All money figures are quoted per 100 of face value (street convention). Time
is measured in years from the settlement date using an Actual/365-fixed day
count for simplicity:

    t_i = (payment_date_i - settlement) / 365

A standard fixed-rate bullet bond paying a coupon ``c`` (annual %, ``f`` times
per year) until ``maturity`` produces cash flows:

    CF_i = (c / f)            for i = 1 .. N-1          (coupon)
    CF_N = (c / f) + 100      at maturity               (coupon + redemption)

These primitives are pure functions of the schedule and a discounting rule,
which lets the spread solvers (YTM, Z-spread, OAS) reuse the same machinery.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Callable

import numpy as np

DAY_COUNT = 365.0


@dataclass(frozen=True)
class CashFlow:
    """A single bond cash flow."""

    t: float  # year fraction from settlement
    amount: float  # per 100 face


def generate_cashflows(
    settlement: date,
    maturity: date,
    coupon: float,
    freq: int = 2,
    face: float = 100.0,
) -> list[CashFlow]:
    """Generate remaining cash flows of a fixed-rate bullet bond.

    Coupon dates are stepped backwards from maturity at ``12/freq`` month
    intervals; only flows strictly after settlement are retained. The final
    flow includes the redemption of ``face``.

    Parameters
    ----------
    settlement : valuation/settlement date.
    maturity   : redemption date.
    coupon     : annual coupon rate in percent (e.g. 4.5 for 4.5%).
    freq       : coupon payments per year (2 = semi-annual).
    face       : redemption amount, per-100 convention defaults to 100.
    """
    if maturity <= settlement:
        return []

    months_step = 12 // freq
    coupon_amt = coupon / freq  # per-period coupon per 100 face

    # Walk coupon dates backwards from maturity until we pass settlement.
    dates: list[date] = []
    d = maturity
    while d > settlement:
        dates.append(d)
        d = _subtract_months(d, months_step)
    dates.reverse()

    flows: list[CashFlow] = []
    for i, pay_date in enumerate(dates):
        t = (pay_date - settlement).days / DAY_COUNT
        amount = coupon_amt
        if i == len(dates) - 1:  # maturity flow adds redemption
            amount += face
        flows.append(CashFlow(t=t, amount=amount))
    return flows


def _subtract_months(d: date, months: int) -> date:
    """Subtract whole months from a date, clamping day-of-month if needed."""
    month_index = (d.year * 12 + (d.month - 1)) - months
    year, month = divmod(month_index, 12)
    month += 1
    # Clamp day for short months (e.g. 31 -> 28/30).
    day = min(d.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - date(year, month, 1)).days


def present_value(flows: list[CashFlow], discount: Callable[[float], float]) -> float:
    """Present value given a discount-factor function ``DF(t)``.

    PV = Σ CF_i · DF(t_i)
    """
    return float(sum(cf.amount * discount(cf.t) for cf in flows))


def pv_flat_yield(flows: list[CashFlow], y: float) -> float:
    """PV discounting every flow at a single flat annually-compounded yield
    ``y`` (decimal):

        DF(t) = (1 + y) ** (-t)
    """
    return present_value(flows, lambda t: (1.0 + y) ** (-t))


def macaulay_duration(flows: list[CashFlow], y: float) -> float:
    """Macaulay duration (years) at flat yield ``y``.

    D_mac = (Σ t_i · CF_i · DF_i) / (Σ CF_i · DF_i)
    """
    df = lambda t: (1.0 + y) ** (-t)  # noqa: E731
    pv = sum(cf.amount * df(cf.t) for cf in flows)
    if pv == 0:
        return 0.0
    weighted = sum(cf.t * cf.amount * df(cf.t) for cf in flows)
    return float(weighted / pv)


def modified_duration(flows: list[CashFlow], y: float) -> float:
    """Modified duration = Macaulay / (1 + y)."""
    return macaulay_duration(flows, y) / (1.0 + y)


def years_to_maturity(settlement: date, maturity: date) -> float:
    """Year fraction to maturity (Actual/365)."""
    return max((maturity - settlement).days / DAY_COUNT, 0.0)


def flows_to_arrays(flows: list[CashFlow]) -> tuple[np.ndarray, np.ndarray]:
    """Vectorise flows into ``(times, amounts)`` arrays for fast solvers."""
    times = np.array([cf.t for cf in flows], dtype=float)
    amounts = np.array([cf.amount for cf in flows], dtype=float)
    return times, amounts
