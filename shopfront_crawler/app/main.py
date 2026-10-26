import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy import desc, select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db, init_db
from .models import DailySalesSummary, InventorySnapshot, OAuthState, Product, PosImportRun, Sale, ShopfrontToken, Store, StoreMapping, SyncJob, SyncRun, WebhookEvent
from .shopfront import ShopfrontError
from .pos import OrithosClient, PosIntegrationError
from .sync import access_token, ensure_stores, get_client, is_after, make_state, save_token, sync_store, verify_webhook

settings = get_settings()
app = FastAPI(title="Shopfront Crawler", version="0.1.0")
logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone=settings.sync_timezone)
sync_lock = __import__("asyncio").Lock()
history_lock = __import__("asyncio").Lock()


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
        resumed_stores: set[str] = set()
        interrupted_history_ids: list[int] = []
        interrupted_discovery_ids: list[int] = []
        for job in interrupted:
            if job.store_key in resumed_stores:
                job.status = "superseded"
                job.error = "superseded by newer job after crawler restart"
                job.finished_at = datetime.now(timezone.utc)
                continue
            job.status = "queued"
            job.error = "requeued after crawler restart"
            resumed_stores.add(job.store_key)
            if job.job_type == "history":
                interrupted_history_ids.append(job.id)
            elif job.job_type == "discover":
                interrupted_discovery_ids.append(job.id)
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
    for job_id in interrupted_discovery_ids:
        __import__("asyncio").create_task(run_history_discovery(job_id))


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
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=settings.sync_lookback_days - 1))
    background_tasks.add_task(run_sync_background, store.store_key, start, end)
    return {"status": "queued", "store": store.store_key, "from": start, "to": end}


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
    if sync_lock.locked():
        return
    async with sync_lock:
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
                await _sync_history_chunk(db, store_key, store, cursor, chunk_end, job_id, cursor == start)
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
        await sync_store(db, settings, store, start, end, include_catalog=include_catalog)
        if settings.pos_import_enabled:
            await push_pos_snapshot(db, store_key)
        return True
    except Exception:
        failed_run = db.scalars(select(SyncRun).where(SyncRun.store_key == store_key, SyncRun.from_date == start.isoformat(), SyncRun.to_date == end.isoformat()).order_by(desc(SyncRun.started_at))).first()
        if failed_run and start < end:
            failed_run.status = "superseded"
            failed_run.error = "split into smaller retry ranges"
            db.commit()
        if start >= end:
            logger.exception("Shopfront single-day chunk failed: store=%s from=%s", store_key, start)
            return False
        midpoint = start + timedelta(days=(end - start).days // 2)
        logger.warning("Splitting failed Shopfront range: store=%s from=%s to=%s", store_key, start, end)
        left = await _sync_history_chunk(db, store_key, store, start, midpoint, job_id, include_catalog)
        right = await _sync_history_chunk(db, store_key, store, midpoint + timedelta(days=1), end, job_id, False)
        return left and right


async def push_pos_snapshot(db: Session, store_key: str) -> None:
    """Push the current idempotent crawler snapshot to the POS boundary."""
    products = db.scalars(select(Product).where(Product.store_key == store_key)).all()
    inventory = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store_key)).all()
    sales = db.scalars(select(Sale).where(Sale.store_key == store_key)).all()
    incomplete = [sale.shopfront_sale_id for sale in sales if not sale.shopfront_sale_id or not sale.items]
    if incomplete:
        logger.warning("POS sales push blocked: store=%s incomplete_sales=%s", store_key, len(incomplete))
        return
    payloads = {
        "products": {"store_key": store_key, "items": [{"source_id": p.shopfront_product_id, "name": p.name, "sku": p.sku, "barcode": p.barcode, "category": p.category, "brand": p.brand, "cost": p.cost, "price": p.price} for p in products]},
        "inventory": {"store_key": store_key, "replace": True, "items": [{"source_id": row.shopfront_product_id, "quantity": row.quantity, "timestamp": row.inventory_timestamp} for row in inventory]},
        "sales": {"store_key": store_key, "items": [{"external_id": sale.shopfront_sale_id, "invoice_id": sale.invoice_id, "status": sale.status, "created_at": sale.created_at, "updated_at": sale.updated_at, "total_price": sale.total_price, "total_tax": sale.total_tax, "items": [{"source_product_id": item.shopfront_product_id, "name": item.product_name, "quantity": item.quantity, "unit_price": item.unit_price, "line_total": item.line_total} for item in sale.items]} for sale in sales]},
    }
    client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, settings.pos_import_enabled)
    try:
        await client.upsert_products(jsonable_encoder(payloads["products"]))
        await client.replace_inventory(jsonable_encoder(payloads["inventory"]))
        await client.upsert_sales(jsonable_encoder(payloads["sales"]))
    except Exception:
        logger.exception("POS snapshot push failed: store=%s", store_key)
    finally:
        await client.close()


async def scheduled_sync() -> None:
    today = datetime.now(ZoneInfo(settings.sync_timezone)).date()
    end = today - timedelta(days=1)
    start = end - timedelta(days=settings.sync_lookback_days - 1)
    for store_key in settings.stores():
        await run_sync_background(store_key, start, end)


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
    payload = jsonable_encoder({"store_key": store, "items": [{"source_id": p.shopfront_product_id, "name": p.name, "sku": p.sku, "barcode": p.barcode, "category": p.category, "brand": p.brand, "cost": p.cost, "price": p.price} for p in products]})
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
    payload = jsonable_encoder({"store_key": store, "replace": True, "items": [{"source_id": x.shopfront_product_id, "quantity": x.quantity, "timestamp": x.inventory_timestamp} for x in rows]})
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
    if incomplete:
        run.status = "blocked"
        run.error = f"Sale detail is incomplete for {len(incomplete)} sales; formal POS import is blocked"
        run.counts = {"sales": len(rows), "blocked": len(incomplete)}
        db.commit()
        return {"status": run.status, "run_id": run.id, "counts": run.counts, "error": run.error}
    payload = jsonable_encoder({"store_key": store, "items": [{"external_id": x.shopfront_sale_id, "invoice_id": x.invoice_id, "status": x.status, "created_at": x.created_at, "updated_at": x.updated_at, "total_price": x.total_price, "total_tax": x.total_tax, "items": [{"source_product_id": i.shopfront_product_id, "name": i.product_name, "quantity": i.quantity, "unit_price": i.unit_price, "line_total": i.line_total} for i in x.items]} for x in rows]})
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
    return {"data": [{"shopfront_product_id": x.shopfront_product_id, "sku": x.sku, "barcode": x.barcode, "name": x.name, "category": x.category, "brand": x.brand, "cost": x.cost, "price": x.price, "raw_payload": x.raw_payload, "synced_at": x.synced_at} for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows)}, "source": "shopfront_products"}


@app.get("/api/inventory")
def inventory(store: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> dict:
    require_store(store, db)
    rows = db.scalars(select(InventorySnapshot).where(InventorySnapshot.store_key == store).order_by(desc(InventorySnapshot.inventory_timestamp)).offset((page - 1) * size).limit(size)).all()
    return {"data": [{"shopfront_product_id": x.shopfront_product_id, "quantity": x.quantity, "inventory_timestamp": x.inventory_timestamp, "raw_payload": x.raw_payload} for x in rows], "pagination": {"page": page, "size": size, "returned": len(rows)}, "source": "shopfront_inventory"}


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
