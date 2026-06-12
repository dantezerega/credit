"""Yield-curve interpolation and issuer spread-curve fitting.

Two distinct curve problems live here:

1. **Treasury (risk-free) curve** — given a set of par yields at standard
   tenors, build a function ``y(t)`` returning the interpolated risk-free
   yield at any maturity. Used as the benchmark for G-spread and as the
   discounting base for Z-spread / OAS.

2. **Issuer spread curve** — given a scatter of ``(maturity, spread)`` points
   for one issuer, fit a smooth curve so each bond's *model* (fair) spread can
   be read off and compared to its *actual* spread. Three fitters are offered:

       * Nelson-Siegel  — parametric, economically interpretable, robust with
         few points.
       * Cubic spline   — flexible, needs >= 4 well-separated tenors.
       * Linear         — always-works interpolation fallback.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import least_squares


# --------------------------------------------------------------------------- #
# Treasury curve
# --------------------------------------------------------------------------- #
class TreasuryCurve:
    """Piecewise-linear interpolation of the risk-free par-yield curve.

    Linear interpolation on yields is the standard desk approximation for a
    benchmark curve; it is monotone-preserving and never overshoots, which
    matters when the curve feeds spread calculations.
    """

    def __init__(self, tenors: np.ndarray, yields: np.ndarray) -> None:
        order = np.argsort(tenors)
        self.tenors = np.asarray(tenors, dtype=float)[order]
        self.yields = np.asarray(yields, dtype=float)[order]
        if self.tenors.size < 2:
            raise ValueError("Treasury curve needs >= 2 tenors")

    def yield_at(self, t: float) -> float:
        """Interpolated (flat-extrapolated) par yield at maturity ``t`` years."""
        return float(np.interp(t, self.tenors, self.yields))

    def zero_rate(self, t: float) -> float:
        """Approximate zero rate.

        For a smooth, gently-sloped government curve the par-yield vs zero-rate
        difference is second-order; we treat the interpolated par yield as the
        continuously-usable discount rate. This keeps the Z-spread solver
        self-consistent (the same base curve is used everywhere).
        """
        return self.yield_at(t)

    def discount_factor(self, t: float, spread: float = 0.0) -> float:
        """Risk-free discount factor with an optional additive ``spread``
        (decimal) applied in parallel: ``DF(t) = (1 + z(t) + s) ** (-t)``.
        """
        rate = self.zero_rate(t) + spread
        return (1.0 + rate) ** (-t)


# --------------------------------------------------------------------------- #
# Nelson-Siegel
# --------------------------------------------------------------------------- #
@dataclass
class NelsonSiegelParams:
    """Nelson-Siegel parameters.

    s(t) = beta0
         + beta1 * (1 - e^{-t/tau}) / (t/tau)
         + beta2 * ((1 - e^{-t/tau}) / (t/tau) - e^{-t/tau})

    beta0  long-run level, beta1 short-end slope, beta2 medium-term curvature,
    tau    decay/location of the curvature hump (>0).
    """

    beta0: float
    beta1: float
    beta2: float
    tau: float

    def __call__(self, t: float | np.ndarray) -> np.ndarray:
        t = np.asarray(t, dtype=float)
        # Guard t→0 (the loadings have a removable singularity there).
        t = np.where(t <= 1e-8, 1e-8, t)
        x = t / self.tau
        loading_slope = (1.0 - np.exp(-x)) / x
        loading_curve = loading_slope - np.exp(-x)
        return self.beta0 + self.beta1 * loading_slope + self.beta2 * loading_curve


def fit_nelson_siegel(
    tenors: np.ndarray, spreads: np.ndarray
) -> NelsonSiegelParams:
    """Least-squares fit of the Nelson-Siegel form to spread points.

    Requires >= 4 points for a well-posed 4-parameter fit (else raises). ``tau``
    is bounded to a sensible (0.1, 30y) range; beta starting values use the
    level / slope / zero curvature heuristic.
    """
    tenors = np.asarray(tenors, dtype=float)
    spreads = np.asarray(spreads, dtype=float)
    if tenors.size < 4:
        raise ValueError("Nelson-Siegel needs >= 4 points")

    level = float(spreads[np.argmax(tenors)])  # long end ~ beta0
    slope = float(spreads[np.argmin(tenors)] - level)  # short minus long

    def resid(p: np.ndarray) -> np.ndarray:
        ns = NelsonSiegelParams(p[0], p[1], p[2], p[3])
        return ns(tenors) - spreads

    x0 = np.array([level, slope, 0.0, 2.0])
    lower = np.array([-np.inf, -np.inf, -np.inf, 0.1])
    upper = np.array([np.inf, np.inf, np.inf, 30.0])
    sol = least_squares(resid, x0, bounds=(lower, upper), max_nfev=10_000)
    return NelsonSiegelParams(*sol.x)


# --------------------------------------------------------------------------- #
# Unified issuer-curve fitter
# --------------------------------------------------------------------------- #
@dataclass
class FittedCurve:
    """Result of fitting an issuer spread curve."""

    method: str
    predict: "callable"  # type: ignore[valid-type]  # f(t_years) -> spread bps

    def __call__(self, t: float | np.ndarray) -> np.ndarray:
        return np.asarray(self.predict(t), dtype=float)


def fit_issuer_curve(
    tenors: np.ndarray,
    spreads: np.ndarray,
    method: str = "auto",
) -> FittedCurve:
    """Fit an issuer spread curve, falling back gracefully on sparse data.

    method = "auto" picks Nelson-Siegel when >= 4 points are available,
    cubic spline when >= 4 (used by request), else linear. With < 2 points a
    flat curve at the single observed spread is returned.

    Spreads are in basis points; the returned callable maps maturity (years)
    to fair spread (bps).
    """
    tenors = np.asarray(tenors, dtype=float)
    spreads = np.asarray(spreads, dtype=float)

    # Collapse duplicate tenors (average) so interpolators stay well-defined.
    tenors, spreads = _dedupe_tenors(tenors, spreads)
    n = tenors.size

    if n == 0:
        raise ValueError("need at least one point to fit a curve")
    if n == 1:
        const = float(spreads[0])
        return FittedCurve("flat", lambda t: np.full_like(np.asarray(t, float), const))

    if method == "auto":
        method = "nelson_siegel" if n >= 4 else "linear"

    if method == "nelson_siegel" and n >= 4:
        ns = fit_nelson_siegel(tenors, spreads)
        return FittedCurve("nelson_siegel", ns)

    if method == "cubic_spline" and n >= 4:
        cs = CubicSpline(tenors, spreads, bc_type="natural", extrapolate=True)
        return FittedCurve("cubic_spline", cs)

    # Linear interpolation fallback (flat-extrapolated outside the knots).
    def linear(t: float | np.ndarray) -> np.ndarray:
        return np.interp(np.asarray(t, float), tenors, spreads)

    return FittedCurve("linear", linear)


def _dedupe_tenors(
    tenors: np.ndarray, spreads: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Sort by tenor and average spreads sharing the same tenor."""
    order = np.argsort(tenors)
    tenors, spreads = tenors[order], spreads[order]
    uniq, inv = np.unique(tenors, return_inverse=True)
    if uniq.size == tenors.size:
        return tenors, spreads
    avg = np.zeros_like(uniq)
    counts = np.zeros_like(uniq)
    np.add.at(avg, inv, spreads)
    np.add.at(counts, inv, 1.0)
    return uniq, avg / counts
