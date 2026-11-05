import hashlib
import hmac
import secrets
import asyncio
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import Settings
from .models import DailySalesSummary, InventorySnapshot, InventorySnapshotManifest, Product, Sale, SaleItem, ShopfrontCustomer, ShopfrontExtendedRecord, ShopfrontPurchaseOrder, ShopfrontSupplier, ShopfrontToken, Store, SyncRun
from .pos import OrithosClient, PosIntegrationError
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


def sale_tax_amount(row: dict[str, Any], *, line: bool = False) -> Decimal | None:
    """Amounts only: never interpret a tax rate/name as a monetary amount.

    Preserve explicit zero; null aliases must not hide the supplied amount.
    Conflicting aliases are unresolved evidence, not a reason to select one.
    """
    names = ("tax", "Tax", "taxAmount", "tax_amount") if line else ("Tax Amount", "total_tax", "totalTax", "taxAmount", "tax")
    values = []
    for name in names:
        if row.get(name) is None or row.get(name) == "":
            continue
        value = parse_decimal(row[name])
        if value is None or not value.is_finite():
            return None
        values.append(value)
    return values[0] if values and all(value == values[0] for value in values) else None


def merge_sale_detail(row: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    """Merge a complete Sale response without discarding report fields."""
    merged = dict(row)
    for key, value in detail.items():
        # A detail response is authoritative when it supplies a value, but a
        # partial response must not erase items/payments already present.
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


async def enrich_sale_detail(
    client: Any,
    token: str,
    sale_id: str,
    row: dict[str, Any],
    query: str,
    warnings: list[dict[str, str]],
    *,
    timeout_seconds: float = 30,
) -> dict[str, Any]:
    items = row.get("items") if isinstance(row.get("items"), list) else []
    has_product_metadata = bool(items) and all(
        isinstance(line, dict)
        and isinstance(line.get("item"), dict)
        and bool(first(line.get("item", {}), "name", "displayName", "title"))
        for line in items
    )
    has_payments = isinstance(row.get("payments"), list)
    if not query or (has_product_metadata and has_payments):
        return row
    try:
        detail = await asyncio.wait_for(
            client.fetch_sale_detail(token, sale_id, query),
            timeout=timeout_seconds,
        )
    except (ShopfrontError, asyncio.TimeoutError):
        warnings.append({
            "stage": "sale_detail",
            "sale_id": sale_id,
            "message": "Optional sale detail unavailable; retained the complete-sale query payload.",
        })
        return row
    return merge_sale_detail(row, detail) if isinstance(detail, dict) else row


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


def shelf_unit_price(item: dict[str, Any]) -> Decimal | None:
    """Use the quantity-1 price tier. The first tier can be a case price."""
    prices = item.get("prices") if isinstance(item.get("prices"), list) else []
    for row in prices:
        if isinstance(row, dict) and parse_decimal(row.get("quantity")) == Decimal("1"):
            price = parse_decimal(first(row, "price", "Price"))
            if price is not None:
                return price
    return parse_decimal(first(item, "price", "Price", "retailPrice"))


def _non_empty(value: Any) -> bool:
    return value is not None and value != "" and value != [] and value != {}


_SENSITIVE_SUPPLIER_KEYS = {"authentication", "username", "password", "accountnumber", "token", "accesstoken", "refreshtoken", "apitoken", "apikey", "secret"}


def without_credentials(value: Any) -> Any:
    """Remove credential and account-number fields before persisting source payloads."""
    if isinstance(value, dict):
        return {
            key: without_credentials(item)
            for key, item in value.items()
            if re.sub(r"[^a-z]", "", str(key).lower()) not in _SENSITIVE_SUPPLIER_KEYS
        }
    if isinstance(value, list):
        return [without_credentials(item) for item in value]
    return value


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
    # A richer query can reveal historical refund/pack evidence without the
    # source changing updatedAt. Do not skip that evidence enrichment.
    for key in ("linkedSale", "totalRounding"):
        if key in row and (key not in payload or row[key] != payload[key]):
            return False
    stored_items = {str(item.get("id")): item for item in payload.get("items") or [] if isinstance(item, dict) and item.get("id")}
    for item in row.get("items") or []:
        if not isinstance(item, dict):
            continue
        stored_item = stored_items.get(str(item.get("id")), {})
        for key in ("caseQuantity", "metaData"):
            if key in item and (key not in stored_item or item[key] != stored_item[key]):
                return False
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
        incoming_price = shelf_unit_price(incoming)
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


async def sync_supply_chain(db: Session, settings: Settings, store: Store) -> dict[str, int]:
    if not settings.shopfront_enable_supply_chain:
        raise ShopfrontError("Supply-chain sync is disabled; grant see_suppliers and see_stock_management, then enable SHOPFRONT_ENABLE_SUPPLY_CHAIN and re-authorize")
    token = await access_token(db, settings, store)
    client = get_client(settings, store)
    counts = {"suppliers": 0, "purchase_orders": 0}
    try:
        suppliers = await client.fetch_suppliers(token)
        orders = await client.fetch_purchase_orders(token)
        now = datetime.now(timezone.utc)
        for source in suppliers:
            source_id = str(source.get("id") or "").strip()
            if not source_id:
                continue
            row = db.scalar(select(ShopfrontSupplier).where(ShopfrontSupplier.store_key == store.store_key, ShopfrontSupplier.source_id == source_id))
            if row is None:
                row = ShopfrontSupplier(store_key=store.store_key, source_id=source_id)
                db.add(row)
            row.name = source.get("name")
            row.business_number = source.get("businessNumber")
            row.status = source.get("status")
            row.raw_payload = without_credentials(source)
            row.synced_at = now
            counts["suppliers"] += 1
        for source in orders:
            source_id = str(source.get("id") or "").strip()
            if not source_id:
                continue
            row = db.scalar(select(ShopfrontPurchaseOrder).where(ShopfrontPurchaseOrder.store_key == store.store_key, ShopfrontPurchaseOrder.source_id == source_id))
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
            counts["purchase_orders"] += 1
        db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        await client.close()


async def sync_customers(db: Session, settings: Settings, store: Store) -> dict[str, int]:
    if not settings.shopfront_enable_customers:
        raise ShopfrontError("Customer sync is disabled; enable SHOPFRONT_ENABLE_CUSTOMERS and re-authorize Shopfront")
    token = await access_token(db, settings, store)
    client = get_client(settings, store)
    count = 0
    try:
        customers = await client.fetch_customers(token)
        now = datetime.now(timezone.utc)
        for source in customers:
            source_id = str(source.get("id") or "").strip()
            if not source_id:
                continue
            row = db.scalar(select(ShopfrontCustomer).where(
                ShopfrontCustomer.store_key == store.store_key,
                ShopfrontCustomer.source_id == source_id,
            ))
            if row is None:
                row = ShopfrontCustomer(store_key=store.store_key, source_id=source_id)
                db.add(row)
            emails = source.get("emails") if isinstance(source.get("emails"), list) else []
            group = source.get("customerGroup") if isinstance(source.get("customerGroup"), dict) else {}
            row.client_id = source.get("clientId")
            row.code = source.get("code")
            row.name = source.get("name")
            row.first_name = source.get("firstName")
            row.last_name = source.get("lastName")
            row.company = source.get("company")
            row.email = str(emails[0]) if emails else None
            row.phone = source.get("phone")
            row.mobile = source.get("mobile")
            row.customer_group = group.get("name")
            row.loyalty_points = parse_decimal(source.get("loyaltyPoints"))
            row.current_owing = parse_decimal(source.get("currentOwing"))
            row.deleted = bool(source.get("deleted")) if source.get("deleted") is not None else None
            row.raw_payload = without_credentials(source)
            row.synced_at = now
            balance_date = now.astimezone(ZoneInfo(store.timezone)).date().isoformat()
            balance_id = f"{source_id}:{balance_date}"
            balance = db.scalar(select(ShopfrontExtendedRecord).where(
                ShopfrontExtendedRecord.store_key == store.store_key,
                ShopfrontExtendedRecord.entity_type == "customer_balances",
                ShopfrontExtendedRecord.source_id == balance_id,
            ))
            if balance is None:
                balance = ShopfrontExtendedRecord(
                    store_key=store.store_key,
                    entity_type="customer_balances",
                    source_id=balance_id,
                )
                db.add(balance)
            balance.raw_payload = without_credentials({
                "customerId": source_id,
                "clientId": source.get("clientId"),
                "code": source.get("code"),
                "currentOwing": source.get("currentOwing"),
                "accountLimit": source.get("accountLimit"),
                "updatedAt": source.get("updatedAt"),
                "snapshotAt": now.isoformat(),
            })
            balance.synced_at = now
            count += 1
        db.commit()
        return {"customers": count}
    except Exception:
        db.rollback()
        raise
    finally:
        await client.close()


async def sync_extended_data(db: Session, settings: Settings, store: Store) -> dict[str, Any]:
    token = await access_token(db, settings, store)
    client = get_client(settings, store)
    try:
        entities, errors = await client.fetch_extended_data(token)
    finally:
        await client.close()

    counts: dict[str, int] = {}
    now = datetime.now(timezone.utc)
    for entity_type, records in entities.items():
        count = 0
        for source in records:
            source_id = str(source.get("id") or source.get("source_id") or "").strip()
            if not source_id:
                continue
            row = db.scalar(select(ShopfrontExtendedRecord).where(
                ShopfrontExtendedRecord.store_key == store.store_key,
                ShopfrontExtendedRecord.entity_type == entity_type,
                ShopfrontExtendedRecord.source_id == source_id,
            ))
            if row is None:
                row = ShopfrontExtendedRecord(
                    store_key=store.store_key,
                    entity_type=entity_type,
                    source_id=source_id,
                )
                db.add(row)
            row.raw_payload = without_credentials(source)
            row.synced_at = now
            count += 1
        counts[entity_type] = count
    db.commit()

    staged = 0
    if settings.pos_import_enabled:
        pos_client = OrithosClient(settings.pos_api_base_url, settings.pos_api_token, True)
        try:
            for entity_type in sorted(counts):
                rows = db.scalars(select(ShopfrontExtendedRecord).where(
                    ShopfrontExtendedRecord.store_key == store.store_key,
                    ShopfrontExtendedRecord.entity_type == entity_type,
                ).order_by(ShopfrontExtendedRecord.source_id)).all()
                for offset in range(0, len(rows), 200):
                    batch = rows[offset:offset + 200]
                    response = await pos_client.upsert_extended({
                        "store_key": store.store_key,
                        "entity_type": entity_type,
                        "items": [{"source_id": item.source_id, "raw_payload": item.raw_payload} for item in batch],
                    })
                    result = response.get("data", response)
                    if result.get("status") != "STAGED":
                        raise PosIntegrationError(f"Extended record mirror was not staged for {entity_type}")
                    staged += len(batch)
        finally:
            await pos_client.close()

    return {
        "status": "partial" if errors else "completed",
        "counts": counts,
        "errors": errors,
        "pos_staged": staged,
    }


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
    products_updated_after: str | None = None,
    refresh_inventory: bool = False,
    progress_callback: Any | None = None,
) -> SyncRun:
    run = SyncRun(store_key=store.store_key, from_date=start.isoformat(), to_date=end.isoformat())
    db.add(run)
    db.commit()
    client = get_client(settings, store)
    counts = {"summaries": 0, "sales": 0, "products": 0, "products_from_sales": 0, "inventory": 0, "warnings": []}
    catalog_cursor = datetime.now(timezone.utc).isoformat() if include_catalog else None
    catalog_sync_complete = False
    sale_product_ids: set[str] = set()
    sale_products: dict[str, Product] = {}
    configured_batch_size = max(1, int(getattr(settings, "sync_sale_commit_batch_size", 25)))
    commit_batch_size = 1 if db.bind is not None and db.bind.dialect.name == "sqlite" else configured_batch_size
    try:
        # A blocked lock or malformed database statement must fail the chunk
        # and be retried by the scheduler. Without a server-side timeout the
        # worker can remain stuck forever after a checkpoint.
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SET statement_timeout = '30s'"))
        token = await access_token(db, settings, store)
        rows: list[dict[str, Any]] = []
        sale_rows: list[dict[str, Any]] = []
        outlet_ids: list[str] = []
        try:
            outlet_rows = await client.fetch_outlets(token)
            outlet_ids = [str(row["id"]) for row in outlet_rows if isinstance(row, dict) and row.get("id") and not row.get("deleted")]
            counts["outlets"] = len(outlet_ids)
        except ShopfrontError as exc:
            counts["warnings"].append({"stage": "outlets", "message": str(exc)[:500]})
        try:
            sale_rows = await client.fetch_sales_graphql(token, start.isoformat(), end.isoformat(), store.timezone, progress_callback, outlet_ids or None)
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
        for row in sale_rows:
            register = row.get("register") if isinstance(row.get("register"), dict) else {}
            outlet = register.get("outlet") if isinstance(register.get("outlet"), dict) else {}
            if outlet.get("name"):
                row["_outlet_name"] = outlet["name"]
        if duplicate_sales:
            counts["duplicate_sales_collapsed"] = duplicate_sales
        # Do not advance a history cursor when the report and complete Sale
        # sources disagree. Reports provide daily counts; GraphQL provides
        # stable Sale IDs and line items. A mismatch must be retried, usually
        # as smaller ranges, instead of becoming a silent historical gap.
        source_warning_stages = {
            str(w.get("stage")) for w in counts["warnings"] if isinstance(w, dict)
        }
        if rows and not sale_rows and "sales_detail" in source_warning_stages:
            raise ShopfrontError(
                "Sales report returned rows but complete Sale query returned no rows"
            )
        if rows and sale_rows:
            report_counts: dict[str, int] = {}
            sale_counts: dict[str, int] = {}
            for report_row in rows:
                report_date = business_date(
                    first(report_row, "timestamp", "Timestamp", "created_at", "createdAt"),
                    start,
                    store.timezone,
                )
                report_counts[report_date] = report_counts.get(report_date, 0) + 1
            for sale_row in sale_rows:
                sale_date = business_date(
                    first(sale_row, "createdAt", "created_at", "timestamp"),
                    start,
                    store.timezone,
                )
                sale_counts[sale_date] = sale_counts.get(sale_date, 0) + 1
            mismatches = {
                day: (report_counts.get(day, 0), sale_counts.get(day, 0))
                for day in sorted(set(report_counts) | set(sale_counts))
                if report_counts.get(day, 0) != sale_counts.get(day, 0)
            }
            if mismatches:
                raise ShopfrontError(
                    "Shopfront report/Sale count mismatch: "
                    + str(mismatches)[:1500]
                )
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
                key = (business_date(timestamp, start, store.timezone), first(row, "outlet", "outletName", "outlet_name", "_outlet_name"))
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
        # A previous report sync may have stored a consolidated or UTC-dated
        # row that is not present in the current authoritative window. Keep
        # those stale rows from inflating later trend and reconciliation APIs.
        # Only clean when the source query completed without a sales warning;
        # a failed query must never erase a valid prior summary.
        source_warning_stages = {str(w.get("stage")) for w in counts["warnings"] if isinstance(w, dict)}
        source_query_ok = not source_warning_stages.intersection({"sales_detail", "sales_report"})
        if source_query_ok:
            valid_summary_keys = set(aggregates)
            existing_summaries = db.scalars(select(DailySalesSummary).where(
                DailySalesSummary.store_key == store.store_key,
                DailySalesSummary.business_date >= start.isoformat(),
                DailySalesSummary.business_date <= end.isoformat(),
            )).all()
            for existing_summary in existing_summaries:
                key = (existing_summary.business_date, existing_summary.outlet)
                if key not in valid_summary_keys:
                    db.delete(existing_summary)
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
        # Recent compensation windows are normally composed almost entirely
        # of already mirrored sales. Validate the source version/status in one
        # pass and avoid entering the per-sale ORM path when the whole window
        # is unchanged. This also prevents one malformed legacy row from
        # blocking an otherwise idempotent retry.
        unchanged_sales = 0
        if sale_rows and source_sale_ids and len(existing_sales) == len(source_sale_ids):
            for source_id, row in zip(source_sale_ids, sale_rows):
                sale = existing_sales.get(source_id)
                incoming_updated = parse_datetime(first(row, "updatedAt", "updated_at"))
                if sale is None or incoming_updated is None or sale.updated_at is None:
                    break
                if not _sale_is_complete_and_unchanged(sale, row, existing_line_counts.get(sale.id, 0)):
                    break
                unchanged_sales += 1
            if unchanged_sales == len(sale_rows):
                # A replay must be able to select unchanged rows even when an
                # older record has a missing or malformed business timestamp.
                # Refresh the durable sync marker for every source row before
                # dropping the in-memory window in the fast path.
                synced_at = datetime.now(timezone.utc)
                for sale in existing_sales.values():
                    sale.synced_at = synced_at
                counts["sales"] = len(sale_rows)
                counts["sales_fetched"] = len(sale_rows)
                counts["sales_processed"] = len(sale_rows)
                counts["sales_skipped_unchanged"] = len(sale_rows)
                counts["stage"] = "sales_skipped_unchanged"
                sale_product_ids.update(source_product_ids)
                sale_rows = []
                # Daily summaries are complete at this point. Release the
                # SQLite write transaction before any remote catalog lookups.
                db.commit()
        for sale_index, row in enumerate(sale_rows, start=1):
            # Cancellation is persisted by the API request in a separate
            # database session. Check it at each commit boundary so a bad or
            # parked source record cannot keep the writer occupied indefinitely.
            checkpoint_due = sale_index == 1 or (sale_index - 1) % commit_batch_size == 0
            if checkpoint_due:
                db.refresh(run)
                if run.status == "cancelled":
                    counts["sales_fetched"] = len(sale_rows)
                    counts["sales_processed"] = sale_index - 1
                    counts["stage"] = "cancelled"
                    run.counts = counts
                    db.rollback()
                    return run
            # Persist a heartbeat before each batch. This makes the exact
            # blocking sale visible through the status API even if the next
            # database operation never returns.
            if checkpoint_due:
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
                    sale.synced_at = datetime.now(timezone.utc)
                    counts["sales"] += 1
                    counts["sales_skipped_unchanged"] = counts.get("sales_skipped_unchanged", 0) + 1
                    counts["phase"] = "sale_skipped_unchanged"
                    if sale_index % commit_batch_size == 0 or sale_index == len(sale_rows):
                        counts["sales_fetched"] = len(sale_rows)
                        counts["sales_processed"] = sale_index
                        counts["stage"] = "sales"
                        counts["current_sale_index"] = sale_index + 1
                        counts["current_sale_id"] = None
                        run.counts = counts
                        db.commit()
                    continue
                row = await enrich_sale_detail(
                    client,
                    token,
                    str(sale_id),
                    row,
                    settings.shopfront_sale_detail_query,
                    counts["warnings"],
                )
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
                sale.total_tax = sale_tax_amount(row)
                sale.total_discount = parse_decimal(first(row, "Discount Amount", "total_discount", "totalDiscount", "discount"))
                sale.total_cost = parse_decimal(first(row, "Cost", "cost", "totalCost"))
                sale.customer_reference = first(row, "clientId", "client_id", "customerReference")
                sale.raw_payload = row
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
                        # Consume once: another line for the same product may
                        # carry a different quantity/sign and source line ID.
                        sale_item = legacy_items_by_product.pop((sale.id, product_id), None)
                    if sale_item is None:
                        sale_item = SaleItem(sale_id=sale.id, line_key=line_key, shopfront_product_id=product_id)
                        db.add(sale_item)
                    sale_items_by_key[(sale.id, line_key)] = sale_item
                    sale_item.line_key = line_key
                    sale_item.quantity = parse_decimal(first(item, "quantity", "Quantity"))
                    sale_item.unit_price = parse_decimal(first(item, "basePrice", "unitPrice"))
                    sale_item.line_total = parse_decimal(first(item, "totalPrice", "lineTotal"))
                    sale_item.cost = parse_decimal(first(item, "cost", "Cost"))
                    sale_item.tax = sale_tax_amount(item, line=True)
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
                if sale_index % commit_batch_size == 0 or sale_index == len(sale_rows):
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
                if products_updated_after:
                    products = await client.fetch_products_incremental(token, products_updated_after)
                else:
                    products = await client.fetch_products(token, settings.shopfront_products_query)
                catalog_sync_complete = True
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
            product.price = parse_decimal(first(item, "price", "Price", "retailPrice")) or shelf_unit_price(item)
            product.raw_payload = item
            product.synced_at = datetime.now(timezone.utc)
            product.catalog_last_seen_at = product.synced_at
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
        if refresh_inventory:
            # The full product snapshot can dirty thousands of SQLite rows.
            # Persist that batch before waiting on the paginated inventory API
            # so the worker and its heartbeat do not compete for the writer.
            counts["stage"] = "inventory_fetch"
            counts["products_fetched"] = len(products)
            counts["products_processed"] = counts["products"]
            run.counts = counts
            db.commit()
            try:
                # Use the beginning of the request window as the cutoff so
                # stock moves made while Shopfront paginates the snapshot are
                # preserved by the Odoo reconciliation guard.
                snapshot_time = datetime.now(timezone.utc)
                inventory_products = await client.fetch_inventory(token, settings.shopfront_inventory_query)
                snapshot_keys: set[tuple[str, str]] = set()
                inventory_rows: list[tuple[str, str, str | None, Decimal, dict[str, Any]]] = []
                inventory_product_ids: set[str] = set()
                if not inventory_products:
                    raise ShopfrontError("Shopfront inventory snapshot returned no products")
                for item in inventory_products:
                    product_id = first(item, "id", "ID")
                    if not product_id:
                        raise ShopfrontError("Shopfront inventory snapshot contains a product without an ID")
                    product_id = str(product_id)
                    if product_id in inventory_product_ids:
                        raise ShopfrontError("Shopfront inventory snapshot contains duplicate product IDs")
                    inventory_product_ids.add(product_id)
                    if "inventory" not in item:
                        raise ShopfrontError("Shopfront inventory snapshot omitted the inventory field")
                    raw_inventory = item.get("inventory")
                    rows_for_product = raw_inventory if isinstance(raw_inventory, list) else ([raw_inventory] if isinstance(raw_inventory, dict) else [])
                    if raw_inventory is not None and not isinstance(raw_inventory, (list, dict)):
                        raise ShopfrontError("Shopfront inventory snapshot contains an invalid inventory value")
                    for inventory_row in rows_for_product:
                        if not isinstance(inventory_row, dict):
                            raise ShopfrontError("Shopfront inventory snapshot contains an invalid row")
                        quantity = parse_decimal(first(inventory_row, "quantity", "Quantity"))
                        if quantity is None or not quantity.is_finite():
                            raise ShopfrontError("Shopfront inventory snapshot contains a missing or invalid quantity")
                        outlet = inventory_row.get("outlet") if isinstance(inventory_row.get("outlet"), dict) else {}
                        outlet_id = str(first(inventory_row, "outletId") or outlet.get("id") or "unknown")
                        outlet_name = first(inventory_row, "outletName") or outlet.get("name")
                        if (product_id, outlet_id) in snapshot_keys:
                            raise ShopfrontError("Shopfront inventory snapshot contains duplicate product/outlet rows")
                        snapshot_keys.add((product_id, outlet_id))
                        inventory_rows.append((product_id, outlet_id, str(outlet_name) if outlet_name is not None else None, quantity, inventory_row))

                existing_rows = db.scalars(select(InventorySnapshot).where(
                    InventorySnapshot.store_key == store.store_key,
                )).all()
                existing_by_key = {
                    (row.shopfront_product_id, row.outlet_id or "unknown"): row
                    for row in existing_rows
                }
                for product_id, outlet_id, outlet_name, quantity, raw in inventory_rows:
                    row = existing_by_key.get((product_id, outlet_id))
                    if row is None:
                        row = InventorySnapshot(
                            store_key=store.store_key,
                            shopfront_product_id=product_id,
                            outlet_id=outlet_id,
                        )
                        db.add(row)
                    row.outlet_name = outlet_name
                    row.quantity = quantity
                    row.inventory_timestamp = snapshot_time
                    row.raw_payload = raw
                stale_rows = [
                    row for row in existing_rows
                    if (row.shopfront_product_id, row.outlet_id or "unknown") not in snapshot_keys
                ]
                for row in stale_rows:
                    db.delete(row)
                counts["inventory"] = len(inventory_rows)
                counts["inventory_products_scanned"] = len(inventory_product_ids)
                counts["inventory_source_keys"] = len(snapshot_keys)
                counts["inventory_stale_keys_removed"] = len(stale_rows)
                counts["inventory_sync_complete"] = True
                counts["inventory_source_product_ids"] = sorted(inventory_product_ids)
                counts["inventory_snapshot_at"] = snapshot_time.isoformat()
                manifest = db.scalar(select(InventorySnapshotManifest).where(
                    InventorySnapshotManifest.store_key == store.store_key,
                ))
                if manifest is None:
                    manifest = InventorySnapshotManifest(store_key=store.store_key)
                    db.add(manifest)
                manifest.source_product_ids = sorted(inventory_product_ids)
                manifest.snapshot_at = snapshot_time
                manifest.complete = True
            except Exception as exc:
                counts["inventory_sync_complete"] = False
                counts["warnings"].append({"stage": "inventory", "message": str(exc)[:500]})
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
        counts["catalog_source_ids"] = sorted({
            str(first(item, "id", "ID")) for item in products if first(item, "id", "ID")
        })
        counts["catalog_sync_complete"] = catalog_sync_complete
        counts["catalog_full_snapshot"] = bool(catalog_sync_complete and include_catalog and not products_updated_after)
        counts["catalog_cursor"] = catalog_cursor if catalog_sync_complete else None
        run.status, run.counts = ("running" if defer_completion else "completed"), counts
        run.finished_at = None if defer_completion else datetime.now(timezone.utc)
        db.commit()
    except asyncio.CancelledError:
        db.rollback()
        if run.status != "cancelled":
            run.status = "cancelled"
            run.error = "cancelled by operator"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    except Exception as exc:
        db.rollback()
        db.refresh(run)
        if run.status != "cancelled":
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
