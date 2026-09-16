"""Application configuration.

Settings are read from environment variables (12-factor style) with sane
defaults for local development. The single ``DATABASE_URL`` knob lets the same
code run against Postgres (production / docker-compose) or SQLite (tests,
quick local runs) without modification.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database -----------------------------------------------------------
    # Default to a local SQLite file so the project is runnable with zero infra.
    # docker-compose overrides this with a Postgres DSN.
    database_url: str = "sqlite:///./credit_rv.db"

    @field_validator("database_url")
    @classmethod
    def _normalize_pg_dsn(cls, v: str) -> str:
        """Normalize hosted-Postgres DSNs to the psycopg3 SQLAlchemy driver.

        Vercel Postgres / Neon / Supabase hand out ``postgres://`` or
        ``postgresql://`` URLs; SQLAlchemy needs an explicit driver. Map both to
        ``postgresql+psycopg://`` (psycopg3). Strip a ``?sslmode=`` style query
        only if it confuses the driver — psycopg3 accepts sslmode, so we keep it.
        """
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    # --- API ----------------------------------------------------------------
    api_title: str = "Credit Spread RV Dashboard API"
    api_version: str = "1.0.0"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # --- Analytics tuning ---------------------------------------------------
    # Lookback window (trading days) used for residual z-scores / percentiles.
    zscore_lookback_days: int = 252
    # Absolute residual z threshold that flags a bond rich/cheap.
    signal_z_threshold: float = 2.0
    # Day-count basis used throughout (Actual/365 fixed for simplicity).
    day_count_basis: float = 365.0

    # --- Alerting (optional bonus feature) ----------------------------------
    slack_webhook_url: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    alert_email_to: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton ``Settings`` instance."""
    return Settings()


settings = get_settings()
