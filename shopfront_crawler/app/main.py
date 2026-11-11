import asyncio
import asyncio
import contextlib
import hmac
import json
import logging
import os
import re
import httpx
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any
from zoneinfo import ZoneInfo

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy import String, case, cast, desc, func, or_, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .config import REQUIRED_SHOPFRONT_SCOPES, get_settings
from .db import SessionLocal, get_db, init_db
from .models import DailySalesSummary, InventorySnapshot, InventorySnapshotManifest, InventorySnapshotScan, OAuthState, Product, PosImportRun, Sale, SaleItem, ShopfrontCustomer, ShopfrontExtendedRecord, ShopfrontPurchaseOrder, ShopfrontReportSnapshot, ShopfrontSupplier, ShopfrontSyncCheckpoint, ShopfrontToken, Store, StoreMapping, SyncJob, SyncRun, WebhookEvent
from .shopfront import CATALOG_QUERY, ShopfrontError
from .pos import OrithosClient, PosIntegrationError
from .source_reporting import dashboard_report_transaction_count, dashboard_sales_matching_report, inventory_manifest_status, inventory_report_totals, inventory_snapshot_is_fresh
from .odoo import OdooSyncClient, receipt_count
from .sync import access_token, ensure_stores, get_client, is_after, make_state, parse_decimal, save_token, shelf_unit_price, sync_customers, sync_extended_data, sync_store, sync_supply_chain, verify_webhook, without_credentials

settings = get_settings()
app = FastAPI(title="Shopfront Crawler", version="0.1.0")
logger = logging.getLogger(__name__)

POS_UI_NOTIFY_HOSTS: dict[str, list[str]] = {
    "skr": ["skr.orithos.com.au", "demo.orithos.com.au"],
}


