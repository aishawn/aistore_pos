import hashlib
import hmac
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from sqlalchemy import select, text
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


def merge_sale_detail(row: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    """Merge a complete Sale response without discarding report fields."""
    merged = dict(row)
    for key, value in detail.items():
        # A detail response is authoritative when it supplies a value, but a
        # partial response must not erase items/payments already present.
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


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


def business_date(value: Any, fallback: date, timezone_name: str = "Australia/Adelaide") -> str:
    parsed = parse_datetime(value)
    if parsed is None:
        return fallback.isoformat()
    try:
        local_zone = ZoneInfo(timezone_name)
    except (KeyError, ValueError):
        local_zone = timezone.utc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_zone)
    return parsed.astimezone(local_zone).date().isoformat()


def _non_empty(value: Any) -> bool:
    return value is not None and value != "" and value != [] and value != {}


def _sale_is_complete_and_unchanged(
    sale: Sale,
    row: dict[str, Any],
    existing_line_count: int,
) -> bool:
    """Return True only when a historical retry is genuinely safe to skip.

    A Sale ID alone is not an idempotency shortcut: Shopfront can modify,
    cancel, refund, or finish uploading a sale after the first report.  The
    fast path therefore requires a matching source update timestamp/status,
    complete line items and a payments field in both payloads.
    """
    incoming_updated = parse_datetime(first(row, "updatedAt", "updated_at"))
    payload = sale.raw_payload if isinstance(sale.raw_payload, dict) else {}
    # Some Shopfront report variants omit updatedAt. In that case compare the
    # immutable business fields and structured children against the stored
    # payload. This keeps retries fast while still detecting edits.
    if incoming_updated is not None and sale.updated_at is not None:
        incoming_cmp = incoming_updated.replace(tzinfo=timezone.utc) if incoming_updated.tzinfo is None else incoming_updated.astimezone(timezone.utc)
        stored_cmp = sale.updated_at.replace(tzinfo=timezone.utc) if sale.updated_at.tzinfo is None else sale.updated_at.astimezone(timezone.utc)
        if incoming_cmp != stored_cmp:
            return False
    elif incoming_updated is None and sale.updated_at is not None:
        stored_updated = payload.get("updatedAt") or payload.get("updated_at")
        if stored_updated and str(stored_updated) != str(first(row, "updatedAt", "updated_at")):
            return False
    if first(row, "Status", "status") != sale.status:
        return False
    # Once the source version and status match, the sale is already mirrored.
    # Nested GraphQL fields are intentionally not used as a gate because older
    # rows can have equivalent data with a different field shape.
    if incoming_updated is not None and sale.updated_at is not None:
        return True
    items = row.get("items")
    if not isinstance(items, list) or not items:
        return False
    if len(items) != existing_line_count:
        return False
    if any(
        not isinstance(item, dict)
        or not ((item.get("item") or {}).get("id") or first(item, "id", "ID"))
        for item in items
    ):
        return False
    if not isinstance(row.get("payments"), list) or not isinstance(payload.get("payments"), list):
        return False
    # The source update timestamp and status are the authoritative version
    # markers. GraphQL may reorder/shape nested fields between requests, so do
    # not require byte-for-byte equality of items/payments here.
    for field_names in (("totalPrice", "total_price", "Total Price"), ("totalTax", "total_tax", "Tax Amount"), ("totalDiscount", "total_discount", "Discount Amount"), ("totalCost", "total_cost", "Cost")):
        incoming_value = first(row, *field_names)
        stored_value = first(payload, *field_names)
        if incoming_value is not None and stored_value is not None and str(incoming_value) != str(stored_value):
            return False
    return True


