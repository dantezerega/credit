#!/usr/bin/env bash
# Container startup: wait for the DB, run migrations, seed once, then serve.
set -euo pipefail

echo "Applying database migrations…"
alembic upgrade head

# Seed sample data + analytics only if the bonds table is empty.
python - <<'PY'
from sqlalchemy import select, func
from app.database import SessionLocal, init_db
from app.models import Bond
from app.ingestion.pipeline import bootstrap

init_db()
with SessionLocal() as db:
    n = db.execute(select(func.count()).select_from(Bond)).scalar_one()
    if n == 0:
        print("Empty database — seeding sample data + analytics…")
        print(bootstrap(db, days=180))
    else:
        print(f"Database already has {n} bonds — skipping seed.")
PY

echo "Starting API on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
