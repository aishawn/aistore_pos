from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.db import Base
from app.models import InventorySnapshot, Product, Sale, SaleItem, Store, SyncRun


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
        "products": 3,
        "pos_import": {"status": "failed", "products": 3, "error": "POS temporarily unavailable"},
    }
