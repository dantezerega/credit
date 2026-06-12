# Credit Spread Relative Value (RV) Dashboard

A full-stack application that ingests corporate-bond market data, computes the
full family of credit spread metrics, fits issuer spread curves, detects
rich/cheap dislocations, generates mean-reversion trade signals, and backtests
them — a simplified replica of a credit trading desk's RV workflow.

> **Data note.** Real TRACE access requires a FINRA subscription, so the
> project ships a self-consistent **synthetic data generator** that fabricates
> issuers, bonds, a Treasury curve, and mean-reverting daily spreads. Prices are
> derived *from* the generated spreads by discounting cash flows, so the
> analytics engine recovers spreads close to the ground truth — every feature is
> exercised with realistic-looking data. Swap the generator for a TRACE loader
> to go live.

---

## Architecture

```
credit-spread-dashboard/
├── backend/                 FastAPI + analytics engine (Python 3.12)
│   ├── app/
│   │   ├── analytics/       cashflows, curves, zspread, oas, relative_value,
│   │   │                    signals, sector, backtest, pca
│   │   ├── ingestion/       sample_data, validation, pipeline
│   │   ├── api/             routes (typed) + service layer
│   │   ├── models.py        SQLAlchemy ORM (7 tables)
│   │   ├── schemas.py       Pydantic response contracts
│   │   ├── alerting.py      Slack / email signal alerts
│   │   └── main.py          app entrypoint
│   ├── alembic/             database migrations
│   ├── scripts/             seed.py, daily_signals.py
│   └── tests/               pytest suite (>90% coverage)
├── frontend/                React + TypeScript + Vite + Tailwind + Recharts
│   └── src/components/       dashboard, RV tables, curve viewer, charts, backtest
├── database/                schema.sql (Postgres DDL reference)
└── docker-compose.yml       Postgres + backend + frontend
```

---

## Quick start

### Option A — Docker (full stack)

```bash
docker compose up --build
```

* Frontend → http://localhost:8080
* API docs → http://localhost:8000/docs

The backend container runs migrations and seeds 180 business days of sample
data + analytics on first boot.

### Option B — Local dev

**Backend** (Python 3.12; the scientific stack has no 3.14 wheels yet):

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed --days 180        # load sample data + run analytics
uvicorn app.main:app --reload            # http://localhost:8000
```

**Frontend**:

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173 (proxies /api)
```

---

## The analytics engine

All spreads are quoted in **basis points**; the engine uses an Actual/365 day
count and annually-compounded discounting throughout for internal consistency.

| Metric | Definition | Module |
|--------|-----------|--------|
| **YTM** | flat rate repricing the bond's cash flows | `zspread.py` |
| **G-spread** | YTM − Treasury par yield at maturity | `zspread.py` |
| **I-spread** | YTM − Treasury yield at the bond's duration | `zspread.py` |
| **Z-spread** | constant spread over the Treasury *curve* repricing the bond | `zspread.py` |
| **OAS** | Z-spread − embedded-option cost (simplified) | `oas.py` |

### Simplified OAS

A true OAS needs a calibrated short-rate lattice + vol surface. We instead
compute `OAS ≈ Z-spread − OptionCost`, where the call-option cost is a
closed-form estimate `k·vol·√T_call / duration`. Bullets have `OAS = Z-spread`;
callables (modelled here as long bonds with a ~5y call) trade at a lower OAS.
Assumptions are documented in full at the top of `app/analytics/oas.py`.

### Issuer curve fitting

For each issuer we fit `(maturity, spread)` points with, in order of preference:

* **Nelson-Siegel** (4-parameter, level/slope/curvature) — chosen with ≥4 bonds,
* **Cubic spline** — available on request with ≥4 knots,
* **Linear interpolation** — always-works fallback (and a flat curve for a single
  bond).

`Residual = Actual Spread − Model Spread`. Residuals are stored and standardised
per bond over a trailing window into a **z-score** and **historical percentile**.

### Signals & backtest

* `z > +2` → **BUY CHEAP**, `z < −2` → **SELL RICH**.
* Expected reversion = −residual (residual reverts to its mean).
* **Signal strength (1–100)** blends `|z|` (0.6), liquidity (0.2) and empirical
  reversion reliability (0.2).
* The **backtester** opens at `|z| > entry`, exits when `z` reverts to 0, and
  reports hit rate, average reversion (bp), per-trade Sharpe and max drawdown.

### Bonus features

* **PCA spread decomposition** (`analytics/pca.py`) — systemic vs idiosyncratic.
* **Cross-sector RV** with a desk narrative ("Energy 1.8σ cheap to Industrials").
* **Automated daily signals + Slack/email alerting** (`scripts/daily_signals.py`,
  `app/alerting.py`).

---

## API

Interactive docs at `/docs`. Key endpoints (all return typed schemas):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/bonds` | bonds (filter by issuer/sector/rating) |
| GET | `/api/issuers` | distinct issuers |
| GET | `/api/spreads` | spread metrics (by date or CUSIP history) |
| GET | `/api/spreads/history/{cusip}` | G/I/Z/OAS time series |
| GET | `/api/rv/cheapest` · `/api/rv/richest` | top-20 RV rankings |
| GET | `/api/signals` · `/api/signals/top` | mean-reversion signals |
| GET | `/api/issuer/{issuer}` | fitted curve + residual points |
| GET | `/api/sectors` | cross-sector RV + narrative |
| GET | `/api/residuals/distribution` | z-score histogram data |
| GET | `/api/backtest` | strategy performance |
| POST | `/api/pipeline/run` | recompute spreads→residuals→signals |
| POST | `/api/alerts/send` | dispatch signal alerts |

---

## Database

Seven tables (`bonds`, `market_data`, `treasury_curve`, `spreads`, `residuals`,
`signals`, `backtest_results`) defined as SQLAlchemy ORM models with Alembic
migrations. `database/schema.sql` holds the equivalent Postgres DDL. Default
local DB is SQLite (zero infra); docker-compose uses Postgres 16.

```bash
cd backend
alembic upgrade head          # apply migrations
alembic revision --autogenerate -m "msg"   # new migration
```

---

## Testing

```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

52 tests cover spread maths (priced-off-curve ⇒ Z≈0, YTM inversion, OAS
behaviour), curve fitting (NS recovery, spline knots, fallbacks), the RV/signal/
backtest logic, the bonus PCA/alerting paths, and the full API surface —
**~93% line coverage**.

---

## License / disclaimer

Synthetic data, simplified models. For research and educational use only — not
investment advice.
# credit