def _dedupe_sales(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Collapse duplicate GraphQL edges while retaining the fullest Sale.

    Shopfront can repeat an edge when a date window crosses a pagination
    boundary. The database and POS use Sale ID as the idempotency key, so
    counting every returned edge would make a healthy import look incomplete.
    Merge optional fields from repeated edges and prefer the payload with
    more line items or payments.
    """
    unique: dict[str, dict[str, Any]] = {}
    without_id: list[dict[str, Any]] = []
    duplicates = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        sale_id = first(row, "ID", "id", "Sale ID", "sale_id")
        if not sale_id:
            without_id.append(row)
            continue
        key = str(sale_id)
        existing = unique.get(key)
        if existing is None:
            unique[key] = row
            continue
        duplicates += 1
        for field, value in row.items():
            if _non_empty(value) and not _non_empty(existing.get(field)):
                existing[field] = value
        for field in ("items", "payments"):
            incoming = row.get(field)
            current = existing.get(field)
            if isinstance(incoming, list) and (not isinstance(current, list) or len(incoming) > len(current)):
                existing[field] = incoming
    return list(unique.values()) + without_id, duplicates


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


async def sync_store(
    db: Session,
    settings: Settings,
    store: Store,
    start: date,
    end: date,
    include_catalog: bool = True,
    defer_completion: bool = False,
) -> SyncRun:
    run = SyncRun(store_key=store.store_key, from_date=start.isoformat(), to_date=end.isoformat())
    db.add(run)
    db.commit()
    client = get_client(settings, store)
    counts = {"summaries": 0, "sales": 0, "products": 0, "products_from_sales": 0, "inventory": 0, "warnings": []}
    sale_product_ids: set[str] = set()
    sale_products: dict[str, Product] = {}
    try:
        # A blocked lock or malformed database statement must fail the chunk
        # and be retried by the scheduler. Without a server-side timeout the
        # worker can remain stuck forever after a checkpoint.
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SET statement_timeout = '30s'"))
        token = await access_token(db, settings, store)
        rows: list[dict[str, Any]] = []
        sale_rows: list[dict[str, Any]] = []
        try:
            sale_rows = await client.fetch_sales_graphql(token, start.isoformat(), end.isoformat(), store.timezone)
        except ShopfrontError as exc:
            counts["warnings"].append({"stage": "sales_detail", "message": str(exc)[:500]})
        # Complete GraphQL Sale records are authoritative for summaries because
        # they contain each transaction timestamp, stable ID, payments and line
        # items. Reporting is range-aggregated, so use it only as a degraded
        # fallback when the complete Sale query is unavailable.
        if not sale_rows:
            try:
                rows = await client.fetch_sales(token, start.isoformat(), end.isoformat())
            except ShopfrontError as exc:
                counts["warnings"].append({"stage": "sales_report", "message": str(exc)[:500]})
        sale_rows, duplicate_sales = _dedupe_sales(sale_rows)
        if duplicate_sales:
            counts["duplicate_sales_collapsed"] = duplicate_sales
        # Reporting rows are the authoritative source for daily aggregates. The
        # GraphQL rows below are the authoritative source for complete sales.
        aggregates: dict[tuple[str, str | None], dict[str, Any]] = {}
        for row in rows:
            timestamp = first(row, "timestamp", "Timestamp", "created_at", "createdAt")
            key = (business_date(timestamp, start, store.timezone), first(row, "by_name", "BY_NAME", "Name", "name", "outlet"))
            agg = aggregates.setdefault(key, {"revenue": Decimal(0), "cost": Decimal(0), "profit": Decimal(0), "tax": Decimal(0), "discount": Decimal(0), "count": 0, "row": row})
            agg["revenue"] += parse_decimal(first(row, "Revenue", "revenue")) or Decimal(0)
            agg["cost"] += parse_decimal(first(row, "Cost of Goods Sold", "cost")) or Decimal(0)
            agg["profit"] += parse_decimal(first(row, "Profit", "profit")) or Decimal(0)
            agg["tax"] += parse_decimal(first(row, "Tax", "tax", "Tax Amount", "totalTax")) or Decimal(0)
            agg["discount"] += parse_decimal(first(row, "Discount", "discount", "Discount Amount", "totalDiscount")) or Decimal(0)
            agg["count"] += 1
        if not rows and sale_rows:
            # Reporting has occasional date-specific 400 responses. GraphQL
            # still contains the complete Sale records, so use it as the
            # aggregate source for that range instead of dropping the day.
            for row in sale_rows:
                timestamp = first(row, "createdAt", "created_at", "timestamp")
                key = (business_date(timestamp, start, store.timezone), first(row, "outlet", "outletName", "outlet_name"))
                agg = aggregates.setdefault(key, {"revenue": Decimal(0), "cost": Decimal(0), "profit": Decimal(0), "tax": Decimal(0), "discount": Decimal(0), "count": 0, "row": row})
                revenue = parse_decimal(first(row, "totalPrice", "total_price")) or Decimal(0)
                cost = parse_decimal(first(row, "totalCost", "total_cost")) or Decimal(0)
                agg["revenue"] += revenue
                agg["cost"] += cost
                agg["profit"] += revenue - cost
                agg["tax"] += parse_decimal(first(row, "totalTax", "total_tax", "tax")) or Decimal(0)
                agg["discount"] += parse_decimal(first(row, "totalDiscount", "total_discount", "discount")) or Decimal(0)
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
            summary.tax = agg["tax"]
            summary.discount = agg["discount"]
            summary.source_range = {"start": start.isoformat(), "end": end.isoformat(), "rows": agg["count"]}
            summary.synced_at = datetime.now(timezone.utc)
            counts["summaries"] += 1
        # Load the existing rows for this window once. Per-sale ORM lookups
        # made history retries needlessly slow and amplified SQLite lock
        # contention. The maps preserve the same idempotent upsert behavior.
        source_sale_ids = [
            str(first(row, "ID", "id", "Sale ID", "sale_id"))
            for row in sale_rows
            if first(row, "ID", "id", "Sale ID", "sale_id")
        ]
        existing_sales = {
            str(sale.shopfront_sale_id): sale
            for sale in db.scalars(select(Sale).where(
                Sale.store_key == store.store_key,
                Sale.shopfront_sale_id.in_(source_sale_ids),
            )).all()
        } if source_sale_ids else {}
        existing_items = db.scalars(select(SaleItem).join(Sale, SaleItem.sale_id == Sale.id).where(
            Sale.store_key == store.store_key,
            Sale.shopfront_sale_id.in_(source_sale_ids),
        )).all() if source_sale_ids else []
        sale_items_by_key = {
            (item.sale_id, str(item.line_key)): item
            for item in existing_items
            if item.line_key is not None
        }
        existing_line_counts: dict[int, int] = {}
        for item in existing_items:
            existing_line_counts[item.sale_id] = existing_line_counts.get(item.sale_id, 0) + 1
        legacy_items_by_product = {
            (item.sale_id, str(item.shopfront_product_id)): item
            for item in existing_items
            if item.line_key is None and item.shopfront_product_id
        }
        source_product_ids = {
            str((item.get("item") or {}).get("id") or first(item, "id", "ID"))
            for row in sale_rows
            for item in (row.get("items") if isinstance(row.get("items"), list) else [])
            if isinstance(item, dict) and ((item.get("item") or {}).get("id") or first(item, "id", "ID"))
        }
        if source_product_ids:
            sale_products.update({
                str(product.shopfront_product_id): product
                for product in db.scalars(select(Product).where(
                    Product.store_key == store.store_key,
                    Product.shopfront_product_id.in_(source_product_ids),
                )).all()
            })
        for sale_index, row in enumerate(sale_rows, start=1):
            # Persist a heartbeat before each batch. This makes the exact
            # blocking sale visible through the status API even if the next
            # database operation never returns.
            if sale_index == 1 or (sale_index - 1) % 10 == 0:
                counts["sales_fetched"] = len(sale_rows)
                counts["sales_processed"] = sale_index - 1
                counts["stage"] = "sales"
                counts["current_sale_index"] = sale_index
                counts["current_sale_id"] = first(row, "ID", "id", "Sale ID", "sale_id")
                run.counts = counts
                db.commit()
            sale_id = first(row, "ID", "id", "Sale ID", "sale_id")
            counts["phase"] = "sale_lookup"
            counts["current_sale_id"] = sale_id
            run.counts = counts
            if sale_id:
                sale = existing_sales.get(str(sale_id))
                # A retry of an already mirrored sale should be a cheap idempotent
                # no-op. Rewriting the full JSON payload and every line for
                # already mirrored sales keeps SQLite in a long write
                # transaction and can make the worker appear stuck on the
                # first row of a historical window. Modified or incomplete
                # sales are handled by the dedicated repair task, while new
                # sales still take the full upsert path below.
                if (
                    sale is not None
                    and sale.id is not None
                    and _sale_is_complete_and_unchanged(
                        sale,
                        row,
                        existing_line_counts.get(sale.id, 0),
                    )
                ):
                    counts["sales"] += 1
                    counts["sales_skipped_unchanged"] = counts.get("sales_skipped_unchanged", 0) + 1
                    counts["phase"] = "sale_skipped_unchanged"
                    if sale_index % 10 == 0:
                        counts["sales_fetched"] = len(sale_rows)
                        counts["sales_processed"] = sale_index
                        counts["stage"] = "sales"
                        counts["current_sale_index"] = sale_index + 1
                        counts["current_sale_id"] = None
                        run.counts = counts
                        db.commit()
                    continue
                if sale is None:
                    sale = Sale(store_key=store.store_key, shopfront_sale_id=str(sale_id))
                    db.add(sale)
                    db.flush()
                    existing_sales[str(sale_id)] = sale
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
                # The complete sales GraphQL query already requests item,
                # payment and product metadata. An optional per-sale detail
                # query is expensive, so use it only for incomplete rows.
                row_items = row.get("items") if isinstance(row.get("items"), list) else []
                row_has_product_metadata = bool(row_items) and all(
                    isinstance(line, dict)
                    and isinstance(line.get("item"), dict)
                    and bool(first(line.get("item", {}), "name", "displayName", "title"))
                    for line in row_items
                )
                row_has_payments = isinstance(row.get("payments"), list)
                if settings.shopfront_sale_detail_query and (not row_has_product_metadata or not row_has_payments):
                    try:
                        detail = await client.fetch_sale_detail(token, str(sale_id), settings.shopfront_sale_detail_query)
                        if isinstance(detail, dict):
                            # Detail queries often contain the only complete
                            # items/payments payload. Merge it into the row
                            # before processing structured fields so names,
                            # images and payments are not stranded in JSON.
                            row = merge_sale_detail(row, detail)
                            sale.raw_payload = row
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
                    sale_item = sale_items_by_key.get((sale.id, line_key))
                    # Rows created by older versions have no line_key. Reuse a
                    # legacy row for the first matching line instead of making
                    # every retry duplicate it.
                    if sale_item is None:
                        sale_item = legacy_items_by_product.get((sale.id, product_id))
                    if sale_item is None:
                        sale_item = SaleItem(sale_id=sale.id, line_key=line_key, shopfront_product_id=product_id)
                        db.add(sale_item)
                    sale_items_by_key[(sale.id, line_key)] = sale_item
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
                if sale_index % 10 == 0:
                    counts["sales_fetched"] = len(sale_rows)
                    counts["sales_processed"] = sale_index
                    counts["stage"] = "sales"
                    counts["current_sale_index"] = sale_index + 1
                    counts["current_sale_id"] = None
                    run.counts = counts
                    db.commit()
            counts["phase"] = "sale_processed"
        if sale_rows:
            db.commit()
            # The periodic checkpoint above intentionally updates progress in
            # batches, but the final run record must report the exact number
            # processed rather than the last checkpoint (for example 2500 of
            # 2526). This is used by reconciliation and retry decisions.
            counts["sales_fetched"] = len(sale_rows)
            counts["sales_processed"] = len(sale_rows)
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
        run.status, run.counts = ("running" if defer_completion else "completed"), counts
        run.finished_at = None if defer_completion else datetime.now(timezone.utc)
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
