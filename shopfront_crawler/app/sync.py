import hashlib
import hmac
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import DailySalesSummary, InventorySnapshot, Product, Sale, ShopfrontToken, Store, SyncRun
from .shopfront import ShopfrontClient, ShopfrontError


class TokenCipher:
    def __init__(self, key: str):
        self._fernet = Fernet(key.encode()) if key else None

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode()).decode() if self._fernet else value

    def decrypt(self, value: str) -> str:
        return self._fernet.decrypt(value.encode()).decode() if self._fernet else value


def ensure_stores(db: Session, settings: Settings) -> None:
    for config in settings.stores().values():
        store = db.scalar(select(Store).where(Store.store_key == config["store_key"]))
        if store is None:
            db.add(Store(**config))
        else:
            store.vendor = config["vendor"]
            store.timezone = config["timezone"]
    db.commit()


def parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value).replace("$", "").replace(",", "").replace("%", ""))
    except (InvalidOperation, ValueError):
        return None


def first(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row:
            return row[name]
    return None


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
    return None


def business_date(value: Any, fallback: date) -> str:
    parsed = parse_datetime(value)
    return (parsed.date() if parsed else fallback).isoformat()


def is_after(value: datetime | None, point: datetime) -> bool:
    if value is None:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value > point


def save_token(db: Session, settings: Settings, store: Store, payload: dict[str, Any]) -> ShopfrontToken:
    token = db.scalar(select(ShopfrontToken).where(ShopfrontToken.store_key == store.store_key))
    if token is None:
        token = ShopfrontToken(store_key=store.store_key, vendor=store.vendor, access_token="", refresh_token="")
        db.add(token)
    cipher = TokenCipher(settings.token_encryption_key)
    token.vendor = store.vendor
    token.access_token = cipher.encrypt(payload["access_token"])
    if payload.get("refresh_token"):
        token.refresh_token = cipher.encrypt(payload["refresh_token"])
    token.token_type = payload.get("token_type", "Bearer")
    token.scopes = payload.get("scope", settings.shopfront_scopes)
    token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 3600)))
    token.last_refresh_at = datetime.now(timezone.utc)
    token.status = "active"
    db.commit()
    return token


def get_client(settings: Settings, store: Store) -> ShopfrontClient:
    return ShopfrontClient(store.vendor, settings.shopfront_client_id, settings.shopfront_client_secret, settings.shopfront_redirect_uri, settings.shopfront_scopes)


async def access_token(db: Session, settings: Settings, store: Store) -> str:
    token = db.scalar(select(ShopfrontToken).where(ShopfrontToken.store_key == store.store_key))
    if token is None:
        raise ShopfrontError(f"Store {store.store_key} has not been authorized")
    cipher = TokenCipher(settings.token_encryption_key)
    if is_after(token.expires_at, datetime.now(timezone.utc) + timedelta(seconds=60)):
        return cipher.decrypt(token.access_token)
    client = get_client(settings, store)
    try:
        payload = await client.refresh_token(cipher.decrypt(token.refresh_token))
        save_token(db, settings, store, payload)
        refreshed = db.scalar(select(ShopfrontToken).where(ShopfrontToken.store_key == store.store_key))
        return cipher.decrypt(refreshed.access_token)
    except Exception:
        token.status = "expired"
        db.commit()
        raise
    finally:
        await client.close()


