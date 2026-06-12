"""Data validation and missing-data handling for the ingestion pipeline.

Validation is deliberately strict on *structure* (types, required fields,
plausible ranges) and lenient-but-explicit on *gaps* (missing prices are
forward-filled with a logged warning rather than dropped, mirroring how a desk
carries a stale mark until a fresh trade prints).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pandas as pd


@dataclass
class ValidationReport:
    """Outcome of validating a batch of market data."""

    n_rows: int
    n_dropped: int = 0
    n_filled: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


# Plausible bounds for sanity checks (reject obvious bad ticks).
_PRICE_MIN, _PRICE_MAX = 20.0, 200.0  # clean price per 100
_YIELD_MIN, _YIELD_MAX = -0.05, 0.40  # decimal


def validate_market_data(df: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    """Validate and clean a market-data frame.

    Required columns: ``cusip, trade_date, price, yield_to_maturity, volume``.
    Returns the cleaned frame plus a :class:`ValidationReport`.
    """
    required = {"cusip", "trade_date", "price", "yield_to_maturity", "volume"}
    report = ValidationReport(n_rows=len(df))

    missing_cols = required - set(df.columns)
    if missing_cols:
        report.errors.append(f"missing columns: {sorted(missing_cols)}")
        return df, report

    clean = df.copy()
    clean["trade_date"] = pd.to_datetime(clean["trade_date"]).dt.date

    # Drop structurally invalid rows (null cusip/date, non-positive price).
    before = len(clean)
    clean = clean[clean["cusip"].notna() & clean["trade_date"].notna()]
    clean = clean[clean["price"].notna() | clean["yield_to_maturity"].notna()]
    report.n_dropped = before - len(clean)

    # Range checks → flag (don't silently keep absurd ticks).
    bad_price = clean["price"].notna() & (
        (clean["price"] < _PRICE_MIN) | (clean["price"] > _PRICE_MAX)
    )
    if bad_price.any():
        report.warnings.append(f"{int(bad_price.sum())} price(s) outside plausible band")
        clean = clean[~bad_price]

    bad_yield = clean["yield_to_maturity"].notna() & (
        (clean["yield_to_maturity"] < _YIELD_MIN)
        | (clean["yield_to_maturity"] > _YIELD_MAX)
    )
    if bad_yield.any():
        report.warnings.append(f"{int(bad_yield.sum())} yield(s) outside plausible band")
        clean = clean[~bad_yield]

    # Missing-volume → 0 (illiquid / no print that day).
    clean["volume"] = clean["volume"].fillna(0.0)
    return clean.reset_index(drop=True), report


def forward_fill_prices(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Forward-fill missing prices per CUSIP along the date axis.

    Returns the filled frame and the number of cells filled. A desk carries the
    last good mark forward when no fresh trade prints; we replicate that.
    """
    out = df.sort_values(["cusip", "trade_date"]).copy()
    n_missing = int(out["price"].isna().sum())
    out["price"] = out.groupby("cusip")["price"].ffill()
    out["yield_to_maturity"] = out.groupby("cusip")["yield_to_maturity"].ffill()
    return out, n_missing


def validate_bond_reference(df: pd.DataFrame) -> ValidationReport:
    """Validate static bond reference data (structure + economic sanity)."""
    required = {"cusip", "issuer", "sector", "rating", "coupon", "maturity", "issue_date"}
    report = ValidationReport(n_rows=len(df))
    missing = required - set(df.columns)
    if missing:
        report.errors.append(f"missing columns: {sorted(missing)}")
        return report
    if df["cusip"].duplicated().any():
        report.errors.append("duplicate CUSIPs in reference data")
    if (df["coupon"] < 0).any() or (df["coupon"] > 20).any():
        report.warnings.append("coupon outside [0, 20]% for some bonds")
    bad_dates = pd.to_datetime(df["maturity"]) <= pd.to_datetime(df["issue_date"])
    if bad_dates.any():
        report.errors.append(f"{int(bad_dates.sum())} bond(s) mature before issuance")
    return report
