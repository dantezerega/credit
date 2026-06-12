"""Cross-sector relative value.

Aggregates bond-level spreads into sector averages and standardises each
sector against the cross-sector distribution so a desk can say, e.g.,
"Energy is trading 1.8σ cheap to Industrials".

For a single date:

    sector_avg(s)  = mean spread of bonds in sector s
    grand_mean     = mean of sector averages
    grand_sd       = stdev of sector averages
    sector_z(s)    = (sector_avg(s) − grand_mean) / grand_sd

A high positive z means the sector trades wide (cheap) versus peers. The
pairwise narrative compares each sector to the tightest (richest) sector.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def sector_stats(df: pd.DataFrame, spread_col: str = "z_spread") -> pd.DataFrame:
    """Per-sector average spread, z-score and percentile for one date.

    ``df`` needs columns ``[sector, <spread_col>]``. Percentile ranks each
    sector's average within the set of sector averages (0..100).
    """
    grouped = (
        df.groupby("sector")[spread_col]
        .agg(avg_spread="mean", n_bonds="count")
        .reset_index()
    )
    avgs = grouped["avg_spread"].to_numpy(dtype=float)
    mu, sd = float(np.mean(avgs)), float(np.std(avgs, ddof=1)) if len(avgs) > 1 else 0.0
    grouped["z_score"] = 0.0 if sd == 0 else (avgs - mu) / sd
    grouped["percentile"] = [
        float((np.sum(avgs <= a) / len(avgs)) * 100.0) for a in avgs
    ]
    return grouped.sort_values("z_score", ascending=False).reset_index(drop=True)


def sector_narrative(stats: pd.DataFrame) -> list[str]:
    """Human-readable cross-sector dislocation statements.

    Compares each sector to the richest (tightest) sector in std-dev units of
    the cross-sector spread distribution.
    """
    if len(stats) < 2:
        return []
    richest = stats.iloc[-1]  # lowest z = tightest = richest
    lines: list[str] = []
    for _, row in stats.iterrows():
        if row["sector"] == richest["sector"]:
            continue
        dz = row["z_score"] - richest["z_score"]
        if abs(dz) < 0.1:
            continue
        side = "cheap" if dz > 0 else "rich"
        lines.append(
            f"{row['sector']} bonds trading {abs(dz):.1f} standard deviations "
            f"{side} to {richest['sector']}."
        )
    return lines
