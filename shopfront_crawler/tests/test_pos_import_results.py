from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app import sync
from app.db import Base
from app.config import Settings
from app.models import InventorySnapshot, InventorySnapshotManifest, Product, Sale, SaleItem, Store, SyncJob, SyncRun
from app.sync import _upsert_sale_product, merge_sale_detail


def test_audit_odoo_sales_batch_counts_formal_orders_and_allowed_skips():
    audit = main.audit_odoo_sales_batch(
        {
            "result": {
                "ok": True,
                "business": {
                    "imported": 2,
                    "updated_orders": 1,
                    "skipped": [{"reason": "cancelled source sale"}],
                },
            }
        },
        expected_count=4,
    )

    assert audit == {"imported": 2, "updated_orders": 1, "skipped": 1}


def test_audit_odoo_sales_batch_accepts_legacy_receipt_when_counts_cover_every_item():
    audit = main.audit_odoo_sales_batch(
        {"result": {"ok": True, "business": {"imported": 2, "updated_orders": 1}}},
        expected_count=3,
    )
    assert audit == {"imported": 2, "updated_orders": 1, "skipped": 0}


@pytest.mark.parametrize(
    "business, expected_error",
    [
        ({"imported": 1, "updated_orders": 0, "skipped": []}, "count mismatch"),
        ({"imported": 1, "updated_orders": 0, "skipped": [{"reason": "unmatched or empty sale lines"}]}, "require repair"),
        ({"imported": 1, "updated_orders": 0}, "skipped-order details"),
    ],
)
def test_audit_odoo_sales_batch_rejects_incomplete_formal_import(business, expected_error):
    with pytest.raises(RuntimeError, match=expected_error):
        main.audit_odoo_sales_batch({"result": {"ok": True, "business": business}}, expected_count=2)


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
async def test_inventory_fetch_releases_sqlite_write_transaction(db_session, monkeypatch):
    store = Store(store_key="skr", vendor="skr")
    db_session.add(store)
    db_session.commit()

    class FakeClient:
        async def fetch_outlets(self, *args):
            return []

        async def fetch_sales_graphql(self, *args):
            return []

        async def fetch_sales(self, *args):
            return []

        async def fetch_products(self, *args):
            return [{"id": "product-1", "name": "Test product", "inventory": []}]

        async def fetch_inventory(self, *args):
            assert not db_session.in_transaction()
            return [{
                "id": "product-1",
                "inventory": [{"outlet": {"id": "outlet-1", "name": "Main"}, "quantity": 4}],
            }]

        async def close(self):
            return None

    client = FakeClient()

    async def fake_access_token(*args):
        return "token"

    monkeypatch.setattr(sync, "access_token", fake_access_token)
    monkeypatch.setattr(sync, "get_client", lambda *args: client)

    run = await sync.sync_store(
        db_session,
        Settings(),
        store,
        date(2026, 11, 1),
        date(2026, 11, 1),
        refresh_inventory=True,
    )

    assert run.status == "completed"
    assert run.counts["inventory_sync_complete"] is True
    manifest = db_session.scalar(select(InventorySnapshotManifest).where(
        InventorySnapshotManifest.store_key == "skr",
    ))
    assert manifest.complete is True
    assert manifest.source_product_ids == ["product-1"]
    assert manifest.snapshot_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("mirror_enabled", [False, True])
async def test_push_pos_snapshot_returns_batch_and_response_summary(db_session, monkeypatch, mirror_enabled):
    seed_snapshot(db_session)
    monkeypatch.setattr(main.settings, "pos_api_mirror_base_url", "https://mirror.example" if mirror_enabled else "")
    monkeypatch.setattr(main.settings, "pos_api_mirror_token", "fixture-token" if mirror_enabled else "")

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
    targets = ["primary", "mirror"] if mirror_enabled else ["primary"]
    assert result["product_response"] == {target: {"data": {"upserted": 1}} for target in targets}
    assert result["inventory_response"] == {target: {"data": {"replaced": 1}} for target in targets}
    assert result["target_sale_batches"] == {target: 1 for target in targets}
    assert result["sales_batch_audit"] == [
        {
            "target": target,
            "offset": 0,
            "payload_count": 1,
            "response": {"upserted": 1},
        }
        for target in targets
    ]
    assert result["mirror_errors"] == []
    assert len(FakePosClient.instances) == len(targets)
    assert all(client.closed and len(client.sales_payloads) == 1 for client in FakePosClient.instances)
    client = FakePosClient.instances[0]
    assert client.closed is True
    assert len(client.sales_payloads) == 1
    assert client.sales_payloads[0]["items"][0]["external_id"] == "sale-1"
    assert client.sales_payloads[0]["items"][0]["items"][0]["name"] == "Test wine"


