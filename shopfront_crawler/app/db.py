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
    # ``create_all`` does not upgrade a persistent SQLite/PostgreSQL volume.
    # Keep all crawler schema evolution here so an old deployment volume is
    # upgraded before request handlers query the new columns.
    additions = {
        "shopfront_tokens": {
            "token_type": "VARCHAR(32)",
            "expires_at": "TIMESTAMP",
            "scopes": "TEXT",
            "status": "VARCHAR(32)",
            "last_refresh_at": "TIMESTAMP",
        },
        "sync_runs": {
            "from_date": "VARCHAR(32)",
            "to_date": "VARCHAR(32)",
            "counts": "TEXT",
            "error": "TEXT",
        },
        "sync_jobs": {
            "job_type": "VARCHAR(32)",
            "status": "VARCHAR(32)",
            "from_date": "VARCHAR(32)",
            "to_date": "VARCHAR(32)",
            "cursor_date": "VARCHAR(32)",
            "payload": "TEXT",
            "error": "TEXT",
            "created_at": "TIMESTAMP",
            "started_at": "TIMESTAMP",
            "finished_at": "TIMESTAMP",
        },
        "store_mappings": {
            "shopfront_outlet": "VARCHAR(255)",
            "pos_company_id": "VARCHAR(128)",
            "pos_outlet_id": "VARCHAR(128)",
            "enabled": "BOOLEAN",
            "updated_at": "TIMESTAMP",
        },
        "pos_import_runs": {
            "status": "VARCHAR(32)",
            "counts": "TEXT",
            "error": "TEXT",
            "created_at": "TIMESTAMP",
            "finished_at": "TIMESTAMP",
        },
        "external_sync_states": {
            "entity_type": "VARCHAR(32)",
            "source_id": "VARCHAR(160)",
            "status": "VARCHAR(32)",
            "error": "TEXT",
            "synced_at": "TIMESTAMP",
        },
        "inventory_snapshots": {
            "outlet_id": "VARCHAR(128)",
            "outlet_name": "VARCHAR(255)",
        },
        "sale_items": {
            "line_key": "VARCHAR(128)",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
            if table == "sale_items" and "line_key" not in existing:
                # Older rows have no source line identity. Their local id is a
                # stable fallback until that sale is refreshed from Shopfront.
                connection.execute(text("UPDATE sale_items SET line_key = CAST(id AS VARCHAR(128)) WHERE line_key IS NULL"))
