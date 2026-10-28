from datetime import date, datetime
from decimal import Decimal
import asyncio

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.db import Base
from app.models import InventorySnapshot, Product, Sale, SaleItem, Store, SyncRun
from app.sync import _upsert_sale_product


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def seed_snapshot(db: Session) -> None:
    sale = Sale(
        store_key="skr",
        shopfront_sale_id="sale-1",
        created_at=datetime(2026, 10, 26),
        updated_at=datetime(2026, 10, 26),
        total_price=Decimal("12.99"),
    )
    sale.items.append(SaleItem(
        shopfront_product_id="product-1",
        product_name=None,
        quantity=Decimal("1"),
        unit_price=Decimal("12.99"),
        line_total=Decimal("12.99"),
        raw_payload={"id": "line-1"},
    ))
    db.add_all([
        Store(store_key="skr", vendor="skr"),
        Product(store_key="skr", shopfront_product_id="product-1", name="Test wine", sku="SKU-1"),
        InventorySnapshot(store_key="skr", shopfront_product_id="product-1", quantity=Decimal("5")),
        sale,
    ])
    db.commit()


def test_sale_product_replaces_placeholder_name_and_keeps_source_metadata(db_session):
    product = Product(
        store_key="skr",
        shopfront_product_id="source-old",
        name="Shopfront source-old",
        raw_payload={"id": "source-old", "name": "Shopfront source-old"},
    )
    db_session.add(product)
    db_session.commit()

    updated = _upsert_sale_product(
        db_session,
        "skr",
        "source-old",
        {
            "id": "source-old",
            "name": "REAL PRODUCT NAME",
            "description": "source description",
            "image": None,
            "barcodes": [{"code": "12345", "quantity": 1}],
            "prices": [{"quantity": 1, "price": 9.99}],
        },
        {"id": "line-1", "basePrice": 9.99, "cost": 4.0},
    )
    db_session.commit()
    db_session.refresh(updated)

    assert updated.name == "REAL PRODUCT NAME"
    assert updated.barcode == "12345"
    assert updated.price == Decimal("9.99")
    assert updated.raw_payload["description"] == "source description"
    assert updated.raw_payload["barcodes"][0]["code"] == "12345"


@pytest.mark.asyncio
async def test_push_pos_snapshot_returns_batch_and_response_summary(db_session, monkeypatch):
    seed_snapshot(db_session)

    class FakePosClient:
        instances = []

        def __init__(self, *args):
            self.closed = False
            self.sales_payloads = []
            self.instances.append(self)

        async def upsert_products(self, payload):
            assert len(payload["items"]) == 1
            return {"data": {"upserted": 1}}

        async def replace_inventory(self, payload):
            assert payload["replace"] is True
            assert len(payload["items"]) == 1
            return {"data": {"replaced": 1}}

        async def upsert_sales(self, payload):
            self.sales_payloads.append(payload)
            return {"data": {"upserted": len(payload["items"])}}

        async def close(self):
            self.closed = True

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    result = await main.push_pos_snapshot(db_session, "skr")

    assert result["status"] == "completed"
    assert result["products"] == 1
    assert result["inventory"] == 1
    assert result["sales"] == 1
    assert result["error"] is None
    assert result["sale_batches"] == 1
    assert result["product_response"] == {"data": {"upserted": 1}}
    assert result["inventory_response"] == {"data": {"replaced": 1}}
    assert result["mirror_errors"] == []
    client = FakePosClient.instances[0]
    assert client.closed is True
    assert len(client.sales_payloads) == 1
    assert client.sales_payloads[0]["items"][0]["external_id"] == "sale-1"
    assert client.sales_payloads[0]["items"][0]["items"][0]["name"] == "Test wine"


@pytest.mark.asyncio
async def test_push_pos_snapshot_records_failure_and_closes_client(db_session, monkeypatch):
    seed_snapshot(db_session)

    class FakePosClient:
        instances = []

        def __init__(self, *args):
            self.closed = False
            self.instances.append(self)

        async def upsert_products(self, payload):
            raise RuntimeError("POS temporarily unavailable")

        async def close(self):
            self.closed = True

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    result = await main.push_pos_snapshot(db_session, "skr")

    assert result["status"] == "failed"
    assert result["products"] == 1
    assert result["inventory"] == 1
    assert result["sales"] == 1
    assert result["error"] == "POS temporarily unavailable"
    assert result["mirror_errors"]
    assert FakePosClient.instances[0].closed is True


@pytest.mark.asyncio
async def test_sync_chunk_persists_pos_result_in_run_counts(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={"products": 3},
    )
    db_session.add(run)
    db_session.commit()

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        return {"status": "failed", "products": 3, "error": "POS temporarily unavailable"}

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)
    store = Store(store_key="skr", vendor="skr")

    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        store,
        date(2026, 10, 26),
        date(2026, 10, 26),
        None,
        True,
    )
    db_session.refresh(run)

    assert ok is True
    assert run.counts == {
        "sync": {"products": 3},
        "pos_import": {"status": "failed", "products": 3, "error": "POS temporarily unavailable"},
    }


@pytest.mark.asyncio
async def test_history_releases_writer_between_chunks_for_queued_repairs(db_session, monkeypatch):
    db_session.add(Store(store_key="skr", vendor="skr"))
    db_session.commit()
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
    monkeypatch.setattr(main.settings, "history_chunk_days", 14)

    first_chunk_started = asyncio.Event()
    finish_first_chunk = asyncio.Event()
    events = []

    async def fake_sync_history_chunk(_db, _store_key, _store, start, _end, _job_id, _include_catalog):
        events.append(("chunk-start", start))
        if start == date(2026, 10, 26):
            first_chunk_started.set()
            await finish_first_chunk.wait()
        events.append(("chunk-end", start))
        return True

    monkeypatch.setattr(main, "_sync_history_chunk", fake_sync_history_chunk)

    history = asyncio.create_task(main.run_sync_background(
        "skr", date(2026, 10, 26), date(2026, 11, 9)
    ))
    await first_chunk_started.wait()

    async def queued_repair():
        async with main.sync_lock:
            events.append(("repair", None))

    repair = asyncio.create_task(queued_repair())
    await asyncio.sleep(0)
    finish_first_chunk.set()
    await asyncio.gather(history, repair)

    assert events == [
        ("chunk-start", date(2026, 10, 26)),
        ("chunk-end", date(2026, 10, 26)),
        ("repair", None),
        ("chunk-start", date(2026, 11, 9)),
        ("chunk-end", date(2026, 11, 9)),
    ], events
