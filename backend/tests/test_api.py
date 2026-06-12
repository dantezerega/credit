"""End-to-end API tests against a seeded in-memory database."""
from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite:///./test_api.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.ingestion.pipeline import bootstrap  # noqa: E402
from app.main import app  # noqa: E402
from app.database import SessionLocal  # noqa: E402


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        bootstrap(db, days=45)
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_get_bonds(client):
    r = client.get("/api/bonds")
    assert r.status_code == 200
    bonds = r.json()
    assert len(bonds) > 0
    assert {"cusip", "issuer", "sector", "rating", "maturity"} <= set(bonds[0])


def test_get_bonds_filtered(client):
    r = client.get("/api/bonds", params={"sector": "Energy"})
    assert r.status_code == 200
    assert all(b["sector"] == "Energy" for b in r.json())


def test_get_issuers(client):
    r = client.get("/api/issuers")
    assert r.status_code == 200
    assert "EXXON MOBIL" in r.json()


def test_get_spreads(client):
    r = client.get("/api/spreads")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) > 0
    assert {"g_spread", "i_spread", "z_spread", "oas"} <= set(rows[0])


def test_dashboard_summary(client):
    r = client.get("/api/dashboard/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["total_bonds"] > 0
    assert "active_signals" in data


def test_rv_cheapest_and_richest(client):
    cheap = client.get("/api/rv/cheapest", params={"limit": 5}).json()
    rich = client.get("/api/rv/richest", params={"limit": 5}).json()
    assert len(cheap) <= 5 and len(rich) <= 5
    if cheap and rich:
        # Cheapest has higher z-score than richest.
        assert cheap[0]["z_score"] >= rich[0]["z_score"]


def test_signals_top(client):
    r = client.get("/api/signals/top", params={"limit": 5})
    assert r.status_code == 200
    for s in r.json():
        assert s["direction"] in ("BUY", "SELL")
        assert 1 <= s["signal_strength"] <= 100


def test_issuer_curve(client):
    r = client.get("/api/issuer/EXXON MOBIL")
    assert r.status_code == 200
    data = r.json()
    assert data["issuer"] == "EXXON MOBIL"
    assert len(data["points"]) > 0
    assert len(data["fitted_tenors"]) == len(data["fitted_spreads"])


def test_issuer_curve_unknown_404(client):
    r = client.get("/api/issuer/NOT_A_REAL_ISSUER")
    assert r.status_code == 404


def test_sectors(client):
    r = client.get("/api/sectors")
    assert r.status_code == 200
    data = r.json()
    assert len(data["sectors"]) > 0
    assert isinstance(data["narrative"], list)


def test_backtest(client):
    r = client.get("/api/backtest", params={"entry_z": 2.0, "exit_z": 0.0})
    assert r.status_code == 200
    data = r.json()
    assert "hit_rate" in data and "sharpe" in data
    assert 0.0 <= data["hit_rate"] <= 1.0


def test_spread_history(client):
    cusip = client.get("/api/bonds").json()[0]["cusip"]
    r = client.get(f"/api/spreads/history/{cusip}")
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_residual_distribution(client):
    r = client.get("/api/residuals/distribution")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_pipeline_run(client):
    r = client.post("/api/pipeline/run")
    assert r.status_code == 200
    assert "spreads" in r.json()
