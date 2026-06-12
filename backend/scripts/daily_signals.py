"""Automated daily signal generation + alerting (bonus feature).

Intended to be run from cron / a scheduler once a day after the market close:

    0 22 * * 1-5  python -m scripts.daily_signals

It re-runs the analytics pipeline over the latest ingested data and dispatches
the resulting signals to any configured Slack / email channels.
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from app.alerting import dispatch_alerts
from app.api.routes import _enrich_signals
from app.database import SessionLocal, init_db
from app.ingestion.pipeline import run_daily_pipeline
from app.models import Signal


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    init_db()
    with SessionLocal() as db:
        result = run_daily_pipeline(db)
        logging.info("pipeline result: %s", result)

        latest = db.execute(select(Signal.trade_date)).scalars().all()
        if not latest:
            logging.info("no signals to alert on")
            return
        asof = max(latest)
        sigs = list(db.execute(select(Signal).where(Signal.trade_date == asof)).scalars())
        dispatched = dispatch_alerts(_enrich_signals(db, sigs))
        logging.info("alerts dispatched: %s", dispatched)


if __name__ == "__main__":
    main()
