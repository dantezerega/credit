"""Export the read-only API as a tree of JSON files.

The dashboard ships to static hosting with no backend behind it, so every GET
the frontend can make is pre-rendered here and served as a file. The data is a
fixed synthetic sample, so a snapshot loses nothing.

Static hosting ignores query strings, which is why parameters end up in the
filename. The rule below is mirrored in frontend/src/api/client.ts; change one
and you must change the other.

    /rv/cheapest + {limit: 20}  ->  rv/cheapest__limit-20.json
    /issuer/EXXON MOBIL         ->  issuer/EXXON-MOBIL.json

Run from the backend directory with the app's database configured:

    .venv/bin/python scripts/export_snapshot.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

OUT_DIR = (
    Path(__file__).resolve().parents[2] / "frontend" / "public" / "api-static"
)

# Limits the UI actually asks for, plus each endpoint's own default so a call
# that omits the argument still resolves.
RV_LIMITS = (20,)
SIGNAL_LIMITS = (10, 15)
ENTRY_ZS = (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0)

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def slug(value: str) -> str:
    return _UNSAFE.sub("-", value).strip("-")


def snapshot_path(path: str, params: dict | None = None) -> Path:
    """Mirror of snapshotUrl() in the TypeScript client."""
    query = (
        ",".join(f"{k}-{slug(_fmt(params[k]))}" for k in sorted(params))
        if params
        else ""
    )
    parts = [slug(p) for p in path.split("/") if p]
    name = parts[-1] + (f"__{query}" if query else "") + ".json"
    return OUT_DIR.joinpath(*parts[:-1], name)


def _fmt(value) -> str:
    """Match JavaScript's String(): 2.0 renders as "2", not "2.0"."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def main() -> int:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    client = TestClient(app)

    def fetch(path: str, params: dict | None = None) -> object:
        res = client.get(f"/api{path}", params=params)
        res.raise_for_status()
        body = res.json()
        out = snapshot_path(path, params)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(body, separators=(",", ":")))
        return body

    # Fixed endpoints.
    fetch("/dashboard/summary")
    fetch("/sectors")
    fetch("/sectors/list")
    fetch("/residuals/distribution")
    fetch("/signals")
    fetch("/bonds")
    issuers = fetch("/issuers")

    for limit in RV_LIMITS:
        fetch("/rv/cheapest", {"limit": limit})
        fetch("/rv/richest", {"limit": limit})

    for limit in SIGNAL_LIMITS:
        fetch("/signals/top", {"limit": limit})

    for entry_z in ENTRY_ZS:
        fetch("/backtest", {"entry_z": entry_z, "exit_z": 0.0})

    # Per-issuer curve, and the bond list the time-series picker needs.
    cusips: set[str] = set()
    for issuer in issuers:
        fetch(f"/issuer/{issuer}")
        for bond in fetch("/bonds", {"issuer": issuer}):
            cusips.add(bond["cusip"])

    for cusip in sorted(cusips):
        fetch(f"/spreads/history/{cusip}")

    files = sorted(OUT_DIR.rglob("*.json"))
    size = sum(f.stat().st_size for f in files)
    print(f"{len(files)} files, {size / 1_048_576:.2f} MB -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