async def notify_pos_ui_sync(store_key: str) -> None:
    url = settings.pos_ui_notify_url.strip()
    secret = settings.orithos_shopfront_sync_notify_secret.strip()
    if not url or not secret:
        return
    payload = {
        "storeKey": store_key,
        "hosts": POS_UI_NOTIFY_HOSTS.get(store_key, []),
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            response = await http.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
            if response.status_code >= 300:
                logger.warning("POS UI sync notify rejected: store=%s status=%s", store_key, response.status_code)
    except Exception as exc:
        logger.warning("POS UI sync notify failed: store=%s error=%r", store_key, exc)


def should_include_catalog(job_type: str | None, existing_products: int, existing_inventory: int) -> bool:
    """Refresh stock when the catalogue exists but its inventory mirror does not."""
    return job_type == "daily_sync" or existing_products == 0 or existing_inventory == 0


def audit_odoo_sales_batch(response: dict[str, Any], expected_count: int) -> dict[str, int]:
    """Verify every source sale reached Odoo without inventing POS orders."""
    payload = response.get("result", response) if isinstance(response, dict) else {}
    business = payload.get("business") if isinstance(payload, dict) else None
    if not isinstance(business, dict):
        raise RuntimeError("Odoo did not confirm formal Shopfront sales business writes")

    imported_value = business.get("imported")
    if imported_value is None:
        imported_value = business.get("created", 0)
    updated_value = business.get("updated_orders")
    if updated_value is None:
        updated_value = business.get("updated", 0)
    imported = receipt_count(imported_value)
    updated = receipt_count(updated_value)
    if "mirrored" in business and imported == 0 and updated in (None, 0):
        raise RuntimeError(
            "Odoo returned a mirror-only sales acknowledgement; formal sales import is required"
        )
    if imported is None or updated is None:
        raise RuntimeError("Odoo sales response contains invalid imported/updated counts")
    skipped = business.get("skipped")
    if skipped is None and imported + updated == expected_count:
        skipped = []
    if not isinstance(skipped, list):
        raise RuntimeError("Odoo sales response did not include skipped-order details")
    if imported + updated + len(skipped) != expected_count:
        raise RuntimeError(
            "Odoo sales import count mismatch: "
            f"expected={expected_count}, imported={imported}, updated={updated}, skipped={len(skipped)}"
        )

    expected_skips = {
        "cancelled source sale",
        "source sale is not completed",
        "source sale is incomplete",
        "source financial evidence does not reconcile",
    }
    unexpected = [
        str(item.get("reason") or "unknown") if isinstance(item, dict) else "malformed skipped-order detail"
        for item in skipped
        if not isinstance(item, dict) or item.get("reason") not in expected_skips
    ]
    if unexpected:
        reasons = ", ".join(sorted(set(unexpected)))
        raise RuntimeError(f"Odoo skipped Shopfront sales that require repair: {reasons}")

    return {"imported": imported, "updated_orders": updated, "skipped": len(skipped), "mirrored": 0}


def source_sale_snapshot_is_complete(raw_sale: Any, sale_items: list[SaleItem]) -> bool:
    if not isinstance(raw_sale, dict):
        return False
    source_items = raw_sale.get("items")
    source_payments = raw_sale.get("payments")
    if not isinstance(source_items, list) or not isinstance(source_payments, list):
        return False

    source_ids = [str(item.get("id") or "").strip() for item in source_items if isinstance(item, dict)]
    stored_ids = [str(item.line_key or "").strip() for item in sale_items]
    return (
        len(source_ids) == len(source_items)
        and len(stored_ids) == len(sale_items)
        and all(source_ids)
        and all(stored_ids)
        and len(set(source_ids)) == len(source_ids)
        and len(set(stored_ids)) == len(stored_ids)
        and set(source_ids) == set(stored_ids)
    )


def validate_pos_import_receipt(response: Any, expected_count: int, entity: str) -> dict[str, Any]:
    receipt = response.get("data", response) if isinstance(response, dict) else None
    if not isinstance(receipt, dict):
        raise PosIntegrationError(f"POS {entity} import returned no structured receipt")
    status = str(receipt.get("status") or "").upper()
    if status in {"FAILED", "BLOCKED", "BLOCKED_MAPPING", "REJECTED"}:
        raise PosIntegrationError(f"POS {entity} import was rejected: {status}")
    acknowledged = receipt.get("item_count", receipt.get("upserted", receipt.get("accepted")))
    if acknowledged != expected_count:
        raise PosIntegrationError(
            f"POS {entity} receipt count mismatch: expected {expected_count}, got {acknowledged!r}"
        )
    return receipt
scheduler = AsyncIOScheduler(timezone=settings.sync_timezone)
sync_lock = __import__("asyncio").Lock()
history_lock = __import__("asyncio").Lock()
snapshot_lock = __import__("asyncio").Lock()
active_sync_tasks: dict[str, asyncio.Task] = {}
active_job_tasks: dict[int, asyncio.Task] = {}


def wake_durable_worker() -> None:
    """Wake the worker immediately after an API enqueue.

    The interval trigger remains the recovery path, while this avoids making
    an operator wait for the next scheduler tick when APScheduler has just
    resumed after a deployment or a long-running request.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(process_next_job())
    except RuntimeError:
        logger.warning("Could not wake durable worker: no running event loop")


def report_sync_notification_token() -> str:
    return (settings.orithos_shopfront_sync_notify_secret.strip()
            or settings.shopfront_integration_token.strip()
            or settings.pos_api_token.strip())


async def notify_report_refresh(store_key: str, start: date, end: date, run_id: int | None, status: str) -> None:
    url = report_sync_notification_url()
    token = report_sync_notification_token()
    if not url or not token:
        return
    payload = {"storeKey": store_key, "fromDay": start.isoformat(), "toDay": end.isoformat(),
               "syncRunId": run_id, "status": status}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json=payload, headers={"X-Shopfront-Integration-Token": token})
            response.raise_for_status()
    except Exception as exc:
        logger.warning("Report refresh notification failed: store=%s run=%s error=%s", store_key, run_id, type(exc).__name__)


def report_sync_notification_url() -> str:
    configured = settings.report_sync_notification_url.strip()
    if configured:
        return configured
    notify_url = settings.pos_ui_notify_url.strip()
    suffix = "/api/internal/shopfront-sync-notify"
    if notify_url.endswith(suffix):
        return notify_url[:-len(suffix)] + "/api/internal/shopfront-sync-complete"
    if notify_url:
        from urllib.parse import urlsplit, urlunsplit

        parsed = urlsplit(notify_url)
        if parsed.scheme and parsed.netloc:
            return urlunsplit((parsed.scheme, parsed.netloc, "/api/internal/shopfront-sync-complete", "", ""))
    return "http://frontend:3000/api/internal/shopfront-sync-complete"


@app.on_event("startup")
async def startup() -> None:
    init_db()
    db = next(get_db())
    try:
        ensure_stores(db, settings)
        # A process restart must not leave durable jobs stuck in ``running``.
        # Requeue them and resume from their persisted cursor below.
        interrupted_runs = db.scalars(select(SyncRun).where(SyncRun.status == "running")).all()
        for run in interrupted_runs:
            run.status = "failed"
            run.error = "interrupted by crawler restart; history job will retry this range"
            run.finished_at = datetime.now(timezone.utc)
        interrupted = db.scalars(select(SyncJob).where(SyncJob.status == "running").order_by(SyncJob.store_key, desc(SyncJob.id))).all()
        resumed_stores: set[tuple[str, str]] = set()
        for job in interrupted:
            job_key = (job.store_key, job.job_type)
            if job_key in resumed_stores:
                job.status = "superseded"
                job.error = "superseded by newer job after crawler restart"
                job.finished_at = datetime.now(timezone.utc)
                continue
            job.status = "queued"
            # The job is healthy and resumable; keep restart history in the
            # run records instead of exposing a stale error on live status.
            job.error = None
            resumed_stores.add(job_key)
        # Keep only the newest queued snapshot job of each type. The durable
        # worker below will pick up the surviving queued job after startup.
        queued_snapshots = db.scalars(
            select(SyncJob)
            .where(SyncJob.status == "queued", SyncJob.job_type.in_(["snapshot", "catalog_snapshot", "sales_repair", "sales_reconcile"]))
            .order_by(SyncJob.store_key, desc(SyncJob.id))
        ).all()
        queued_snapshot_keys: set[tuple[str, str]] = set()
        for job in queued_snapshots:
            key = (job.store_key, job.job_type)
            if key in queued_snapshot_keys:
                job.status = "superseded"
                job.error = "superseded by newer queued snapshot"
                job.finished_at = datetime.now(timezone.utc)
                continue
            queued_snapshot_keys.add(key)

        # Keep only the newest queued history job for a store; the worker
        # resumes it from its persisted cursor.
        queued_histories = db.scalars(
            select(SyncJob)
            .where(SyncJob.status == "queued", SyncJob.job_type == "history")
            .order_by(SyncJob.store_key, desc(SyncJob.id))
        ).all()
        queued_history_stores: set[str] = set()
        for job in queued_histories:
            if job.store_key in queued_history_stores:
                job.status = "superseded"
                job.error = "superseded by newer queued history job"
                job.finished_at = datetime.now(timezone.utc)
                continue
            queued_history_stores.add(job.store_key)
        db.commit()
    finally:
        db.close()
    for sync_time in settings.daily_sync_times():
        hour, minute = (int(part) for part in sync_time.split(":"))
        scheduler.add_job(
            scheduled_sync,
            CronTrigger(hour=hour, minute=minute, timezone=settings.sync_timezone),
            id=f"shopfront-sync-{hour:02d}{minute:02d}",
            args=[sync_time],
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    scheduler.add_job(
        process_next_job,
        "interval",
        seconds=2,
        id="shopfront-durable-worker",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        scheduled_incremental_sync,
        "interval",
        minutes=max(1, int(settings.sync_interval_minutes)),
        id="shopfront-sync-interval",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "service": "shopfront-crawler"}


def require_store(store_key: str, db: Session) -> Store:
    store = db.scalar(select(Store).where(Store.store_key == store_key, Store.active.is_(True)))
    if store is None:
        raise HTTPException(404, f"Unknown store: {store_key}")
    return store


def should_include_supply_chain(db: Session, store_key: str) -> bool:
    """Decide whether a daily run should pay for the full supply-chain scan.

    Sales and inventory are deliberately checked every day. Supplier and
    purchase-order directories are much slower and are refreshed on a weekly
    cadence unless the last run was partial or failed.
    """
    if not settings.shopfront_enable_supply_chain:
        return False
    latest = db.scalar(
        select(SyncJob)
        .where(
            SyncJob.store_key == store_key,
            SyncJob.job_type == "supply_chain",
            SyncJob.status == "completed",
        )
        .order_by(desc(SyncJob.finished_at), desc(SyncJob.id))
        .limit(1)
    )
    if latest is None or latest.finished_at is None:
        return True
    finished = latest.finished_at
    if finished.tzinfo is None:
        finished = finished.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - finished >= timedelta(days=max(1, settings.shopfront_supply_chain_interval_days))


def preferred_summary_rows(rows: list[DailySalesSummary]) -> list[DailySalesSummary]:
    """Drop a consolidated null-outlet row when outlet rows exist.

    Shopfront reports can return both the store total and its outlet detail.
    Keeping both in the API makes consumers double count the same day.
    """
    grouped: dict[str, list[DailySalesSummary]] = {}
    for row in rows:
        grouped.setdefault(row.business_date, []).append(row)
    selected: list[DailySalesSummary] = []
    for date_rows in grouped.values():
        named = [row for row in date_rows if row.outlet and str(row.outlet).strip()]
        selected.extend(named or date_rows)
    return sorted(selected, key=lambda row: (row.business_date, row.outlet or ""))


def sales_trend_missing_dates(from_date: date, to_date: date, rows: list[DailySalesSummary]) -> list[str]:
    """Return requested dates without summaries without inferring a calendar state."""
    present = {row.business_date for row in rows if row.business_date}
    missing: list[str] = []
    current = from_date
    while current <= to_date:
        value = current.isoformat()
        if value not in present:
            missing.append(value)
        current += timedelta(days=1)
    return missing


def shopfront_source_report_query(report_type: str, from_date: date | None, to_date: date | None) -> str:
    if report_type == "inventory":
        return '''SELECT BY_NAME AS "Name", case_quantity AS "Case Quantity",
inventory.case_level AS "Case Level", inventory.single_level AS "Item Level",
FORMAT(costs.last_cost * (inventory.case_level + (inventory.single_level / case_quantity)), '$', '', 2)
AS "Value (Inc) (Last)" TOTAL(SUM)
FROM products BY product'''
    if report_type == "sales" and from_date and to_date:
        return f'''SELECT BY_NAME AS "Name",
revenue AS "Revenue",
cost AS "Cost of Goods Sold",
transaction_count AS "Transaction Count",
FORMAT(revenue / transaction_count, '$') AS "Average Sale",
profit AS "Profit",
FORMAT((revenue - cost) / revenue * 100, '', '%', 2) AS "Profit Percentage",
tax AS "Tax Amount",
discount AS "Discount Amount",
FORMAT(revenue, '', '%', 2) AS "Revenue Percentage" TOTAL(PERCENTAGE_FROM_TOTAL),
FORMAT(transaction_count, '', '%', 2) AS "Transaction Percentage" TOTAL(PERCENTAGE_FROM_TOTAL)
FROM sales BY outlet START '{from_date.isoformat()}' END '{to_date.isoformat()}'
ORDER "Name" asc CONSOLIDATED'''
    if report_type == "purchase" and from_date and to_date:
        return f'''SELECT BY_NAME AS "Name", cost AS "Total Cost", fees AS "Fees",
freight AS "Freight", payment_fees AS "Payment Fees", tax AS "Tax Amount"
FROM orders BY outlet START '{from_date.isoformat()}' END '{to_date.isoformat()}'
ORDER "Name" asc CONSOLIDATED'''
    raise ValueError("Unsupported Shopfront source report")


INVENTORY_REPORT_CACHE_SOURCE = "shopfront_reporting_api_v1"


def inventory_report_cache_rows(snapshot: ShopfrontReportSnapshot | None) -> list[dict[str, Any]] | None:
    if snapshot is None or not isinstance(snapshot.rows, dict):
        return None
    if snapshot.rows.get("source") != INVENTORY_REPORT_CACHE_SOURCE:
        return None
    rows = snapshot.rows.get("rows")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        return None
    return rows


async def load_shopfront_inventory_report(
    store_key: str, db: Session, *, now: datetime | None = None,
) -> tuple[list[dict[str, Any]], datetime, str]:
    current = now or datetime.now(timezone.utc)
    snapshot = db.scalar(select(ShopfrontReportSnapshot).where(
        ShopfrontReportSnapshot.store_key == store_key,
        ShopfrontReportSnapshot.report_type == "inventory",
        ShopfrontReportSnapshot.period_key == "all",
    ))
    fetched = snapshot.fetched_at.replace(tzinfo=timezone.utc) if snapshot and snapshot.fetched_at.tzinfo is None else (snapshot.fetched_at if snapshot else None)
    cached_rows = inventory_report_cache_rows(snapshot)
    if cached_rows is not None and fetched and current - fetched < timedelta(seconds=60):
        return cached_rows, fetched, "hit"

    store = require_store(store_key, db)
    client = get_client(settings, store)
    try:
        token = await access_token(db, settings, store)
        rows = await client.run_report(token, shopfront_source_report_query("inventory", None, None))
    finally:
        await client.close()
    normalized = [row for row in rows if isinstance(row, dict)]
    if not normalized:
        raise ShopfrontError("Shopfront inventory report returned no rows")

    if snapshot is None:
        snapshot = ShopfrontReportSnapshot(store_key=store_key, report_type="inventory", period_key="all")
        db.add(snapshot)
    snapshot.rows = {"source": INVENTORY_REPORT_CACHE_SOURCE, "rows": normalized}
    snapshot.fetched_at = current.replace(tzinfo=None)
    db.commit()
    return normalized, current, "refreshed"


def source_product_row(raw: dict[str, Any]) -> dict[str, Any]:
    def name(value: Any) -> str | None:
        return value.get("name") if isinstance(value, dict) else None

    def supplier_entity(value: Any) -> dict[str, Any] | None:
        # ProductSupplier nests the Supplier under "supplier"; core/last are flat.
        if not isinstance(value, dict):
            return None
        nested = value.get("supplier")
        if isinstance(nested, dict):
            return nested
        if value.get("id") is not None or value.get("name") is not None:
            return value
        return None

    suppliers = raw.get("suppliers") if isinstance(raw.get("suppliers"), list) else []
    first_supplier = None
    for entry in suppliers:
        entity = supplier_entity(entry)
        if entity is not None:
            first_supplier = entity
            break
    supplier = (
        supplier_entity(raw.get("coreSupplier"))
        or supplier_entity(raw.get("lastSupplier"))
        or first_supplier
    )
    first_barcode = raw.get("barcodes")[0] if isinstance(raw.get("barcodes"), list) and raw.get("barcodes") and isinstance(raw.get("barcodes")[0], dict) else {}
    additional_fields = raw.get("additionalFields") if isinstance(raw.get("additionalFields"), list) else []
    gift_card_field = next((field for field in additional_fields if isinstance(field, dict) and str(field.get("safeName") or "").casefold() == "vii_is_gift_card"), None)
    gift_card_value = str(gift_card_field.get("value") or "").strip().casefold() if isinstance(gift_card_field, dict) else ""
    is_gift_card = gift_card_value in {"true", "1", "yes", "on"} if gift_card_value else bool(raw.get("giftCard") or raw.get("gift_card") or "gift" in str(raw.get("type") or "").casefold())
    retail_price = shelf_unit_price(raw)
    return {
        "shopfront_product_id": raw.get("id"),
        "sku": raw.get("mdbId"),
        "barcode": first_barcode.get("code"),
        "name": raw.get("name"),
        "category": name(raw.get("category")),
        "brand": name(raw.get("brand")),
        "family": name(raw.get("family")),
        "supplier": name(supplier),
        "tags": raw.get("tags"),
        "suppliers": raw.get("suppliers"),
        "coreSupplier": raw.get("coreSupplier"),
        "lastSupplier": raw.get("lastSupplier"),
        "type": raw.get("type"),
        "tax_rate": name(raw.get("taxRate")),
        "cost_tax_rate": name(raw.get("costTaxRate")),
        "track_inventory": raw.get("trackInventory"),
        "case_quantity": raw.get("caseQuantity"),
        "cost": raw.get("cost"),
        "price": float(retail_price) if retail_price is not None else None,
        "status": raw.get("status"),
        "is_gift_card": is_gift_card,
        "raw_payload": raw,
    }


@app.get("/api/source-reports/{report_type}")
async def shopfront_source_report(
    report_type: str,
    request: Request,
    store: str,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=600),
    q: str | None = None,
    negative_only: bool = False,
    dashboard: bool = False,
    status: str | None = None,
    brand: str | None = None,
    category: str | None = None,
    family: str | None = None,
    tag: str | None = None,
    supplier: str | None = None,
    product_type: str | None = Query(None, alias="type"),
    tax_rate: str | None = None,
    cost_tax_rate: str | None = None,
    gift_card: bool | None = None,
    db: Session = Depends(get_db),
) -> dict:
    expected = settings.shopfront_integration_token.strip()
    supplied = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(401, "Shopfront source report authorization failed")
    if report_type not in {"inventory", "sales", "purchase", "products"}:
        raise HTTPException(404, "Unknown Shopfront source report")
    if report_type in {"sales", "purchase"}:
        if from_date is None or to_date is None or from_date > to_date:
            raise HTTPException(400, "Choose a valid source report date range")
        if (to_date - from_date).days > 366:
            raise HTTPException(400, "Source report ranges are limited to 366 days")
    if q is not None and len(q) > 120:
        raise HTTPException(400, "q must be at most 120 characters")
    if report_type == "products" and status and status.strip().upper() not in {"ACTIVE", "NOT_ACTIVE"}:
        raise HTTPException(400, "status must be ACTIVE or NOT_ACTIVE")

    period_key = f"{from_date.isoformat()}:{to_date.isoformat()}" if from_date and to_date else "all"
    cached = db.scalar(select(ShopfrontReportSnapshot).where(
        ShopfrontReportSnapshot.store_key == store,
        ShopfrontReportSnapshot.report_type == report_type,
        ShopfrontReportSnapshot.period_key == period_key,
    ))
    now = datetime.now(timezone.utc)
    fetched = cached.fetched_at.replace(tzinfo=timezone.utc) if cached and cached.fetched_at.tzinfo is None else (cached.fetched_at if cached else None)
    if report_type == "inventory":
        try:
            rows, source_fetched_at, cache_status = await load_shopfront_inventory_report(store, db, now=now)
        except ShopfrontError as exc:
            raise HTTPException(502, f"Shopfront inventory report failed: {exc}") from exc
    elif cached and fetched and now - fetched < timedelta(seconds=60):
        rows = cached.rows if isinstance(cached.rows, list) else []
        source_fetched_at = cached.fetched_at
        cache_status = "hit"
    else:
        store_row = require_store(store, db)
        client = get_client(settings, store_row)
        try:
            token = await access_token(db, settings, store_row)
            if report_type == "products":
                rows = [source_product_row(row) for row in await client.fetch_products(token, CATALOG_QUERY) if isinstance(row, dict)]
            else:
                query = shopfront_source_report_query(report_type, from_date, to_date)
                rows = await client.run_report(token, query)
        except ShopfrontError as exc:
            raise HTTPException(502, f"Shopfront source report failed: {exc}") from exc
        finally:
            await client.close()
        if cached is None:
            # Older volumes created this table with a (store, report_type)
            # unique key. Reuse that row when the schema has not been migrated
            # yet, so changing report periods never breaks a live worker.
            cached = db.scalar(select(ShopfrontReportSnapshot).where(
                ShopfrontReportSnapshot.store_key == store,
                ShopfrontReportSnapshot.report_type == report_type,
            ))
        if cached is None:
            cached = ShopfrontReportSnapshot(store_key=store, report_type=report_type, period_key=period_key)
            db.add(cached)
        else:
            cached.period_key = period_key
        cached.rows = rows
        cached.fetched_at = now.replace(tzinfo=None)
        source_fetched_at = cached.fetched_at
        db.execute(
            ShopfrontReportSnapshot.__table__.delete().where(
                ShopfrontReportSnapshot.store_key == store,
                ShopfrontReportSnapshot.report_type == report_type,
                ShopfrontReportSnapshot.fetched_at < (now - timedelta(days=30)).replace(tzinfo=None),
                ShopfrontReportSnapshot.period_key != period_key,
            )
        )
        db.commit()
        cache_status = "refreshed"

    normalized_rows = [row for row in rows if isinstance(row, dict)]
    if report_type == "inventory" and inventory_report_totals(normalized_rows)["inventory_metrics_complete"] != 1:
        raise HTTPException(503, "Shopfront inventory report has incomplete case or item quantities")
    metrics: dict[str, Any] = {}
    if report_type == "sales" and dashboard and from_date and to_date:
        store_row = require_store(store, db)
        client = get_client(settings, store_row)
        try:
            token = await access_token(db, settings, store_row)
            sales_rows = await client.fetch_sales_graphql(token, from_date.isoformat(), to_date.isoformat(), store_row.timezone)
        except ShopfrontError as exc:
            raise HTTPException(502, f"Shopfront dashboard metrics failed: {exc}") from exc
        finally:
            await client.close()
        matched_sales_rows = dashboard_sales_matching_report(sales_rows, normalized_rows)
        if matched_sales_rows is None:
            source_transaction_count = dashboard_report_transaction_count(normalized_rows)
            metrics = {
                "available": False,
                "reason": "source_sales_count_mismatch",
                "source_transaction_count": source_transaction_count,
                "graphql_transaction_count": len(sales_rows),
                "customer_count": None,
                "basket_size": None,
                "top_products": [],
                "users": [],
            }
        else:
            customer_ids = {str(row.get("customer", {}).get("id")) for row in matched_sales_rows if isinstance(row.get("customer"), dict) and row.get("customer", {}).get("id")}
            quantity_total = 0.0
            top_products: dict[str, dict[str, Any]] = {}
            users: dict[str, dict[str, Any]] = {}
            for sale in matched_sales_rows:
                user = sale.get("user") if isinstance(sale.get("user"), dict) else {}
                user_id = str(user.get("id") or "unknown")
                user_name = str(user.get("name") or "Unknown")
                user_row = users.setdefault(user_id, {"id": user_id, "name": user_name, "transactions": 0, "revenue": 0.0})
                user_row["transactions"] += 1
                try:
                    user_row["revenue"] += float(sale.get("totalPrice") or 0)
                except (TypeError, ValueError):
                    pass
                for item in sale.get("items", []) if isinstance(sale.get("items"), list) else []:
                    if isinstance(item, dict):
                        raw_quantity = item.get("quantity")
                        try:
                            quantity_total += float(raw_quantity or 0)
                        except (TypeError, ValueError):
                            pass
                        item_info = item.get("item") if isinstance(item.get("item"), dict) else {}
                        product_id = str(item_info.get("id") or "unknown")
                        product_name = str(item_info.get("name") or product_id)
                        product_row = top_products.setdefault(product_id, {"id": product_id, "name": product_name, "quantity": 0.0, "revenue": 0.0})
                        try:
                            product_row["quantity"] += float(item.get("quantity") or 0)
                        except (TypeError, ValueError):
                            pass
                        try:
                            product_row["revenue"] += float(item.get("totalPrice") or 0)
                        except (TypeError, ValueError):
                            pass
            transaction_count = len(matched_sales_rows)
            user_rows = sorted(users.values(), key=lambda row: (-int(row["transactions"]), str(row["name"])))
            for user_row in user_rows:
                user_row["average_sale"] = round(float(user_row["revenue"]) / int(user_row["transactions"]), 2) if user_row["transactions"] else 0
            metrics = {
                "available": True,
                "customer_count": len(customer_ids),
                "basket_size": round(quantity_total / transaction_count, 2) if transaction_count else 0,
                "top_products": sorted(top_products.values(), key=lambda row: (-float(row["quantity"]), str(row["name"])))[:20],
                "users": user_rows,
            }
    if report_type == "products":
        def product_text(value: Any) -> str:
            if isinstance(value, dict):
                return " ".join(product_text(item) for item in value.values())
            if isinstance(value, list):
                return " ".join(product_text(item) for item in value)
            return str(value or "")

        def product_has(row: dict[str, Any], needle: str | None, *keys: str) -> bool:
            if needle is None:
                return True
            target = needle.strip().casefold()
            return target in " ".join(product_text(row.get(key)) for key in keys).casefold()

        selected_status = (status or "ACTIVE").strip().upper()
        filtered_products: list[dict[str, Any]] = []
        for row in normalized_rows:
            raw = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
            if str(row.get("status") or "UNKNOWN").upper() != selected_status:
                continue
            if not product_has(row, brand, "brand") or not product_has(row, category, "category") or not product_has(row, family, "family"):
                continue
            if not product_has(row, tag, "tags") or not product_has(row, supplier, "supplier", "suppliers", "coreSupplier", "lastSupplier"):
                continue
            if not product_has(row, product_type, "type") or not product_has(row, tax_rate, "tax_rate", "taxRate") or not product_has(row, cost_tax_rate, "cost_tax_rate", "costTaxRate"):
                continue
            if gift_card is not None:
                if bool(row.get("is_gift_card")) != gift_card:
                    continue
            filtered_products.append(row)
        normalized_rows = filtered_products
    if q and q.strip():
        needle = q.strip().casefold()
        normalized_rows = [row for row in normalized_rows if needle in json.dumps(row, ensure_ascii=False, default=str).casefold()]
    if negative_only and report_type == "inventory":
        def negative_row(row: dict[str, Any]) -> bool:
            def value(*keys: str) -> float | None:
                for key in keys:
                    raw = row.get(key)
                    if raw is None:
                        continue
                    try:
                        return float(re.sub(r"[^0-9.\-]", "", str(raw)))
                    except ValueError:
                        return None
                return None
            cases = value("Case Level", "case_level")
            items = value("Item Level", "single_level")
            case_quantity = value("Case Quantity", "case_quantity")
            return cases is not None and items is not None and case_quantity is not None and case_quantity > 0 and cases * case_quantity + items < 0
        normalized_rows = [row for row in normalized_rows if negative_row(row)]
    total = len(normalized_rows)
    totals: dict[str, float] = {}
    if report_type == "inventory":
        for result_key, row_keys in {
            "case_level": ("Case Level", "case_level"),
            "item_level": ("Item Level", "single_level"),
            "value_last_cost": ("Value (Inc) (Last)", "Value (Inc) (Last)", "value"),
        }.items():
            field_total = 0.0
            for row in normalized_rows:
                for key in row_keys:
                    raw = row.get(key)
                    if raw is not None:
                        try:
                            field_total += float(re.sub(r"[^0-9.\-]", "", str(raw)))
                        except ValueError:
                            pass
                        break
            totals[result_key] = round(field_total, 2)
        totals.update(inventory_report_totals(normalized_rows))
    page_rows = normalized_rows[(page - 1) * size:page * size]
    return {
        "data": page_rows,
        "pagination": {"page": page, "size": size, "returned": len(page_rows), "total": total},
        "totals": totals,
        "metrics": metrics,
        "report": report_type,
        "period": period_key,
        "source": "shopfront_reporting_api",
        "source_version": INVENTORY_REPORT_CACHE_SOURCE if report_type == "inventory" else None,
        "fetched_at": source_fetched_at,
        "cache": cache_status,
    }


@app.get("/api/dashboard/inventory")
async def dashboard_inventory(request: Request, store: str, db: Session = Depends(get_db)) -> dict:
    """Return Dashboard stock KPIs from the same report rows as the Inventory page."""
    expected = settings.shopfront_integration_token.strip()
    supplied = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(401, "Shopfront source report authorization failed")
    require_store(store, db)
    try:
        rows, fetched_at, _ = await load_shopfront_inventory_report(store, db)
    except ShopfrontError:
        return {"available": False, "reason": "source_report_unavailable", "source": "shopfront_reporting_api"}
    totals = inventory_report_totals(rows)
    if totals["inventory_metrics_complete"] != 1:
        return {"available": False, "reason": "report_units_incomplete", "snapshot_at": fetched_at,
                "source": "shopfront_reporting_api"}
    return {
        "available": True,
        "sellable_units": totals["sellable_units"],
        "negative_stock_products": int(totals["negative_stock_products"]),
        "record_count": len(rows),
        "outlet_count": 1,
        "snapshot_at": fetched_at,
        "fetched_at": fetched_at,
        "source": "shopfront_reporting_api",
        "source_version": INVENTORY_REPORT_CACHE_SOURCE,
    }


@app.get("/auth/shopfront/{store_key}/start")
def start_auth(store_key: str, db: Session = Depends(get_db)) -> RedirectResponse:
    store = require_store(store_key, db)
    state = make_state()
    db.add(OAuthState(state=state, store_key=store.store_key, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    db.commit()
    client = get_client(settings, store)
    return RedirectResponse(client.authorization_url(state))


@app.get("/oauth/shopfront/callback")
async def auth_callback(code: str | None = None, state: str | None = None, error: str | None = None, error_description: str | None = None, db: Session = Depends(get_db)) -> dict:
    if error:
        detail = f"Shopfront authorization failed: {error}"
        if error_description:
            detail += f" ({error_description})"
        raise HTTPException(400, detail)
    if not code or not state:
        raise HTTPException(400, "Missing code or state")
    oauth_state = db.scalar(select(OAuthState).where(OAuthState.state == state))
    if oauth_state is None or not is_after(oauth_state.expires_at, datetime.now(timezone.utc)):
        raise HTTPException(400, "Invalid or expired OAuth state")
    store = require_store(oauth_state.store_key, db)
    client = get_client(settings, store)
    try:
        save_token(db, settings, store, await client.exchange_code(code))
    finally:
        await client.close()
    db.delete(oauth_state)
    db.commit()
    return {"status": "authorized", "store": store.store_key}


@app.get("/api/stores")
def stores(db: Session = Depends(get_db)) -> list[dict]:
    tokens = {t.store_key: t for t in db.scalars(select(ShopfrontToken)).all()}
    result = []
    for store in db.scalars(select(Store).order_by(Store.store_key)).all():
        token = tokens.get(store.store_key)
        granted = set((token.scopes or "").replace(",", " ").split()) if token else set()
        result.append({
            "store_key": store.store_key,
            "vendor": store.vendor,
            "timezone": store.timezone,
            "active": store.active,
            "token_status": token.status if token else "not_authorized",
            "requested_scopes": settings.shopfront_scopes.split(),
            "granted_scopes": sorted(granted),
            "missing_scopes": sorted(set(REQUIRED_SHOPFRONT_SCOPES) - granted),
        })
    return result


@app.get("/api/pos/mappings")
def pos_mappings(store: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    query = select(StoreMapping).order_by(StoreMapping.store_key)
    if store:
        query = query.where(StoreMapping.store_key == store)
    return [{"store_key": x.store_key, "shopfront_outlet": x.shopfront_outlet, "pos_company_id": x.pos_company_id, "pos_outlet_id": x.pos_outlet_id, "enabled": x.enabled} for x in db.scalars(query).all()]


@app.put("/api/pos/mappings/{store_key}")
def save_pos_mapping(store_key: str, payload: dict, db: Session = Depends(get_db)) -> dict:
    require_store(store_key, db)
    row = db.scalar(select(StoreMapping).where(StoreMapping.store_key == store_key))
    if row is None:
        row = StoreMapping(store_key=store_key)
        db.add(row)
    row.shopfront_outlet = payload.get("shopfront_outlet")
    row.pos_company_id = payload.get("pos_company_id")
    row.pos_outlet_id = payload.get("pos_outlet_id")
    row.enabled = bool(payload.get("enabled", False))
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "saved", "store_key": store_key}


@app.post("/api/stores/{store_key}/sync")
async def trigger_sync(
    store_key: str,
    from_date: date | None = None,
    to_date: date | None = None,
    full_inventory_snapshot: bool = False,
    db: Session = Depends(get_db),
) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    end = to_date or (datetime.now(ZoneInfo(store.timezone)).date() - timedelta(days=1))
    start = from_date or (end - timedelta(days=settings.sync_lookback_days - 1))
    if start > end:
        raise HTTPException(400, "from_date must be on or before to_date")
    if full_inventory_snapshot and start != end:
        raise HTTPException(400, "A full inventory refresh must target one business date")
    job = SyncJob(
        store_key=store.store_key,
        job_type="daily_sync",
        status="queued",
        from_date=start.isoformat(),
        to_date=end.isoformat(),
        cursor_date=start.isoformat(),
        payload={
            "include_supply_chain": False if full_inventory_snapshot else should_include_supply_chain(db, store.store_key),
            "full_inventory_snapshot": full_inventory_snapshot,
            "manual_repair": True,
        },
    )
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {
        "status": "queued", "job_id": job.id, "store": store.store_key,
        "from": start, "to": end, "full_inventory_snapshot": full_inventory_snapshot,
    }


async def run_full_snapshot_job(job_id: int) -> None:
    task = asyncio.current_task()
    if task is not None:
        active_job_tasks[job_id] = task
    try:
        # Full snapshots and history/catalog jobs share the same database writer.
        # Serialize all durable crawler writes through sync_lock.
        async with sync_lock:
            db = next(get_db())
            # existing body is intentionally kept inside the lock
            await _run_full_snapshot_body(job_id, db)
    finally:
        if task is not None and active_job_tasks.get(job_id) is task:
            active_job_tasks.pop(job_id, None)


def _inventory_snapshot_evidence(db: Session, store_key: str) -> dict[str, Any] | None:
    manifest = db.scalar(select(InventorySnapshotManifest).where(
        InventorySnapshotManifest.store_key == store_key,
        InventorySnapshotManifest.complete.is_(True),
    ))
    if manifest is None or not manifest.snapshot_at:
        return None
    if not inventory_snapshot_is_fresh(manifest.snapshot_at):
        return None
    source_ids = sorted({str(value).strip() for value in (manifest.source_product_ids or []) if str(value).strip()})
    if not source_ids:
        return None
    snapshot_at = manifest.snapshot_at
    if snapshot_at.tzinfo is None:
        snapshot_at = snapshot_at.replace(tzinfo=timezone.utc)
    return {"source_product_ids": source_ids, "snapshot_at": snapshot_at.isoformat()}


async def _run_full_snapshot_body(job_id: int, db: Session) -> None:
        run = None
        try:
            claimed = db.execute(update(SyncJob).where(
                SyncJob.id == job_id,
                SyncJob.status == "queued",
            ).values(
                status="running",
                started_at=datetime.now(timezone.utc),
                heartbeat_at=datetime.now(timezone.utc),
                phase="pos_snapshot",
                attempts=SyncJob.attempts + 1,
            ))
            db.commit()
            if claimed.rowcount != 1:
                return
            job = db.get(SyncJob, job_id)
            run = SyncRun(store_key=job.store_key, status="running", counts={"type": "full_snapshot"})
            db.add(run)
            db.commit()
            inventory_manifest = _inventory_snapshot_evidence(db, job.store_key)
            result = await push_pos_snapshot(
                db,
                job.store_key,
                run=run,
                include_inventory_snapshot=inventory_manifest is not None,
                inventory_snapshot_source_ids=inventory_manifest["source_product_ids"] if inventory_manifest else None,
                inventory_snapshot_at=inventory_manifest["snapshot_at"] if inventory_manifest else None,
            )
            if inventory_manifest is None:
                result["inventory_reconciliation_required"] = True
                result["inventory_reconciliation_reason"] = "no verified complete Shopfront inventory snapshot manifest"
                result["error"] = result.get("error") or result["inventory_reconciliation_reason"]
            run.status = "completed" if result.get("error") is None else "failed"
            run.counts = {"type": "full_snapshot", **result}
            run.error = result.get("error")
            run.finished_at = datetime.now(timezone.utc)
            job.status = run.status
            job.payload = run.counts
            job.error = run.error
            job.finished_at = run.finished_at
            db.commit()
        except Exception as exc:
            if run is not None:
                run.status = "failed"
                run.error = str(exc)[:2000]
                run.finished_at = datetime.now(timezone.utc)
            job = db.get(SyncJob, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)[:2000]
                job.finished_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()


async def _run_catalog_job(job_id: int, *, include_sales: bool) -> None:
    """Run a catalog-only or sale-repair snapshot with durable progress."""
    # Sale repair can touch the same Sale/Product rows as a history chunk.
    # Serialize it with the history writer to avoid PostgreSQL serialization
    # failures.
    async with sync_lock:
        db = next(get_db())
        run = None
        try:
            claimed = db.execute(update(SyncJob).where(
                SyncJob.id == job_id,
                SyncJob.status == "queued",
            ).values(
                status="running",
                started_at=datetime.now(timezone.utc),
                heartbeat_at=datetime.now(timezone.utc),
                phase="pos_snapshot",
                attempts=SyncJob.attempts + 1,
            ))
            db.commit()
            if claimed.rowcount != 1:
                return
            job = db.get(SyncJob, job_id)
            run = SyncRun(store_key=job.store_key, status="running", counts={"type": job.job_type})
            db.add(run)
            db.commit()
            inventory_manifest = _inventory_snapshot_evidence(db, job.store_key) if not include_sales else None
            result = await push_pos_snapshot(
                db,
                job.store_key,
                run=run,
                include_catalog=not include_sales,
                include_sales=include_sales,
                sales_offset=int((job.payload or {}).get("sales_offset", 0) or 0),
                include_inventory_snapshot=inventory_manifest is not None,
                inventory_snapshot_source_ids=inventory_manifest["source_product_ids"] if inventory_manifest else None,
                inventory_snapshot_at=inventory_manifest["snapshot_at"] if inventory_manifest else None,
                job=job,
            )
            if not include_sales and inventory_manifest is None:
                result["inventory_reconciliation_required"] = True
                result["inventory_reconciliation_reason"] = "no verified complete Shopfront inventory snapshot manifest"
                result["error"] = result.get("error") or result["inventory_reconciliation_reason"]
            run.status = "completed" if result.get("error") is None else "failed"
            run.counts = {"type": job.job_type, **result}
            run.error = result.get("error")
            run.finished_at = datetime.now(timezone.utc)
            job.status = run.status
            job.payload = run.counts
            job.error = run.error
            job.finished_at = run.finished_at
            db.commit()
        except Exception as exc:
            if run is not None:
                run.status = "failed"
                run.error = str(exc)[:2000]
                run.finished_at = datetime.now(timezone.utc)
            job = db.get(SyncJob, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)[:2000]
                job.finished_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()


async def run_catalog_snapshot_job(job_id: int) -> None:
    task = asyncio.current_task()
    if task is not None:
        active_job_tasks[job_id] = task
    try:
        await _run_catalog_job(job_id, include_sales=False)
    finally:
        if task is not None and active_job_tasks.get(job_id) is task:
            active_job_tasks.pop(job_id, None)


async def run_sales_repair_job(job_id: int) -> None:
    task = asyncio.current_task()
    if task is not None:
        active_job_tasks[job_id] = task
    try:
        await _run_catalog_job(job_id, include_sales=True)
    finally:
        if task is not None and active_job_tasks.get(job_id) is task:
            active_job_tasks.pop(job_id, None)


async def run_sales_reconcile_job(job_id: int) -> None:
    task = asyncio.current_task()
    if task is not None:
        active_job_tasks[job_id] = task
    try:
        await _run_catalog_job(job_id, include_sales=True)
    finally:
        if task is not None and active_job_tasks.get(job_id) is task:
            active_job_tasks.pop(job_id, None)


@app.post("/api/stores/{store_key}/pos/full-snapshot")
async def start_full_snapshot(store_key: str, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, "A sync job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="snapshot", status="queued")
    db.add(job)
    db.commit()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "crawler database to POS and Odoo mirrors"}


@app.post("/api/stores/{store_key}/pos/catalog-snapshot")
async def start_catalog_snapshot(store_key: str, db: Session = Depends(get_db)) -> dict:
    """Refresh product metadata and inventory without waiting for history."""
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="catalog_snapshot", status="queued")
    db.add(job)
    db.commit()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "products and inventory"}


@app.post("/api/stores/{store_key}/pos/sales-repair")
async def start_sales_repair(store_key: str, db: Session = Depends(get_db)) -> dict:
    """Re-push saved sales so SaleItem names and source metadata are repaired."""
    store = require_store(store_key, db)
    # A repair rewrites the same Sale/Product rows as history chunks. Queueing
    # both jobs together can still collide when the service runs more than one
    # process, where the in-process asyncio lock is not shared.
    store_active = active_job(db, store.store_key)
    if store_active:
        raise HTTPException(409, f"A {store_active.job_type} job is already active for this store")
    active = db.scalar(select(SyncJob).where(
        SyncJob.store_key == store.store_key,
        SyncJob.job_type == "sales_repair",
        SyncJob.status.in_(["queued", "running"]),
    ))
    if active:
        raise HTTPException(409, "A sales repair is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="sales_repair", status="queued")
    db.add(job)
    db.commit()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "saved sales and SaleItem metadata"}


@app.post("/api/stores/{store_key}/pos/sales-reconcile")
async def start_sales_reconcile(store_key: str, db: Session = Depends(get_db)) -> dict:
    """Reconcile complete saved sales to mirrors without formal business writes."""
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(
        store_key=store.store_key,
        job_type="sales_reconcile",
        status="queued",
        payload={"mirror_only": True},
    )
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {
        "status": "queued",
        "job_id": job.id,
        "store": store.store_key,
        "scope": "saved sales only; POS and Odoo mirrors; no inventory or formal business writes",
    }


def active_job(db: Session, store_key: str) -> SyncJob | None:
    return db.scalar(select(SyncJob).where(SyncJob.store_key == store_key, SyncJob.status.in_(["queued", "running"])).order_by(SyncJob.id.desc()))


@app.post("/api/stores/{store_key}/history/discover")
async def discover_history(store_key: str, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    if active_job(db, store.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="discover", status="queued")
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "job_id": job.id, "store": store.store_key}


@app.post("/api/stores/{store_key}/history/sync")
async def start_history_sync(store_key: str, from_date: date | None = None, to_date: date | None = None, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    if active_job(db, store.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    end = to_date or datetime.now(ZoneInfo(store.timezone)).date()
    start = from_date or date(settings.shopfront_history_start_year, 1, 1)
    job = SyncJob(store_key=store.store_key, job_type="history", status="queued", from_date=start.isoformat(), to_date=end.isoformat(), cursor_date=start.isoformat())
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "from": start, "to": end}


@app.get("/api/sync/status")
def sync_status(store: str | None = None, db: Session = Depends(get_db)) -> dict:
    query = select(SyncJob).order_by(desc(SyncJob.id))
    if store:
        query = query.where(SyncJob.store_key == store)
    jobs = db.scalars(query.limit(20)).all()
    return {"data": [{"id": j.id, "store": j.store_key, "type": j.job_type, "status": j.status, "phase": j.phase, "attempts": j.attempts, "from": j.from_date, "to": j.to_date, "cursor": j.cursor_date, "heartbeat_at": j.heartbeat_at, "error": j.error, "created_at": j.created_at, "started_at": j.started_at, "finished_at": j.finished_at, "payload": j.payload} for j in jobs]}


@app.get("/shopfront-audit")
def shopfront_audit(store: str = "skr", db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    active = active_job(db, store)
    status_rows = db.execute(
        select(Sale.status, func.count(Sale.id))
        .where(Sale.store_key == store)
        .group_by(Sale.status)
    ).all()
    status_counts = {str(status or "UNKNOWN"): int(count) for status, count in status_rows}
    checkpoint = db.scalar(select(ShopfrontSyncCheckpoint).where(
        ShopfrontSyncCheckpoint.store_key == store,
        ShopfrontSyncCheckpoint.checkpoint_key == "catalog",
    ))
    latest_inventory_timestamp = db.scalar(
        select(func.max(InventorySnapshot.inventory_timestamp)).where(InventorySnapshot.store_key == store)
    )
    latest_product_sync = db.scalar(
        select(func.max(Product.synced_at)).where(Product.store_key == store)
    )
    latest_catalog_job = db.scalar(
        select(SyncJob.finished_at)
        .where(SyncJob.store_key == store, SyncJob.job_type == "catalog_snapshot", SyncJob.status == "completed")
        .order_by(desc(SyncJob.finished_at), desc(SyncJob.id))
        .limit(1)
    )
    return {
        "store": store,
        "status": "running" if active else "ready",
        "active_job": ({"id": active.id, "type": active.job_type, "status": active.status, "phase": active.phase} if active else None),
        "catalog_checkpoint": checkpoint.value if checkpoint else None,
        "freshness": {
            "latest_inventory_timestamp": latest_inventory_timestamp,
            "latest_product_sync": latest_product_sync,
            "latest_completed_catalog_job": latest_catalog_job,
        },
        "counts": {
            "products": db.scalar(select(func.count(Product.id)).where(Product.store_key == store)) or 0,
            "sales": db.scalar(select(func.count(Sale.id)).where(Sale.store_key == store)) or 0,
            "sale_items": db.scalar(select(func.count(SaleItem.id)).join(Sale, Sale.id == SaleItem.sale_id).where(Sale.store_key == store)) or 0,
            "inventory": db.scalar(select(func.count(InventorySnapshot.id)).where(InventorySnapshot.store_key == store)) or 0,
            "suppliers": db.scalar(select(func.count(ShopfrontSupplier.id)).where(ShopfrontSupplier.store_key == store)) or 0,
            "purchase_orders": db.scalar(select(func.count(ShopfrontPurchaseOrder.id)).where(ShopfrontPurchaseOrder.store_key == store)) or 0,
            "customers": db.scalar(select(func.count(ShopfrontCustomer.id)).where(ShopfrontCustomer.store_key == store)) or 0,
            "sale_status": status_counts,
            "incomplete_sales": status_counts.get("INCOMPLETE", 0),
        },
        "source": "crawler_database",
    }


@app.post("/shopfront-sync-daily")
def shopfront_sync_daily(store: str | None = None, db: Session = Depends(get_db)) -> dict:
    today_by_store = {}
    queued = []
    keys = [store] if store else list(settings.stores())
    for key in keys:
        row = require_store(key, db)
        if active_job(db, key):
            continue
        end = datetime.now(ZoneInfo(row.timezone)).date() - timedelta(days=1)
        start = end - timedelta(days=settings.sync_lookback_days - 1)
        job = SyncJob(store_key=key, job_type="daily_sync", status="queued", from_date=start.isoformat(), to_date=end.isoformat(), cursor_date=start.isoformat(), payload={"skill": "shopfront-sync-daily", "include_supply_chain": should_include_supply_chain(db, key)})
        db.add(job)
        db.flush()
        queued.append({"store": key, "job_id": job.id, "from": start, "to": end})
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "jobs": queued}


@app.get("/shopfront-reconcile")
def shopfront_reconcile(store: str = "skr", reconcile_date: date | None = Query(None, alias="date"), db: Session = Depends(get_db)) -> dict:
    store_row = require_store(store, db)
    local_zone = ZoneInfo(store_row.timezone or settings.sync_timezone)
    target = reconcile_date or (datetime.now(local_zone).date() - timedelta(days=1))
    # Sale timestamps are persisted as UTC by SQLite and PostgreSQL. Convert
    # the store's local business-day boundaries before filtering the rows.
    utc_start = datetime.combine(target, datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
    utc_end = datetime.combine(target + timedelta(days=1), datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
    summary_rows = db.scalars(select(DailySalesSummary).where(DailySalesSummary.store_key == store, DailySalesSummary.business_date == target.isoformat())).all()
    summary_count = sum(int(row.transaction_count or 0) for row in preferred_summary_rows(summary_rows))
    sale_window = [Sale.store_key == store, Sale.created_at >= utc_start, Sale.created_at < utc_end]
    sale_count = db.scalar(select(func.count(Sale.id)).where(*sale_window, Sale.status != "PARKED")) or 0
    parked_count = db.scalar(select(func.count(Sale.id)).where(*sale_window, Sale.status == "PARKED")) or 0
    status_rows = db.execute(
        select(Sale.status, func.count(Sale.id))
        .where(Sale.store_key == store, Sale.created_at >= utc_start, Sale.created_at < utc_end)
        .group_by(Sale.status)
    ).all()
    sale_status_counts = {str(status or "UNKNOWN"): int(count) for status, count in status_rows}
    missing_names = db.scalar(select(func.count(SaleItem.id)).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.store_key == store,
        Sale.created_at >= utc_start,
        Sale.created_at < utc_end,
        or_(SaleItem.product_name.is_(None), func.trim(SaleItem.product_name) == ""),
    )) or 0
    return {
        "store": store,
        "date": target,
        "status": "ok" if int(summary_count) == int(sale_count) and int(missing_names) == 0 else "attention",
        "summary_transaction_count": int(summary_count),
        "sale_count": int(sale_count),
        "difference": int(sale_count) - int(summary_count),
        "sale_status_counts": sale_status_counts,
        "parked_excluded": int(parked_count),
        "sale_items_missing_name": int(missing_names),
        "source": "crawler_database",
    }


@app.post("/api/sync/cleanup-summaries")
def cleanup_stale_summaries(store: str = "skr", dates: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Remove only verified stale consolidated summary rows.

    Older UTC based runs could leave an outlet-less row on the previous local
    business date while the complete Sale rows were stored on the next local
    date. Require a neighbouring local-day Sale before deleting such a row so
    uncovered historical dates remain untouched.
    """
    store_row = require_store(store, db)
    local_zone = ZoneInfo(store_row.timezone or settings.sync_timezone)
    requested_dates = {value.strip() for value in (dates or "").split(",") if value.strip()}
    summary_query = select(DailySalesSummary).where(
        DailySalesSummary.store_key == store,
        DailySalesSummary.outlet.is_(None),
    )
    if requested_dates:
        summary_query = summary_query.where(DailySalesSummary.business_date.in_(requested_dates))
    summaries = db.scalars(summary_query).all()
    summary_dates = {date.fromisoformat(row.business_date) for row in summaries}
    named_dates = {
        str(value)
        for value in db.scalars(select(DailySalesSummary.business_date).where(
            DailySalesSummary.store_key == store,
            DailySalesSummary.outlet.is_not(None),
        )).all()
    }
    if summary_dates:
        min_date = min(summary_dates) - timedelta(days=1)
        max_date = max(summary_dates) + timedelta(days=2)
        range_start = datetime.combine(min_date, datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
        range_end = datetime.combine(max_date, datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
        sale_timestamps = db.scalars(select(Sale.created_at).where(
            Sale.store_key == store,
            Sale.created_at >= range_start,
            Sale.created_at < range_end,
        )).all()
    else:
        sale_timestamps = []
    sale_counts_by_date: dict[date, int] = {}
    for timestamp in sale_timestamps:
        if timestamp is None:
            continue
        aware = timestamp.replace(tzinfo=timezone.utc) if timestamp.tzinfo is None else timestamp
        local_date = aware.astimezone(local_zone).date()
        sale_counts_by_date[local_date] = sale_counts_by_date.get(local_date, 0) + 1
    removed: list[str] = []
    for summary in summaries:
        target = date.fromisoformat(summary.business_date)
        same_day_sales = sale_counts_by_date.get(target, 0)
        named_same_day = summary.business_date in named_dates
        if named_same_day or same_day_sales:
            if named_same_day:
                db.delete(summary)
                removed.append(summary.business_date)
            continue
        neighbour_sales = sum(sale_counts_by_date.get(target + timedelta(days=offset), 0) for offset in (-1, 1))
        if neighbour_sales and int(summary.transaction_count or 0) > 0:
            db.delete(summary)
            removed.append(summary.business_date)
    db.commit()
    return {"store": store, "removed_count": len(removed), "removed_dates": sorted(set(removed)), "source": "crawler_database"}


@app.get("/api/sync/coverage")
def sync_coverage(store: str, db: Session = Depends(get_db)) -> dict:
    """Return read-only source coverage metrics for verification and handoff."""
    require_store(store, db)
    products = db.scalars(select(Product).where(Product.store_key == store)).all()
    catalog_products = [product for product in products if product.catalog_last_seen_at is not None]
    catalog_status_counts: dict[str, int] = {}
    for product in catalog_products:
        raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
        status = str(raw.get("status") or "UNKNOWN").strip().upper()
        catalog_status_counts[status] = catalog_status_counts.get(status, 0) + 1
    inventory_count = db.scalar(select(func.count(InventorySnapshot.id)).where(InventorySnapshot.store_key == store)) or 0
    outlet_count = db.scalar(select(func.count(func.distinct(InventorySnapshot.outlet_id))).where(InventorySnapshot.store_key == store, InventorySnapshot.outlet_id.is_not(None))) or 0
    inventory_quantity = InventorySnapshot.quantity
    inventory_stats = db.execute(select(
        func.sum(case((inventory_quantity < 0, 1), else_=0)),
        func.sum(case((inventory_quantity > 0, inventory_quantity), else_=0)),
        func.sum(inventory_quantity),
        func.min(inventory_quantity),
        func.max(inventory_quantity),
    ).where(InventorySnapshot.store_key == store)).one()
    inventory_manifest = db.scalar(select(InventorySnapshotManifest).where(InventorySnapshotManifest.store_key == store))
    inventory_scan = db.scalar(select(InventorySnapshotScan).where(InventorySnapshotScan.store_key == store))
    inventory_product_ids = db.scalars(
        select(InventorySnapshot.shopfront_product_id)
        .where(InventorySnapshot.store_key == store)
        .distinct()
    ).all()
    inventory_manifest_state = inventory_manifest_status(
        inventory_manifest.source_product_ids if inventory_manifest else None,
        inventory_product_ids,
        bool(inventory_manifest and inventory_manifest.complete),
    )
    sale_count = db.scalar(select(func.count(Sale.id)).where(Sale.store_key == store)) or 0
    sale_item_count = db.scalar(select(func.count(SaleItem.id)).join(Sale, SaleItem.sale_id == Sale.id).where(Sale.store_key == store)) or 0
    customer_count = db.scalar(select(func.count(ShopfrontCustomer.id)).where(ShopfrontCustomer.store_key == store)) or 0
    extended_rows = db.execute(
        select(ShopfrontExtendedRecord.entity_type, func.count(ShopfrontExtendedRecord.id))
        .where(ShopfrontExtendedRecord.store_key == store)
        .group_by(ShopfrontExtendedRecord.entity_type)
    ).all()
    extended_counts = {str(entity): int(count) for entity, count in extended_rows}
    missing_sale_item_names = db.scalar(select(func.count(SaleItem.id)).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.store_key == store,
        or_(SaleItem.product_name.is_(None), func.trim(SaleItem.product_name) == ""),
    )) or 0

    def non_empty(value: object) -> bool:
        return value is not None and value != "" and value != [] and value != {}

    fields = {
        "name": 0,
        "description": 0,
        "barcode": 0,
        "sku": 0,
        "category": 0,
        "brand": 0,
        "family": 0,
        "image": 0,
        "alternate_images": 0,
        "tags": 0,
        "price": 0,
        "cost": 0,
        "tax_rate": 0,
        "track_inventory": 0,
        "source_created_at": 0,
        "source_updated_at": 0,
    }
    for product in products:
        raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
        category = raw.get("category") if isinstance(raw.get("category"), dict) else raw.get("category")
        brand = raw.get("brand") if isinstance(raw.get("brand"), dict) else raw.get("brand")
        family = raw.get("family") if isinstance(raw.get("family"), dict) else raw.get("family")
        tax_rate = raw.get("taxRate") or raw.get("tax_rate")
        values = {
            "name": product.name or raw.get("name"),
            "description": raw.get("description"),
            "barcode": product.barcode or raw.get("barcode") or raw.get("barcodes"),
            "sku": product.sku or raw.get("sku") or raw.get("mdbId"),
            "category": product.category or (category.get("name") if isinstance(category, dict) else category),
            "brand": product.brand or (brand.get("name") if isinstance(brand, dict) else brand),
            "family": family.get("name") if isinstance(family, dict) else family,
            "image": raw.get("image") or raw.get("image_url") or raw.get("imageUrl"),
            "alternate_images": raw.get("alternateImages") or raw.get("alternate_images"),
            "tags": raw.get("tags"),
            "price": product.price if product.price is not None else (raw.get("price") or raw.get("prices")),
            "cost": product.cost if product.cost is not None else raw.get("cost"),
            "tax_rate": tax_rate,
            "track_inventory": raw.get("trackInventory") if "trackInventory" in raw else raw.get("track_inventory"),
            "source_created_at": raw.get("createdAt") or raw.get("source_created_at"),
            "source_updated_at": raw.get("updatedAt") or raw.get("source_updated_at"),
        }
        for field, value in values.items():
            if non_empty(value):
                fields[field] += 1
    return {
        "data": {
            "store": store,
            "products": {"total": len(products), "fields": fields},
            "catalog": {
                "current_records": len(catalog_products),
                "active_records": catalog_status_counts.get("ACTIVE", 0),
                "status_counts": catalog_status_counts,
                "historical_or_unconfirmed_records": len(products) - len(catalog_products),
            },
            "inventory": {
                "records": int(inventory_count),
                "outlets": int(outlet_count),
                "negative_records": int(inventory_stats[0] or 0),
                "positive_quantity_total": inventory_stats[1] or 0,
                "signed_quantity_total": inventory_stats[2] or 0,
                "minimum_quantity": inventory_stats[3],
                "maximum_quantity": inventory_stats[4],
                "snapshot_complete": inventory_manifest_state["complete"],
                "snapshot_at": inventory_manifest.snapshot_at if inventory_manifest else None,
                **inventory_manifest_state,
                "scan": ({
                    "status": inventory_scan.status,
                    "cursor_checkpointed": bool(inventory_scan.cursor),
                    "products_checkpointed": inventory_scan.product_count,
                    "started_at": inventory_scan.started_at,
                    "updated_at": inventory_scan.updated_at,
                } if inventory_scan else None),
            },
            "sales": {"total": int(sale_count), "sale_items": int(sale_item_count), "sale_items_missing_name": int(missing_sale_item_names)},
            "customers": {"total": int(customer_count)},
            "extended_data": extended_counts,
        },
        "source": "shopfront_crawler",
        "synced_at": datetime.now(timezone.utc),
    }


@app.get("/api/pos/coverage")
async def pos_coverage(store: str, db: Session = Depends(get_db)) -> dict:
    """Read POS staging counts through the server-side integration secret."""
    require_store(store, db)
    clients = {
        "primary": OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled),
    }
    if settings.pos_api_mirror_base_url or settings.pos_api_mirror_token:
        mirror_token = settings.pos_api_mirror_token or settings.pos_api_token
        if not settings.pos_api_mirror_base_url or not mirror_token:
            await clients["primary"].close()
            raise HTTPException(503, "Both POS mirror URL and token must be configured")
        clients["mirror"] = OrithosClient(
            settings.pos_api_mirror_base_url,
            mirror_token,
            settings.pos_import_enabled,
        )
    try:
        target_data = {}
        for target_name, client in clients.items():
            snapshot = await client.snapshot(store)
            matching = await client.match_status(store)
            target_data[target_name] = {
                "snapshot": snapshot.get("data", snapshot),
                "matching": matching.get("data", matching),
            }
        return {
            "data": {
                "store": store,
                "snapshot": target_data["primary"]["snapshot"],
                "matching": target_data["primary"]["matching"],
                "targets": target_data,
            },
            "source": "orithos_shopfront_staging",
        }
    except PosIntegrationError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        for client in clients.values():
            await client.close()


@app.get("/api/pos/products/reconcile")
async def reconcile_pos_products(store: str, preview: int = Query(200, ge=1, le=1000), db: Session = Depends(get_db)) -> dict:
    """Compare immutable Shopfront IDs; reject incomplete/unstable POS pagination."""
    require_store(store, db)
    crawler_rows = db.scalars(select(Product).where(Product.store_key == store)).all()
    crawler_by_id = {str(row.shopfront_product_id): row for row in crawler_rows if row.shopfront_product_id}
    referenced = {str(source_id) for source_id in db.scalars(
        select(SaleItem.shopfront_product_id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(Sale.store_key == store, SaleItem.shopfront_product_id.is_not(None))
    ).all() if source_id}
    catalog_rows = [row for row in crawler_rows if row.catalog_last_seen_at is not None]
    catalog_status_counts: dict[str, int] = {}
    for row in catalog_rows:
        raw = row.raw_payload if isinstance(row.raw_payload, dict) else {}
        status = str(raw.get("status") or "UNKNOWN").strip().upper()
        catalog_status_counts[status] = catalog_status_counts.get(status, 0) + 1
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        pos_by_id: dict[str, dict] = {}
        total: int | None = None
        page = 1
        while True:
            response = await client.data(store, "products", page=page, size=500)
            payload = response.get("data", response)
            rows = payload.get("data", []) if isinstance(payload, dict) else []
            if total is None:
                total = int(payload.get("total", 0))
            for row in rows:
                source_id = row.get("source_id")
                if source_id is not None:
                    pos_by_id[str(source_id)] = row
            if len(rows) < 500:
                break
            page += 1
        if len(pos_by_id) != (total or 0):
            raise PosIntegrationError(
                f"POS product pagination is incomplete or duplicated: {len(pos_by_id)} unique source IDs for {total} rows"
            )
        crawler_ids = set(crawler_by_id)
        pos_ids = set(pos_by_id)
        crawler_missing = sorted(crawler_ids - pos_ids)
        pos_only = sorted(pos_ids - crawler_ids)
        historical_only = [source_id for source_id in pos_only if source_id in referenced]
        unexplained = [source_id for source_id in pos_only if source_id not in referenced]
        return {
            "data": {
                "store": store,
                "crawler": {
                    "total": len(crawler_ids),
                    "catalog_seen_since_tracking": len(catalog_rows),
                    "catalog_active": catalog_status_counts.get("ACTIVE", 0),
                    "catalog_status_counts": catalog_status_counts,
                    "catalog_unconfirmed_with_sales_reference": sum(1 for row in crawler_rows if row.catalog_last_seen_at is None and row.shopfront_product_id in referenced),
                    "unclassified": sum(1 for row in crawler_rows if row.catalog_last_seen_at is None and row.shopfront_product_id not in referenced),
                    "historical_sale_reference_ids": len(referenced),
                },
                "pos_total": len(pos_ids),
                "crawler_missing_in_pos": {"count": len(crawler_missing), "source_ids": crawler_missing[:preview]},
                "pos_only": {"count": len(pos_only), "source_ids": [
                    {"source_id": source_id, "name": pos_by_id[source_id].get("name"), "referenced_by_historical_sale": source_id in referenced}
                    for source_id in pos_only[:preview]
                ]},
                "pos_only_classification": {
                    "historical_sale_references": {"count": len(historical_only), "source_ids": historical_only[:preview]},
                    "unexplained": {"count": len(unexplained), "source_ids": unexplained[:preview]},
                },
                "automatic_deletion_performed": False,
            },
            "source": "shopfront_crawler_vs_orithos_staging",
        }
    except PosIntegrationError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        await client.close()


@app.get("/api/pos/inventory/reconcile")
async def reconcile_pos_inventory(store: str, preview: int = Query(200, ge=1, le=1000), db: Session = Depends(get_db)) -> dict:
    """Compare the complete signed source snapshot with POS staging by product and outlet."""
    require_store(store, db)
    manifest = db.scalar(select(InventorySnapshotManifest).where(InventorySnapshotManifest.store_key == store))
    source_rows = db.scalars(
        select(InventorySnapshot).where(InventorySnapshot.store_key == store)
    ).all()
    source_by_key = {
        (str(row.shopfront_product_id), str(row.outlet_id or "")): row
        for row in source_rows
    }
    if len(source_by_key) != len(source_rows):
        raise HTTPException(502, "Crawler inventory contains duplicate product/outlet keys")

    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        pos_by_key: dict[tuple[str, str], dict[str, Any]] = {}
        total: int | None = None
        page = 1
        while True:
            response = await client.data(store, "inventory", page=page, size=500)
            payload = response.get("data", response)
            rows = payload.get("data", []) if isinstance(payload, dict) else []
            if total is None:
                total = int(payload.get("total", 0))
            for row in rows:
                source_id = row.get("source_product_id")
                if source_id is None:
                    continue
                key = (str(source_id), str(row.get("outlet_id") or ""))
                if key in pos_by_key:
                    raise PosIntegrationError("POS inventory pagination contains duplicate product/outlet keys")
                pos_by_key[key] = row
            if len(rows) < 500:
                break
            page += 1
        if len(pos_by_key) != (total or 0):
            raise PosIntegrationError(
                f"POS inventory pagination is incomplete: {len(pos_by_key)} unique keys for {total} rows"
            )

        source_keys = set(source_by_key)
        pos_keys = set(pos_by_key)
        source_product_ids = {product_id for product_id, _ in source_keys}
        manifest_product_ids = {
            str(product_id) for product_id in (manifest.source_product_ids or [])
        } if manifest else set()
        source_products_match_manifest = source_product_ids == manifest_product_ids
        products_not_in_manifest = sorted(source_product_ids - manifest_product_ids)
        manifest_only_products = sorted(manifest_product_ids - source_product_ids)
        source_missing = sorted(source_keys - pos_keys)
        pos_only = sorted(pos_keys - source_keys)
        quantity_mismatches = []
        for key in sorted(source_keys & pos_keys):
            source_quantity = source_by_key[key].quantity
            pos_quantity = parse_decimal(pos_by_key[key].get("quantity"))
            if source_quantity is None or pos_quantity is None or source_quantity != pos_quantity:
                quantity_mismatches.append({
                    "source_product_id": key[0],
                    "outlet_id": key[1],
                    "source_quantity": source_quantity,
                    "pos_quantity": pos_quantity,
                })

        return {
            "data": {
                "store": store,
                "source": {
                    "records": len(source_keys),
                    "manifest_complete": bool(manifest and manifest.complete),
                    "products": len(source_product_ids),
                    "manifest_products": len(manifest_product_ids),
                    "products_match_manifest": source_products_match_manifest,
                    "products_not_in_manifest": products_not_in_manifest[:preview],
                    "manifest_only_products": manifest_only_products[:preview],
                    "snapshot_at": manifest.snapshot_at if manifest else None,
                },
                "pos_total": len(pos_keys),
                "missing_in_pos": {"count": len(source_missing), "keys": source_missing[:preview]},
                "pos_only": {"count": len(pos_only), "keys": pos_only[:preview]},
                "quantity_mismatches": {
                    "count": len(quantity_mismatches),
                    "rows": quantity_mismatches[:preview],
                },
                "complete_match": bool(manifest and manifest.complete)
                    and source_products_match_manifest
                    and len(pos_keys) == len(source_keys)
                    and not source_missing and not pos_only and not quantity_mismatches,
                "automatic_write_performed": False,
            },
            "source": "shopfront_crawler_vs_orithos_staging",
        }
    except PosIntegrationError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        await client.close()


async def sync_supply_chain(db: Session, store: Store) -> dict:
    if not settings.shopfront_enable_supply_chain:
        raise HTTPException(409, "Supply-chain scopes are disabled; enable them and reauthorize Shopfront first")
    token = await access_token(db, settings, store)
    client = get_client(settings, store)
    errors: list[dict[str, str]] = []
    try:
        # Keep the two permission domains independent. Shopfront may grant
        # purchase-order access while withholding the supplier directory.
        try:
            suppliers = await asyncio.wait_for(
                client.fetch_suppliers(token),
                timeout=settings.shopfront_supply_chain_timeout_seconds,
            )
        except asyncio.TimeoutError:
            suppliers = []
            errors.append({
                "entity": "suppliers",
                "message": f"timed out after {settings.shopfront_supply_chain_timeout_seconds}s",
            })
        except Exception as exc:
            suppliers = []
            errors.append({"entity": "suppliers", "message": str(exc)[:500]})
        try:
            orders = await asyncio.wait_for(
                client.fetch_purchase_orders(token),
                timeout=settings.shopfront_supply_chain_timeout_seconds,
            )
        except asyncio.TimeoutError:
            orders = []
            errors.append({
                "entity": "purchase_orders",
                "message": f"timed out after {settings.shopfront_supply_chain_timeout_seconds}s",
            })
        except Exception as exc:
            orders = []
            errors.append({"entity": "purchase_orders", "message": str(exc)[:500]})
    finally:
        await client.close()

    now = datetime.now(timezone.utc)
    supplier_count = 0
    order_count = 0
    for source in suppliers:
        source_id = str(source.get("id") or "").strip()
        if not source_id:
            continue
        row = db.scalar(select(ShopfrontSupplier).where(
            ShopfrontSupplier.store_key == store.store_key, ShopfrontSupplier.source_id == source_id,
        ))
        if row is None:
            row = ShopfrontSupplier(store_key=store.store_key, source_id=source_id)
            db.add(row)
        row.name = source.get("name")
        row.business_number = source.get("businessNumber")
        row.status = source.get("status")
        row.raw_payload = without_credentials(source)
        row.synced_at = now
        supplier_count += 1
    for source in orders:
        source_id = str(source.get("id") or "").strip()
        if not source_id:
            continue
        row = db.scalar(select(ShopfrontPurchaseOrder).where(
            ShopfrontPurchaseOrder.store_key == store.store_key, ShopfrontPurchaseOrder.source_id == source_id,
        ))
        if row is None:
            row = ShopfrontPurchaseOrder(store_key=store.store_key, source_id=source_id)
            db.add(row)
        lines = source.get("products") if isinstance(source.get("products"), list) else []
        supplier = next((line.get("supplier") for line in lines if isinstance(line, dict) and isinstance(line.get("supplier"), dict) and line["supplier"].get("id")), {})
        row.supplier_source_id = str(supplier["id"]) if supplier.get("id") is not None else None
        row.status = source.get("status")
        row.order_date = str(source.get("orderDate")) if source.get("orderDate") is not None else None
        row.total_cost = parse_decimal(source.get("totalCost"))
        row.raw_payload = without_credentials(source)
        row.synced_at = now
        order_count += 1
    db.commit()
    result = {
        "status": "partial" if errors else "completed",
        "suppliers": supplier_count,
        "purchase_orders": order_count,
        "errors": errors,
    }
    if settings.pos_import_enabled:
        pos_client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, True)
        try:
            supplier_rows = db.scalars(select(ShopfrontSupplier).where(ShopfrontSupplier.store_key == store.store_key).order_by(ShopfrontSupplier.source_id)).all()
            order_rows = db.scalars(select(ShopfrontPurchaseOrder).where(ShopfrontPurchaseOrder.store_key == store.store_key).order_by(ShopfrontPurchaseOrder.source_id)).all()
            # Dual-write catalogue-style: primary store_key plus optional secondary
            # (Demo) so shared-DB tenants stay on the same Shopfront SoT.
            target_store_keys = [store.store_key]
            secondary = (settings.pos_api_secondary_store_key or "").strip()
            if secondary and secondary != store.store_key:
                target_store_keys.append(secondary)
            supplier_items = [
                {
                    "source_id": item.source_id,
                    "name": item.name,
                    "business_number": item.business_number,
                    "status": item.status,
                    "raw_payload": item.raw_payload,
                }
                for item in supplier_rows
            ]
            order_items = [
                {
                    "source_id": item.source_id,
                    "supplier_source_id": item.supplier_source_id,
                    "status": item.status,
                    "order_date": item.order_date,
                    "total_cost": item.total_cost,
                    "raw_payload": item.raw_payload,
                }
                for item in order_rows
            ]
            for target_store in target_store_keys:
                for offset in range(0, len(supplier_items), 100):
                    batch = supplier_items[offset:offset + 100]
                    response = await pos_client.upsert_suppliers(jsonable_encoder({
                        "store_key": target_store,
                        "items": batch,
                    }))
                    staged = response.get("data", response)
                    if staged.get("status") != "STAGED":
                        raise PosIntegrationError(
                            f"Supplier mirror batch was not staged for {target_store}: {staged.get('status', 'unknown')}"
                        )
                for offset in range(0, len(order_items), 50):
                    batch = order_items[offset:offset + 50]
                    response = await pos_client.upsert_purchase_orders(jsonable_encoder({
                        "store_key": target_store,
                        "items": batch,
                    }))
                    staged = response.get("data", response)
                    if staged.get("status") != "STAGED":
                        raise PosIntegrationError(
                            f"Purchase-order mirror batch was not staged for {target_store}: {staged.get('status', 'unknown')}"
                        )
            # Library-side promote: pos-api reads shopfront_purchase_order via JDBC
            # and writes native purchase_order. Small request body, no CF payload bloat.
            # Uses POS_API_BASE_URL (internal http://backend:8080) — public CF times out.
            promote_summary: dict[str, Any] = {}
            for target_store in target_store_keys:
                promote_summary[target_store] = await _promote_purchase_orders_loop(
                    pos_client, target_store, limit=100, max_loops=80, retry_skipped=False,
                )
            result["pos_staged"] = {
                "suppliers": len(supplier_rows),
                "purchase_orders": len(order_rows),
                "store_keys": target_store_keys,
            }
            result["pos_promoted"] = promote_summary
        finally:
            await pos_client.close()
    try:
        result["odoo_purchase_mirror"] = await push_purchase_mirror(db, store)
    except Exception as exc:
        logger.warning("Shopfront purchase mirror failed: store=%s error=%r", store.store_key, exc)
        result["odoo_purchase_mirror"] = {"status": "failed"}
    return result


async def _promote_purchase_orders_loop(
    pos_client: OrithosClient,
    store_key: str,
    *,
    limit: int = 100,
    max_loops: int = 80,
    retry_skipped: bool = False,
) -> dict[str, Any]:
    """Call pos-api purchase-orders:promote-native until caught up (internal URL)."""
    after = ""
    created = updated = skipped = loops = 0
    mapped = None
    while loops < max_loops:
        loops += 1
        payload: dict[str, Any] = {
            "store_key": store_key,
            "limit": limit,
            "only_unmapped": True,
            "retry_skipped": retry_skipped,
        }
        if after:
            payload["after_source_id"] = after
        response = await pos_client.promote_purchase_orders(payload)
        data = response.get("data", response)
        biz = data.get("business") or {}
        created += int(biz.get("created") or 0)
        updated += int(biz.get("updated") or 0)
        skipped += int(biz.get("skipped") or 0)
        after = str(data.get("last_source_id") or after)
        mapped = data.get("purchase_orders_mapped", mapped)
        if not data.get("has_more") or int(data.get("mirror_batch") or 0) == 0:
            break
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "loops": loops,
        "mapped": mapped,
        "last_source_id": after or None,
    }


