"""Realistic synthetic market-data generator (TRACE-substitute).

True TRACE access requires a FINRA subscription, so this module fabricates an
*internally consistent* sample dataset that exercises every analytic in the
project:

* A universe of issuers across 5 sectors and a spread of ratings.
* Multiple bonds per issuer spanning the 2y / 5y / 10y / 20y / 30y tenors so
  issuer curves can actually be fitted.
* A daily Treasury par curve that drifts gently over time.
* Daily Z-spreads driven by an Ornstein-Uhlenbeck (mean-reverting) process
  around an issuer-curve fair level, so the mean-reversion signal and backtest
  have genuine reversion to find.
* Clean prices derived *from* those spreads by discounting the bond's cash
  flows off ``Treasury + spread`` — guaranteeing the analytics recover spreads
  close to the ones that generated the prices (a self-consistent ground truth).

The OU process for a bond's spread ``s_t`` (bps):

    s_{t+1} = s_t + kappa·(theta − s_t)·dt + sigma·sqrt(dt)·eps,   eps~N(0,1)

theta = issuer-curve fair spread at the bond's tenor (level set by rating).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.analytics.cashflows import generate_cashflows, present_value

# --------------------------------------------------------------------------- #
# Static universe definition
# --------------------------------------------------------------------------- #
SECTORS = ["Financials", "Industrials", "Utilities", "Energy", "Consumer"]

# Issuer -> (sector, rating). Spread level is driven primarily by rating.
ISSUERS: dict[str, tuple[str, str]] = {
    "JPMORGAN": ("Financials", "A"),
    "GOLDMAN SACHS": ("Financials", "BBB"),
    "BANK OF AMERICA": ("Financials", "A"),
    "BOEING": ("Industrials", "BBB"),
    "CATERPILLAR": ("Industrials", "A"),
    "3M": ("Industrials", "A"),
    "DUKE ENERGY": ("Utilities", "BBB"),
    "SOUTHERN CO": ("Utilities", "BBB"),
    "NEXTERA": ("Utilities", "A"),
    "EXXON MOBIL": ("Energy", "AA"),
    "OCCIDENTAL": ("Energy", "BB"),
    "CHEVRON": ("Energy", "AA"),
    "WALMART": ("Consumer", "AA"),
    "PROCTER GAMBLE": ("Consumer", "AA"),
    "KRAFT HEINZ": ("Consumer", "BBB"),
}

# Rating -> base option-adjusted spread level (bps) at the 5y point.
RATING_BASE_SPREAD: dict[str, float] = {
    "AAA": 35.0,
    "AA": 55.0,
    "A": 85.0,
    "BBB": 140.0,
    "BB": 280.0,
    "B": 450.0,
}

# Tenors (years) at which each issuer has a bond.
TENORS = [2.0, 5.0, 10.0, 20.0, 30.0]

# Standard Treasury curve tenors and a base level (decimal). Upward sloping.
UST_TENORS = np.array([0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30], dtype=float)
UST_BASE = np.array(
    [0.045, 0.046, 0.047, 0.044, 0.043, 0.042, 0.043, 0.044, 0.046, 0.047]
)


@dataclass
class GeneratedData:
    bonds: pd.DataFrame
    treasury: pd.DataFrame
    market_data: pd.DataFrame


def _term_premium(tenor: float) -> float:
    """Add a mild upward credit-curve slope so longer tenors trade wider.

    A logarithmic slope (≈ +6 bp/decade-of-tenor) keeps short-end spreads tight
    and avoids the unrealistic straight-line a purely linear slope would give.
    """
    return 18.0 * np.log1p(tenor / 5.0)


def build_universe(asof: date) -> pd.DataFrame:
    """Construct the static bond reference table."""
    rng = np.random.default_rng(42)
    rows = []
    cusip_seq = 0
    for issuer, (sector, rating) in ISSUERS.items():
        for tenor in TENORS:
            cusip_seq += 1
            cusip = f"{abs(hash(issuer)) % 1000:03d}{cusip_seq:04d}A{rating[0]}"[:9]
            maturity = asof + timedelta(days=int(tenor * 365))
            issue = asof - timedelta(days=int(rng.integers(180, 1500)))
            coupon = round(float(rng.uniform(3.0, 6.0)), 3)
            rows.append(
                {
                    "cusip": cusip,
                    "issuer": issuer,
                    "sector": sector,
                    "rating": rating,
                    "coupon": coupon,
                    "maturity": maturity,
                    "issue_date": issue,
                    "coupon_freq": 2,
                    "face_value": 100.0,
                    "_tenor": tenor,
                }
            )
    return pd.DataFrame(rows)


def build_treasury_history(start: date, days: int) -> pd.DataFrame:
    """Generate a gently time-varying Treasury par curve over ``days`` business
    days, with a small common level shock each day (parallel + a little tilt).
    """
    rng = np.random.default_rng(7)
    rows = []
    level = 0.0
    d = start
    count = 0
    while count < days:
        if d.weekday() < 5:  # business days only
            level += float(rng.normal(0, 0.0006))  # random-walk level shock
            level = float(np.clip(level, -0.01, 0.01))
            tilt = float(rng.normal(0, 0.0003))
            for i, tenor in enumerate(UST_TENORS):
                # Longer tenors get a touch more of the tilt.
                y = UST_BASE[i] + level + tilt * (tenor - 5.0) / 25.0
                rows.append(
                    {"curve_date": d, "tenor_years": float(tenor), "par_yield": float(y)}
                )
            count += 1
        d += timedelta(days=1)
    return pd.DataFrame(rows)


def _ust_yield_at(curve_day: pd.DataFrame, t: float) -> float:
    return float(np.interp(t, curve_day["tenor_years"], curve_day["par_yield"]))


def build_market_data(
    bonds: pd.DataFrame,
    treasury: pd.DataFrame,
    seed: int = 123,
) -> pd.DataFrame:
    """Simulate daily Z-spreads (OU) and derive consistent clean prices.

    Returns long market data with ``cusip, trade_date, price,
    yield_to_maturity, volume`` (and an internal ``_true_zspread`` for
    reference/debugging).
    """
    rng = np.random.default_rng(seed)
    dates = sorted(treasury["curve_date"].unique())
    treas_by_date = {d: treasury[treasury["curve_date"] == d] for d in dates}

    # OU parameters (per-business-day dt). kappa is the annualised reversion
    # speed: ~6 gives a reversion half-life of ~6 weeks, slow enough that a
    # daily snapshot carries several persistent dislocations yet fast enough
    # for the backtest to capture reversion within the sample window.
    dt = 1.0 / 252.0
    kappa = 6.0  # reversion speed
    sigma = 70.0  # spread vol (bps/√yr)

    records: list[dict] = []
    for _, bond in bonds.iterrows():
        tenor = bond["_tenor"]
        rating = bond["rating"]
        # Fair (theta) spread = rating base scaled to tenor + term premium.
        theta = RATING_BASE_SPREAD[rating] * (
            0.6 + 0.4 * tenor / 5.0
        ) / 1.0 + _term_premium(tenor)
        # Per-bond persistent offset so issuer curves aren't perfectly smooth.
        theta += float(rng.normal(0, 6.0))

        s = theta + float(rng.normal(0, 25.0))  # start slightly dislocated
        for d in dates:
            eps = float(rng.standard_normal())
            s += kappa * (theta - s) * dt + sigma * np.sqrt(dt) * eps
            s = max(s, 5.0)  # spreads stay positive

            curve_day = treas_by_date[d]
            spread_dec = s / 10_000.0
            flows = generate_cashflows(
                d, bond["maturity"], bond["coupon"], int(bond["coupon_freq"])
            )
            if not flows:
                continue
            # Price = PV discounting at Treasury zero + spread (parallel).
            price = present_value(
                flows,
                lambda t: (1.0 + _ust_yield_at(curve_day, t) + spread_dec) ** (-t),
            )
            # Approx YTM ≈ maturity Treasury + spread (good enough for storage;
            # the analytics engine recomputes a precise YTM from price anyway).
            ytm = _ust_yield_at(curve_day, tenor) + spread_dec
            volume = float(max(0.0, rng.normal(8.0, 4.0)))  # $mm, occasionally ~0
            records.append(
                {
                    "cusip": bond["cusip"],
                    "trade_date": d,
                    "price": round(float(price), 4),
                    "yield_to_maturity": round(float(ytm), 6),
                    "volume": round(volume, 2),
                    "_true_zspread": round(s, 2),
                }
            )
    return pd.DataFrame(records)


def generate_sample_dataset(asof: date | None = None, days: int = 180) -> GeneratedData:
    """Top-level entry: build the full synthetic dataset.

    ``days`` business days of history ending at ``asof`` (default today).
    """
    asof = asof or date.today()
    start = asof - timedelta(days=int(days * 1.5))  # cushion for weekends
    bonds = build_universe(asof)
    treasury = build_treasury_history(start, days)
    market = build_market_data(bonds, treasury)
    return GeneratedData(bonds=bonds, treasury=treasury, market_data=market)
