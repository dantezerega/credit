"""Relative-value engine: issuer-curve residuals, z-scores, percentiles, ranks.

Pipeline per trade date
-----------------------
1. For each issuer, fit a spread curve over its bonds' ``(maturity, spread)``.
2. Read each bond's *model* spread off the fitted curve.
3. Residual = Actual − Model  (bps). Positive ⇒ cheap (yields more than fair),
   negative ⇒ rich.
4. Standardise each bond's residual through time:

       z = (residual_t − μ_residual) / σ_residual

   computed over a trailing lookback window of that bond's own residual
   history (its idiosyncratic basis), so the z-score measures dislocation
   relative to the bond's normal richness/cheapness, not the cross-section.
5. Historical percentile = rank of today's residual within the lookback window.

Classification: z > +threshold ⇒ CHEAP, z < −threshold ⇒ RICH, else FAIR.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.analytics.curves import fit_issuer_curve


@dataclass
class ResidualResult:
    """Per-bond residual diagnostics for a single date."""

    cusip: str
    actual_spread: float
    model_spread: float
    residual: float
    z_score: float
    percentile: float
    classification: str


def compute_issuer_residuals(
    df: pd.DataFrame,
    spread_col: str = "z_spread",
    method: str = "auto",
) -> pd.DataFrame:
    """Fit issuer curves and compute residuals for a *single* trade date.

    Parameters
    ----------
    df : columns ``[cusip, issuer, maturity_years, <spread_col>]`` for one date.
    spread_col : which spread metric to model (default Z-spread).
    method : curve fitter passed through to :func:`fit_issuer_curve`.

    Returns a copy of ``df`` with ``model_spread`` and ``residual`` columns.
    """
    out = df.copy()
    out["model_spread"] = np.nan
    for issuer, grp in out.groupby("issuer"):
        tenors = grp["maturity_years"].to_numpy(dtype=float)
        spreads = grp[spread_col].to_numpy(dtype=float)
        curve = fit_issuer_curve(tenors, spreads, method=method)
        out.loc[grp.index, "model_spread"] = curve(tenors)
    out["residual"] = out[spread_col] - out["model_spread"]
    return out


def zscore_and_percentile(
    history: pd.Series,
    threshold: float = 2.0,
) -> tuple[float, float, str]:
    """Z-score, historical percentile and classification of the latest residual.

    ``history`` is a time-ordered series of one bond's residuals; the last
    element is "today". Percentile is the share of past observations below the
    current value (0..100). With < 2 observations the bond is treated as FAIR
    (insufficient history to call a dislocation).
    """
    arr = history.to_numpy(dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.size < 2:
        return 0.0, 50.0, "FAIR"
    current = arr[-1]
    mu = float(np.mean(arr))
    sd = float(np.std(arr, ddof=1))
    z = 0.0 if sd == 0 else (current - mu) / sd
    percentile = float((np.sum(arr <= current) / arr.size) * 100.0)
    cls = "CHEAP" if z > threshold else "RICH" if z < -threshold else "FAIR"
    return z, percentile, cls


def build_residual_panel(
    history_df: pd.DataFrame,
    spread_col: str = "z_spread",
    method: str = "auto",
    threshold: float = 2.0,
    lookback: int = 252,
) -> pd.DataFrame:
    """Compute residual + z-score + percentile for every (cusip, date).

    Parameters
    ----------
    history_df : long panel with columns
        ``[trade_date, cusip, issuer, maturity_years, <spread_col>]``.
    lookback : trailing window (rows) for the z-score / percentile per bond.

    Returns a frame with added columns ``model_spread, residual, z_score,
    percentile, classification``.
    """
    # Step 1: residuals date-by-date (curves are re-fit each day).
    frames = []
    for _, day in history_df.groupby("trade_date"):
        frames.append(compute_issuer_residuals(day, spread_col, method))
    panel = pd.concat(frames, ignore_index=True)
    panel = panel.sort_values(["cusip", "trade_date"]).reset_index(drop=True)

    # Step 2: rolling z-score / percentile within each bond's own residual path.
    z_scores: list[float] = []
    pctiles: list[float] = []
    classes: list[str] = []
    for _, grp in panel.groupby("cusip", sort=False):
        residuals = grp["residual"].reset_index(drop=True)
        for i in range(len(residuals)):
            window = residuals.iloc[max(0, i - lookback + 1) : i + 1]
            z, p, c = zscore_and_percentile(window, threshold)
            z_scores.append(z)
            pctiles.append(p)
            classes.append(c)
    panel["z_score"] = z_scores
    panel["percentile"] = pctiles
    panel["classification"] = classes
    return panel


def rank_rich_cheap(
    panel_today: pd.DataFrame,
    top_n: int = 20,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return ``(cheapest, richest)`` ranking tables for the latest date.

    Cheapest = highest positive z-score; Richest = most negative z-score.
    """
    ranked = panel_today.sort_values("z_score", ascending=False)
    cheapest = ranked.head(top_n).reset_index(drop=True)
    richest = ranked.tail(top_n).iloc[::-1].reset_index(drop=True)
    return cheapest, richest