@app.post("/api/stores/{store_key}/purchase-orders/promote-native")
async def promote_purchase_orders_native(store_key: str, request: Request) -> dict:
    """Catch-up promote via crawler→internal pos-api (avoids Cloudflare gateway timeouts)."""
    expected = (
        settings.shopfront_integration_token.strip()
        or settings.pos_api_token.strip()
    )
    supplied = request.headers.get("authorization", "")
    header_token = request.headers.get("x-shopfront-integration-token", "")
    authed = bool(expected) and (
        hmac.compare_digest(supplied, f"Bearer {expected}")
        or hmac.compare_digest(header_token, expected)
    )
    if not authed:
        raise HTTPException(401, "Unauthorized")
    if not settings.pos_import_enabled:
        raise HTTPException(409, "POS_IMPORT_ENABLED is false")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    limit = int(body.get("limit") or 100)
    max_loops = int(body.get("max_loops") or 80)
    retry_skipped = bool(body.get("retry_skipped") or False)
    limit = max(1, min(limit, 250))
    max_loops = max(1, min(max_loops, 200))
    targets = [store_key]
    secondary = (settings.pos_api_secondary_store_key or "").strip()
    include_secondary = bool(body.get("include_secondary"))
    if include_secondary and secondary and secondary != store_key:
        targets.append(secondary)
    pos_client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, True)
    try:
        summary = {}
        for target in targets:
            summary[target] = await _promote_purchase_orders_loop(
                pos_client, target, limit=limit, max_loops=max_loops, retry_skipped=retry_skipped,
            )
        return {
            "status": "promoted",
            "pos_api_base_url": settings.pos_api_base_url,
            "targets": targets,
            "result": summary,
        }
    except PosIntegrationError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        await pos_client.close()


