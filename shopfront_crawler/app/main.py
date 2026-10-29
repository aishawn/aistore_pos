import asyncio
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy import desc, func, or_, select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db, init_db
from .models import DailySalesSummary, InventorySnapshot, OAuthState, Product, PosImportRun, Sale, SaleItem, ShopfrontToken, Store, StoreMapping, SyncJob, SyncRun, WebhookEvent
from .shopfront import ShopfrontError
from .pos import OrithosClient, PosIntegrationError
from .odoo import OdooSyncClient
from .sync import access_token, ensure_stores, get_client, is_after, make_state, parse_decimal, save_token, sync_store, verify_webhook

settings = get_settings()
app = FastAPI(title="Shopfront Crawler", version="0.1.0")
logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone=settings.sync_timezone)
sync_lock = __import__("asyncio").Lock()
history_lock = __import__("asyncio").Lock()
snapshot_lock = __import__("asyncio").Lock()


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
        interrupted_history_ids: list[int] = []
        interrupted_discovery_ids: list[int] = []
        interrupted_snapshot_ids: list[int] = []
        interrupted_catalog_ids: list[int] = []
        interrupted_sales_repair_ids: list[int] = []
        queued_history_ids: list[int] = []
        for job in interrupted:
            job_key = (job.store_key, job.job_type)
            if job_key in resumed_stores:
                job.status = "superseded"
                job.error = "superseded by newer job after crawler restart"
                job.finished_at = datetime.now(timezone.utc)
                continue
            job.status = "queued"
            job.error = "requeued after crawler restart"
            resumed_stores.add(job_key)
            if job.job_type == "history":
                interrupted_history_ids.append(job.id)
            elif job.job_type == "discover":
                interrupted_discovery_ids.append(job.id)
            elif job.job_type == "snapshot":
                interrupted_snapshot_ids.append(job.id)
            elif job.job_type == "catalog_snapshot":
                interrupted_catalog_ids.append(job.id)
            elif job.job_type == "sales_repair":
                interrupted_sales_repair_ids.append(job.id)
        # A snapshot can be persisted as queued immediately before a process
        # restart, before its BackgroundTask gets a chance to claim it. Start
        # the newest queued snapshot for each store so it cannot remain stuck.
        queued_snapshots = db.scalars(
            select(SyncJob)
            .where(SyncJob.status == "queued", SyncJob.job_type.in_(["snapshot", "catalog_snapshot", "sales_repair"]))
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
            if job.job_type == "snapshot":
                interrupted_snapshot_ids.append(job.id)
            elif job.job_type == "catalog_snapshot":
                interrupted_catalog_ids.append(job.id)
            elif job.job_type == "sales_repair":
                interrupted_sales_repair_ids.append(job.id)

        # A history request is persisted before its BackgroundTask starts.
        # If the process restarts in that window, resume the newest queued
        # range instead of leaving it permanently queued behind a dead lock.
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
            queued_history_ids.append(job.id)
        db.commit()
    finally:
        db.close()
    scheduler.add_job(
        scheduled_sync,
        CronTrigger(hour=settings.sync_daily_hour, minute=settings.sync_daily_minute, timezone=settings.sync_timezone),
        id="shopfront-sync",
        replace_existing=True,
    )
    scheduler.start()
    for job_id in interrupted_history_ids:
        __import__("asyncio").create_task(run_history_job(job_id))
    for job_id in queued_history_ids:
        __import__("asyncio").create_task(run_history_job(job_id))
    for job_id in interrupted_discovery_ids:
        __import__("asyncio").create_task(run_history_discovery(job_id))
    for job_id in interrupted_snapshot_ids:
        __import__("asyncio").create_task(run_full_snapshot_job(job_id))
    for job_id in interrupted_catalog_ids:
        __import__("asyncio").create_task(run_catalog_snapshot_job(job_id))
    for job_id in interrupted_sales_repair_ids:
        __import__("asyncio").create_task(run_sales_repair_job(job_id))


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
    return [{"store_key": s.store_key, "vendor": s.vendor, "timezone": s.timezone, "active": s.active, "token_status": tokens.get(s.store_key).status if tokens.get(s.store_key) else "not_authorized"} for s in db.scalars(select(Store).order_by(Store.store_key)).all()]


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
async def trigger_sync(store_key: str, background_tasks: BackgroundTasks, from_date: date | None = None, to_date: date | None = None, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=settings.sync_lookback_days - 1))
    background_tasks.add_task(run_sync_background, store.store_key, start, end)
    return {"status": "queued", "store": store.store_key, "from": start, "to": end}


