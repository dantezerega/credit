"""Shared pytest fixtures: in-memory DB + seeded analytics."""
from __future__ import annotations

import os

# Force a throwaway SQLite DB before app modules import settings.
os.environ["DATABASE_URL"] = "sqlite:///./test_credit_rv.db"

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.database import Base  # noqa: E402


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def db(engine):
    """A fresh session with all tables, rolled back after each test."""
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def seeded_db(db):
    """A small seeded dataset (short history for speed)."""
    from app.ingestion.pipeline import bootstrap

    bootstrap(db, days=40)
    return db