@app.post("/api/stores/{store_key}/supply-chain/sync")
async def supply_chain_sync(store_key: str, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="supply_chain", status="queued")
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "source": "shopfront_supply_chain_mirror"}


@app.post("/api/stores/{store_key}/customers/sync")
async def customers_sync(store_key: str, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="customers", status="queued")
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "source": "shopfront_customers"}


@app.post("/api/stores/{store_key}/extended-data/sync")
async def extended_data_sync(store_key: str, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="extended_data", status="queued")
    db.add(job)
    db.commit()
    wake_durable_worker()
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "source": "shopfront_extended_records"}


@app.get("/api/extended-records")
def list_extended_records(
    store: str,
    entity_type: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    require_store(store, db)
    query = select(ShopfrontExtendedRecord).where(ShopfrontExtendedRecord.store_key == store)
    count_query = select(func.count(ShopfrontExtendedRecord.id)).where(ShopfrontExtendedRecord.store_key == store)
    if entity_type:
        query = query.where(ShopfrontExtendedRecord.entity_type == entity_type)
        count_query = count_query.where(ShopfrontExtendedRecord.entity_type == entity_type)
    rows = db.scalars(query.order_by(ShopfrontExtendedRecord.entity_type, ShopfrontExtendedRecord.source_id)
                       .offset((page - 1) * size).limit(size)).all()
    total = db.scalar(count_query) or 0
    return {"data": [{
        "entity_type": row.entity_type,
        "source_id": row.source_id,
        "raw_payload": row.raw_payload,
        "synced_at": row.synced_at,
    } for row in rows], "pagination": {"page": page, "size": size, "total": total}, "source": "shopfront_extended_records"}


@app.get("/api/suppliers")
def list_suppliers(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    query = select(ShopfrontSupplier).where(ShopfrontSupplier.store_key == store).order_by(ShopfrontSupplier.source_id)
    rows = db.scalars(query.offset((page - 1) * size).limit(size)).all()
    total = db.scalar(select(func.count(ShopfrontSupplier.id)).where(ShopfrontSupplier.store_key == store)) or 0
    return {"data": [{"source_id": row.source_id, "name": row.name, "business_number": row.business_number, "status": row.status, "raw_payload": row.raw_payload, "synced_at": row.synced_at} for row in rows], "pagination": {"page": page, "size": size, "total": total}, "source": "shopfront_suppliers"}


@app.get("/api/purchase-orders")
def list_purchase_orders(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), status: str | None = None, q: str | None = None, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    if q is not None and len(q) > 120:
        raise HTTPException(400, "q must be at most 120 characters")
    filters: list[Any] = [ShopfrontPurchaseOrder.store_key == store]
    if status:
        filters.append(func.upper(ShopfrontPurchaseOrder.status) == status.strip().upper())
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(or_(
            ShopfrontPurchaseOrder.source_id.ilike(pattern),
            ShopfrontPurchaseOrder.supplier_source_id.ilike(pattern),
            cast(ShopfrontPurchaseOrder.raw_payload, String).ilike(pattern),
        ))
    statement = select(ShopfrontPurchaseOrder, ShopfrontSupplier.name).outerjoin(
        ShopfrontSupplier,
        (ShopfrontSupplier.store_key == ShopfrontPurchaseOrder.store_key)
        & (ShopfrontSupplier.source_id == ShopfrontPurchaseOrder.supplier_source_id),
    ).where(*filters).order_by(desc(ShopfrontPurchaseOrder.order_date), ShopfrontPurchaseOrder.source_id)
    rows = db.execute(statement.offset((page - 1) * size).limit(size)).all()
    total = db.scalar(select(func.count(ShopfrontPurchaseOrder.id)).where(*filters)) or 0
    return {"data": [{
        "source_id": row.source_id,
        "supplier_source_id": row.supplier_source_id,
        "supplier_name": supplier_name,
        "status": row.status,
        "order_date": row.order_date,
        "total_cost": row.total_cost,
        "line_count": (row.raw_payload or {}).get("lineCount") if isinstance(row.raw_payload, dict) else None,
        "raw_payload": row.raw_payload,
        "synced_at": row.synced_at,
    } for row, supplier_name in rows], "pagination": {"page": page, "size": size, "total": total}, "source": "shopfront_purchase_orders"}


@app.get("/api/customers")
def list_customers(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    query = select(ShopfrontCustomer).where(ShopfrontCustomer.store_key == store).order_by(ShopfrontCustomer.source_id)
    rows = db.scalars(query.offset((page - 1) * size).limit(size)).all()
    total = db.scalar(select(func.count(ShopfrontCustomer.id)).where(ShopfrontCustomer.store_key == store)) or 0
    return {"data": [{
        "source_id": row.source_id, "client_id": row.client_id, "code": row.code,
        "name": row.name, "first_name": row.first_name, "last_name": row.last_name,
        "company": row.company, "email": row.email, "phone": row.phone, "mobile": row.mobile,
        "customer_group": row.customer_group, "loyalty_points": row.loyalty_points,
        "current_owing": row.current_owing, "deleted": row.deleted, "synced_at": row.synced_at,
    } for row in rows], "pagination": {"page": page, "size": size, "total": total}, "source": "shopfront_customers"}


@app.post("/api/sync/runs/{run_id}/retry")
async def retry_sync_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    run = db.get(SyncRun, run_id)
    if run is None:
        raise HTTPException(404, "Sync run not found")
    if active_job(db, run.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    # A retry must replay the source sales window. The crawler may have
    # persisted the rows while the downstream mirror stopped halfway through;
    # treating them as unchanged would incorrectly report zero work and leave
    # the mirror short.
    job = SyncJob(
        store_key=run.store_key,
        job_type="history",
        status="queued",
        from_date=run.from_date,
        to_date=run.to_date,
        cursor_date=run.from_date,
        payload={"retry_run_id": run.id, "replay_sales_window": True},
    )
    db.add(job)
    db.commit()
    return {"status": "queued", "job_id": job.id, "retry_run_id": run.id}


@app.post("/api/sync/runs/{run_id}/cancel")
def cancel_sync_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    job = db.get(SyncJob, run_id)
    if job is not None:
        if job.status in {"queued", "running"}:
            job.status = "cancelled"
            job.error = "cancelled by operator"
            job.finished_at = datetime.now(timezone.utc)
        active_run = None
        if job.started_at is not None:
            active_run = db.scalars(
                select(SyncRun)
                .where(
                    SyncRun.store_key == job.store_key,
                    SyncRun.status == "running",
                    SyncRun.started_at >= job.started_at,
                )
                .order_by(desc(SyncRun.started_at))
            ).first()
        if active_run is not None:
            active_run.status = "cancelled"
            active_run.error = "cancelled by operator"
            active_run.finished_at = datetime.now(timezone.utc)
        if job.status == "cancelled":
            db.commit()
        task = active_job_tasks.get(job.id) or active_sync_tasks.get(job.store_key)
        if task is not None and task is not asyncio.current_task() and not task.done():
            task.cancel()
        return {"status": job.status, "run_id": job.id, "type": "job"}
    run = db.get(SyncRun, run_id)
    if run is None:
        raise HTTPException(404, "Sync run not found")
    if run.status == "running":
        run.status = "cancelled"
        run.error = "cancelled by operator"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        task = active_sync_tasks.get(run.store_key)
        if task is not None and task is not asyncio.current_task() and not task.done():
            task.cancel()
    return {"status": run.status, "run_id": run.id}


async def run_sync_background(store_key: str, start: date, end: date, job_id: int | None = None) -> None:
    task = asyncio.current_task()
    if task is not None:
        active_sync_tasks[store_key] = task
    try:
        await _run_sync_background(store_key, start, end, job_id)
    finally:
        if task is not None and active_sync_tasks.get(store_key) is task:
            active_sync_tasks.pop(store_key, None)


async def _run_sync_background(store_key: str, start: date, end: date, job_id: int | None = None) -> None:
    db = next(get_db())
    try:
        store = db.scalar(select(Store).where(Store.store_key == store_key))
        if store:
            cursor = start
            while cursor <= end:
                # Keep report windows small enough for Shopfront's reporting
                # backend; large historical windows can hang or return 500.
                chunk_end = min(cursor + timedelta(days=max(1, settings.history_chunk_days - 1)), end)
                # A restarted history job resumes at its saved cursor. The
                # cursor is also the current invocation's start date, so using
                # ``cursor == start`` alone would incorrectly repeat the full
                # 10k-product catalog on every restart. The catalog is already
                # durable after the first successful attempt; only a new
                # history job with an empty catalog needs the initial snapshot.
                include_catalog = cursor == start
                force_full_catalog = False
                job = None
                if job_id is not None and include_catalog:
                    job = db.get(SyncJob, job_id)
                    existing_products = db.scalar(
                        select(func.count()).select_from(Product).where(Product.store_key == store_key)
                    ) or 0
                    existing_inventory = db.scalar(
                        select(func.count()).select_from(InventorySnapshot).where(InventorySnapshot.store_key == store_key)
                    ) or 0
                    force_full_catalog = existing_inventory == 0
                    # Older deployments had a complete catalog but no durable
                    # checkpoint. Seed it from the newest local product sync so
                    # the first post-upgrade daily run is incremental instead
                    # of re-downloading every product.
                    if job and job.job_type == "daily_sync" and existing_products:
                        checkpoint = db.scalar(select(ShopfrontSyncCheckpoint).where(
                            ShopfrontSyncCheckpoint.store_key == store_key,
                            ShopfrontSyncCheckpoint.checkpoint_key == "catalog",
                        ))
                        if checkpoint is None:
                            latest_product_sync = db.scalar(select(func.max(Product.synced_at)).where(Product.store_key == store_key))
                            if latest_product_sync:
                                checkpoint = ShopfrontSyncCheckpoint(
                                    store_key=store_key,
                                    checkpoint_key="catalog",
                                    value=latest_product_sync.isoformat(),
                                    updated_at=datetime.now(timezone.utc),
                                )
                                db.add(checkpoint)
                                db.commit()
                    # A product catalogue can already exist while its inventory
                    # snapshot is still empty (for example after a history
                    # replay). Re-fetch the catalogue in that case so stock is
                    # not reported as zero merely because products were saved.
                    include_catalog = should_include_catalog(job.job_type if job else None, existing_products, existing_inventory)
                # Serialize each durable chunk, then release the writer so a
                # queued catalog/sales repair can run before the next range.
                async with sync_lock:
                    completed = await _sync_history_chunk(
                        db,
                        store_key,
                        store,
                        cursor,
                        chunk_end,
                        job_id,
                        include_catalog,
                        force_full_catalog,
                        refresh_inventory=bool(
                            job and cursor == date.fromisoformat(job.from_date)
                            and (job.payload or {}).get("full_inventory_snapshot") is True
                        ),
                        replay_sales_window=bool(job and (job.payload or {}).get("replay_sales_window")),
                    )
                    # Never advance a durable history cursor past a chunk that
                    # failed after all split retries. Advancing here would
                    # make a job look complete while leaving an unrecoverable
                    # data gap behind.
                    if not completed:
                        if job_id is not None:
                            job = db.get(SyncJob, job_id)
                            if job is not None and job.status == "running":
                                job.status = "failed"
                                job.error = f"history chunk failed: {cursor.isoformat()}..{chunk_end.isoformat()}"
                                job.finished_at = datetime.now(timezone.utc)
                                db.commit()
                        break
                    cursor = chunk_end + timedelta(days=1)
                    if job_id is not None:
                        job = db.get(SyncJob, job_id)
                        if job is not None and job.status == "cancelled":
                            break
                        if job is not None:
                            job.cursor_date = cursor.isoformat()
                            job.heartbeat_at = datetime.now(timezone.utc)
                            job.phase = f"sync:{cursor.isoformat()}"
                            # A restart marker is historical context only;
                            # once this chunk commits, status should reflect
                            # the currently healthy worker.
                            job.error = None
                            db.commit()
                            if job.job_type == "history":
                                daily_waiting = db.scalar(select(SyncJob.id).where(
                                    SyncJob.store_key == store_key,
                                    SyncJob.job_type == "daily_sync",
                                    SyncJob.status == "queued",
                                ).limit(1))
                                if daily_waiting:
                                    job.status = "queued"
                                    job.phase = "yielded_to_daily_sync"
                                    db.commit()
                                    break
    finally:
        db.close()


async def _sync_history_chunk(
    db: Session,
    store_key: str,
    store: Store,
    start: date,
    end: date,
    job_id: int | None,
    include_catalog: bool,
    force_full_catalog: bool = False,
    refresh_inventory: bool = False,
    replay_sales_window: bool = False,
) -> bool:
    try:
        async def keepalive() -> None:
            while True:
                await asyncio.sleep(30)
                for attempt in range(3):
                    heartbeat_db = SessionLocal()
                    try:
                        if job_id is None:
                            return
                        heartbeat_job = heartbeat_db.get(SyncJob, job_id)
                        if heartbeat_job is None or heartbeat_job.status != "running":
                            return
                        heartbeat_job.heartbeat_at = datetime.now(timezone.utc)
                        heartbeat_job.phase = heartbeat_job.phase or "sync:active"
                        heartbeat_db.commit()
                        break
                    except OperationalError as exc:
                        heartbeat_db.rollback()
                        message = str(exc).lower()
                        if "locked" not in message and "busy" not in message:
                            raise
                        if attempt == 2:
                            logger.warning("Sync heartbeat deferred after SQLite contention for job %s", job_id)
                        else:
                            await asyncio.sleep(0.25 * (attempt + 1))
                    finally:
                        heartbeat_db.close()

        async def report_progress(field: str, item_count: int) -> None:
            if job_id is None:
                return
            job = db.get(SyncJob, job_id)
            if job is None or job.status == "cancelled":
                return
            job.phase = f"{field}:fetched:{item_count}"
            job.heartbeat_at = datetime.now(timezone.utc)
            db.commit()

        # Keep the run open until the POS/Odoo mirror has acknowledged every
        # batch. A source-only completion must never advance the history cursor
        # while the downstream import is still running.
        catalog_checkpoint = db.scalar(select(ShopfrontSyncCheckpoint).where(
            ShopfrontSyncCheckpoint.store_key == store_key,
            ShopfrontSyncCheckpoint.checkpoint_key == "catalog",
        ))
        keepalive_task = asyncio.create_task(keepalive()) if job_id is not None else None
        async def stop_keepalive() -> None:
            if keepalive_task is not None:
                keepalive_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await keepalive_task

        run = await sync_store(
            db,
            settings,
            store,
            start,
            end,
            include_catalog=include_catalog,
            defer_completion=True,
            # An empty inventory mirror requires a full catalogue query. An
            # incremental query can contain no changed products and would
            # leave the mirror falsely empty.
            products_updated_after=(catalog_checkpoint.value if include_catalog and catalog_checkpoint and not force_full_catalog else None),
            refresh_inventory=refresh_inventory,
            progress_callback=report_progress,
        )
        if run.status == "failed":
            await stop_keepalive()
            return False
        sync_counts = dict(run.counts or {})
        if refresh_inventory and not sync_counts.get("inventory_sync_complete"):
            raise RuntimeError("Shopfront full inventory snapshot did not complete")
        if settings.pos_import_enabled:
            # A catalog query may be incremental even when ``include_catalog``
            # is true. Only a first full snapshot should resend every product
            # and inventory row; later runs push changed catalog rows plus
            # products referenced by the current sales window.
            full_catalog = bool(sync_counts.get("catalog_full_snapshot"))
            catalog_source_ids = sync_counts.get("catalog_source_ids") or []
            sale_product_ids = sync_counts.get("product_source_ids") or []
            product_source_ids = sorted(set(catalog_source_ids) | set(sale_product_ids))
            source_sales = int(sync_counts.get("sales") or 0)
            unchanged_sales = int(sync_counts.get("sales_skipped_unchanged") or 0)
            skip_stable_history_products = bool(
                settings.pos_skip_unchanged_history_products
                and not full_catalog
                and not catalog_source_ids
                and source_sales > 0
                and unchanged_sales == source_sales
            )
            if skip_stable_history_products:
                product_source_ids = []
            sync_job = db.get(SyncJob, job_id) if job_id is not None else None
            replay_daily_sales = bool(
                sync_job
                and (
                    sync_job.job_type == "daily_sync"
                    or (sync_job.job_type == "history" and (sync_job.payload or {}).get("replay_sales_window") is True)
                )
            )
            push_kwargs = {
                "run": run,
                "replay_sales_window": replay_daily_sales,
                "include_catalog": full_catalog,
                "include_inventory_snapshot": refresh_inventory,
                "inventory_snapshot_source_ids": sync_counts.get("inventory_source_product_ids") or [],
                "inventory_snapshot_at": sync_counts.get("inventory_snapshot_at"),
            }
            if sync_job is not None and sync_job.status == "running":
                sync_job.phase = "pos_import"
                sync_job.heartbeat_at = datetime.now(timezone.utc)
                db.commit()
                push_kwargs["job"] = sync_job
            if not full_catalog:
                push_kwargs["product_source_ids"] = product_source_ids
                push_kwargs["inventory_source_ids"] = catalog_source_ids
            # Do not keep a crawler write transaction open while waiting on
            # the POS or Odoo services.
            db.commit()
            pos_result = await push_pos_snapshot(db, store_key, start, end, **push_kwargs)
            if pos_result.get("status") != "completed" or pos_result.get("error"):
                raise RuntimeError(pos_result.get("error") or "POS mirror did not confirm a completed import")
            imported_sales = int(pos_result.get("sales_imported") or 0)
            # Daily runs replay the whole bounded source window so a prior
            # partial mirror write cannot be mistaken for a complete import.
            required_sales = source_sales if replay_daily_sales else max(0, source_sales - unchanged_sales)
            if imported_sales < required_sales:
                raise RuntimeError(
                    "POS sales import is smaller than Shopfront source: "
                    f"required={required_sales}, source={source_sales}, imported={imported_sales}"
                )
            # The IDs are an in-process filter for this chunk, not durable
            # progress state. Keeping only the count makes status reads and
            # run-row commits substantially smaller for long histories.
            if product_source_ids is not None:
                sync_counts["product_source_id_count"] = len(product_source_ids)
                sync_counts.pop("product_source_ids", None)
            if refresh_inventory:
                sync_counts["inventory_source_product_id_count"] = len(sync_counts.get("inventory_source_product_ids") or [])
                sync_counts.pop("inventory_source_product_ids", None)
            sync_counts["pos_products_skipped_unchanged"] = skip_stable_history_products
            run.counts = {"sync": sync_counts, "pos_import": pos_result}
        else:
            run.counts = {"sync": sync_counts}
        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
        if include_catalog and sync_counts.get("catalog_sync_complete") and sync_counts.get("catalog_cursor"):
            if catalog_checkpoint is None:
                catalog_checkpoint = ShopfrontSyncCheckpoint(store_key=store_key, checkpoint_key="catalog", value="")
                db.add(catalog_checkpoint)
            catalog_checkpoint.value = sync_counts["catalog_cursor"]
            catalog_checkpoint.updated_at = datetime.now(timezone.utc)
        db.commit()
        if start is not None and end is not None:
            await notify_report_refresh(store_key, start, end, run.id, "completed")
        await stop_keepalive()
        return True
    except Exception as exc:
        if "stop_keepalive" in locals():
            await stop_keepalive()
        failed_run = db.scalars(select(SyncRun).where(SyncRun.store_key == store_key, SyncRun.from_date == start.isoformat(), SyncRun.to_date == end.isoformat()).order_by(desc(SyncRun.started_at))).first()
        if failed_run:
            failed_run.status = "superseded" if start < end else "failed"
            failed_run.error = "split into smaller retry ranges" if start < end else str(exc)[:2000]
            db.commit()
        if start is not None and end is not None:
            await notify_report_refresh(store_key, start, end, failed_run.id if failed_run else None, "partial")
        if start >= end:
            logger.exception("Shopfront single-day chunk failed: store=%s from=%s", store_key, start)
            return False
        midpoint = start + timedelta(days=(end - start).days // 2)
        logger.warning("Splitting failed Shopfront range: store=%s from=%s to=%s", store_key, start, end)
        left = await _sync_history_chunk(db, store_key, store, start, midpoint, job_id, include_catalog, force_full_catalog, refresh_inventory, replay_sales_window)
        right = await _sync_history_chunk(db, store_key, store, midpoint + timedelta(days=1), end, job_id, False, False, False, replay_sales_window)
        return left and right


async def push_pos_snapshot(
    db: Session,
    store_key: str,
    start: date | None = None,
    end: date | None = None,
    run: SyncRun | None = None,
    include_catalog: bool = True,
    product_source_ids: list[str] | None = None,
    inventory_source_ids: list[str] | None = None,
    include_inventory_snapshot: bool = False,
    inventory_snapshot_source_ids: list[str] | None = None,
    inventory_snapshot_at: str | None = None,
    include_sales: bool = True,
    replay_sales_window: bool = False,
    sales_offset: int = 0,
    job: SyncJob | None = None,
) -> dict:
    """Push a snapshot in bounded pages so a full history never sits in RAM."""
    products_query = select(Product).where(Product.store_key == store_key)
    if not include_catalog:
        ids = sorted({str(value) for value in (product_source_ids or []) if value})
        products_query = products_query.where(Product.shopfront_product_id.in_(ids)) if ids else products_query.where(False)
    products = db.scalars(products_query).all()
    if include_catalog or include_inventory_snapshot:
        inventory = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store_key)).all()
    else:
        inventory_ids = sorted({str(value) for value in (inventory_source_ids or []) if value})
        inventory_query = select(InventorySnapshot).where(InventorySnapshot.store_key == store_key)
        inventory = db.scalars(inventory_query.where(InventorySnapshot.shopfront_product_id.in_(inventory_ids))).all() if inventory_ids else []
    source_store = db.scalar(select(Store).where(Store.store_key == store_key))
    try:
        local_zone = ZoneInfo(source_store.timezone if source_store else settings.sync_timezone)
    except (KeyError, ValueError):
        local_zone = timezone.utc
    repair_job = bool(job is not None and job.job_type == "sales_repair")
    sales_reconcile_job = bool(job is not None and job.job_type == "sales_reconcile")
    sales_query = select(Sale).where(Sale.store_key == store_key).order_by(Sale.id.desc() if repair_job else Sale.id)
    sales_selection_diagnostics: dict[str, Any] | None = None
    if run is not None and start is not None and end is not None and not replay_sales_window:
        # A history sync has just upserted the exact source rows that belong
        # to this run. Use its durable sync timestamp so sales with a missing
        # or malformed source timestamp are still imported. Full snapshots
        # retain the normal date filter below.
        sales_query = sales_query.where(Sale.synced_at >= run.started_at)
    elif run is not None and start is not None and end is not None and replay_sales_window:
        window_start = datetime.combine(start, datetime.min.time(), tzinfo=local_zone)
        window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=local_zone)
        synced_filter = Sale.synced_at >= run.started_at
        created_filter = (Sale.created_at >= window_start) & (Sale.created_at < window_end)
        updated_filter = (Sale.updated_at >= window_start) & (Sale.updated_at < window_end)
        union_filter = or_(synced_filter, created_filter, updated_filter)
        total_local = db.scalar(
            select(func.count()).select_from(select(Sale.id).where(Sale.store_key == store_key).subquery())
        ) or 0
        synced_count = db.scalar(
            select(func.count()).select_from(select(Sale.id).where(Sale.store_key == store_key, synced_filter).subquery())
        ) or 0
        created_count = db.scalar(
            select(func.count()).select_from(select(Sale.id).where(Sale.store_key == store_key, created_filter).subquery())
        ) or 0
        updated_count = db.scalar(
            select(func.count()).select_from(select(Sale.id).where(Sale.store_key == store_key, updated_filter).subquery())
        ) or 0
        union_count = db.scalar(
            select(func.count()).select_from(select(Sale.id).where(Sale.store_key == store_key, union_filter).subquery())
        ) or 0
        null_synced_count = db.scalar(
            select(func.count()).select_from(
                select(Sale.id).where(Sale.store_key == store_key, Sale.synced_at.is_(None)).subquery()
            )
        ) or 0
        min_synced, max_synced = db.execute(
            select(func.min(Sale.synced_at), func.max(Sale.synced_at)).where(Sale.store_key == store_key)
        ).one()
        sales_selection_diagnostics = {
            "store_key": store_key,
            "run_started_at": run.started_at.isoformat() if run.started_at else None,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "total_local": int(total_local),
            "synced_at_count": int(synced_count),
            "created_window_count": int(created_count),
            "updated_window_count": int(updated_count),
            "union_count": int(union_count),
            "synced_at_null_count": int(null_synced_count),
            "min_synced_at": min_synced.isoformat() if min_synced else None,
            "max_synced_at": max_synced.isoformat() if max_synced else None,
        }
        sales_query = sales_query.where(
            union_filter
        )
    elif start is not None and end is not None:
        window_start = datetime.combine(start, datetime.min.time(), tzinfo=local_zone)
        window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=local_zone)
        window_filter = ((Sale.created_at >= window_start) & (Sale.created_at < window_end)) | ((Sale.updated_at >= window_start) & (Sale.updated_at < window_end))
        if run is not None and replay_sales_window:
            window_filter = or_(Sale.synced_at >= run.started_at, window_filter)
        sales_query = sales_query.where(window_filter)
    if repair_job:
        # POS repair is a compensation pass for the newest changes. A fixed
        # keyset window avoids counting and scanning the entire ledger.
        sales_query = sales_query.limit(500)
        total_sales = 500 if include_sales else 0
        sales_offset = 0
    else:
        total_sales = (db.scalar(select(func.count()).select_from(sales_query.subquery())) or 0) if include_sales else 0
    clients = {
        "primary": OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled),
    }
    if settings.pos_api_mirror_base_url or settings.pos_api_mirror_token:
        mirror_token = settings.pos_api_mirror_token or settings.pos_api_token
        if not settings.pos_api_mirror_base_url or not mirror_token:
            await clients["primary"].close()
            raise RuntimeError("POS_API_MIRROR_BASE_URL and a POS integration token are required")
        clients["mirror"] = OrithosClient(
            settings.pos_api_mirror_base_url,
            mirror_token,
            settings.pos_import_enabled,
        )
    fallback_token = settings.shopfront_integration_token or settings.pos_api_token
    odoo_enabled = bool(
        settings.odoo_import_enabled
        and settings.odoo_api_base_url
        and (settings.odoo_api_token or fallback_token)
    )
    odoo_business_write = bool(odoo_enabled and settings.odoo_business_write_enabled and not sales_reconcile_job)
    odoo_client = OdooSyncClient(settings.odoo_api_base_url, settings.odoo_api_token, settings.odoo_api_database, odoo_enabled, odoo_business_write, fallback_token)
    result = {
        "status": "failed",
        "products": len(products),
        "inventory": len(inventory),
        "sales": total_sales,
        "sales_imported": 0,
        "error": None,
        "mirror_errors": [],
        # Inventory is reconciled independently from historical sales. A
        # missing product mapping must remain visible without blocking the
        # source sales ledger and its margin evidence.
        "inventory_unmatched": [],
        "inventory_reconciliation_required": False,
        "inventory_legacy_duplicates_cleared": 0,
        "sales_batch_audit": [],
        "odoo_sales": {"imported": 0, "updated_orders": 0, "skipped": 0, "mirrored": 0, "batches": 0},
    }
    if sales_selection_diagnostics is not None:
        result["sales_selection_diagnostics"] = sales_selection_diagnostics

    def sales_response_audit(response: Any) -> dict[str, Any]:
        """Keep bounded response counters for diagnosing partial imports."""
        payload = response.get("data", response) if isinstance(response, dict) else {}
        if not isinstance(payload, dict):
            return {"response_type": type(payload).__name__}
        audit: dict[str, Any] = {}
        for key in ("accepted", "created", "updated", "upserted", "skipped", "errors"):
            value = payload.get(key)
            if isinstance(value, (int, float, str, list, dict)):
                audit[key] = len(value) if isinstance(value, (list, dict)) else value
        if "status" in payload:
            audit["status"] = payload["status"]
        return audit

    products_by_source = {str(product.shopfront_product_id): product for product in products}

    def sale_line_payload(item: SaleItem) -> dict:
        """Build a complete line even when an older row missed product_name.

        Early crawler runs persisted the nested Shopfront item in raw_payload but
        did not always copy its name into SaleItem.product_name. Prefer the
        persisted line, then the nested source item, then the catalog mirror.
        This keeps historical Odoo/POS repairs idempotent and avoids placeholder
        product names on re-import.
        """
        raw = dict(item.raw_payload) if isinstance(item.raw_payload, dict) else {}
        nested = raw.get("item") if isinstance(raw.get("item"), dict) else {}
        catalog = products_by_source.get(str(item.shopfront_product_id))
        catalog_raw = catalog.raw_payload if catalog and isinstance(catalog.raw_payload, dict) else {}
        source = nested or catalog_raw
        name = item.product_name or nested.get("name") or raw.get("name")
        # Archived products may only exist in the historical product payload
        # assembled below. Use that payload before emitting a sale batch so
        # older Odoo/POS lines are repaired with the real item name.
        historical = product_items_by_source.get(str(item.shopfront_product_id)) if "product_items_by_source" in locals() else None
        historical_raw = historical.get("raw_payload") if isinstance(historical, dict) and isinstance(historical.get("raw_payload"), dict) else {}
        name = name or (catalog.name if catalog else None) or catalog_raw.get("name") or (historical or {}).get("name") or historical_raw.get("name")
        if name and not item.product_name:
            item.product_name = str(name)
        if not nested and catalog_raw:
            raw["item"] = catalog_raw
        barcodes = nested.get("barcodes") if isinstance(nested.get("barcodes"), list) else None
        if not barcodes and isinstance(catalog_raw.get("barcodes"), list):
            barcodes = catalog_raw["barcodes"]
        if not barcodes and isinstance((historical or {}).get("barcodes"), list):
            barcodes = historical["barcodes"]
        def metadata(*keys: str) -> Any:
            """Read complete product metadata from current or archived sources."""
            sources = (nested, catalog_raw, historical or {}, historical_raw)
            for source in sources:
                if not isinstance(source, dict):
                    continue
                for key in keys:
                    value = source.get(key)
                    if value not in (None, "", [], {}):
                        return value
            return None

        sku = metadata("mdbId", "sku") or (catalog.sku if catalog else None)
        # Keep the complete embedded Product payload on the line. This is
        # needed for archived products that are no longer in the active
        # catalog, and lets POS/Odoo repair names, descriptions and images.
        category_value = metadata("category")
        brand_value = metadata("brand")
        family_value = metadata("family")
        category = category_value if isinstance(category_value, dict) else {}
        brand = brand_value if isinstance(brand_value, dict) else {}
        family = family_value if isinstance(family_value, dict) else {}
        tax_rate = metadata("taxRate") if isinstance(metadata("taxRate"), dict) else {}
        cost_tax_rate = metadata("costTaxRate") if isinstance(metadata("costTaxRate"), dict) else {}
        description = metadata("description")
        image = metadata("image")
        alternate_images = metadata("alternateImages", "alternate_images") or []
        tags = metadata("tags") or []
        track_inventory = metadata("trackInventory", "track_inventory")
        case_quantity = metadata("caseQuantity", "case_quantity")
        prices = metadata("prices") or []
        return {
            "id": item.line_key,
            "source_product_id": item.shopfront_product_id,
            "name": name,
            "sku": sku,
            "barcode": (barcodes[0].get("code") if barcodes and isinstance(barcodes[0], dict) else (catalog.barcode if catalog else metadata("barcode"))),
            "barcodes": barcodes or [],
            "category": category.get("name") if category else (category_value or (catalog.category if catalog else None)),
            "category_id": category.get("id"),
            "brand": brand.get("name") if brand else (brand_value or (catalog.brand if catalog else None)),
            "brand_id": brand.get("id"),
            "family": family.get("name") if family else family_value,
            "family_id": family.get("id"),
            "description": description,
            "image": image,
            "alternate_images": alternate_images,
            "tags": tags,
            "track_inventory": track_inventory,
            "case_quantity": case_quantity,
            "tax_rate_id": tax_rate.get("id"),
            "tax_rate_name": tax_rate.get("name"),
            "cost_tax_rate_id": cost_tax_rate.get("id"),
            "cost_tax_rate_name": cost_tax_rate.get("name"),
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "line_total": item.line_total,
            "cost": item.cost,
            "tax": item.tax,
            "prices": prices,
            "raw_payload": raw,
        }

    def sale_payload(sale: Sale) -> dict:
        raw_sale = sale.raw_payload if isinstance(sale.raw_payload, dict) else {}
        source_payments = raw_sale.get("payments")
        sale_items = [{
            **sale_line_payload(item),
        } for item in sale.items]
        source_complete = source_sale_snapshot_is_complete(raw_sale, sale.items)
        return {"external_id": sale.shopfront_sale_id, "source_complete": source_complete, "invoice_id": sale.invoice_id, "status": sale.status, "created_at": sale.created_at, "updated_at": sale.updated_at, "total_price": sale.total_price, "total_tax": sale.total_tax, "total_discount": sale.total_discount, "total_cost": sale.total_cost, "customer_reference": sale.customer_reference, "payments": source_payments if isinstance(source_payments, list) else [], "raw_payload": raw_sale, "items": sale_items}

    def product_payload(product: Product) -> dict:
        raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
        category = raw.get("category") if isinstance(raw.get("category"), dict) else {}
        brand = raw.get("brand") if isinstance(raw.get("brand"), dict) else {}
        family = raw.get("family") if isinstance(raw.get("family"), dict) else {}
        tax_rate = raw.get("taxRate") if isinstance(raw.get("taxRate"), dict) else {}
        return {
            "source_id": product.shopfront_product_id,
            "name": product.name or raw.get("name"),
            "sku": product.sku or raw.get("mdbId") or raw.get("sku"),
            "barcode": product.barcode or ((raw.get("barcodes") or [{}])[0].get("code") if isinstance((raw.get("barcodes") or [{}])[0], dict) else None),
            "barcodes": raw.get("barcodes") or [],
            "category": product.category or category.get("name"),
            "category_id": category.get("id"),
            "brand": product.brand or brand.get("name"),
            "brand_id": brand.get("id"),
            "family": family.get("name"),
            "family_id": family.get("id"),
            "description": raw.get("description"),
            "image": raw.get("image"),
            "alternate_images": raw.get("alternateImages") or raw.get("alternate_images") or [],
            "tags": raw.get("tags") or [],
            "track_inventory": raw.get("trackInventory"),
            "case_quantity": raw.get("caseQuantity"),
            "tax_rate_id": tax_rate.get("id"),
            "tax_rate_name": tax_rate.get("name"),
            "cost_tax_rate_id": (raw.get("costTaxRate") or {}).get("id") if isinstance(raw.get("costTaxRate"), dict) else None,
            "cost_tax_rate_name": (raw.get("costTaxRate") or {}).get("name") if isinstance(raw.get("costTaxRate"), dict) else None,
            "cost_percentage": raw.get("costPercentage"),
            "use_scales": raw.get("useScales"),
            "use_barcode_templates": raw.get("useBarcodeTemplates"),
            "use_price_label": raw.get("usePriceLabel"),
            "prevent_manual_discounts": raw.get("preventManualDiscounts"),
            "request_quantity": raw.get("requestQuantity"),
            "request_price": raw.get("requestPrice"),
            "minimum_order_quantity": raw.get("minimumOrderQuantity"),
            "order_notes": raw.get("orderNotes"),
            "invoice_notes": raw.get("invoiceNotes"),
            "temp_product": raw.get("tempProduct"),
            "deleted": raw.get("deleted"),
            "deleted_at": raw.get("deletedAt"),
            "ignore_price_host_changes": raw.get("ignorePriceHostChanges"),
            "ignore_barcode_host_changes": raw.get("ignoreBarcodeHostChanges"),
            "source_status": raw.get("status"),
            "source_type": raw.get("type"),
            "source_created_at": raw.get("createdAt"),
            "source_updated_at": raw.get("updatedAt"),
            "cost": product.cost if product.cost is not None else raw.get("cost"),
            "price": product.price if product.price is not None else ((raw.get("prices") or [{}])[0].get("price") if isinstance((raw.get("prices") or [{}])[0], dict) else None),
            "prices": raw.get("prices") or [],
            "raw_payload": raw,
        }

    product_items = [product_payload(p) for p in products]

    # The current Shopfront catalog contains only active/current products.
    # Historical SaleItems can reference products that have since been
    # archived, while still carrying the real name, barcode and price. Promote
    # those embedded products into the catalog payload before sending sales so
    # POS/Odoo can match the sale line to a named product instead of creating a
    # ``Shopfront <source_id>`` placeholder.
    sale_item_query = (
        select(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(Sale.store_key == store_key)
    )
    if start is not None and end is not None:
        window_start = datetime.combine(start, datetime.min.time(), tzinfo=local_zone)
        window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=local_zone)
        sale_item_query = sale_item_query.where(
            ((Sale.created_at >= window_start) & (Sale.created_at < window_end))
            | ((Sale.updated_at >= window_start) & (Sale.updated_at < window_end))
        )

    def historical_product_payload(item: SaleItem) -> dict | None:
        raw = item.raw_payload if isinstance(item.raw_payload, dict) else {}
        nested = raw.get("item") if isinstance(raw.get("item"), dict) else {}
        source = nested or raw
        source_id = str(item.shopfront_product_id or source.get("id") or "").strip()
        name = item.product_name or source.get("name") or raw.get("name")
        if not source_id or not name:
            return None
        barcodes = source.get("barcodes") if isinstance(source.get("barcodes"), list) else []
        prices = source.get("prices") if isinstance(source.get("prices"), list) else []
        price = item.unit_price
        if price is None:
            price = shelf_unit_price(source)
        cost = item.cost if item.cost is not None else source.get("cost")
        return {
            "source_id": source_id,
            "name": str(name),
            "sku": source.get("mdbId") or source.get("sku"),
            "barcode": (barcodes[0].get("code") if barcodes and isinstance(barcodes[0], dict) else None),
            "barcodes": barcodes,
            "category": (source.get("category") or {}).get("name") if isinstance(source.get("category"), dict) else source.get("category"),
            "brand": (source.get("brand") or {}).get("name") if isinstance(source.get("brand"), dict) else source.get("brand"),
            "description": source.get("description"),
            "image": source.get("image"),
            "alternate_images": source.get("alternateImages") or source.get("alternate_images") or [],
            "tags": source.get("tags") or [],
            "track_inventory": source.get("trackInventory"),
            "case_quantity": source.get("caseQuantity"),
            "tax_rate_name": (source.get("taxRate") or {}).get("name") if isinstance(source.get("taxRate"), dict) else None,
            "cost_tax_rate_name": (source.get("costTaxRate") or {}).get("name") if isinstance(source.get("costTaxRate"), dict) else None,
            "cost": cost,
            "price": price,
            "prices": prices or ([{"quantity": 1, "price": price}] if price is not None else []),
            "source_status": source.get("status"),
            "source_type": source.get("type"),
            "raw_payload": raw,
        }

    product_items_by_source = {str(item["source_id"]): item for item in product_items if item.get("source_id")}
    current_source_ids = set(product_items_by_source)
    # Sales-repair is used after the crawler's coverage check. When every
    # SaleItem already has a name, do not scan the full historical line table;
    # the current catalog and persisted line payload are already sufficient.
    missing_name_query = sale_item_query.where(
        or_(SaleItem.product_name.is_(None), SaleItem.product_name == "")
    )
    missing_name_count = 0 if repair_job else (db.scalar(select(func.count()).select_from(missing_name_query.subquery())) or 0)
    if missing_name_count and current_source_ids:
        archived_query = sale_item_query.where(
            SaleItem.shopfront_product_id.is_not(None),
            ~SaleItem.shopfront_product_id.in_(current_source_ids),
        )
        archived_sale_items = db.scalars(archived_query).all()
    elif missing_name_count:
        archived_sale_items = db.scalars(sale_item_query).all()
    else:
        archived_sale_items = []
    for sale_item in archived_sale_items:
        historical = historical_product_payload(sale_item)
        if not historical:
            continue
        existing = product_items_by_source.get(historical["source_id"])
        if existing is None:
            product_items_by_source[historical["source_id"]] = historical
            continue
        # Current catalog values win; historical values fill fields that were
        # absent from the current catalog response.
        for key, value in historical.items():
            if key == "raw_payload":
                continue
            if not existing.get(key) and value:
                existing[key] = value

    # Only inspect SaleItems whose source product is absent from the current
    # catalog. Scanning all historical lines twice made sales-repair take
    # hours even when every current product already had a complete name.
    missing_ids: set[str] = set()
    for sale_item in archived_sale_items:
        source_id = str(sale_item.shopfront_product_id or "").strip()
        if not source_id:
            continue
        raw = sale_item.raw_payload if isinstance(sale_item.raw_payload, dict) else {}
        nested = raw.get("item") if isinstance(raw.get("item"), dict) else {}
        catalog = product_items_by_source.get(source_id)
        if not (sale_item.product_name or nested.get("name") or raw.get("name") or (catalog and catalog.get("name"))):
            missing_ids.add(source_id)
    missing_ids = sorted(missing_ids)
    if missing_ids:
        source_store = db.scalar(select(Store).where(Store.store_key == store_key))
        if source_store is not None:
            source_client = get_client(settings, source_store)
            try:
                source_token = await access_token(db, settings, source_store)
                fetched_by_id: dict[str, dict] = {}
                for offset in range(0, len(missing_ids), 100):
                    try:
                        fetched = await source_client.fetch_products_by_ids(source_token, missing_ids[offset:offset + 100])
                    except ShopfrontError as exc:
                        result["mirror_errors"].append(f"archived products: {exc!r}")
                        break
                    fetched_by_id.update({str(item.get("id")): item for item in fetched if item.get("id")})
                recovered_names: dict[str, str] = {}
                recovered_payloads: dict[str, dict] = {}
                for source_id, item in fetched_by_id.items():
                    category = item.get("category") if isinstance(item.get("category"), dict) else {}
                    brand = item.get("brand") if isinstance(item.get("brand"), dict) else {}
                    family = item.get("family") if isinstance(item.get("family"), dict) else {}
                    tax_rate = item.get("taxRate") if isinstance(item.get("taxRate"), dict) else {}
                    normalized = {
                        "source_id": source_id,
                        "name": item.get("name"),
                        "sku": item.get("mdbId") or item.get("sku"),
                        "barcode": item.get("barcode") or ((item.get("barcodes") or [{}])[0].get("code") if isinstance((item.get("barcodes") or [{}])[0], dict) else None),
                        "barcodes": item.get("barcodes") or [],
                        "category": item.get("categoryName") or category.get("name"),
                        "category_id": category.get("id"),
                        "brand": item.get("brandName") or brand.get("name"),
                        "brand_id": brand.get("id"),
                        "family": family.get("name"),
                        "family_id": family.get("id"),
                        "description": item.get("description"),
                        "image": item.get("image"),
                        "alternate_images": item.get("alternateImages") or item.get("alternate_images") or [],
                        "tags": item.get("tags") or [],
                        "track_inventory": item.get("trackInventory"),
                        "case_quantity": item.get("caseQuantity"),
                        "tax_rate_id": tax_rate.get("id"),
                        "tax_rate_name": tax_rate.get("name"),
                        "cost_tax_rate_name": (item.get("costTaxRate") or {}).get("name") if isinstance(item.get("costTaxRate"), dict) else None,
                        "source_status": item.get("status"),
                        "source_type": item.get("type"),
                        "source_created_at": item.get("createdAt"),
                        "source_updated_at": item.get("updatedAt"),
                        "cost": item.get("cost"),
                        "price": item.get("price") or ((item.get("prices") or [{}])[0].get("price") if isinstance((item.get("prices") or [{}])[0], dict) else None),
                        "prices": item.get("prices") or [],
                        "raw_payload": item,
                    }
                    existing = product_items_by_source.get(source_id)
                    if existing is None:
                        product_items_by_source[source_id] = normalized
                    else:
                        catalog_fields = {
                            "category", "category_id", "brand", "brand_id", "family", "family_id",
                            "track_inventory", "case_quantity", "source_status", "source_type",
                            "source_created_at", "source_updated_at", "price", "prices", "cost",
                        }
                        for key, value in normalized.items():
                            if value in (None, "", [], {}):
                                continue
                            if key in catalog_fields or not existing.get(key):
                                existing[key] = value
                    product = products_by_source.get(source_id)
                    if product is None and normalized.get("name"):
                        # Archived products are still valid source records. Keep
                        # them in the crawler catalog so later API reads and
                        # retries do not depend on the temporary batch payload.
                        product = Product(
                            store_key=store_key,
                            shopfront_product_id=source_id,
                            name=normalized.get("name"),
                            sku=normalized.get("sku"),
                            barcode=normalized.get("barcode"),
                            category=normalized.get("category"),
                            brand=normalized.get("brand"),
                            cost=parse_decimal(normalized.get("cost")),
                            price=parse_decimal(normalized.get("price")),
                            raw_payload=normalized.get("raw_payload") or {},
                            synced_at=datetime.now(timezone.utc),
                        )
                        db.add(product)
                        db.flush()
                    products_by_source[source_id] = product
                    if product is not None:
                        product.name = product.name or normalized.get("name")
                        product.sku = product.sku or normalized.get("sku")
                        product.barcode = product.barcode or normalized.get("barcode")
                        if normalized.get("category"):
                            product.category = normalized.get("category")
                        else:
                            product.category = product.category or normalized.get("category")
                        product.brand = product.brand or normalized.get("brand")
                        product.cost = product.cost if product.cost is not None else parse_decimal(normalized.get("cost"))
                        product.price = product.price if product.price is not None else parse_decimal(normalized.get("price"))
                        existing_raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
                        product.raw_payload = {**existing_raw, **(normalized.get("raw_payload") or {})}
                        product.synced_at = datetime.now(timezone.utc)
                    if normalized.get("name"):
                        missing_lines = db.scalars(
                            select(SaleItem).join(Sale, SaleItem.sale_id == Sale.id).where(
                                Sale.store_key == store_key,
                                SaleItem.shopfront_product_id == source_id,
                                or_(SaleItem.product_name.is_(None), func.trim(SaleItem.product_name) == ""),
                            )
                        ).all()
                        for missing_line in missing_lines:
                            missing_line.product_name = str(normalized["name"])
                            line_raw = dict(missing_line.raw_payload) if isinstance(missing_line.raw_payload, dict) else {}
                            line_raw.setdefault("item", item)
                            missing_line.raw_payload = line_raw
                db.commit()
            finally:
                await source_client.close()
    product_items = list(product_items_by_source.values())
    # Include historical SaleItem-derived products in the run statistics.
    result["products"] = len(product_items)
    inventory_items = []
    for row in inventory:
        raw = row.raw_payload if isinstance(row.raw_payload, dict) else {}
        outlet = raw.get("outlet") if isinstance(raw.get("outlet"), dict) else {}
        inventory_items.append({
            "source_id": row.shopfront_product_id,
            "outlet_id": row.outlet_id or outlet.get("id"),
            "outlet_name": row.outlet_name or outlet.get("name"),
            "quantity": row.quantity,
            "single_level": raw.get("singleLevel"),
            "case_level": raw.get("caseLevel"),
            "reorder_level": raw.get("reorderLevel"),
            "reorder_level_singles": raw.get("reorderLevelSingles"),
            "reorder_level_cases": raw.get("reorderLevelCases"),
            "reorder_amount": raw.get("reorderAmount"),
            "reorder_amount_singles": raw.get("reorderAmountSingles"),
            "reorder_amount_cases": raw.get("reorderAmountCases"),
            "reorder_limit": raw.get("reorderLimit"),
            "max_quantity": raw.get("maxQuantity"),
            "max_quantity_singles": raw.get("maxQuantitySingles"),
            "max_quantity_cases": raw.get("maxQuantityCases"),
            "on_order": raw.get("onOrder"),
            "timestamp": row.inventory_timestamp,
            "raw_payload": raw,
        })
    # Payload construction may read or repair local rows. Persist those
    # changes before the long-running POS/Odoo requests begin.
    db.commit()
    try:
        if settings.odoo_business_write_enabled and not odoo_enabled and not sales_reconcile_job:
            raise RuntimeError("Formal Odoo business writes are enabled, but the Odoo import integration is unavailable")

        async def sync_odoo_batches(import_type: str, values: list[dict], *, snapshot_complete: bool = False) -> list[dict]:
            """Write Odoo data with bounded retries and recursive split fallback.

            Odoo can return PostgreSQL serialization failures when a large
            catalog batch overlaps a regular POS transaction. Retrying the
            same large transaction only repeats the conflict, so split the
            failed batch until the conflicting record is isolated.
            """
            responses: list[dict] = []

            async def write_chunk(chunk: list[dict], depth: int = 0) -> None:
                last_error: Exception | None = None
                for attempt in range(3):
                    try:
                        responses.append(await odoo_client.sync(import_type, store_key, jsonable_encoder(chunk), snapshot_complete=snapshot_complete))
                        return
                    except Exception as exc:
                        last_error = exc
                        text = str(exc).lower()
                        retryable = any(token in text for token in ("serialize", "serialization", "deadlock", "could not serialize", "timeout"))
                        if not retryable or attempt == 2:
                            break
                        await asyncio.sleep(2 ** attempt)
                if len(chunk) <= 25 or depth >= 8 or last_error is None:
                    raise last_error or RuntimeError("Odoo batch failed")
                midpoint = max(1, len(chunk) // 2)
                await write_chunk(chunk[:midpoint], depth + 1)
                await write_chunk(chunk[midpoint:], depth + 1)

            for offset in range(0, len(values), 200):
                await write_chunk(values[offset:offset + 200])
                if job is not None and job.status == "running":
                    job.phase = f"odoo_{import_type}:{min(offset + 200, len(values))}/{len(values)}"
                    job.heartbeat_at = datetime.now(timezone.utc)
                    db.commit()
            return responses

        product_result = {}
        inventory_result = {}
        catalog_error: Exception | None = None
        catalog_store_keys = [store_key]
        secondary_store_key = (settings.pos_api_secondary_store_key or "").strip()
        if secondary_store_key and secondary_store_key != store_key:
            catalog_store_keys.append(secondary_store_key)
        try:
            for target_name, client in clients.items():
                for catalog_store in catalog_store_keys:
                    result_key = target_name if catalog_store == store_key else f"{target_name}:{catalog_store}"
                    product_responses = []
                    for offset in range(0, len(product_items), 250):
                        product_responses.append(await client.upsert_products(jsonable_encoder({
                            "store_key": catalog_store,
                            "items": product_items[offset:offset + 250],
                        })))
                    if product_responses:
                        product_result[result_key] = (
                            product_responses[0]
                            if len(product_responses) == 1
                            else {"batches": len(product_responses), "last": product_responses[-1]}
                        )
                    if include_catalog or include_inventory_snapshot:
                        inventory_result[result_key] = await client.replace_inventory(jsonable_encoder({
                            "store_key": catalog_store,
                            "replace": True,
                            "snapshot_complete": True,
                            "items": inventory_items,
                        }))
        except Exception as exc:
            catalog_error = exc
            result["mirror_errors"].append(f"catalog: {exc!r}")
            logger.warning("POS catalog mirror failed; Odoo mirror may continue but the sync will be retryable: %r", exc)
        # A configured POS mirror is part of the requested synchronization
        # contract. Do not report success when its product or inventory write
        # failed, even if the independent Odoo mirror accepted the batch.
        if catalog_error is not None and settings.pos_import_enabled:
            raise RuntimeError(str(catalog_error)) from catalog_error
        if result["mirror_errors"] and not odoo_enabled:
            raise RuntimeError(str(catalog_error or result["mirror_errors"][-1]))
        odoo_product_result = None
        odoo_inventory_result = None
        if odoo_enabled and product_items:
            # Odoo commits each request transactionally. Serialization or
            # deadlock failures are retried and recursively split; progress is
            # persisted after every successful product batch.
            odoo_product_responses = await sync_odoo_batches("products", product_items)
            if job is not None:
                job.payload = {**(job.payload or {}), "products_imported": len(product_items)}
                db.commit()
            odoo_product_result = odoo_product_responses[0] if len(odoo_product_responses) == 1 else {"batches": len(odoo_product_responses), "last": odoo_product_responses[-1]}
        if odoo_enabled and (include_catalog or include_inventory_snapshot):
            inventory_responses = await sync_odoo_batches("inventory", inventory_items)
            def business_unmatched(response: dict) -> list:
                payload = response.get("result", response) if isinstance(response, dict) else {}
                business = payload.get("business") if isinstance(payload, dict) else None
                unmatched = business.get("unmatched") if isinstance(business, dict) else None
                return unmatched if isinstance(unmatched, list) else []

            unmatched = [item for response in inventory_responses for item in business_unmatched(response)]
            result["inventory_legacy_duplicates_cleared"] = sum(
                int(
                    (response.get("result", response).get("business") or {}).get("cleared_legacy_duplicates") or 0
                )
                for response in inventory_responses
                if isinstance(response, dict)
                and isinstance(response.get("result", response), dict)
            )
            if unmatched:
                # Keep unresolved source rows visible for a later repair. A
                # validated full source-ID set still permits safe stale cleanup.
                result["inventory_unmatched"] = unmatched
                result["inventory_reconciliation_required"] = True
            if include_inventory_snapshot:
                source_ids = sorted({str(value).strip() for value in (inventory_snapshot_source_ids or []) if str(value).strip()})
                if source_ids:
                    # The caller only enables finalization after the crawler
                    # validated a complete source snapshot. Unmatched rows stay
                    # visible above, while their source IDs protect them from
                    # stale cleanup; they must not block cleanup of unrelated
                    # Shopfront products that are absent from this full set.
                    finalize_kwargs = {
                        "snapshot_finalize": True,
                        "snapshot_source_ids": source_ids,
                    }
                    if inventory_snapshot_at:
                        finalize_kwargs["snapshot_at"] = inventory_snapshot_at
                    finalize_response = await odoo_client.sync("inventory", store_key, [], **finalize_kwargs)
                    finalize_unmatched = business_unmatched(finalize_response)
                    if finalize_unmatched:
                        result["inventory_unmatched"].extend(finalize_unmatched)
                        result["inventory_reconciliation_required"] = True
                    else:
                        inventory_responses.append(finalize_response)
                else:
                    result["inventory_unmatched"].append({
                        "source_id": "",
                        "reason": "complete inventory snapshot has no source product IDs",
                    })
                    result["inventory_reconciliation_required"] = True
            odoo_inventory_result = inventory_responses[0] if len(inventory_responses) == 1 else {"batches": len(inventory_responses), "last": inventory_responses[-1]}
        sale_batches = 0
        odoo_batches = 0
        target_sale_batches = {target_name: 0 for target_name in clients}
        sales_batch_size = max(1, min(250, int(settings.pos_sales_import_batch_size)))
        offset = max(0, int(sales_offset or 0))
        while include_sales and offset < total_sales:
            sales = db.scalars(sales_query.offset(offset).limit(sales_batch_size)).all()
            if not sales:
                break
            items = [sale_payload(sale) for sale in sales]
            db.commit()
            try:
                for target_name, client in clients.items():
                    sales_payload = {"store_key": store_key, "items": items}
                    if sales_reconcile_job:
                        sales_payload["business_write"] = False
                    response = await client.upsert_sales(jsonable_encoder(sales_payload))
                    validate_pos_import_receipt(response, len(items), "sales")
                    result["sales_batch_audit"].append({
                        "target": target_name,
                        "offset": offset,
                        "payload_count": len(items),
                        "response": sales_response_audit(response),
                    })
                    target_sale_batches[target_name] += 1
                sale_batches += 1
            except Exception as exc:
                result["mirror_errors"].append(f"sales batch {offset}, target {target_name}: {exc!r}")
                logger.warning("POS sales mirror failed: offset=%s target=%s error=%r", offset, target_name, exc)
            if odoo_enabled:
                # Odoo accepts a complete list of orders in one JSON-RPC
                # transaction. A 200-sale batch halves request overhead for
                # historical replay while the 25-sale fallback keeps retries
                # small when one payload contains a problematic record.
                for small_offset in range(0, len(items), 200):
                    batch = items[small_offset:small_offset + 200]
                    try:
                        response = await odoo_client.sync("sales", store_key, jsonable_encoder(batch))
                    except Exception:
                        for retry_offset in range(0, len(batch), 50):
                            retry_batch = batch[retry_offset:retry_offset + 50]
                            response = await odoo_client.sync("sales", store_key, jsonable_encoder(retry_batch))
                            if odoo_business_write:
                                audit = audit_odoo_sales_batch(response, len(retry_batch))
                                for key in ("imported", "updated_orders", "skipped", "mirrored"):
                                    result["odoo_sales"][key] += audit[key]
                                result["odoo_sales"]["batches"] += 1
                    else:
                        if odoo_business_write:
                            audit = audit_odoo_sales_batch(response, len(batch))
                            for key in ("imported", "updated_orders", "skipped", "mirrored"):
                                result["odoo_sales"][key] += audit[key]
                            result["odoo_sales"]["batches"] += 1
                    odoo_batches += 1
            offset += len(sales)
            result["sales_imported"] = offset
            result["sale_batches"] = sale_batches
            result["odoo_sale_batches"] = odoo_batches
            if run is not None:
                # Preserve source-sync counts when this helper is called for
                # a historical chunk. Replacing the whole object hid
                # products_from_sales, warnings and the crawler's date range.
                prior_counts = dict(run.counts or {})
                run.counts = {
                    **prior_counts,
                    "type": prior_counts.get("type", "full_snapshot"),
                    "pos_products": len(product_items),
                    "pos_inventory": len(inventory_items),
                    "pos_sales": offset,
                    "sale_total": total_sales,
                    "sale_batches": sale_batches,
                    "target_sale_batches": dict(target_sale_batches),
                    "sales_batch_audit": list(result["sales_batch_audit"]),
                    "odoo_sale_batches": odoo_batches,
                    "odoo_sales": dict(result["odoo_sales"]),
                    "stage": (
                        "odoo_business"
                        if odoo_business_write
                        else "odoo_mirror" if odoo_enabled else "pos_mirror"
                    ),
                }
                if job is not None:
                    job.payload = {**(job.payload or {}), "sales_offset": offset, "sale_total": total_sales}
                db.commit()
        if include_sales and result["sales_imported"] != total_sales:
            result["mirror_errors"].append(
                f"sales import incomplete: expected {total_sales}, imported {result['sales_imported']}"
            )
        if result["inventory_reconciliation_required"]:
            result["mirror_errors"].append(
                f"inventory reconciliation required for {len(result['inventory_unmatched'])} unmatched source row(s)"
            )
        result.update({
            "status": "failed" if result["mirror_errors"] else "completed",
            "error": "; ".join(result["mirror_errors"]) if result["mirror_errors"] else None,
            "product_response": product_result,
            "inventory_response": inventory_result,
            "targets": list(clients),
            "target_sale_batches": target_sale_batches,
            "odoo_business_write": bool(odoo_enabled and odoo_business_write),
            "odoo_product_response": odoo_product_result,
            "odoo_inventory_response": odoo_inventory_result,
        })
        if result.get("status") == "completed" and not result.get("mirror_errors"):
            await notify_pos_ui_sync(store_key)
    except Exception as exc:
        result["error"] = str(exc)[:500]
        logger.exception("Shopfront snapshot push failed: store=%s", store_key)
    finally:
        for client in clients.values():
            await client.close()
        await odoo_client.close()
    return result


def _purchase_scope_denied(message: str) -> bool:
    text = message.lower()
    return any(token in text for token in ("permission", "scope", "unauthor", "forbidden", "see_suppliers", "see_stock"))


async def push_purchase_mirror(db: Session, store: Store) -> dict:
    """Read Shopfront purchase orders into the Odoo mirror. Never receive stock."""
    fallback_token = settings.shopfront_integration_token or settings.pos_api_token
    if not (settings.odoo_import_enabled and settings.odoo_api_base_url and (settings.odoo_api_token or fallback_token)):
        return {"status": "skipped"}
    odoo = OdooSyncClient(settings.odoo_api_base_url, settings.odoo_api_token, settings.odoo_api_database, True, False, fallback_token)
    client = get_client(settings, store)
    try:
        token = await access_token(db, settings, store)
        try:
            rows = await client.fetch_purchase_orders(token)
        except ShopfrontError as exc:
            if _purchase_scope_denied(str(exc)):
                await odoo.sync("purchase_orders", store.store_key, [], extra={"purchase_scope": "unauthorized"})
            logger.warning("Shopfront purchase mirror skipped: store=%s error=%s", store.store_key, str(exc)[:300])
            return {"status": "skipped"}
        items = []
        for row in rows:
            source_id = str(row.get("id") or "").strip()
            total = row.get("totalCost")
            if not source_id or total is None or total == "":
                continue
            supplier = row.get("supplier") if isinstance(row.get("supplier"), dict) else {}
            items.append({
                "source_id": source_id,
                "status": row.get("status"),
                "order_date": row.get("orderDate"),
                "total_cost": total,
                "supplier_source_id": supplier.get("id"),
                "raw_payload": row,
            })
        if not items:
            await odoo.sync("purchase_orders", store.store_key, [], extra={"mirror_only": True})
        for offset in range(0, len(items), 100):
            await odoo.sync("purchase_orders", store.store_key, jsonable_encoder(items[offset:offset + 100]), extra={"mirror_only": True})
        await notify_pos_ui_sync(store.store_key)
        return {"status": "completed", "purchase_orders": len(items)}
    finally:
        await client.close()
        await odoo.close()


async def scheduled_incremental_sync() -> None:
    """Refresh today's open business day and yesterday's late edits."""
    local_now = datetime.now(ZoneInfo(settings.sync_timezone))
    today = local_now.date()
    start = today - timedelta(days=1)
    db = next(get_db())
    try:
        for store_key in settings.stores():
            if active_job(db, store_key):
                continue
            db.add(SyncJob(
                store_key=store_key,
                job_type="daily_sync",
                status="queued",
                from_date=start.isoformat(),
                to_date=today.isoformat(),
                cursor_date=start.isoformat(),
                payload={"include_supply_chain": False, "purchase_mirror": True, "full_inventory_snapshot": False},
            ))
        db.commit()
    finally:
        db.close()


def scheduled_sync_range(local_now: datetime, lookback_days: int) -> tuple[date, date]:
    today = local_now.date()
    # The late evening run captures today's business day; the overnight run closes yesterday.
    end = today if local_now.hour >= 23 else today - timedelta(days=1)
    # Routine sync is deliberately a short incremental window. Historical
    # backfills must use the durable history endpoint so a missed/failed day
    # cannot make every normal run replay the entire previous week.
    routine_days = max(1, min(int(lookback_days), 2))
    start = end - timedelta(days=routine_days - 1)
    return start, end


def scheduled_occurrence(local_now: datetime, scheduled_time: str) -> datetime:
    hour, minute = (int(part) for part in scheduled_time.split(":"))
    occurrence = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if occurrence > local_now:
        occurrence -= timedelta(days=1)
    return occurrence


async def scheduled_sync(scheduled_time: str | None = None) -> None:
    local_now = datetime.now(ZoneInfo(settings.sync_timezone))
    supplied_schedule_time = scheduled_time is not None
    scheduled_time = scheduled_time or local_now.strftime("%H:%M")
    if scheduled_time not in settings.daily_sync_times():
        if not supplied_schedule_time:
            logger.info("Skipping manual scheduled sync outside configured times: %s", scheduled_time)
            return
        raise ValueError(f"Unsupported scheduled sync time: {scheduled_time}")
    occurrence = scheduled_occurrence(local_now, scheduled_time)
    start, end = scheduled_sync_range(occurrence, settings.sync_lookback_days)
    schedule_key = f"{occurrence.date().isoformat()}T{scheduled_time}"
    require_full_inventory = scheduled_time in settings.full_inventory_times()
    db = next(get_db())
    try:
        for store_key in settings.stores():
            recent_daily_jobs = db.scalars(select(SyncJob).where(
                SyncJob.store_key == store_key,
                SyncJob.job_type == "daily_sync",
            ).order_by(SyncJob.id.desc()).limit(32)).all()
            same_schedule_job = next((
                item for item in recent_daily_jobs
                if (item.payload or {}).get("schedule_key") == schedule_key
            ), None)
            if same_schedule_job and same_schedule_job.status not in {"failed", "cancelled"}:
                if same_schedule_job.status == "queued":
                    same_schedule_job.from_date = min(same_schedule_job.from_date or start.isoformat(), start.isoformat())
                    same_schedule_job.cursor_date = min(same_schedule_job.cursor_date or start.isoformat(), start.isoformat())
                    same_schedule_job.to_date = max(same_schedule_job.to_date or end.isoformat(), end.isoformat())
                    same_schedule_job.payload = {
                        **(same_schedule_job.payload or {}),
                        "full_inventory_snapshot": require_full_inventory or (same_schedule_job.payload or {}).get("full_inventory_snapshot") is True,
                    }
                continue
            active = active_job(db, store_key)
            if active and active.job_type == "daily_sync":
                logger.info("Queueing scheduled sync behind active job: store=%s active_job=%s schedule=%s", store_key, active.id, schedule_key)
            db.add(SyncJob(
                store_key=store_key,
                job_type="daily_sync",
                status="queued",
                from_date=start.isoformat(),
                to_date=end.isoformat(),
                cursor_date=start.isoformat(),
                payload={
                    "include_supply_chain": should_include_supply_chain(db, store_key),
                    "schedule_key": schedule_key,
                    "scheduled_time": scheduled_time,
                    "full_inventory_snapshot": require_full_inventory,
                },
            ))
        db.commit()
    finally:
        db.close()


async def run_daily_sync_job(job_id: int) -> None:
    db = next(get_db())
    try:
        now = datetime.now(timezone.utc)
        claimed = db.execute(update(SyncJob).where(
            SyncJob.id == job_id,
            SyncJob.status == "queued",
        ).values(status="running", started_at=now, heartbeat_at=now, phase="sales_incremental", attempts=SyncJob.attempts + 1))
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        if not job:
            return
        await run_sync_background(job.store_key, date.fromisoformat(job.from_date), date.fromisoformat(job.to_date), job.id)
        db.refresh(job)
        if job.status != "running":
            return
        if (job.payload or {}).get("include_supply_chain"):
            store = db.scalar(select(Store).where(Store.store_key == job.store_key))
            if store:
                job.phase = "supply_chain"
                job.heartbeat_at = datetime.now(timezone.utc)
                db.commit()
                supply_chain = await sync_supply_chain(db, store)
                job.payload = {**(job.payload or {}), "supply_chain": supply_chain}
                if supply_chain.get("status") == "partial":
                    job.status = "partial"
                    job.error = "; ".join(
                        f"{item.get('entity')}: {item.get('message')}"
                        for item in supply_chain.get("errors", [])
                    )[:2000]
        if (job.payload or {}).get("purchase_mirror"):
            store = db.scalar(select(Store).where(Store.store_key == job.store_key))
            if store:
                try:
                    # Purchase mirroring is a secondary enrichment step. An
                    # unavailable POS endpoint must not leave the completed
                    # sales job running forever and block the next cycle.
                    mirrored = await asyncio.wait_for(
                        push_purchase_mirror(db, store),
                        timeout=120,
                    )
                    job.payload = {**(job.payload or {}), "purchase_mirror_result": mirrored}
                    if not isinstance(mirrored, dict) or mirrored.get("status") != "completed":
                        job.status = "partial"
                        job.error = "Purchase mirror did not complete successfully"
                        if isinstance(mirrored, dict) and mirrored.get("error"):
                            job.error += f": {str(mirrored['error'])[:500]}"
                    db.commit()
                except asyncio.TimeoutError:
                    logger.warning("Shopfront purchase mirror timed out: store=%s", job.store_key)
                    job.payload = {**(job.payload or {}), "purchase_mirror_result": {"status": "timeout"}}
                    job.status = "partial"
                    job.error = "Purchase mirror timed out after 120 seconds"
                    db.commit()
                except Exception as exc:
                    logger.warning("Shopfront purchase mirror failed: store=%s error=%r", job.store_key, exc)
                    job.payload = {**(job.payload or {}), "purchase_mirror_result": {"status": "failed", "error": str(exc)[:500]}}
                    job.status = "partial"
                    job.error = f"Purchase mirror failed: {str(exc)[:500]}"
                    db.commit()
        db.refresh(job)
        if job.status == "running":
            job.status = "completed"
        if job.status == "partial":
            job.phase = "completed_with_warnings"
        else:
            job.phase = "completed"
        job.finished_at = datetime.now(timezone.utc)
        queued_types = {
            row.job_type for row in db.scalars(select(SyncJob).where(
                SyncJob.store_key == job.store_key,
                SyncJob.status.in_(["queued", "running"]),
            )).all()
        }
        if settings.shopfront_enable_customers and "customers" not in queued_types:
            db.add(SyncJob(store_key=job.store_key, job_type="customers", status="queued", payload={"after_daily_job": job.id}))
            queued_types.add("customers")
        if "extended_data" not in queued_types:
            db.add(SyncJob(store_key=job.store_key, job_type="extended_data", status="queued", payload={"after_daily_job": job.id}))
        db.commit()
        wake_durable_worker()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


async def run_supply_chain_job(job_id: int) -> None:
    db = next(get_db())
    try:
        now = datetime.now(timezone.utc)
        claimed = db.execute(update(SyncJob).where(
            SyncJob.id == job_id,
            SyncJob.status == "queued",
        ).values(status="running", started_at=now, heartbeat_at=now, phase="supply_chain", attempts=SyncJob.attempts + 1))
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        store = db.scalar(select(Store).where(Store.store_key == job.store_key)) if job else None
        if not job or not store:
            raise RuntimeError("Store not found for supply-chain sync")
        job.payload = await sync_supply_chain(db, store)
        job.status = "partial" if job.payload.get("status") == "partial" else "completed"
        if job.status == "partial":
            job.error = "; ".join(
                f"{item.get('entity')}: {item.get('message')}"
                for item in job.payload.get("errors", [])
            )[:2000]
        job.phase = "completed_with_warnings" if job.status == "partial" else "completed"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


async def run_customers_job(job_id: int) -> None:
    db = next(get_db())
    try:
        now = datetime.now(timezone.utc)
        claimed = db.execute(update(SyncJob).where(
            SyncJob.id == job_id,
            SyncJob.status == "queued",
        ).values(status="running", started_at=now, heartbeat_at=now, phase="customers", attempts=SyncJob.attempts + 1))
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        store = db.scalar(select(Store).where(Store.store_key == job.store_key)) if job else None
        if not job or not store:
            raise RuntimeError("Store not found for customer sync")
        job.payload = await sync_customers(db, settings, store)
        if settings.pos_import_enabled:
            pos_client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, True)
            try:
                customer_rows = db.scalars(
                    select(ShopfrontCustomer)
                    .where(ShopfrontCustomer.store_key == store.store_key)
                    .order_by(ShopfrontCustomer.source_id)
                ).all()
                for offset in range(0, len(customer_rows), 250):
                    batch = customer_rows[offset:offset + 250]
                    response = await pos_client.upsert_customers(jsonable_encoder({
                        "store_key": store.store_key,
                        "items": [{
                            "source_id": item.source_id,
                            "client_id": item.client_id,
                            "code": item.code,
                            "name": item.name,
                            "email": item.email,
                            "phone": item.phone,
                            "mobile": item.mobile,
                            "deleted": item.deleted,
                            "raw_payload": item.raw_payload,
                        } for item in batch],
                    }))
                    staged = response.get("data", response)
                    if staged.get("status") != "STAGED":
                        raise PosIntegrationError(f"Customer mirror batch was not staged: {staged.get('status', 'unknown')}")
                job.payload["pos_staged"] = {"customers": len(customer_rows)}
                balance_rows = db.scalars(select(ShopfrontExtendedRecord).where(
                    ShopfrontExtendedRecord.store_key == store.store_key,
                    ShopfrontExtendedRecord.entity_type == "customer_balances",
                ).order_by(ShopfrontExtendedRecord.source_id)).all()
                for offset in range(0, len(balance_rows), 200):
                    batch = balance_rows[offset:offset + 200]
                    response = await pos_client.upsert_extended({
                        "store_key": store.store_key,
                        "entity_type": "customer_balances",
                        "items": [{"source_id": item.source_id, "raw_payload": item.raw_payload} for item in batch],
                    })
                    staged = response.get("data", response)
                    if staged.get("status") != "STAGED":
                        raise PosIntegrationError("Customer balance snapshots were not staged")
                job.payload["pos_staged"]["customer_balances"] = len(balance_rows)
            finally:
                await pos_client.close()
        # Odoo is the customer business source of truth. Staging success is
        # recorded separately so an Odoo outage remains retryable without
        # losing the source snapshot.
        if settings.odoo_import_enabled:
            odoo_client = OdooSyncClient(settings.odoo_api_base_url, settings.odoo_api_token, settings.odoo_api_database, True, settings.odoo_business_write_enabled)
            try:
                rows = db.scalars(select(ShopfrontCustomer).where(ShopfrontCustomer.store_key == store.store_key).order_by(ShopfrontCustomer.source_id)).all()
                for offset in range(0, len(rows), 100):
                    batch = rows[offset:offset + 100]
                    response = await odoo_client.sync("customers", store.store_key, [{"source_id": item.source_id, "client_id": item.client_id, "code": item.code, "name": item.name, "email": item.email, "phone": item.phone, "mobile": item.mobile, "deleted": item.deleted, "raw_payload": item.raw_payload} for item in batch])
                    result = response.get("result", response)
                    if result.get("ok") is not True:
                        raise OdooIntegrationError("Customer Odoo batch was not confirmed")
                job.payload["odoo"] = {"customers": len(rows), "targets": [5, 137], "status": "completed"}
            except Exception as exc:
                job.payload["odoo"] = {"customers": len(rows) if 'rows' in locals() else 0, "status": "failed", "error": str(exc)[:200]}
                raise
            finally:
                await odoo_client.close()
        job.status = "completed"
        job.phase = "completed"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