async def run_full_snapshot_job(job_id: int) -> None:
    # Full snapshots and history/catalog jobs share the same database writer.
    # Serialize all durable crawler writes through sync_lock.
    async with sync_lock:
        db = next(get_db())
        run = None
        try:
            job = db.get(SyncJob, job_id)
            if not job or job.status != "queued":
                return
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            run = SyncRun(store_key=job.store_key, status="running", counts={"type": "full_snapshot"})
            db.add(run)
            db.commit()
            result = await push_pos_snapshot(db, job.store_key, run=run)
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
            job = db.get(SyncJob, job_id)
            if not job or job.status != "queued":
                return
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            run = SyncRun(store_key=job.store_key, status="running", counts={"type": job.job_type})
            db.add(run)
            db.commit()
            result = await push_pos_snapshot(
                db,
                job.store_key,
                run=run,
                include_catalog=True,
                include_sales=include_sales,
                sales_offset=int((job.payload or {}).get("sales_offset", 0) or 0),
                job=job,
            )
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
    await _run_catalog_job(job_id, include_sales=False)


async def run_sales_repair_job(job_id: int) -> None:
    await _run_catalog_job(job_id, include_sales=True)


@app.post("/api/stores/{store_key}/pos/full-snapshot")
async def start_full_snapshot(store_key: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, "A sync job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="snapshot", status="queued")
    db.add(job)
    db.commit()
    background_tasks.add_task(run_full_snapshot_job, job.id)
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "crawler database to POS and Odoo mirrors"}