async def sync_store(db: Session, settings: Settings, store: Store, start: date, end: date, include_catalog: bool = True) -> SyncRun:
    run = SyncRun(store_key=store.store_key, from_date=start.isoformat(), to_date=end.isoformat())
    db.add(run)
    db.commit()
    client = get_client(settings, store)
    counts = {"summaries": 0, "sales": 0, "products": 0, "inventory": 0, "warnings": []}
    try:
        token = await access_token(db, settings, store)
        rows = await client.fetch_sales(token, start.isoformat(), end.isoformat())
        # Reporting returns transaction rows. Aggregate them by the transaction's
        # local business date and outlet before writing the daily summary table.
        aggregates: dict[tuple[str, str | None], dict[str, Any]] = {}
        for row in rows:
            timestamp = first(row, "timestamp", "Timestamp", "created_at", "createdAt")
            key = (business_date(timestamp, start), first(row, "by_name", "BY_NAME", "Name", "name", "outlet"))
            agg = aggregates.setdefault(key, {"revenue": Decimal(0), "cost": Decimal(0), "profit": Decimal(0), "count": 0, "row": row})
            agg["revenue"] += parse_decimal(first(row, "Revenue", "revenue")) or Decimal(0)
            agg["cost"] += parse_decimal(first(row, "Cost of Goods Sold", "cost")) or Decimal(0)
            agg["profit"] += parse_decimal(first(row, "Profit", "profit")) or Decimal(0)
            agg["count"] += 1
        for (summary_date, outlet), agg in aggregates.items():
            summary = db.scalar(select(DailySalesSummary).where(DailySalesSummary.store_key == store.store_key, DailySalesSummary.business_date == summary_date, DailySalesSummary.outlet == outlet))
            if summary is None:
                summary = DailySalesSummary(store_key=store.store_key, business_date=summary_date, outlet=outlet)
                db.add(summary)
            summary.revenue = agg["revenue"]
            summary.cost = agg["cost"]
            summary.profit = agg["profit"]
            summary.transaction_count = agg["count"]
            summary.tax = None
            summary.discount = None
            summary.source_range = {"start": start.isoformat(), "end": end.isoformat(), "rows": agg["count"]}
            summary.synced_at = datetime.now(timezone.utc)
            counts["summaries"] += 1
        for row in rows:
            sale_id = first(row, "ID", "id", "Sale ID", "sale_id")
            if sale_id:
                outlet = first(row, "by_name", "BY_NAME", "Name", "name", "outlet")
                sale = db.scalar(select(Sale).where(Sale.store_key == store.store_key, Sale.shopfront_sale_id == str(sale_id)))
                if sale is None:
                    sale = Sale(store_key=store.store_key, shopfront_sale_id=str(sale_id))
                    db.add(sale)
                sale.invoice_id = first(row, "Invoice ID", "invoice_id", "invoiceId")
                sale.status = first(row, "Status", "status")
                sale.created_at = parse_datetime(first(row, "createdAt", "created_at", "timestamp"))
                sale.updated_at = parse_datetime(first(row, "updatedAt", "updated_at"))
                sale.total_price = parse_decimal(first(row, "Total Price", "total_price", "Revenue", "revenue"))
                sale.total_tax = parse_decimal(first(row, "Tax Amount", "total_tax", "tax"))
                sale.total_discount = parse_decimal(first(row, "Discount Amount", "total_discount", "discount"))
                sale.total_cost = parse_decimal(first(row, "Cost", "cost"))
                sale.raw_payload = row
                if settings.shopfront_sale_detail_query:
                    try:
                        detail = await client.fetch_sale_detail(token, str(sale_id), settings.shopfront_sale_detail_query)
                        if isinstance(detail, dict):
                            sale.raw_payload = detail
                    except ShopfrontError:
                        # The report remains usable when a tenant's GraphQL schema lacks the optional detail query.
                        pass
                sale.synced_at = datetime.now(timezone.utc)
                counts["sales"] += 1
        if rows and counts["sales"] == 0:
            counts["warnings"].append({"stage": "sales", "message": "Reporting rows did not include a stable Sale ID; saved summaries only."})
        products = []
        if include_catalog:
            try:
                products = await client.fetch_products(token, settings.shopfront_products_query)
            except ShopfrontError as exc:
                # Catalog schema/permission problems must not discard successful sales data.
                products = []
                counts["warnings"].append({"stage": "products", "message": str(exc)[:500]})
        for item in products:
            product_id = first(item, "id", "ID")
            if not product_id:
                continue
            product = db.scalar(select(Product).where(Product.store_key == store.store_key, Product.shopfront_product_id == str(product_id)))
            if product is None:
                product = Product(store_key=store.store_key, shopfront_product_id=str(product_id))
                db.add(product)
            prices = item.get("prices") if isinstance(item.get("prices"), list) else []
            barcodes = item.get("barcodes") if isinstance(item.get("barcodes"), list) else []
            category = item.get("category") if isinstance(item.get("category"), dict) else {}
            brand = item.get("brand") if isinstance(item.get("brand"), dict) else {}
            product.sku = first(item, "sku", "SKU")
            product.barcode = first(item, "barcode", "Barcode") or (barcodes[0].get("code") if barcodes and isinstance(barcodes[0], dict) else None)
            product.name = first(item, "name", "Name")
            product.category = first(item, "categoryName") or category.get("name")
            product.brand = first(item, "brandName") or brand.get("name")
            product.cost = parse_decimal(first(item, "cost", "Cost"))
            product.price = parse_decimal(first(item, "price", "Price", "retailPrice")) or (parse_decimal(prices[0].get("price")) if prices and isinstance(prices[0], dict) else None)
            product.raw_payload = item
            product.synced_at = datetime.now(timezone.utc)
            counts["products"] += 1
            inventory = item.get("inventory")
            inventory_rows = inventory if isinstance(inventory, list) else ([inventory] if isinstance(inventory, dict) else [])
            for inventory_row in inventory_rows:
                quantity = first(inventory_row, "quantity", "Quantity")
                if quantity is not None:
                    db.add(InventorySnapshot(store_key=store.store_key, shopfront_product_id=str(product_id), quantity=parse_decimal(quantity), raw_payload=inventory_row))
                    counts["inventory"] += 1
        run.status, run.counts = "completed", counts
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        run.status, run.error, run.counts = "failed", str(exc)[:2000], counts
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    finally:
        await client.close()
    return run


def verify_webhook(raw_body: bytes, signature: str | None, signature_time: str | None, key: str) -> bool:
    if not signature or not signature_time or not key:
        return False
    expected = hmac.new(key.encode(), signature_time.encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def make_state() -> str:
    return secrets.token_urlsafe(32)