@pytest.mark.asyncio
async def test_sales_reconcile_does_not_require_formal_order_receipt(db_session, monkeypatch):
    seed_snapshot(db_session)

    class FakePosClient:
        def __init__(self, *args):
            pass

        async def upsert_products(self, payload):
            return {"data": {"upserted": len(payload["items"])}}

        async def replace_inventory(self, payload):
            return {"data": {"replaced": len(payload["items"])}}

        async def upsert_sales(self, payload):
            return {"data": {"upserted": len(payload["items"])}}

        async def close(self):
            pass

    class FakeOdooClient:
        business_write = None

        def __init__(self, base_url, token, database, enabled, business_write, fallback_token=""):
            FakeOdooClient.business_write = business_write

        async def sync(self, import_type, store_key, items, **kwargs):
            return {"result": {"ok": True, "business": None}}

        async def close(self):
            pass

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    monkeypatch.setattr(main, "OdooSyncClient", FakeOdooClient)
    monkeypatch.setattr(main.settings, "odoo_import_enabled", True)
    monkeypatch.setattr(main.settings, "odoo_api_base_url", "https://odoo.test")
    monkeypatch.setattr(main.settings, "odoo_api_token", "test-token")
    monkeypatch.setattr(main.settings, "odoo_api_database", "aipos_uat")
    monkeypatch.setattr(main.settings, "odoo_business_write_enabled", True)
    monkeypatch.setattr(main.settings, "pos_api_mirror_base_url", "")
    monkeypatch.setattr(main.settings, "pos_api_mirror_token", "")

    result = await main.push_pos_snapshot(
        db_session,
        "skr",
        job=SimpleNamespace(job_type="sales_reconcile", status="queued", payload={}),
    )

    assert result["status"] == "completed"
    assert result["odoo_business_write"] is False
    assert result["odoo_sales"] == {"imported": 0, "updated_orders": 0, "skipped": 0, "batches": 0}
    assert FakeOdooClient.business_write is False


