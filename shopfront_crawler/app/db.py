from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


url = get_settings().database_url
if url.startswith("sqlite:///"):
    sqlite_path = url.removeprefix("sqlite:///")
    Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401
    Base.metadata.create_all(engine)
    # create_all does not add columns to the persistent SQLite volume. Keep
    # the small schema evolution needed by catalog snapshots self-contained so
    # a deployment restart can read databases created by older versions.
    additions = {
        "inventory_snapshots": {
            "outlet_id": "VARCHAR(128)",
            "outlet_name": "VARCHAR(255)",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
        # Older crawler volumes did not have a uniqueness constraint and may
        # contain one row per historical snapshot. Keep the newest row for
        # each product/outlet before enforcing the idempotency invariant.
        connection.execute(text(
            "DELETE FROM inventory_snapshots "
            "WHERE id NOT IN (SELECT MAX(id) FROM inventory_snapshots "
            "GROUP BY store_key, shopfront_product_id, outlet_id)"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_snapshot "
            "ON inventory_snapshots (store_key, shopfront_product_id, outlet_id)"
        ))
