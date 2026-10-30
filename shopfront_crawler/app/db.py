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
engine = create_engine(
    url,
    # A stale worker or overlapping deployment must fail quickly and let the
    # durable retry loop take over. A long SQLite lock timeout makes the whole
    # async worker appear healthy while it is actually wedged.
    connect_args={"check_same_thread": False, "timeout": 5} if url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
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
    if engine.dialect.name == "sqlite":
        # History sync performs slow remote requests between writes. WAL keeps
        # read-only status/catalog endpoints available while a chunk commits.
        with engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            connection.exec_driver_sql("PRAGMA busy_timeout=5000")
            connection.exec_driver_sql("PRAGMA synchronous=NORMAL")
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
            "heartbeat_at": "TIMESTAMP",
            "phase": "VARCHAR(64)",
            "attempts": "INTEGER DEFAULT 0",
            "max_attempts": "INTEGER DEFAULT 5",
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
        "products": {
            "catalog_last_seen_at": "TIMESTAMP",
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
        # Older rows stored outlet data only inside raw_payload. Deduplicate
        # using the derived outlet key before backfilling the normalized
        # columns. This order matters when a previous deployment already
        # created the unique index: updating all duplicate NULL rows first
        # would violate that index before the cleanup can run.
        if engine.dialect.name == "sqlite":
            connection.execute(text(
                "DELETE FROM inventory_snapshots "
                "WHERE id NOT IN (SELECT MAX(id) FROM inventory_snapshots "
                "GROUP BY store_key, shopfront_product_id, "
                "COALESCE(outlet_id, json_extract(raw_payload, '$.outlet.id'), 'unknown'))"
            ))
            connection.execute(text(
                "UPDATE inventory_snapshots SET outlet_id = COALESCE(outlet_id, "
                "json_extract(raw_payload, '$.outlet.id'), 'unknown'), "
                "outlet_name = COALESCE(outlet_name, json_extract(raw_payload, '$.outlet.name')) "
                "WHERE outlet_id IS NULL"
            ))
        elif engine.dialect.name == "postgresql":
            connection.execute(text(
                "DELETE FROM inventory_snapshots "
                "WHERE id NOT IN (SELECT MAX(id) FROM inventory_snapshots "
                "GROUP BY store_key, shopfront_product_id, "
                "COALESCE(outlet_id, raw_payload->'outlet'->>'id', 'unknown'))"
            ))
            connection.execute(text(
                "UPDATE inventory_snapshots SET outlet_id = COALESCE(outlet_id, "
                "raw_payload->'outlet'->>'id', 'unknown'), "
                "outlet_name = COALESCE(outlet_name, raw_payload->'outlet'->>'name') "
                "WHERE outlet_id IS NULL"
            ))
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
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS shopfront_sync_checkpoints (id INTEGER PRIMARY KEY, store_key VARCHAR(64) NOT NULL, checkpoint_key VARCHAR(64) NOT NULL, value VARCHAR(64) NOT NULL, updated_at TIMESTAMP, CONSTRAINT uq_shopfront_sync_checkpoint UNIQUE (store_key, checkpoint_key))"
        ))