@pytest.mark.asyncio
async def test_full_inventory_snapshot_finalizes_even_when_source_row_is_unmatched(db_session, monkeypatch):
    seed_snapshot(db_session)
    calls = []

    class FakePosClient:
        def __init__(self, *args):
            pass

        async def upsert_products(self, payload):
            return {"data": {"upserted": len(payload["items"])} }

        async def replace_inventory(self, payload):
            assert payload["replace"] is True
            return {"data": {"replaced": len(payload["items"])}}

        async def close(self):
            pass

    class FakeOdooClient:
        def __init__(self, *args):
            pass

        async def sync(self, import_type, store_key, items, **kwargs):
            calls.append((import_type, store_key, items, kwargs))
            unmatched = [] if import_type != "inventory" or kwargs.get("snapshot_finalize") else [
                {"source_id": "product-1", "reason": "source quantity is below reserved quantity"}
            ]
            return {"result": {"ok": True, "business": {"unmatched": unmatched}}}

        async def close(self):
            pass

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    monkeypatch.setattr(main, "OdooSyncClient", FakeOdooClient)
    monkeypatch.setattr(main.settings, "odoo_import_enabled", True)
    monkeypatch.setattr(main.settings, "odoo_api_base_url", "https://odoo.test")
    monkeypatch.setattr(main.settings, "odoo_api_token", "test-token")
    monkeypatch.setattr(main.settings, "odoo_api_database", "aipos_uat")
    monkeypatch.setattr(main.settings, "pos_api_mirror_base_url", "")
    monkeypatch.setattr(main.settings, "pos_api_mirror_token", "")

    result = await main.push_pos_snapshot(
        db_session,
        "skr",
        include_catalog=False,
        product_source_ids=["product-1"],
        include_inventory_snapshot=True,
        inventory_snapshot_source_ids=["product-1", "product-2"],
        include_sales=False,
    )

    assert calls[-1] == (
        "inventory",
        "skr",
        [],
        {"snapshot_finalize": True, "snapshot_source_ids": ["product-1", "product-2"]},
    )
    assert result["inventory_reconciliation_required"] is True
    assert result["inventory_unmatched"] == [
        {"source_id": "product-1", "reason": "source quantity is below reserved quantity"}
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("mirror_enabled", [False, True])
async def test_push_pos_snapshot_records_failure_and_closes_client(db_session, monkeypatch, mirror_enabled):
    seed_snapshot(db_session)
    monkeypatch.setattr(main.settings, "pos_api_mirror_base_url", "https://mirror.example" if mirror_enabled else "")
    monkeypatch.setattr(main.settings, "pos_api_mirror_token", "fixture-token" if mirror_enabled else "")

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
    assert len(FakePosClient.instances) == (2 if mirror_enabled else 1)
    assert all(client.closed for client in FakePosClient.instances)


def test_merge_sale_detail_preserves_existing_fields_when_detail_is_partial():
    merged = merge_sale_detail(
        {"id": "sale-1", "items": [{"id": "line-1"}], "payments": [{"id": "p-1"}]},
        {"items": [], "payments": [{"id": "p-2"}], "updatedAt": "2026-10-29T00:00:00Z"},
    )

    assert merged["id"] == "sale-1"
    assert merged["items"] == [{"id": "line-1"}]
    assert merged["payments"] == [{"id": "p-2"}]
    assert merged["updatedAt"] == "2026-10-29T00:00:00Z"


@pytest.mark.asyncio
async def test_product_reconcile_rejects_duplicate_or_missing_pos_pages(db_session, monkeypatch):
    db_session.add(Store(store_key="skr", vendor="skr"))
    db_session.commit()

    class FakePosClient:
        def __init__(self, *args):
            pass

        async def data(self, store, data_type, page=1, size=500):
            return {"data": {"total": 2, "data": [
                {"source_id": "product-1"},
                {"source_id": "product-1"},
            ]}}

        async def close(self):
            pass

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    with pytest.raises(main.HTTPException) as failure:
        await main.reconcile_pos_products(store="skr", db=db_session)
    assert failure.value.status_code == 502
    assert "1 unique source IDs for 2 rows" in failure.value.detail


@pytest.mark.asyncio
async def test_product_reconcile_separates_historical_references_from_unexplained_ids(db_session, monkeypatch):
    db_session.add_all([
        Store(store_key="skr", vendor="skr"),
        Product(store_key="skr", shopfront_product_id="current-1", name="Current", catalog_last_seen_at=datetime(2026, 10, 30)),
        Sale(
            store_key="skr",
            shopfront_sale_id="sale-old",
            created_at=datetime(2024, 1, 1),
            updated_at=datetime(2024, 1, 1),
            items=[SaleItem(shopfront_product_id="archived-1", product_name="Archived")],
        ),
    ])
    db_session.commit()

    class FakePosClient:
        def __init__(self, *args):
            pass

        async def data(self, store, data_type, page=1, size=500):
            return {"data": {"total": 3, "data": [
                {"source_id": "current-1", "name": "Current"},
                {"source_id": "archived-1", "name": "Archived"},
                {"source_id": "extra-1", "name": "Unexplained"},
            ]}}

        async def close(self):
            pass

    monkeypatch.setattr(main, "OrithosClient", FakePosClient)
    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    result = await main.reconcile_pos_products(store="skr", preview=200, db=db_session)
    data = result["data"]
    assert data["pos_only_classification"]["historical_sale_references"]["source_ids"] == ["archived-1"]
    assert data["pos_only_classification"]["unexplained"]["source_ids"] == ["extra-1"]
    assert data["automatic_deletion_performed"] is False


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
    assert ok is False
    run = db_session.get(SyncRun, run.id)
    assert run.status == "failed"
    assert "POS temporarily unavailable" in (run.error or "")


@pytest.mark.asyncio
async def test_sync_chunk_rejects_pos_count_below_shopfront_source(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={"sales": 10},
    )
    db_session.add(run)
    db_session.commit()

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        return {"status": "completed", "sales": 9, "sales_imported": 9, "error": None}

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

    assert ok is False
    failed = db_session.get(SyncRun, run.id)
    assert failed.status == "failed"
    assert "source=10, imported=9" in (failed.error or "")


@pytest.mark.asyncio
async def test_sync_chunk_keeps_sales_successful_when_inventory_needs_reconciliation(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={"sales": 10},
    )
    db_session.add(run)
    db_session.commit()

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        return {
            "status": "completed",
            "sales": 10,
            "sales_imported": 10,
            "error": None,
            "inventory_unmatched": [{"source_id": "product-missing", "reason": "product not found"}],
            "inventory_reconciliation_required": True,
        }

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)

    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        Store(store_key="skr", vendor="skr"),
        date(2026, 10, 26),
        date(2026, 10, 26),
        None,
        True,
    )

    assert ok is True
    persisted = db_session.get(SyncRun, run.id)
    assert persisted.status == "completed"
    assert persisted.counts["pos_import"]["sales_imported"] == 10
    assert persisted.counts["pos_import"]["inventory_reconciliation_required"] is True
    assert persisted.counts["pos_import"]["inventory_unmatched"][0]["source_id"] == "product-missing"