async def run_extended_data_job(job_id: int) -> None:
    db = next(get_db())
    heartbeat_task: asyncio.Task | None = None
    try:
        now = datetime.now(timezone.utc)
        claimed = db.execute(update(SyncJob).where(
            SyncJob.id == job_id,
            SyncJob.status == "queued",
        ).values(status="running", started_at=now, heartbeat_at=now, phase="extended_data", attempts=SyncJob.attempts + 1))
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        store = db.scalar(select(Store).where(Store.store_key == job.store_key)) if job else None
        if not job or not store:
            raise RuntimeError("Store not found for extended-data sync")

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(15)
                heartbeat_db = SessionLocal()
                try:
                    heartbeat_job = heartbeat_db.get(SyncJob, job_id)
                    if heartbeat_job is None or heartbeat_job.status != "running":
                        return
                    heartbeat_job.heartbeat_at = datetime.now(timezone.utc)
                    heartbeat_job.phase = "extended_data"
                    heartbeat_db.commit()
                except Exception:
                    heartbeat_db.rollback()
                    logger.warning("Extended-data heartbeat failed for job %s", job_id, exc_info=True)
                finally:
                    heartbeat_db.close()

        heartbeat_task = asyncio.create_task(heartbeat())
        job.payload = await sync_extended_data(db, settings, store)
        job.status = "partial" if job.payload.get("status") == "partial" else "completed"
        if job.status == "partial":
            job.error = "; ".join(
                f"{entity}: {message}" for entity, message in job.payload.get("errors", {}).items()
            )[:2000]
        job.phase = "completed_with_warnings" if job.status == "partial" else "completed"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat_task
        db.close()