@app.post("/api/stores/{store_key}/pos/catalog-snapshot")
async def start_catalog_snapshot(store_key: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Refresh product metadata and inventory without waiting for history."""
    store = require_store(store_key, db)
    active = active_job(db, store.store_key)
    if active:
        raise HTTPException(409, f"A {active.job_type} job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="catalog_snapshot", status="queued")
    db.add(job)
    db.commit()
    background_tasks.add_task(run_catalog_snapshot_job, job.id)
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "products and inventory"}


@app.post("/api/stores/{store_key}/pos/sales-repair")
async def start_sales_repair(store_key: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
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
    background_tasks.add_task(run_sales_repair_job, job.id)
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "scope": "saved sales and SaleItem metadata"}


def active_job(db: Session, store_key: str) -> SyncJob | None:
    return db.scalar(select(SyncJob).where(SyncJob.store_key == store_key, SyncJob.status.in_(["queued", "running"])).order_by(SyncJob.id.desc()))


@app.post("/api/stores/{store_key}/history/discover")
async def discover_history(store_key: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    if active_job(db, store.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    job = SyncJob(store_key=store.store_key, job_type="discover", status="queued")
    db.add(job)
    db.commit()
    background_tasks.add_task(run_history_discovery, job.id)
    return {"status": "queued", "job_id": job.id, "store": store.store_key}


@app.post("/api/stores/{store_key}/history/sync")
async def start_history_sync(store_key: str, background_tasks: BackgroundTasks, from_date: date | None = None, to_date: date | None = None, db: Session = Depends(get_db)) -> dict:
    store = require_store(store_key, db)
    if active_job(db, store.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    end = to_date or date.today()
    start = from_date or date(settings.shopfront_history_start_year, 1, 1)
    job = SyncJob(store_key=store.store_key, job_type="history", status="queued", from_date=start.isoformat(), to_date=end.isoformat(), cursor_date=start.isoformat())
    db.add(job)
    db.commit()
    background_tasks.add_task(run_history_job, job.id)
    return {"status": "queued", "job_id": job.id, "store": store.store_key, "from": start, "to": end}


@app.get("/api/sync/status")
def sync_status(store: str | None = None, db: Session = Depends(get_db)) -> dict:
    query = select(SyncJob).order_by(desc(SyncJob.id))
    if store:
        query = query.where(SyncJob.store_key == store)
    jobs = db.scalars(query.limit(20)).all()
    return {"data": [{"id": j.id, "store": j.store_key, "type": j.job_type, "status": j.status, "from": j.from_date, "to": j.to_date, "cursor": j.cursor_date, "error": j.error, "created_at": j.created_at, "finished_at": j.finished_at} for j in jobs]}


@app.get("/api/sync/coverage")
def sync_coverage(store: str, db: Session = Depends(get_db)) -> dict:
    """Return read-only source coverage metrics for verification and handoff."""
    require_store(store, db)
    products = db.scalars(select(Product).where(Product.store_key == store)).all()
    inventory_count = db.scalar(select(func.count(InventorySnapshot.id)).where(InventorySnapshot.store_key == store)) or 0
    outlet_count = db.scalar(select(func.count(func.distinct(InventorySnapshot.outlet_id))).where(InventorySnapshot.store_key == store, InventorySnapshot.outlet_id.is_not(None))) or 0
    sale_count = db.scalar(select(func.count(Sale.id)).where(Sale.store_key == store)) or 0
    sale_item_count = db.scalar(select(func.count(SaleItem.id)).join(Sale, SaleItem.sale_id == Sale.id).where(Sale.store_key == store)) or 0
    missing_sale_item_names = db.scalar(select(func.count(SaleItem.id)).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.store_key == store,
        or_(SaleItem.product_name.is_(None), func.trim(SaleItem.product_name) == ""),
    )) or 0

    def non_empty(value: object) -> bool:
        return value is not None and value != "" and value != [] and value != {}

    fields = {"name": 0, "description": 0, "barcode": 0, "sku": 0, "category": 0, "brand": 0, "image": 0, "alternate_images": 0, "price": 0, "cost": 0}
    for product in products:
        raw = product.raw_payload if isinstance(product.raw_payload, dict) else {}
        values = {
            "name": product.name or raw.get("name"),
            "description": raw.get("description"),
            "barcode": product.barcode or raw.get("barcode") or raw.get("barcodes"),
            "sku": product.sku or raw.get("sku") or raw.get("mdbId"),
            "category": product.category or raw.get("category"),
            "brand": product.brand or raw.get("brand"),
            "image": raw.get("image"),
            "alternate_images": raw.get("alternateImages") or raw.get("alternate_images"),
            "price": product.price or raw.get("price") or raw.get("prices"),
            "cost": product.cost or raw.get("cost"),
        }
        for field, value in values.items():
            if non_empty(value):
                fields[field] += 1
    return {
        "data": {
            "store": store,
            "products": {"total": len(products), "fields": fields},
            "inventory": {"records": int(inventory_count), "outlets": int(outlet_count)},
            "sales": {"total": int(sale_count), "sale_items": int(sale_item_count), "sale_items_missing_name": int(missing_sale_item_names)},
        },
        "source": "shopfront_crawler",
        "synced_at": datetime.now(timezone.utc),
    }


@app.get("/api/pos/coverage")
async def pos_coverage(store: str, db: Session = Depends(get_db)) -> dict:
    """Read POS staging counts through the server-side integration secret."""
    require_store(store, db)
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        snapshot = await client.snapshot(store)
        matching = await client.match_status(store)
        return {"data": {"store": store, "snapshot": snapshot.get("data", snapshot), "matching": matching.get("data", matching)}, "source": "orithos_shopfront_staging"}
    except PosIntegrationError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        await client.close()


@app.post("/api/sync/runs/{run_id}/retry")
async def retry_sync_run(run_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    run = db.get(SyncRun, run_id)
    if run is None:
        raise HTTPException(404, "Sync run not found")
    if active_job(db, run.store_key):
        raise HTTPException(409, "A sync job is already active for this store")
    job = SyncJob(store_key=run.store_key, job_type="history", status="queued", from_date=run.from_date, to_date=run.to_date, cursor_date=run.from_date)
    db.add(job)
    db.commit()
    background_tasks.add_task(run_history_job, job.id)
    return {"status": "queued", "job_id": job.id, "retry_run_id": run.id}


@app.post("/api/sync/runs/{run_id}/cancel")
def cancel_sync_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    job = db.get(SyncJob, run_id)
    if job is not None:
        if job.status in {"queued", "running"}:
            job.status = "cancelled"
            job.error = "cancelled by operator"
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        return {"status": job.status, "run_id": job.id, "type": "job"}
    run = db.get(SyncRun, run_id)
    if run is None:
        raise HTTPException(404, "Sync run not found")
    if run.status == "running":
        run.status = "cancelled"
        run.error = "cancelled by operator"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": run.status, "run_id": run.id}


async def run_sync_background(store_key: str, start: date, end: date, job_id: int | None = None) -> None:
    await _run_sync_background(store_key, start, end, job_id)


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
                if job_id is not None and include_catalog:
                    existing_products = db.scalar(
                        select(func.count()).select_from(Product).where(Product.store_key == store_key)
                    ) or 0
                    include_catalog = existing_products == 0
                # Serialize each durable chunk, then release the writer so a
                # queued catalog/sales repair can run before the next range.
                async with sync_lock:
                    completed = await _sync_history_chunk(db, store_key, store, cursor, chunk_end, job_id, include_catalog)
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
                            db.commit()
    finally:
        db.close()


async def _sync_history_chunk(db: Session, store_key: str, store: Store, start: date, end: date, job_id: int | None, include_catalog: bool) -> bool:
    try:
        # Keep the run open until the POS/Odoo mirror has acknowledged every
        # batch. A source-only completion must never advance the history cursor
        # while the downstream import is still running.
        run = await sync_store(
            db,
            settings,
            store,
            start,
            end,
            include_catalog=include_catalog,
            defer_completion=True,
        )
        if run.status == "failed":
            return False
        sync_counts = dict(run.counts or {})
        if settings.pos_import_enabled:
            # Historical chunks only need the catalog on the first chunk. For
            # later chunks, push sales when present and avoid rewriting the
            # same full product/inventory snapshot for every empty date range.
            push_kwargs = {"run": run, "include_catalog": include_catalog}
            product_source_ids = sync_counts.get("product_source_ids")
            if product_source_ids:
                # Later history chunks push only products discovered in their
                # SaleItems; the first chunk still sends the complete catalog.
                push_kwargs["product_source_ids"] = product_source_ids
            pos_result = await push_pos_snapshot(db, store_key, start, end, **push_kwargs)
            if pos_result.get("status") != "completed" or pos_result.get("error"):
                raise RuntimeError(pos_result.get("error") or "POS mirror did not confirm a completed import")
            source_sales = int(sync_counts.get("sales") or 0)
            imported_sales = int(pos_result.get("sales_imported") or 0)
            if source_sales and imported_sales < source_sales:
                raise RuntimeError(
                    "POS sales import is smaller than Shopfront source: "
                    f"source={source_sales}, imported={imported_sales}"
                )
            # The IDs are an in-process filter for this chunk, not durable
            # progress state. Keeping only the count makes status reads and
            # run-row commits substantially smaller for long histories.
            if product_source_ids is not None:
                sync_counts["product_source_id_count"] = len(product_source_ids)
                sync_counts.pop("product_source_ids", None)
            run.counts = {"sync": sync_counts, "pos_import": pos_result}
        else:
            run.counts = {"sync": sync_counts}
        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return True
    except Exception as exc:
        failed_run = db.scalars(select(SyncRun).where(SyncRun.store_key == store_key, SyncRun.from_date == start.isoformat(), SyncRun.to_date == end.isoformat()).order_by(desc(SyncRun.started_at))).first()
        if failed_run:
            failed_run.status = "superseded" if start < end else "failed"
            failed_run.error = "split into smaller retry ranges" if start < end else str(exc)[:2000]
            db.commit()
        if start >= end:
            logger.exception("Shopfront single-day chunk failed: store=%s from=%s", store_key, start)
            return False
        midpoint = start + timedelta(days=(end - start).days // 2)
        logger.warning("Splitting failed Shopfront range: store=%s from=%s to=%s", store_key, start, end)
        left = await _sync_history_chunk(db, store_key, store, start, midpoint, job_id, include_catalog)
        right = await _sync_history_chunk(db, store_key, store, midpoint + timedelta(days=1), end, job_id, False)
        return left and right


async def push_pos_snapshot(
    db: Session,
    store_key: str,
    start: date | None = None,
    end: date | None = None,
    run: SyncRun | None = None,
    include_catalog: bool = True,
    product_source_ids: list[str] | None = None,
    include_sales: bool = True,
    sales_offset: int = 0,
    job: SyncJob | None = None,
) -> dict:
    """Push a snapshot in bounded pages so a full history never sits in RAM."""
    products_query = select(Product).where(Product.store_key == store_key)
    if not include_catalog:
        ids = sorted({str(value) for value in (product_source_ids or []) if value})
        products_query = products_query.where(Product.shopfront_product_id.in_(ids)) if ids else products_query.where(False)
    products = db.scalars(products_query).all()
    inventory = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store_key)).all() if include_catalog else []
    source_store = db.scalar(select(Store).where(Store.store_key == store_key))
    try:
        local_zone = ZoneInfo(source_store.timezone if source_store else settings.sync_timezone)
    except (KeyError, ValueError):
        local_zone = timezone.utc
    sales_query = select(Sale).where(Sale.store_key == store_key).order_by(Sale.id)
    if run is not None and start is not None and end is not None:
        # A history sync has just upserted the exact source rows that belong
        # to this run. Use its durable sync timestamp so sales with a missing
        # or malformed source timestamp are still imported. Full snapshots
        # retain the normal date filter below.
        sales_query = sales_query.where(Sale.synced_at >= run.started_at)
    elif start is not None and end is not None:
        window_start = datetime.combine(start, datetime.min.time(), tzinfo=local_zone)
        window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=local_zone)
        sales_query = sales_query.where(((Sale.created_at >= window_start) & (Sale.created_at < window_end)) | ((Sale.updated_at >= window_start) & (Sale.updated_at < window_end)))
    total_sales = (db.scalar(select(func.count()).select_from(sales_query.subquery())) or 0) if include_sales else 0
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    fallback_token = settings.shopfront_integration_token or settings.pos_api_token
    odoo_enabled = bool(
        settings.odoo_import_enabled
        and settings.odoo_api_base_url
        and (settings.odoo_api_token or fallback_token)
    )
    odoo_client = OdooSyncClient(settings.odoo_api_base_url, settings.odoo_api_token, settings.odoo_api_database, odoo_enabled, settings.odoo_business_write_enabled, fallback_token)
    result = {"status": "failed", "products": len(products), "inventory": len(inventory), "sales": total_sales, "sales_imported": 0, "error": None, "mirror_errors": []}

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
        return {"external_id": sale.shopfront_sale_id, "invoice_id": sale.invoice_id, "status": sale.status, "created_at": sale.created_at, "updated_at": sale.updated_at, "total_price": sale.total_price, "total_tax": sale.total_tax, "total_discount": sale.total_discount, "total_cost": sale.total_cost, "customer_reference": sale.customer_reference, "payments": raw_sale.get("payments", []) if isinstance(raw_sale.get("payments"), list) else [], "raw_payload": raw_sale, "items": [{
            **sale_line_payload(item),
        } for item in sale.items]}

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
        if price is None and prices and isinstance(prices[0], dict):
            price = prices[0].get("price")
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
    for sale_item in db.scalars(sale_item_query).yield_per(1000):
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

    # Historical SaleItems can point at archived products that are no longer in
    # the current catalog. Earlier repair runs only looked at product payloads
    # already present in ``product_items_by_source``; that skipped the common
    # case where the SaleItem itself had a source ID but no nested Product
    # object. Collect those IDs explicitly so the archived-product lookup can
    # restore names and every available product field.
    missing_ids: set[str] = {
        source_id
        for source_id, item in product_items_by_source.items()
        if not item.get("name")
    }
    for sale_item in db.scalars(sale_item_query).yield_per(1000):
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
                        for key, value in normalized.items():
                            if value not in (None, "", [], {}) and not existing.get(key):
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
    try:
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
            return responses

        product_result = None
        inventory_result = None
        catalog_error: Exception | None = None
        try:
            product_responses = []
            for offset in range(0, len(product_items), 250):
                product_responses.append(await client.upsert_products(jsonable_encoder({"store_key": store_key, "items": product_items[offset:offset + 250]})))
            if product_responses:
                product_result = product_responses[0] if len(product_responses) == 1 else {"batches": len(product_responses), "last": product_responses[-1]}
            if include_catalog and inventory_items:
                inventory_result = await client.replace_inventory(jsonable_encoder({"store_key": store_key, "replace": True, "snapshot_complete": True, "items": inventory_items}))
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
        if odoo_enabled and include_catalog and inventory_items:
            inventory_responses = await sync_odoo_batches("inventory", inventory_items, snapshot_complete=True)
            odoo_inventory_result = inventory_responses[0] if len(inventory_responses) == 1 else {"batches": len(inventory_responses), "last": inventory_responses[-1]}
        sale_batches = 0
        odoo_batches = 0
        offset = max(0, int(sales_offset or 0))
        while include_sales and offset < total_sales:
            sales = db.scalars(sales_query.offset(offset).limit(250)).all()
            if not sales:
                break
            items = [sale_payload(sale) for sale in sales]
            try:
                await client.upsert_sales(jsonable_encoder({"store_key": store_key, "items": items}))
                sale_batches += 1
            except Exception as exc:
                result["mirror_errors"].append(f"sales batch {offset}: {exc!r}")
                logger.warning("POS sales mirror failed; continuing with Odoo: offset=%s error=%r", offset, exc)
            if odoo_enabled:
                # Odoo accepts a complete list of orders in one JSON-RPC
                # transaction. A 200-sale batch halves request overhead for
                # historical replay while the 25-sale fallback keeps retries
                # small when one payload contains a problematic record.
                for small_offset in range(0, len(items), 200):
                    batch = items[small_offset:small_offset + 200]
                    try:
                        await odoo_client.sync("sales", store_key, jsonable_encoder(batch))
                    except Exception:
                        for retry_offset in range(0, len(batch), 50):
                            await odoo_client.sync("sales", store_key, jsonable_encoder(batch[retry_offset:retry_offset + 50]))
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
                    "odoo_sale_batches": odoo_batches,
                    "stage": "odoo_business" if settings.odoo_import_enabled else "pos_mirror",
                }
                if job is not None:
                    job.payload = {**(job.payload or {}), "sales_offset": offset, "sale_total": total_sales}
                db.commit()
        if include_sales and result["sales_imported"] != total_sales:
            result["mirror_errors"].append(
                f"sales import incomplete: expected {total_sales}, imported {result['sales_imported']}"
            )
        result.update({
            "status": "failed" if result["mirror_errors"] else "completed",
            "error": "; ".join(result["mirror_errors"]) if result["mirror_errors"] else None,
            "product_response": product_result,
            "inventory_response": inventory_result,
            "odoo_business_write": bool(odoo_enabled and settings.odoo_business_write_enabled),
            "odoo_product_response": odoo_product_result,
            "odoo_inventory_response": odoo_inventory_result,
        })
    except Exception as exc:
        result["error"] = str(exc)[:500]
        logger.exception("Shopfront snapshot push failed: store=%s", store_key)
    finally:
        await client.close()
        await odoo_client.close()
    return result


async def scheduled_sync() -> None:
    today = datetime.now(ZoneInfo(settings.sync_timezone)).date()
    end = today - timedelta(days=1)
    start = end - timedelta(days=settings.sync_lookback_days - 1)
    db = next(get_db())
    try:
        for store_key in settings.stores():
            # A persisted history/snapshot job owns the store writer. Waiting
            # behind it would add another full report/import window and can
            # make the historical job appear stalled while doing duplicate
            # work. The next scheduled run will cover this lookback window.
            active = active_job(db, store_key)
            if active:
                logger.info("Skipping scheduled sync for store=%s; active job=%s/%s", store_key, active.id, active.job_type)
                continue
            await run_sync_background(store_key, start, end)
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
            .values(status="running", started_at=datetime.now(timezone.utc))
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
        failed = db.scalar(select(SyncRun.id).where(SyncRun.store_key == job.store_key, SyncRun.started_at >= job.started_at, SyncRun.status == "failed"))
        job.status = "failed" if failed else "completed"
        if failed:
            job.error = f"one or more date chunks failed; inspect sync run {failed}"
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


async def run_history_discovery(job_id: int) -> None:
    db = next(get_db())
    try:
        claimed = db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id, SyncJob.status == "queued")
            .values(status="running", started_at=datetime.now(timezone.utc))
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
            "alternate_images": raw.get("alternateImages") or [],
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
            "price": p.price if p.price is not None else (prices[0].get("price") if prices and isinstance(prices[0], dict) else None),
            "prices": prices,
            "raw_payload": raw,
        }

    payload = jsonable_encoder({"store_key": store, "items": [import_product_item(p) for p in products]})
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        if settings.pos_import_enabled:
            result = await client.upsert_products(payload)
            run.status = "completed"
            run.counts = result.get("data", result) if isinstance(result, dict) else {"returned": len(products)}
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
            run.status = "completed"
            run.counts = result.get("data", result) if isinstance(result, dict) else {"returned": len(rows)}
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
    incomplete = [x.shopfront_sale_id for x in rows if not x.shopfront_sale_id or not x.items]
    if incomplete and settings.pos_business_write_enabled:
        run.status = "blocked"
        run.error = f"Sale detail is incomplete for {len(incomplete)} sales; formal POS import is blocked"
        run.counts = {"sales": len(rows), "blocked": len(incomplete)}
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
        return {"source_product_id": item.shopfront_product_id, "name": name, "sku": (catalog.sku if catalog else None), "barcodes": barcodes or [], "quantity": item.quantity, "unit_price": item.unit_price, "line_total": item.line_total, "cost": item.cost, "tax": item.tax, "raw_payload": raw}

    payload = jsonable_encoder({"store_key": store, "items": [{"external_id": x.shopfront_sale_id, "invoice_id": x.invoice_id, "status": x.status, "created_at": x.created_at, "updated_at": x.updated_at, "total_price": x.total_price, "total_tax": x.total_tax, "items": [repair_line(i) for i in x.items]} for x in rows]})
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        if settings.pos_import_enabled:
            result = await client.upsert_sales(payload)
            run.status = "completed"
            run.counts = result.get("data", result) if isinstance(result, dict) else {"returned": len(rows)}
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
    return {"data": [{"business_date": x.business_date, "outlet": x.outlet, "revenue": x.revenue, "cost": x.cost, "profit": x.profit, "transaction_count": x.transaction_count, "tax": x.tax, "discount": x.discount, "currency": x.currency, "synced_at": x.synced_at} for x in rows], "source": "shopfront_reporting", "synced_at": max((x.synced_at for x in rows), default=None)}


@app.get("/api/reports/sales-trend")
def sales_trend(store: str, from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(DailySalesSummary).where(DailySalesSummary.store_key == store, DailySalesSummary.business_date >= from_date.isoformat(), DailySalesSummary.business_date <= to_date.isoformat()).order_by(DailySalesSummary.business_date)).all()
    return {"data": [{"date": x.business_date, "outlet": x.outlet, "revenue": x.revenue, "cost": x.cost, "profit": x.profit, "transaction_count": x.transaction_count} for x in rows], "source": "shopfront_reporting"}


@app.get("/api/sales")
def sales(store: str, from_date: date | None = Query(None, alias="from"), to_date: date | None = Query(None, alias="to"), page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    query = select(Sale).where(Sale.store_key == store).order_by(desc(Sale.created_at)).offset((page - 1) * size).limit(size)
    if from_date:
        query = query.where(Sale.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.where(Sale.created_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time()))
    rows = db.scalars(query).all()
    return {"data": [{"shopfront_sale_id": x.shopfront_sale_id, "invoice_id": x.invoice_id, "status": x.status, "created_at": x.created_at, "updated_at": x.updated_at, "total_price": x.total_price, "total_tax": x.total_tax, "total_discount": x.total_discount, "total_cost": x.total_cost, "raw_payload": x.raw_payload} for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows)}, "source": "shopfront_sales"}


@app.get("/api/sales/{sale_id}")
def sale_detail(sale_id: str, store: str, db: Session = Depends(get_db)) -> dict:
    row = db.scalar(select(Sale).where(Sale.store_key == store, Sale.shopfront_sale_id == sale_id))
    if row is None:
        raise HTTPException(404, "Sale not found")
    return {"data": {"shopfront_sale_id": row.shopfront_sale_id, "invoice_id": row.invoice_id, "status": row.status, "created_at": row.created_at, "updated_at": row.updated_at, "total_price": row.total_price, "total_tax": row.total_tax, "total_discount": row.total_discount, "total_cost": row.total_cost, "raw_payload": row.raw_payload, "items": [{"product_id": x.shopfront_product_id, "name": x.product_name, "quantity": x.quantity, "unit_price": x.unit_price, "line_total": x.line_total, "cost": x.cost, "tax": x.tax} for x in row.items]}, "source": "shopfront_sales"}


@app.get("/api/products")
def products(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(Product).where(Product.store_key == store).order_by(Product.name).offset((page - 1) * size).limit(size)).all()
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
            "tax_rate": raw.get("taxRate"),
            "cost_tax_rate": raw.get("costTaxRate"),
            "status": raw.get("status"),
            "type": raw.get("type"),
            "source_created_at": raw.get("createdAt"),
            "source_updated_at": raw.get("updatedAt"),
            "raw_payload": raw,
            "synced_at": x.synced_at,
        }
    return {"data": [product_data(x) for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows)}, "source": "shopfront_products"}


@app.get("/api/inventory")
def inventory(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store).order_by(desc(InventorySnapshot.inventory_timestamp)).offset((page - 1) * size).limit(size)).all()
    return {"data": [{"shopfront_product_id": x.shopfront_product_id, "outlet_id": x.outlet_id, "outlet_name": x.outlet_name, "quantity": x.quantity, "inventory_timestamp": x.inventory_timestamp, "raw_payload": x.raw_payload} for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows)}, "source": "shopfront_inventory"}


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