@pytest.mark.asyncio
async def test_history_chunk_skips_stable_products_when_all_sales_are_unchanged(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={
            "sales": 10,
            "sales_skipped_unchanged": 10,
            "product_source_ids": ["product-1", "product-2"],
            "catalog_source_ids": [],
            "catalog_full_snapshot": False,
        },
    )
    db_session.add(run)
    job = SyncJob(
        store_key="skr",
        job_type="history",
        status="running",
        from_date="2026-10-26",
        to_date="2026-10-26",
        cursor_date="2026-10-26",
    )
    db_session.add(job)
    db_session.commit()
    captured = {}

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        captured.update(kwargs)
        return {"status": "completed", "sales_imported": 0, "error": None}

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
        job.id,
        False,
    )

    assert ok is True
    assert captured["product_source_ids"] == []
    assert captured["replay_sales_window"] is False
    assert captured["job"].id == job.id
    assert db_session.get(SyncJob, job.id).phase == "pos_import"
    assert db_session.get(SyncRun, run.id).counts["sync"]["pos_products_skipped_unchanged"] is True


@pytest.mark.asyncio
async def test_history_retry_replays_unchanged_sales_window(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={"sales": 10, "sales_skipped_unchanged": 10},
    )
    job = SyncJob(
        store_key="skr",
        job_type="history",
        status="running",
        from_date="2026-10-26",
        to_date="2026-10-26",
        cursor_date="2026-10-26",
        payload={"retry_run_id": 123, "replay_sales_window": True},
    )
    db_session.add_all([run, job])
    db_session.commit()
    captured = {}

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        captured.update(kwargs)
        return {"status": "completed", "sales_imported": 10, "error": None}

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)

    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        Store(store_key="skr", vendor="skr"),
        date(2026, 10, 26),
        date(2026, 10, 26),
        job.id,
        False,
    )

    assert ok is True
    assert captured["replay_sales_window"] is True


@pytest.mark.asyncio
async def test_daily_sync_replays_unchanged_sales_and_requires_mirror_ack(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-11-03",
        to_date="2026-11-03",
        status="completed",
        counts={"sales": 10, "sales_skipped_unchanged": 10},
    )
    job = SyncJob(
        store_key="skr",
        job_type="daily_sync",
        status="running",
        from_date="2026-11-03",
        to_date="2026-11-03",
        cursor_date="2026-11-03",
    )
    db_session.add_all([run, job])
    db_session.commit()
    captured = {}

    async def fake_sync_store(*args, **kwargs):
        return run

    async def fake_push_snapshot(*args, **kwargs):
        captured.update(kwargs)
        return {"status": "completed", "sales_imported": 9, "error": None}

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)
    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        Store(store_key="skr", vendor="skr"),
        date(2026, 11, 3),
        date(2026, 11, 3),
        job.id,
        False,
    )

    assert ok is False
    assert captured["run"] is run
    assert captured["replay_sales_window"] is True
    failed = db_session.get(SyncRun, run.id)
    assert failed.status == "failed"
    assert "required=10, source=10, imported=9" in (failed.error or "")