async def process_next_job() -> None:
    """Dispatch one persisted job; handlers claim it atomically before work."""
    db = next(get_db())
    try:
        stale_before = datetime.now(timezone.utc) - timedelta(seconds=settings.worker_stale_after_seconds)
        db.execute(update(SyncJob).where(
            SyncJob.status == "running",
            SyncJob.heartbeat_at.is_not(None),
            SyncJob.heartbeat_at < stale_before,
        ).values(status="queued", error="requeued after stale worker heartbeat"))
        db.commit()
        job = db.scalar(select(SyncJob).where(SyncJob.status == "queued").order_by(
            case((SyncJob.job_type == "daily_sync", 0), else_=1), SyncJob.id
        ).limit(1))
        job_id = job.id if job else None
        job_type = job.job_type if job else None
    finally:
        db.close()
    if job_id is None:
        return
    handlers = {
        "history": run_history_job,
        "discover": run_history_discovery,
        "snapshot": run_full_snapshot_job,
        "catalog_snapshot": run_catalog_snapshot_job,
        "sales_repair": run_sales_repair_job,
        "sales_reconcile": run_sales_reconcile_job,
        "daily_sync": run_daily_sync_job,
        "supply_chain": run_supply_chain_job,
        "customers": run_customers_job,
        "extended_data": run_extended_data_job,
    }
    handler = handlers.get(job_type)
    if handler is None:
        db = next(get_db())
        try:
            row = db.get(SyncJob, job_id)
            if row and row.status == "queued":
                row.status = "failed"
                row.error = f"unsupported job type: {job_type}"
                row.finished_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
        return
    try:
        await handler(job_id)
    except Exception as exc:
        db = next(get_db())
        try:
            row = db.get(SyncJob, job_id)
            if row and row.status == "running":
                row.status = "failed"
                row.error = str(exc)[:2000]
                row.finished_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()


