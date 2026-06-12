"""Mean-reversion signal engine.

A bond whose residual z-score breaches ±threshold is dislocated from its own
fair value and is expected to revert. We translate that into a directional
trade plus a 1–100 conviction score.

Signal logic
------------
    z > +threshold  ⇒  BUY CHEAP   (long the bond; spread should tighten)
    z < −threshold  ⇒  SELL RICH   (short the bond; spread should widen)
    otherwise       ⇒  FLAT

Expected reversion
------------------
We assume reversion of the *residual* back to its mean (z → 0). The expected
spread move (bps) the trade captures is therefore the current residual itself:

    expected_reversion_bps = −residual            (signed toward fair value)

i.e. a +40 bp (cheap) residual is expected to tighten 40 bp.

Signal strength (1–100)
-----------------------
A blend of three desk-relevant factors, each mapped to 0..1 then weighted:

    strength = 100 · (w_z·f_z + w_liq·f_liq + w_rev·f_rev)

    f_z   = min(|z| / z_cap, 1)            magnitude of dislocation
    f_liq = min(volume / liq_cap, 1)       tradeability (bigger = better fill)
    f_rev = historical reversion frequency proxy (how often this bond mean-
            reverts from extremes; defaults to 0.5 when unknown)

Weights default to 0.6 / 0.2 / 0.2 — dislocation dominates, liquidity and
reversion reliability modulate.
"""
from __future__ import annotations

from dataclasses import dataclass

W_Z, W_LIQ, W_REV = 0.6, 0.2, 0.2
Z_CAP = 4.0  # |z| at/above which the dislocation factor saturates
LIQ_CAP = 25.0  # $mm daily volume at which the liquidity factor saturates


@dataclass
class TradeSignal:
    """A generated mean-reversion signal."""

    cusip: str
    direction: str  # BUY / SELL / FLAT
    z_score: float
    residual: float
    expected_reversion_bps: float
    signal_strength: int


def signal_strength(
    z_score: float,
    volume: float,
    reversion_freq: float = 0.5,
) -> int:
    """Map (|z|, liquidity, reversion reliability) to an integer 1..100."""
    f_z = min(abs(z_score) / Z_CAP, 1.0)
    f_liq = min(max(volume, 0.0) / LIQ_CAP, 1.0)
    f_rev = min(max(reversion_freq, 0.0), 1.0)
    raw = 100.0 * (W_Z * f_z + W_LIQ * f_liq + W_REV * f_rev)
    return int(max(1, min(round(raw), 100)))


def generate_signal(
    *,
    cusip: str,
    z_score: float,
    residual: float,
    volume: float = 0.0,
    reversion_freq: float = 0.5,
    threshold: float = 2.0,
) -> TradeSignal:
    """Generate a single bond's signal from its residual z-score."""
    if z_score > threshold:
        direction = "BUY"
    elif z_score < -threshold:
        direction = "SELL"
    else:
        direction = "FLAT"

    # Reversion of the residual to zero captures the full current residual.
    expected = -residual
    strength = (
        0 if direction == "FLAT" else signal_strength(z_score, volume, reversion_freq)
    )
    return TradeSignal(
        cusip=cusip,
        direction=direction,
        z_score=z_score,
        residual=residual,
        expected_reversion_bps=expected,
        signal_strength=strength,
    )


def reversion_frequency(residual_history: list[float], threshold: float = 2.0) -> float:
    """Empirical reversion reliability for the strength score.

    Fraction of past dislocation episodes (|standardised residual| > threshold)
    that subsequently moved back toward the mean on the next observation.
    Returns 0.5 (neutral prior) when there is too little history.
    """
    import numpy as np

    arr = np.asarray(residual_history, dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.size < 10:
        return 0.5
    mu, sd = float(np.mean(arr)), float(np.std(arr, ddof=1))
    if sd == 0:
        return 0.5
    z = (arr - mu) / sd
    episodes = reverts = 0
    for i in range(len(z) - 1):
        if abs(z[i]) > threshold:
            episodes += 1
            if abs(z[i + 1]) < abs(z[i]):  # moved back toward the mean
                reverts += 1
    return reverts / episodes if episodes else 0.5
