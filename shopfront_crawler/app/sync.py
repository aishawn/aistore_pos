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
from .models import DailySalesSummary, InventorySnapshot, Product, Sale, SaleItem, ShopfrontToken, Store, SyncRun
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


def _non_empty(value: Any) -> bool:
    return value is not None and value != "" and value != [] and value != {}


def _upsert_sale_product(
    db: Session,
    store_key: str,
    product_id: str,
    source_product: dict[str, Any],
    sale_item: dict[str, Any],
    cache: dict[str, Product] | None = None,
) -> Product:
    """Promote the product embedded in a SaleItem into the catalog mirror.

    Shopfront's current products query only returns the current catalog. Older
    sales can reference products that are no longer in that catalog, but their
    SaleItem still contains the name, barcode and image metadata needed to
    render the historical sale and to create an auditable POS product.
    """
    product = cache.get(product_id) if cache is not None else None
    if product is None:
        product = db.scalar(select(Product).where(
            Product.store_key == store_key,
            Product.shopfront_product_id == product_id,
        ))
    if product is None:
        product = Product(store_key=store_key, shopfront_product_id=product_id)
        db.add(product)
    if cache is not None:
        # A date range can contain many SaleItems for the same product. Keep
        # one pending ORM instance so a later row cannot enqueue a duplicate
        # INSERT before the transaction is flushed.
        cache[product_id] = product

    incoming = dict(source_product) if isinstance(source_product, dict) else {}
    incoming.setdefault("id", product_id)
    name = first(incoming, "name", "Name") or first(sale_item, "productName", "name")
    if name and not incoming.get("name"):
        incoming["name"] = name
    barcodes = incoming.get("barcodes") if isinstance(incoming.get("barcodes"), list) else []
    barcode = first(incoming, "barcode", "Barcode")
    if not barcode and barcodes and isinstance(barcodes[0], dict):
        barcode = barcodes[0].get("code")
    if barcode and not incoming.get("barcode"):
        incoming["barcode"] = barcode
    if not incoming.get("prices") and _non_empty(first(sale_item, "basePrice", "unitPrice")):
        incoming["prices"] = [{"quantity": 1, "price": first(sale_item, "basePrice", "unitPrice")}]
    if not _non_empty(first(incoming, "cost", "Cost")) and _non_empty(sale_item.get("cost")):
        incoming["cost"] = sale_item.get("cost")

    existing_raw = dict(product.raw_payload) if isinstance(product.raw_payload, dict) else {}
    merged_raw = dict(existing_raw)
    for key, value in incoming.items():
        if _non_empty(value) or key not in merged_raw:
            merged_raw[key] = value
    product.raw_payload = merged_raw
    # Older imports created ``Shopfront <source_id>`` placeholders before the
    # complete SaleItem query was enabled. Replace those placeholders when a
    # real source name arrives, while keeping an already meaningful catalog
    # name stable.
    if name and (not product.name or str(product.name).strip().startswith("Shopfront ")):
        product.name = str(name)
    incoming_sku = first(incoming, "sku", "SKU", "mdbId", "MDB ID")
    if incoming_sku and not product.sku:
        product.sku = str(incoming_sku)
    if barcode and not product.barcode:
        product.barcode = str(barcode)
    incoming_cost = parse_decimal(first(incoming, "cost", "Cost"))
    if incoming_cost is not None and product.cost is None:
        product.cost = incoming_cost
    incoming_price = parse_decimal(first(incoming, "price", "Price", "retailPrice", "basePrice"))
    if incoming_price is None:
        prices = incoming.get("prices") if isinstance(incoming.get("prices"), list) else []
        if prices and isinstance(prices[0], dict):
            incoming_price = parse_decimal(first(prices[0], "price", "Price"))
    if incoming_price is None:
        incoming_price = parse_decimal(first(sale_item, "basePrice", "unitPrice"))
    if incoming_price is not None and product.price is None:
        product.price = incoming_price
    product.synced_at = datetime.now(timezone.utc)
    return product


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
    counts = {"summaries": 0, "sales": 0, "products": 0, "products_from_sales": 0, "inventory": 0, "warnings": []}
    sale_product_ids: set[str] = set()
    sale_products: dict[str, Product] = {}
    try:
        token = await access_token(db, settings, store)
        rows: list[dict[str, Any]] = []
        try:
            rows = await client.fetch_sales(token, start.isoformat(), end.isoformat())
        except ShopfrontError as exc:
            counts["warnings"].append({"stage": "sales_report", "message": str(exc)[:500]})
        sale_rows: list[dict[str, Any]] = []
        try:
            sale_rows = await client.fetch_sales_graphql(token, start.isoformat(), end.isoformat())
        except ShopfrontError as exc:
            counts["warnings"].append({"stage": "sales_detail", "message": str(exc)[:500]})
        # Reporting rows are the authoritative source for daily aggregates. The
        # GraphQL rows below are the authoritative source for complete sales.
        aggregates: dict[tuple[str, str | None], dict[str, Any]] = {}
        for row in rows:
            timestamp = first(row, "timestamp", "Timestamp", "created_at", "createdAt")
            key = (business_date(timestamp, start), first(row, "by_name", "BY_NAME", "Name", "name", "outlet"))
            agg = aggregates.setdefault(key, {"revenue": Decimal(0), "cost": Decimal(0), "profit": Decimal(0), "count": 0, "row": row})
            agg["revenue"] += parse_decimal(first(row, "Revenue", "revenue")) or Decimal(0)
            agg["cost"] += parse_decimal(first(row, "Cost of Goods Sold", "cost")) or Decimal(0)
            agg["profit"] += parse_decimal(first(row, "Profit", "profit")) or Decimal(0)
            agg["count"] += 1
        if not rows and sale_rows:
            # Reporting has occasional date-specific 400 responses. GraphQL
            # still contains the complete Sale records, so use it as the
            # aggregate source for that range instead of dropping the day.
            for row in sale_rows:
                timestamp = first(row, "createdAt", "created_at", "timestamp")
                key = (business_date(timestamp, start), first(row, "outlet", "outletName", "outlet_name"))
                agg = aggregates.setdefault(key, {"revenue": Decimal(0), "cost": Decimal(0), "profit": Decimal(0), "count": 0, "row": row})
                revenue = parse_decimal(first(row, "totalPrice", "total_price")) or Decimal(0)
                cost = parse_decimal(first(row, "totalCost", "total_cost")) or Decimal(0)
                agg["revenue"] += revenue
                agg["cost"] += cost
                agg["profit"] += revenue - cost
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
        for sale_index, row in enumerate(sale_rows, start=1):
            sale_id = first(row, "ID", "id", "Sale ID", "sale_id")
            if sale_id:
                sale = db.scalar(select(Sale).where(Sale.store_key == store.store_key, Sale.shopfront_sale_id == str(sale_id)))
                if sale is None:
                    sale = Sale(store_key=store.store_key, shopfront_sale_id=str(sale_id))
                    db.add(sale)
                    db.flush()
                sale.invoice_id = first(row, "Invoice ID", "invoice_id", "invoiceId")
                sale.status = first(row, "Status", "status")
                sale.created_at = parse_datetime(first(row, "createdAt", "created_at", "timestamp"))
                sale.updated_at = parse_datetime(first(row, "updatedAt", "updated_at"))
                sale.total_price = parse_decimal(first(row, "Total Price", "total_price", "totalPrice", "Revenue", "revenue"))
                sale.total_tax = parse_decimal(first(row, "Tax Amount", "total_tax", "totalTax", "tax"))
                sale.total_discount = parse_decimal(first(row, "Discount Amount", "total_discount", "totalDiscount", "discount"))
                sale.total_cost = parse_decimal(first(row, "Cost", "cost", "totalCost"))
                sale.customer_reference = first(row, "clientId", "client_id", "customerReference")
                sale.raw_payload = row
                if settings.shopfront_sale_detail_query:
                    try:
                        detail = await client.fetch_sale_detail(token, str(sale_id), settings.shopfront_sale_detail_query)
                        if isinstance(detail, dict):
                            sale.raw_payload = detail
                    except ShopfrontError:
                        # The report remains usable when a tenant's GraphQL schema lacks the optional detail query.
                        pass
                for item in row.get("items", []) if isinstance(row.get("items"), list) else []:
                    item_id = first(item, "id", "ID")
                    product = item.get("item") if isinstance(item.get("item"), dict) else {}
                    if not item_id:
                        continue
                    product_id = str(product.get("id") or item_id)
                    sale_product_ids.add(product_id)
                    _upsert_sale_product(db, store.store_key, product_id, product, item, sale_products)
                    line_key = str(item_id)
                    sale_item = db.scalar(select(SaleItem).where(SaleItem.sale_id == sale.id, SaleItem.line_key == line_key))
                    # Rows created by older versions have no line_key. Reuse a
                    # legacy row for the first matching line instead of making
                    # every retry duplicate it.
                    if sale_item is None:
                        sale_item = db.scalar(select(SaleItem).where(
                            SaleItem.sale_id == sale.id,
                            SaleItem.shopfront_product_id == product_id,
                            SaleItem.line_key.is_(None),
                        ))
                    if sale_item is None:
                        sale_item = SaleItem(sale_id=sale.id, line_key=line_key, shopfront_product_id=product_id)
                        db.add(sale_item)
                    sale_item.line_key = line_key
                    sale_item.quantity = parse_decimal(first(item, "quantity", "Quantity"))
                    sale_item.unit_price = parse_decimal(first(item, "basePrice", "unitPrice"))
                    sale_item.line_total = parse_decimal(first(item, "totalPrice", "lineTotal"))
                    sale_item.cost = parse_decimal(first(item, "cost", "Cost"))
                    sale_item.tax = parse_decimal(first(item, "tax", "Tax"))
                    # Shopfront puts the product fields under SaleItem.item.
                    # Older queries only requested item.id, so retain the
                    # top-level fallbacks for tenants with legacy payloads.
                    sale_item.product_name = first(item, "productName", "name") or first(
                        product, "name", "displayName", "title"
                    )
                    # Some Shopfront tenants return only ``item.id`` from the
                    # Sale connection even when the inline Product fields are
                    # requested. Fall back to the catalog already stored by
                    # the crawler so POS sale lines retain a real name.
                    if not sale_item.product_name:
                        catalog_product = db.scalar(select(Product).where(
                            Product.store_key == store.store_key,
                            Product.shopfront_product_id == product_id,
                        ))
                        if catalog_product and catalog_product.name:
                            sale_item.product_name = catalog_product.name
                    sale_item.raw_payload = item
                sale.synced_at = datetime.now(timezone.utc)
                counts["sales"] += 1
                # Do not hold SQLite's writer lock for the duration of a
                # large GraphQL history window. This also makes a completed
                # subset durable if the process is restarted mid-chunk.
                if sale_index % 50 == 0:
                    db.commit()
        if sale_rows:
            db.commit()
        if rows and not sale_rows:
            counts["warnings"].append({"stage": "sales", "message": "Complete Sale query returned no rows; saved summaries only."})
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
            product.sku = first(item, "sku", "SKU", "mdbId", "MDB ID")
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
                    outlet = inventory_row.get("outlet") if isinstance(inventory_row.get("outlet"), dict) else {}
                    outlet_id = first(inventory_row, "outletId") or outlet.get("id") or "unknown"
                    outlet_name = first(inventory_row, "outletName") or outlet.get("name")
                    # SessionLocal intentionally disables autoflush. Flush a
                    # newly seen row before the lookup so duplicate outlet
                    # entries in one GraphQL response are still idempotent.
                    db.flush()
                    existing_inventory = db.scalar(select(InventorySnapshot).where(
                        InventorySnapshot.store_key == store.store_key,
                        InventorySnapshot.shopfront_product_id == str(product_id),
                        InventorySnapshot.outlet_id == (str(outlet_id) if outlet_id is not None else None),
                    ))
                    if existing_inventory is None:
                        existing_inventory = InventorySnapshot(
                            store_key=store.store_key,
                            shopfront_product_id=str(product_id),
                            outlet_id=str(outlet_id) if outlet_id is not None else None,
                        )
                        db.add(existing_inventory)
                    existing_inventory.outlet_name = str(outlet_name) if outlet_name is not None else None
                    existing_inventory.quantity = parse_decimal(quantity)
                    existing_inventory.inventory_timestamp = datetime.now(timezone.utc)
                    existing_inventory.raw_payload = inventory_row
                    counts["inventory"] += 1
        # Catalog sync normally runs after sales sync in the same transaction.
        # Backfill historical SaleItem names after the catalog is available so
        # rerunning a date range repairs old rows without a full reimport.
        catalog_names = {
            product.shopfront_product_id: product.name
            for product in db.scalars(select(Product).where(Product.store_key == store.store_key)).all()
            if product.name
        }
        if catalog_names:
            sale_items = db.scalars(
                select(SaleItem).join(Sale, SaleItem.sale_id == Sale.id).where(Sale.store_key == store.store_key)
            ).all()
            for sale_item in sale_items:
                if not sale_item.product_name:
                    name = catalog_names.get(sale_item.shopfront_product_id)
                    if name:
                        sale_item.product_name = name
        counts["products_from_sales"] = len(sale_product_ids)
        counts["product_source_ids"] = sorted(sale_product_ids)
        run.status, run.counts = "completed", counts
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
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