async def run_history_job(job_id: int) -> None:
    if history_lock.locked():
        return
    async with history_lock:
        await _run_history_job(job_id)


async def _run_history_job(job_id: int) -> None:
    db = next(get_db())
    try:
        claimed = db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id, SyncJob.status == "queued")
            .values(status="running", started_at=datetime.now(timezone.utc), heartbeat_at=datetime.now(timezone.utc), phase="history", attempts=SyncJob.attempts + 1)
        )
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        if not job:
            return
        start = date.fromisoformat(job.cursor_date or job.from_date)
        await run_sync_background(job.store_key, start, date.fromisoformat(job.to_date), job.id)
        db.refresh(job)
        if job.status == "cancelled":
            return
        if job.status == "queued" and job.phase == "yielded_to_daily_sync":
            return
        failed = db.scalar(select(SyncRun.id).where(SyncRun.store_key == job.store_key, SyncRun.started_at >= job.started_at, SyncRun.status == "failed"))
        job.status = "failed" if failed else "completed"
        if failed:
            job.error = f"one or more date chunks failed; inspect sync run {failed}"
        job.finished_at = datetime.now(timezone.utc)
        if job.status == "completed":
            existing_types = {
                row.job_type for row in db.scalars(select(SyncJob).where(
                    SyncJob.store_key == job.store_key,
                    SyncJob.status.in_(["queued", "running"]),
                )).all()
            }
            if settings.shopfront_enable_customers and "customers" not in existing_types:
                db.add(SyncJob(store_key=job.store_key, job_type="customers", status="queued", payload={"after_history_job": job.id}))
            if settings.shopfront_enable_supply_chain and "supply_chain" not in existing_types:
                db.add(SyncJob(store_key=job.store_key, job_type="supply_chain", status="queued", payload={"after_history_job": job.id}))
            if "extended_data" not in existing_types:
                db.add(SyncJob(store_key=job.store_key, job_type="extended_data", status="queued", payload={"after_history_job": job.id}))
        db.commit()
        if job.status == "completed":
            wake_durable_worker()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


