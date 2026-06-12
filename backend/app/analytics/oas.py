"""Simplified Option-Adjusted Spread (OAS) approximation.

A *true* OAS strips the value of embedded options (call/put/prepay) out of the
Z-spread by valuing the bond over a stochastic short-rate lattice (e.g.
Hull-White) and solving for the constant spread that reprices it. That requires
a calibrated term-structure model and a vol surface — out of scope for a sample
dataset.

We therefore implement a **documented approximation**:

    OAS ≈ Z-spread − OptionCost

where ``OptionCost`` (bps) is a closed-form estimate of the spread give-up from
the embedded option, modelled with a Black-style call value scaled into spread
terms.

Assumptions (explicit)
----------------------
1. Only callable bonds carry optionality. Bullets have ``OAS == Z-spread``.
2. The issuer is short a call to the investor; the option *cost to the holder*
   is positive, so OAS < Z-spread for callable bonds (the investor demands
   extra Z-spread to compensate, which OAS removes).
3. Option value is approximated by a receiver-style rate option whose premium
   we express per unit duration:  ``OptionCost ≈ vol · √T_call · k / dur`` —
   i.e. higher rate vol, longer time-to-call and lower duration widen the cost.
4. ``k`` is a calibration constant (default 100) chosen so a 5y-to-call, 5y
   duration, 1%-vol bond gives a ~45 bp option cost — a realistic order of
   magnitude for a moderately in-the-money call.

This yields a monotone, well-behaved OAS that behaves correctly in the limits
(no call ⇒ OAS=Z; long time-to-call or high vol ⇒ larger reduction) while being
fully deterministic and dependency-light.
"""
from __future__ import annotations

import math
from datetime import date

# Default rate volatility (annualised, decimal) — proxy for normal vol regime.
DEFAULT_RATE_VOL = 0.010  # 100 bp/yr
_CALIBRATION_K = 100.0


def option_cost_bps(
    *,
    years_to_call: float,
    modified_duration: float,
    rate_vol: float = DEFAULT_RATE_VOL,
    calibration_k: float = _CALIBRATION_K,
) -> float:
    """Estimate the embedded-call option cost in basis points.

        OptionCost = k · vol · √T_call / max(dur, 1)

    Floors duration at 1y to avoid blow-ups on very short bonds, and clamps the
    result to a non-negative, sane band [0, 250] bps.
    """
    if years_to_call <= 0 or rate_vol <= 0:
        return 0.0
    dur = max(modified_duration, 1.0)
    cost = calibration_k * rate_vol * math.sqrt(years_to_call) / dur
    return float(max(0.0, min(cost, 250.0)))


def simplified_oas(
    *,
    z_spread: float,
    settlement: date,
    first_call_date: date | None,
    modified_duration: float,
    rate_vol: float = DEFAULT_RATE_VOL,
) -> float:
    """Compute approximate OAS (bps) from a Z-spread.

    For bullet bonds (``first_call_date is None``) OAS equals the Z-spread. For
    callables we subtract the estimated option cost.
    """
    if first_call_date is None or first_call_date <= settlement:
        return z_spread
    years_to_call = (first_call_date - settlement).days / 365.0
    cost = option_cost_bps(
        years_to_call=years_to_call,
        modified_duration=modified_duration,
        rate_vol=rate_vol,
    )
    return z_spread - cost
