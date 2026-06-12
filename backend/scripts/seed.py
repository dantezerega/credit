"""CLI to bootstrap the database with sample data and run the analytics pipeline.

Usage:
    python -m scripts.seed --days 180
"""
from __future__ import annotations

import argparse
import logging

from app.database import SessionLocal, init_db
from app.ingestion.pipeline import bootstrap


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Credit RV database")
    parser.add_argument("--days", type=int, default=180, help="business days of history")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    init_db()
    with SessionLocal() as db:
        result = bootstrap(db, days=args.days)
    print(f"Seed complete: {result}")


if __name__ == "__main__":
    main()
