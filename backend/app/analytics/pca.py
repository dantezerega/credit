"""PCA decomposition of the spread surface (bonus feature).

Builds a matrix ``X`` of shape (dates × bonds) of Z-spreads, demeans each
column, and extracts principal components via SVD. In credit, the first PC is
typically a *systemic / market* factor (all spreads move together), the second
a *curve/quality* factor, the third *sector rotation*, etc.

Outputs
-------
explained_variance_ratio : variance share of each PC
components                : loadings (bonds × n_components)
factor_scores            : time series of each PC (dates × n_components)
residual_spread          : portion of each bond's spread NOT explained by the
                           top-k factors — a model-free richness/cheapness gauge
                           complementary to the issuer-curve residual.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class PCAResult:
    bonds: list[str]
    explained_variance_ratio: np.ndarray
    components: np.ndarray  # (n_components, n_bonds)
    factor_scores: np.ndarray  # (n_dates, n_components)
    mean: np.ndarray  # per-bond column mean (n_bonds,)


def pca_spreads(
    panel: pd.DataFrame,
    spread_col: str = "z_spread",
    n_components: int = 3,
) -> PCAResult:
    """Run PCA on a (date × bond) spread matrix.

    ``panel`` is a long frame with ``[trade_date, cusip, <spread_col>]``. Bonds
    that are not observed on every date are dropped so the matrix is complete.
    """
    wide = panel.pivot_table(
        index="trade_date", columns="cusip", values=spread_col
    ).dropna(axis=1, how="any")
    if wide.shape[1] == 0 or wide.shape[0] < 2:
        raise ValueError("insufficient complete data for PCA")

    bonds = list(wide.columns)
    x = wide.to_numpy(dtype=float)
    mean = x.mean(axis=0)
    xc = x - mean  # demean each bond series

    # Economy SVD: xc = U S V^T ; rows of V^T are the principal directions.
    u, s, vt = np.linalg.svd(xc, full_matrices=False)
    k = min(n_components, vt.shape[0])
    var = s**2
    evr = var / var.sum()

    components = vt[:k]  # (k, n_bonds)
    factor_scores = u[:, :k] * s[:k]  # (n_dates, k)
    return PCAResult(
        bonds=bonds,
        explained_variance_ratio=evr[:k],
        components=components,
        factor_scores=factor_scores,
        mean=mean,
    )


def pca_residual_spread(result: PCAResult, panel: pd.DataFrame, spread_col="z_spread"):
    """Reconstruct spreads from the top-k factors and return the unexplained
    residual per (date, bond) — a model-free dislocation signal.
    """
    wide = panel.pivot_table(
        index="trade_date", columns="cusip", values=spread_col
    )[result.bonds]
    recon = result.factor_scores @ result.components + result.mean
    resid = wide.to_numpy(dtype=float) - recon
    return pd.DataFrame(resid, index=wide.index, columns=result.bonds)