async def run_history_discovery(job_id: int) -> None:
    db = next(get_db())
    try:
        claimed = db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id, SyncJob.status == "queued")
            .values(status="running", started_at=datetime.now(timezone.utc), heartbeat_at=datetime.now(timezone.utc), phase="discover", attempts=SyncJob.attempts + 1)
        )
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(SyncJob, job_id)
        store = db.scalar(select(Store).where(Store.store_key == job.store_key)) if job else None
        if not job or not store:
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()
        token = await access_token(db, settings, store)
        client = get_client(settings, store)
        try:
            today = datetime.now(ZoneInfo(store.timezone)).date()
            found: list[str] = []
            errors: list[dict[str, str]] = []
            async def probe_range(start: date, end: date) -> None:
                try:
                    rows = await client.fetch_sales(token, start.isoformat(), end.isoformat())
                    found.extend(str(r.get("timestamp")) for r in rows if r.get("timestamp"))
                    return
                except Exception as exc:
                    if (end - start).days <= settings.history_chunk_days:
                        errors.append({"from": start.isoformat(), "to": end.isoformat(), "error": str(exc)[:500]})
                        return
                midpoint = start + timedelta(days=(end - start).days // 2)
                await probe_range(start, midpoint)
                await probe_range(midpoint + timedelta(days=1), end)

            await probe_range(date(settings.shopfront_history_start_year, 1, 1), today)
            db.refresh(job)
            if job.status == "cancelled":
                return
            job.payload = {"sample_count": len(found), "min_timestamp": min(found) if found else None, "max_timestamp": max(found) if found else None, "errors": errors}
            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            await client.close()
    except Exception as exc:
        job = db.get(SyncJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


@app.get("/api/sync/runs")
def sync_runs(store: str | None = None, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)) -> list[dict]:
    query = select(SyncRun).order_by(desc(SyncRun.started_at)).limit(limit)
    if store:
        query = query.where(SyncRun.store_key == store)
    return [{"id": x.id, "store": x.store_key, "status": x.status, "from": x.from_date, "to": x.to_date, "counts": x.counts, "error": x.error, "started_at": x.started_at, "finished_at": x.finished_at} for x in db.scalars(query).all()]


@app.get("/api/pos/import-runs/{run_id}")
def pos_import_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(PosImportRun, run_id)
    if row is None:
        raise HTTPException(404, "POS import run not found")
    return {"data": {"id": row.id, "store": row.store_key, "type": row.import_type, "status": row.status, "counts": row.counts, "error": row.error, "created_at": row.created_at, "finished_at": row.finished_at}}


async def _stage_pos_import(store_key: str, import_type: str, db: Session) -> PosImportRun:
    row = PosImportRun(store_key=store_key, import_type=import_type, status="staged")
    db.add(row)
    db.commit()
    return row


@app.post("/api/pos/import/products")
async def import_products_to_pos(store: str, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    run = await _stage_pos_import(store, "products", db)
    products = db.scalars(select(Product).where(Product.store_key == store)).all()
    def import_product_item(p: Product) -> dict:
        raw = p.raw_payload if isinstance(p.raw_payload, dict) else {}
        category = raw.get("category") if isinstance(raw.get("category"), dict) else {}
        brand = raw.get("brand") if isinstance(raw.get("brand"), dict) else {}
        family = raw.get("family") if isinstance(raw.get("family"), dict) else {}
        tax_rate = raw.get("taxRate") if isinstance(raw.get("taxRate"), dict) else {}
        prices = raw.get("prices") if isinstance(raw.get("prices"), list) else []
        barcodes = raw.get("barcodes") if isinstance(raw.get("barcodes"), list) else []
        return {
            "source_id": p.shopfront_product_id,
            "name": p.name or raw.get("name"),
            "sku": p.sku or raw.get("mdbId") or raw.get("sku"),
            "barcode": p.barcode or (barcodes[0].get("code") if barcodes and isinstance(barcodes[0], dict) else None),
            "barcodes": barcodes,
            "category": p.category or category.get("name"),
            "category_id": category.get("id"),
            "brand": p.brand or brand.get("name"),
            "brand_id": brand.get("id"),
            "family": family.get("name"),
            "family_id": family.get("id"),
            "description": raw.get("description"),
            "image": raw.get("image"),
            "alternate_images": raw.get("alternateImages") or raw.get("alternate_images") or [],
            "tags": raw.get("tags") or [],
            "track_inventory": raw.get("trackInventory"),
            "case_quantity": raw.get("caseQuantity"),
            "tax_rate_id": tax_rate.get("id"),
            "tax_rate_name": tax_rate.get("name"),
            "cost_tax_rate_id": (raw.get("costTaxRate") or {}).get("id") if isinstance(raw.get("costTaxRate"), dict) else None,
            "cost_tax_rate_name": (raw.get("costTaxRate") or {}).get("name") if isinstance(raw.get("costTaxRate"), dict) else None,
            "source_status": raw.get("status"),
            "source_type": raw.get("type"),
            "source_created_at": raw.get("createdAt"),
            "source_updated_at": raw.get("updatedAt"),
            "cost": p.cost,
            "price": p.price if p.price is not None else shelf_unit_price(raw),
            "prices": prices,
            "raw_payload": raw,
        }

    payload = jsonable_encoder({"store_key": store, "items": [import_product_item(p) for p in products]})
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        if settings.pos_import_enabled:
            result = await client.upsert_products(payload)
            receipt = validate_pos_import_receipt(result, len(products), "product")
            secondary = (settings.pos_api_secondary_store_key or "").strip()
            secondary_receipt = None
            if secondary and secondary != store:
                secondary_result = await client.upsert_products(jsonable_encoder({
                    "store_key": secondary,
                    "items": payload["items"],
                }))
                secondary_receipt = validate_pos_import_receipt(secondary_result, len(products), "product")
            run.status = "completed"
            run.counts = receipt if secondary_receipt is None else {
                "primary": receipt,
                "secondary": secondary_receipt,
                "secondary_store_key": secondary,
            }
        else:
            run.counts = {"staged": len(products), "ready": len(products), "import_enabled": False}
            run.status = "staged"
        db.commit()
        return {"status": run.status, "run_id": run.id, "counts": run.counts}
    except Exception as exc:
        run.status, run.error = "failed", str(exc)[:2000]
        db.commit()
        raise HTTPException(502, run.error)
    finally:
        await client.close()


@app.post("/api/pos/import/inventory")
async def import_inventory_to_pos(store: str, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    run = await _stage_pos_import(store, "inventory", db)
    rows = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store)).all()
    def import_inventory_item(x: InventorySnapshot) -> dict:
        raw = x.raw_payload if isinstance(x.raw_payload, dict) else {}
        outlet = raw.get("outlet") if isinstance(raw.get("outlet"), dict) else {}
        return {
            "source_id": x.shopfront_product_id,
            "outlet_id": x.outlet_id or outlet.get("id"),
            "outlet_name": x.outlet_name or outlet.get("name"),
            "quantity": x.quantity,
            "single_level": raw.get("singleLevel"),
            "case_level": raw.get("caseLevel"),
            "reorder_level": raw.get("reorderLevel"),
            "reorder_level_singles": raw.get("reorderLevelSingles"),
            "reorder_level_cases": raw.get("reorderLevelCases"),
            "reorder_amount": raw.get("reorderAmount"),
            "reorder_amount_singles": raw.get("reorderAmountSingles"),
            "reorder_amount_cases": raw.get("reorderAmountCases"),
            "reorder_limit": raw.get("reorderLimit"),
            "max_quantity": raw.get("maxQuantity"),
            "max_quantity_singles": raw.get("maxQuantitySingles"),
            "max_quantity_cases": raw.get("maxQuantityCases"),
            "on_order": raw.get("onOrder"),
            "timestamp": x.inventory_timestamp,
            "raw_payload": raw,
        }

    payload = jsonable_encoder({"store_key": store, "replace": True, "snapshot_complete": True, "items": [import_inventory_item(x) for x in rows]})
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        if settings.pos_import_enabled:
            result = await client.replace_inventory(payload)
            receipt = validate_pos_import_receipt(result, len(rows), "inventory")
            secondary = (settings.pos_api_secondary_store_key or "").strip()
            secondary_receipt = None
            if secondary and secondary != store:
                secondary_result = await client.replace_inventory(jsonable_encoder({
                    "store_key": secondary,
                    "replace": True,
                    "snapshot_complete": True,
                    "items": payload["items"],
                }))
                secondary_receipt = validate_pos_import_receipt(secondary_result, len(rows), "inventory")
            run.status = "completed"
            run.counts = receipt if secondary_receipt is None else {
                "primary": receipt,
                "secondary": secondary_receipt,
                "secondary_store_key": secondary,
            }
        else:
            run.counts = {"staged": len(rows), "import_enabled": False}
        db.commit()
        return {"status": run.status, "run_id": run.id, "counts": run.counts}
    except Exception as exc:
        run.status, run.error = "failed", str(exc)[:2000]
        db.commit()
        raise HTTPException(502, run.error)
    finally:
        await client.close()


@app.post("/api/pos/import/sales")
async def import_sales_to_pos(store: str, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    run = await _stage_pos_import(store, "sales", db)
    rows = db.scalars(select(Sale).where(Sale.store_key == store)).all()
    incomplete = []
    incomplete_reasons: dict[str, int] = {}
    for sale in rows:
        raw = sale.raw_payload if isinstance(sale.raw_payload, dict) else {}
        status = str(sale.status or "").upper()
        payments = raw.get("payments") if isinstance(raw.get("payments"), list) else []
        reasons = []
        if not sale.shopfront_sale_id:
            reasons.append("missing_sale_id")
        if not sale.items:
            reasons.append("missing_items")
        if status in {"INCOMPLETE", "PARKED"}:
            reasons.append(f"status_{status.lower()}")
        if status == "COMPLETED" and not payments:
            reasons.append("missing_payments")
        if not status:
            reasons.append("missing_status")
        if reasons:
            incomplete.append(sale.shopfront_sale_id)
            for reason in reasons:
                incomplete_reasons[reason] = incomplete_reasons.get(reason, 0) + 1
    if incomplete and settings.pos_business_write_enabled:
        run.status = "blocked"
        run.error = f"Sale detail is incomplete for {len(incomplete)} sales; formal POS import is blocked"
        run.counts = {"sales": len(rows), "blocked": len(incomplete), "blocked_reasons": incomplete_reasons}
        db.commit()
        return {"status": run.status, "run_id": run.id, "counts": run.counts, "error": run.error}
    products_by_source = {str(product.shopfront_product_id): product for product in db.scalars(select(Product).where(Product.store_key == store)).all()}

    def repair_line(item: SaleItem) -> dict:
        raw = dict(item.raw_payload) if isinstance(item.raw_payload, dict) else {}
        nested = raw.get("item") if isinstance(raw.get("item"), dict) else {}
        catalog = products_by_source.get(str(item.shopfront_product_id))
        catalog_raw = catalog.raw_payload if catalog and isinstance(catalog.raw_payload, dict) else {}
        name = item.product_name or nested.get("name") or raw.get("name") or (catalog.name if catalog else None) or catalog_raw.get("name")
        if name and not item.product_name:
            item.product_name = str(name)
        if not nested and catalog_raw:
            raw["item"] = catalog_raw
        barcodes = nested.get("barcodes") if isinstance(nested.get("barcodes"), list) else catalog_raw.get("barcodes", [])
        return {"id": item.line_key, "source_product_id": item.shopfront_product_id, "name": name, "sku": (catalog.sku if catalog else None), "barcodes": barcodes or [], "quantity": item.quantity, "unit_price": item.unit_price, "line_total": item.line_total, "cost": item.cost, "tax": item.tax, "raw_payload": raw}

    def repair_sale_payload(sale: Sale) -> dict:
        raw = sale.raw_payload if isinstance(sale.raw_payload, dict) else {}
        source_items = raw.get("items")
        source_payments = raw.get("payments")
        items = [repair_line(item) for item in sale.items]
        return {"external_id": sale.shopfront_sale_id, "source_complete": isinstance(source_items, list) and isinstance(source_payments, list) and len(source_items) == len(items), "invoice_id": sale.invoice_id, "status": sale.status, "created_at": sale.created_at, "updated_at": sale.updated_at, "total_price": sale.total_price, "total_tax": sale.total_tax, "payments": source_payments if isinstance(source_payments, list) else [], "items": items}

    payload = jsonable_encoder({"store_key": store, "items": [repair_sale_payload(sale) for sale in rows]})
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        if settings.pos_import_enabled:
            result = await client.upsert_sales(payload)
            receipt = validate_pos_import_receipt(result, len(rows), "sales")
            run.status = "completed"
            run.counts = receipt
        else:
            run.counts = {"staged": len(rows), "import_enabled": False}
        db.commit()
        return {"status": run.status, "run_id": run.id, "counts": run.counts}
    except Exception as exc:
        run.status, run.error = "failed", str(exc)[:2000]
        db.commit()
        raise HTTPException(502, run.error)
    finally:
        await client.close()


@app.get("/api/reports/daily-sales")
def daily_sales(store: str, report_date: date, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(DailySalesSummary).where(DailySalesSummary.store_key == store, DailySalesSummary.business_date == report_date.isoformat())).all()
    rows = preferred_summary_rows(rows)
    return {"data": [{"business_date": x.business_date, "outlet": x.outlet, "revenue": x.revenue, "cost": x.cost, "profit": x.profit, "transaction_count": x.transaction_count, "tax": x.tax, "discount": x.discount, "currency": x.currency, "synced_at": x.synced_at} for x in rows], "source": "shopfront_reporting", "synced_at": max((x.synced_at for x in rows), default=None)}


@app.get("/api/reports/sales-trend")
def sales_trend(store: str, from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(DailySalesSummary).where(DailySalesSummary.store_key == store, DailySalesSummary.business_date >= from_date.isoformat(), DailySalesSummary.business_date <= to_date.isoformat()).order_by(DailySalesSummary.business_date)).all()
    rows = preferred_summary_rows(rows)
    return {
        "data": [{"date": x.business_date, "outlet": x.outlet, "revenue": x.revenue, "cost": x.cost, "profit": x.profit, "tax": x.tax, "discount": x.discount, "transaction_count": x.transaction_count} for x in rows],
        "source": "shopfront_reporting",
        "coverage": {
            "requested_from": from_date.isoformat(),
            "requested_to": to_date.isoformat(),
            "returned_dates": sorted({x.business_date for x in rows}),
            "missing_dates": sales_trend_missing_dates(from_date, to_date, rows),
            "missing_date_status": "UNCLASSIFIED_NO_SUMMARY_ROW",
            "missing_date_policy": "missing does not mean closed or zero sales",
        },
    }


@app.get("/api/sales")
def sales(store: str, from_date: date | None = Query(None, alias="from"), to_date: date | None = Query(None, alias="to"), page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=1000), snapshot_id: int | None = Query(None, ge=1), db: Session = Depends(get_db)) -> dict:
    store_row = require_store(store, db)
    local_zone = ZoneInfo(store_row.timezone or settings.sync_timezone)
    filters: list[Any] = [Sale.store_key == store]
    if from_date:
        start_utc = datetime.combine(from_date, datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
        filters.append(Sale.created_at >= start_utc)
    if to_date:
        end_utc = datetime.combine(to_date + timedelta(days=1), datetime.min.time(), tzinfo=local_zone).astimezone(timezone.utc).replace(tzinfo=None)
        filters.append(Sale.created_at < end_utc)
    resolved_snapshot_id = snapshot_id or db.scalar(select(func.max(Sale.id)).where(*filters)) or 0
    filters.append(Sale.id <= resolved_snapshot_id)
    query = select(Sale).where(*filters).order_by(desc(Sale.created_at), desc(Sale.id)).offset((page - 1) * size).limit(size)
    rows = db.scalars(query).all()
    total = db.scalar(select(func.count(Sale.id)).where(*filters)) or 0
    return {"data": [{"shopfront_sale_id": x.shopfront_sale_id, "invoice_id": x.invoice_id, "status": x.status, "created_at": x.created_at, "updated_at": x.updated_at, "total_price": x.total_price, "total_tax": x.total_tax, "total_discount": x.total_discount, "total_cost": x.total_cost, "raw_payload": x.raw_payload} for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows), "total": int(total), "snapshot_id": int(resolved_snapshot_id)}, "source": "shopfront_sales"}


@app.get("/api/sales/{sale_id}")
def sale_detail(sale_id: str, store: str, db: Session = Depends(get_db)) -> dict:
    row = db.scalar(select(Sale).where(Sale.store_key == store, Sale.shopfront_sale_id == sale_id))
    if row is None:
        raise HTTPException(404, "Sale not found")
    return {"data": {"shopfront_sale_id": row.shopfront_sale_id, "invoice_id": row.invoice_id, "status": row.status, "created_at": row.created_at, "updated_at": row.updated_at, "total_price": row.total_price, "total_tax": row.total_tax, "total_discount": row.total_discount, "total_cost": row.total_cost, "raw_payload": row.raw_payload, "items": [{"product_id": x.shopfront_product_id, "name": x.product_name, "quantity": x.quantity, "unit_price": x.unit_price, "line_total": x.line_total, "cost": x.cost, "tax": x.tax} for x in row.items]}, "source": "shopfront_sales"}


@app.get("/api/products")
def products(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), catalog_only: bool = False, status: str | None = None, q: str | None = None, brand: str | None = None, category: str | None = None, family: str | None = None, tag: str | None = None, supplier: str | None = None, product_type: Annotated[str | None, Query(alias="type")] = None, tax_rate: str | None = None, cost_tax_rate: str | None = None, gift_card: bool | None = None, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    for name, value in (("q", q), ("brand", brand), ("category", category), ("family", family), ("tag", tag), ("supplier", supplier), ("type", product_type), ("tax_rate", tax_rate), ("cost_tax_rate", cost_tax_rate)):
        if value is not None and len(value) > 120:
            raise HTTPException(400, f"{name} must be at most 120 characters")
    if status and status.strip().upper() not in {"ACTIVE", "NOT_ACTIVE"}:
        raise HTTPException(400, "status must be ACTIVE or NOT_ACTIVE")
    filters: list[Any] = [Product.store_key == store]
    if catalog_only:
        filters.append(Product.catalog_last_seen_at.is_not(None))
    if status:
        filters.append(func.upper(func.coalesce(Product.raw_payload["status"].as_string(), "UNKNOWN")) == status.strip().upper())
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(or_(
            Product.name.ilike(pattern),
            Product.sku.ilike(pattern),
            Product.barcode.ilike(pattern),
            cast(Product.raw_payload, String).ilike(pattern),
        ))
    advanced = (brand, category, family, tag, supplier, product_type, tax_rate, cost_tax_rate, gift_card)
    if any(value is not None for value in advanced):
        candidates = db.scalars(select(Product).where(*filters).order_by(Product.name, Product.id)).all()

        def text(value: Any) -> str:
            if isinstance(value, dict):
                return " ".join(text(item) for item in value.values())
            if isinstance(value, list):
                return " ".join(text(item) for item in value)
            return str(value or "")

        def has_value(raw: dict[str, Any], needle: str | None, *keys: str) -> bool:
            if needle is None:
                return True
            target = needle.casefold().strip()
            return target in " ".join(text(raw.get(key)) for key in keys).casefold()

        def matches(product: Product) -> bool:
            raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
            if not has_value(raw, brand, "brand") or not has_value(raw, category, "category") or not has_value(raw, family, "family"):
                return False
            if not has_value(raw, tag, "tags") or not has_value(raw, supplier, "suppliers", "coreSupplier", "lastSupplier"):
                return False
            if not has_value(raw, product_type, "type") or not has_value(raw, tax_rate, "taxRate") or not has_value(raw, cost_tax_rate, "costTaxRate"):
                return False
            if gift_card is not None:
                raw_type = text(raw.get("type")).casefold()
                raw_gift = raw.get("giftCard") or raw.get("gift_card")
                is_gift_card = bool(raw_gift) or "gift" in raw_type
                if is_gift_card != gift_card:
                    return False
            return True

        matched = [product for product in candidates if matches(product)]
        total = len(matched)
        rows = matched[(page - 1) * size:page * size]
    else:
        rows = db.scalars(select(Product).where(*filters).order_by(Product.name, Product.id).offset((page - 1) * size).limit(size)).all()
        total = db.scalar(select(func.count(Product.id)).where(*filters)) or 0
    def product_data(x: Product) -> dict:
        raw = x.raw_payload if isinstance(x.raw_payload, dict) else {}
        return {
            "shopfront_product_id": x.shopfront_product_id,
            "sku": x.sku or raw.get("mdbId") or raw.get("sku"),
            "barcode": x.barcode,
            "barcodes": raw.get("barcodes") or [],
            "name": x.name or raw.get("name"),
            "category": x.category or (raw.get("category") or {}).get("name"),
            "category_id": (raw.get("category") or {}).get("id"),
            "brand": x.brand or (raw.get("brand") or {}).get("name"),
            "brand_id": (raw.get("brand") or {}).get("id"),
            "family": (raw.get("family") or {}).get("name"),
            "supplier": ((raw.get("coreSupplier") or raw.get("lastSupplier") or ((raw.get("suppliers") or [None])[0] if isinstance(raw.get("suppliers"), list) else None)) or {}).get("name") if isinstance(((raw.get("coreSupplier") or raw.get("lastSupplier") or ((raw.get("suppliers") or [None])[0] if isinstance(raw.get("suppliers"), list) else None)) or {}), dict) else None,
            "family_id": (raw.get("family") or {}).get("id"),
            "description": raw.get("description"),
            "image": raw.get("image"),
            "alternate_images": raw.get("alternateImages") or [],
            "tags": raw.get("tags") or [],
            "track_inventory": raw.get("trackInventory"),
            "case_quantity": raw.get("caseQuantity"),
            "cost": x.cost,
            "price": x.price,
            "prices": raw.get("prices") or [],
            "tax_rate": raw.get("taxRate") or raw.get("tax_rate"),
            "cost_tax_rate": raw.get("costTaxRate") or raw.get("cost_tax_rate"),
            "status": raw.get("status"),
            "type": raw.get("type"),
            "source_created_at": raw.get("createdAt"),
            "source_updated_at": raw.get("updatedAt"),
            "catalog_seen": x.catalog_last_seen_at is not None,
            "catalog_last_seen_at": x.catalog_last_seen_at,
            "raw_payload": raw,
            "synced_at": x.synced_at,
        }
    return {"data": [product_data(x) for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows), "total": int(total)}, "source": "shopfront_products"}


@app.get("/api/inventory")
def inventory(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), outlet_id: str | None = None, q: str | None = None, negative_only: bool = False, db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    if q is not None and len(q) > 120:
        raise HTTPException(400, "q must be at most 120 characters")
    filters: list[Any] = [InventorySnapshot.store_key == store]
    if outlet_id:
        filters.append(InventorySnapshot.outlet_id == outlet_id)
    if negative_only:
        filters.append(InventorySnapshot.quantity < 0)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(or_(
            InventorySnapshot.shopfront_product_id.ilike(pattern),
            Product.name.ilike(pattern),
            Product.sku.ilike(pattern),
            Product.barcode.ilike(pattern),
        ))
    statement = select(InventorySnapshot, Product).outerjoin(
        Product,
        (Product.store_key == InventorySnapshot.store_key)
        & (Product.shopfront_product_id == InventorySnapshot.shopfront_product_id),
    ).where(*filters).order_by(InventorySnapshot.shopfront_product_id, InventorySnapshot.outlet_id, InventorySnapshot.id)
    rows = db.execute(statement.offset((page - 1) * size).limit(size)).all()
    total = db.scalar(select(func.count(InventorySnapshot.id)).select_from(InventorySnapshot).outerjoin(
        Product,
        (Product.store_key == InventorySnapshot.store_key)
        & (Product.shopfront_product_id == InventorySnapshot.shopfront_product_id),
    ).where(*filters)) or 0
    manifest = db.scalar(select(InventorySnapshotManifest).where(InventorySnapshotManifest.store_key == store))
    source_product_count = db.scalar(select(func.count(func.distinct(InventorySnapshot.shopfront_product_id))).where(InventorySnapshot.store_key == store)) or 0
    manifest_product_ids = {str(product_id) for product_id in (manifest.source_product_ids or [])} if manifest else set()
    source_product_ids = {str(product_id) for product_id in db.scalars(select(InventorySnapshot.shopfront_product_id).where(InventorySnapshot.store_key == store).distinct()).all()}
    products_match_manifest = source_product_ids.issubset(manifest_product_ids)
    return {
        "data": [{
            "shopfront_product_id": row.shopfront_product_id,
            "product_name": product.name if product else None,
            "sku": product.sku if product else None,
            "category": product.category if product else None,
            "cost": product.cost if product else None,
            "last_cost": (product.raw_payload or {}).get("lastCost") if product and isinstance(product.raw_payload, dict) else None,
            "case_quantity": (product.raw_payload or {}).get("caseQuantity") if product and isinstance(product.raw_payload, dict) else None,
            "price": product.price if product else None,
            "outlet_id": row.outlet_id,
            "outlet_name": row.outlet_name,
            "quantity": row.quantity,
            "inventory_timestamp": row.inventory_timestamp,
            "raw_payload": row.raw_payload,
        } for row, product in rows],
        "pagination": {"page": page, "size": size, "returned": len(rows), "total": int(total)},
        "snapshot": {
            "complete": bool(manifest and manifest.complete and products_match_manifest),
            "manifest_complete": bool(manifest and manifest.complete),
            "products_match_manifest": products_match_manifest,
            "manifest_products": len(manifest_product_ids),
            "products_with_inventory_rows": len(source_product_ids),
            "snapshot_at": manifest.snapshot_at if manifest else None,
            "products": len(manifest_product_ids),
            "source_products": int(source_product_count),
        },
        "source": "shopfront_inventory",
    }


@app.post("/webhooks/shopfront/{store_key}")
async def shopfront_webhook(store_key: str, request: Request, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    raw = await request.body()
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    event_id = request.headers.get("X-Shopfront-Webhook-Id") or body.get("id") or body.get("webhookId")
    if not event_id:
        raise HTTPException(400, "Missing webhook id")
    signing_key = os.getenv(f"SHOPFRONT_WEBHOOK_SIGNING_KEY_{store.store_key.upper()}", "")
    if not signing_key:
        raise HTTPException(503, "Webhook signing key is not configured")
    if not verify_webhook(raw, request.headers.get("X-Shopfront-Signature"), request.headers.get("X-Shopfront-Signature-Time"), signing_key):
        raise HTTPException(401, "Invalid webhook signature")
    if db.scalar(select(WebhookEvent).where(WebhookEvent.event_id == str(event_id))):
        return {"status": "duplicate", "event_id": event_id}
    db.add(WebhookEvent(event_id=str(event_id), store_key=store.store_key, event=str(body.get("event", "unknown")), payload=body))
    db.commit()
    return {"status": "accepted", "event_id": event_id}
