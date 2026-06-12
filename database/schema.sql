-- Credit Spread RV Dashboard — PostgreSQL reference schema.
-- This DDL mirrors the SQLAlchemy ORM models (app/models.py) and is applied
-- automatically by Alembic migrations; it is kept here as human-readable
-- documentation and for bootstrapping a database by hand.

-- ---------------------------------------------------------------------------
-- Static bond reference data (one row per security).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bonds (
    cusip        VARCHAR(9)   PRIMARY KEY,
    issuer       VARCHAR(128) NOT NULL,
    sector       VARCHAR(64)  NOT NULL,
    rating       VARCHAR(8)   NOT NULL,
    coupon       DOUBLE PRECISION NOT NULL,        -- annual %, e.g. 4.5
    maturity     DATE         NOT NULL,
    issue_date   DATE         NOT NULL,
    face_value   DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    coupon_freq  INTEGER      NOT NULL DEFAULT 2   -- payments / year
);
CREATE INDEX IF NOT EXISTS ix_bonds_issuer ON bonds (issuer);
CREATE INDEX IF NOT EXISTS ix_bonds_sector ON bonds (sector);
CREATE INDEX IF NOT EXISTS ix_bonds_rating ON bonds (rating);

-- ---------------------------------------------------------------------------
-- Daily observed market data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_data (
    id                 SERIAL PRIMARY KEY,
    cusip              VARCHAR(9) NOT NULL REFERENCES bonds (cusip),
    trade_date         DATE       NOT NULL,
    price              DOUBLE PRECISION NOT NULL,   -- clean price per 100
    yield_to_maturity  DOUBLE PRECISION NOT NULL,   -- decimal
    volume             DOUBLE PRECISION NOT NULL DEFAULT 0.0,  -- $mm
    CONSTRAINT uq_md_cusip_date UNIQUE (cusip, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_md_cusip ON market_data (cusip);
CREATE INDEX IF NOT EXISTS ix_md_date  ON market_data (trade_date);

-- ---------------------------------------------------------------------------
-- Daily risk-free Treasury par curve.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_curve (
    id          SERIAL PRIMARY KEY,
    curve_date  DATE NOT NULL,
    tenor_years DOUBLE PRECISION NOT NULL,
    par_yield   DOUBLE PRECISION NOT NULL,          -- decimal
    CONSTRAINT uq_ust_date_tenor UNIQUE (curve_date, tenor_years)
);
CREATE INDEX IF NOT EXISTS ix_ust_date ON treasury_curve (curve_date);

-- ---------------------------------------------------------------------------
-- Computed spread metrics (basis points).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spreads (
    id         SERIAL PRIMARY KEY,
    cusip      VARCHAR(9) NOT NULL REFERENCES bonds (cusip),
    trade_date DATE NOT NULL,
    g_spread   DOUBLE PRECISION NOT NULL,
    i_spread   DOUBLE PRECISION NOT NULL,
    z_spread   DOUBLE PRECISION NOT NULL,
    oas        DOUBLE PRECISION NOT NULL,
    CONSTRAINT uq_spread_cusip_date UNIQUE (cusip, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_spread_cusip ON spreads (cusip);
CREATE INDEX IF NOT EXISTS ix_spread_date  ON spreads (trade_date);

-- ---------------------------------------------------------------------------
-- Issuer-curve residual diagnostics.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS residuals (
    id            SERIAL PRIMARY KEY,
    cusip         VARCHAR(9) NOT NULL REFERENCES bonds (cusip),
    trade_date    DATE NOT NULL,
    actual_spread DOUBLE PRECISION NOT NULL,
    model_spread  DOUBLE PRECISION NOT NULL,
    residual      DOUBLE PRECISION NOT NULL,        -- actual - model
    z_score       DOUBLE PRECISION NOT NULL,
    percentile    DOUBLE PRECISION NOT NULL,        -- 0..100
    CONSTRAINT uq_resid_cusip_date UNIQUE (cusip, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_resid_cusip ON residuals (cusip);
CREATE INDEX IF NOT EXISTS ix_resid_date  ON residuals (trade_date);

-- ---------------------------------------------------------------------------
-- Mean-reversion trade signals.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
    id                     SERIAL PRIMARY KEY,
    cusip                  VARCHAR(9) NOT NULL REFERENCES bonds (cusip),
    trade_date             DATE NOT NULL,
    direction              VARCHAR(16) NOT NULL,     -- BUY / SELL / FLAT
    z_score                DOUBLE PRECISION NOT NULL,
    residual               DOUBLE PRECISION NOT NULL,
    expected_reversion_bps DOUBLE PRECISION NOT NULL,
    signal_strength        INTEGER NOT NULL,         -- 1..100
    created_at             TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_signal_cusip_date UNIQUE (cusip, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_signal_cusip ON signals (cusip);
CREATE INDEX IF NOT EXISTS ix_signal_date  ON signals (trade_date);

-- ---------------------------------------------------------------------------
-- Backtest run results.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backtest_results (
    id                SERIAL PRIMARY KEY,
    run_at            TIMESTAMP DEFAULT NOW(),
    entry_z           DOUBLE PRECISION NOT NULL,
    exit_z            DOUBLE PRECISION NOT NULL,
    n_trades          INTEGER NOT NULL,
    hit_rate          DOUBLE PRECISION NOT NULL,
    avg_reversion_bps DOUBLE PRECISION NOT NULL,
    sharpe            DOUBLE PRECISION NOT NULL,
    max_drawdown_bps  DOUBLE PRECISION NOT NULL
);