@pytest.mark.asyncio
async def test_daily_sync_requires_complete_inventory_before_pushing(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={"inventory_sync_complete": False},
    )
    db_session.add(run)
    db_session.commit()
    pushed = False

    async def fake_sync_store(*args, **kwargs):
        assert kwargs["refresh_inventory"] is True
        return run

    async def fake_push_snapshot(*args, **kwargs):
        nonlocal pushed
        pushed = True
        return {"status": "completed", "sales_imported": 0}

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)
    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        Store(store_key="skr", vendor="skr"),
        date(2026, 10, 26),
        date(2026, 10, 26),
        None,
        True,
        refresh_inventory=True,
    )

    assert ok is False
    assert pushed is False


@pytest.mark.asyncio
async def test_daily_sync_pushes_full_inventory_source_set(db_session, monkeypatch):
    run = SyncRun(
        store_key="skr",
        from_date="2026-10-26",
        to_date="2026-10-26",
        status="completed",
        counts={
            "inventory_sync_complete": True,
            "inventory_source_product_ids": ["product-1", "product-2"],
            "sales": 0,
        },
    )
    db_session.add(run)
    db_session.commit()
    captured = {}

    async def fake_sync_store(*args, **kwargs):
        assert kwargs["refresh_inventory"] is True
        return run

    async def fake_push_snapshot(*args, **kwargs):
        captured.update(kwargs)
        return {"status": "completed", "sales_imported": 0}

    monkeypatch.setattr(main.settings, "pos_import_enabled", True)
    monkeypatch.setattr(main, "push_pos_snapshot", fake_push_snapshot)
    monkeypatch.setattr(main, "sync_store", fake_sync_store)
    ok = await main._sync_history_chunk(
        db_session,
        "skr",
        Store(store_key="skr", vendor="skr"),
        date(2026, 10, 26),
        date(2026, 10, 26),
        None,
        True,
        refresh_inventory=True,
    )

    assert ok is True
    assert captured["include_inventory_snapshot"] is True
    assert captured["inventory_snapshot_source_ids"] == ["product-1", "product-2"]
    assert captured["inventory_snapshot_at"] is None
    assert "inventory_source_product_ids" not in db_session.get(SyncRun, run.id).counts["sync"]


def test_inventory_snapshot_evidence_requires_complete_manifest(db_session):
    assert main._inventory_snapshot_evidence(db_session, "skr") is None
    manifest = InventorySnapshotManifest(
        store_key="skr",
        source_product_ids=["product-2", " product-1 ", "product-1"],
        snapshot_at=datetime.now(timezone.utc),
        complete=True,
    )
    db_session.add(manifest)
    db_session.commit()

    assert main._inventory_snapshot_evidence(db_session, "skr") == {
        "source_product_ids": ["product-1", "product-2"],
        "snapshot_at": manifest.snapshot_at.replace(tzinfo=timezone.utc).isoformat(),
    }
    manifest.snapshot_at = datetime.now(timezone.utc) - timedelta(hours=25)
    db_session.commit()
    assert main._inventory_snapshot_evidence(db_session, "skr") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("job_type", ["snapshot", "catalog_snapshot"])
async def test_snapshot_jobs_finalize_only_with_fresh_complete_manifest(db_session, monkeypatch, job_type):
    job = SyncJob(store_key="skr", job_type=job_type, status="queued", payload={})
    manifest = InventorySnapshotManifest(
        store_key="skr",
        source_product_ids=["product-1", "product-2"],
        snapshot_at=datetime.now(timezone.utc),
        complete=True,
    )
    db_session.add_all([job, manifest])
    db_session.commit()
    job_id = job.id
    captured = {}

    async def fake_push(_db, _store_key, **kwargs):
        captured.update(kwargs)
        return {"status": "completed", "sales_imported": 0, "error": None}

    monkeypatch.setattr(main, "push_pos_snapshot", fake_push)
    if job_type == "snapshot":
        await main._run_full_snapshot_body(job_id, db_session)
    else:
        monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
        await main._run_catalog_job(job_id, include_sales=False)

    assert captured["include_inventory_snapshot"] is True
    assert captured["inventory_snapshot_source_ids"] == ["product-1", "product-2"]
    assert captured["inventory_snapshot_at"].endswith("+00:00")
    assert db_session.get(SyncJob, job_id).status == "completed"


@pytest.mark.asyncio
async def test_snapshot_job_does_not_claim_success_without_manifest(db_session, monkeypatch):
    job = SyncJob(store_key="skr", job_type="catalog_snapshot", status="queued", payload={})
    db_session.add(job)
    db_session.commit()
    job_id = job.id
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))

    async def fake_push(*_args, **_kwargs):
        return {"status": "completed", "sales_imported": 0, "error": None}

    monkeypatch.setattr(main, "push_pos_snapshot", fake_push)
    await main._run_catalog_job(job_id, include_sales=False)

    completed_job = db_session.get(SyncJob, job_id)
    assert completed_job.status == "failed"
    assert "no verified complete Shopfront inventory snapshot manifest" in completed_job.error


@pytest.mark.asyncio
async def test_history_releases_writer_between_chunks_for_queued_repairs(db_session, monkeypatch):
    db_session.add(Store(store_key="skr", vendor="skr"))
    db_session.commit()
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
    monkeypatch.setattr(main.settings, "history_chunk_days", 14)

    first_chunk_started = asyncio.Event()
    finish_first_chunk = asyncio.Event()
    events = []

    async def fake_sync_history_chunk(_db, _store_key, _store, start, _end, _job_id, _include_catalog, _force_full_catalog=False, **kwargs):
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


@pytest.mark.asyncio
async def test_resumed_history_skips_catalog_when_products_and_inventory_are_durable(db_session, monkeypatch):
    db_session.add_all([
        Store(store_key="skr", vendor="skr"),
        Product(store_key="skr", shopfront_product_id="existing", name="Existing product"),
        InventorySnapshot(store_key="skr", shopfront_product_id="existing", outlet_id="outlet-1", quantity=5),
    ])
    db_session.commit()
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
    calls = []

    async def fake_sync_history_chunk(_db, _store_key, _store, _start, _end, _job_id, include_catalog, _force_full_catalog=False, **kwargs):
        calls.append(include_catalog)
        return True

    monkeypatch.setattr(main, "_sync_history_chunk", fake_sync_history_chunk)
    await main.run_sync_background("skr", date(2026, 10, 26), date(2026, 10, 26), job_id=25)

    assert calls == [False]


@pytest.mark.asyncio
async def test_history_does_not_advance_cursor_after_failed_chunk(db_session, monkeypatch):
    job = SyncJob(
        store_key="skr",
        job_type="history",
        status="running",
        from_date="2026-10-01",
        to_date="2026-10-14",
        cursor_date="2026-10-01",
    )
    db_session.add_all([Store(store_key="skr", vendor="skr"), job])
    db_session.commit()
    job_id = job.id
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
    calls = []

    async def failed_chunk(_db, _store_key, _store, start, end, _job_id, _include_catalog, _force_full_catalog=False, **kwargs):
        calls.append((start, end))
        return False

    monkeypatch.setattr(main, "_sync_history_chunk", failed_chunk)
    await main.run_sync_background("skr", date(2026, 10, 1), date(2026, 10, 14), job_id=job_id)

    job = db_session.get(SyncJob, job_id)
    assert calls == [(date(2026, 10, 1), date(2026, 10, 14))]
    assert job.cursor_date == "2026-10-01"
    assert job.status == "failed"
    assert "history chunk failed" in (job.error or "")


@pytest.mark.asyncio
async def test_scheduled_sync_skips_store_with_active_history_job(db_session, monkeypatch):
    db_session.add_all([
        Store(store_key="skr", vendor="skr"),
        SyncJob(store_key="skr", job_type="history", status="running", from_date="2026-01-01", to_date="2026-01-02", cursor_date="2026-01-01"),
    ])
    db_session.commit()
    monkeypatch.setattr(main, "get_db", lambda: iter((db_session,)))
    monkeypatch.setattr(main.settings, "sync_lookback_days", 3)
    monkeypatch.setattr(main.settings, "sync_timezone", "Australia/Adelaide")

    calls = []

    async def unexpected_sync(*args, **kwargs):
        calls.append((args, kwargs))

    monkeypatch.setattr(main, "run_sync_background", unexpected_sync)
    await main.scheduled_sync()

    assert calls == []


def test_active_job_is_store_wide_for_manual_sync(db_session):
    db_session.add(SyncJob(store_key="skr", job_type="history", status="running"))
    db_session.commit()

    active = main.active_job(db_session, "skr")

    assert active is not None
    assert active.job_type == "history"
