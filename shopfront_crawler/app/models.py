from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON as JSONType, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    vendor: Mapped[str] = mapped_column(String(128), unique=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Australia/Adelaide")
    active: Mapped[bool] = mapped_column(default=True)


class OAuthState(Base):
    __tablename__ = "oauth_states"
    state: Mapped[str] = mapped_column(String(128), primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShopfrontToken(Base):
    __tablename__ = "shopfront_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(ForeignKey("stores.store_key"), unique=True)
    vendor: Mapped[str] = mapped_column(String(128))
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(Text)
    token_type: Mapped[str] = mapped_column(String(32), default="Bearer")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scopes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="active")
    last_refresh_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SyncRun(Base):
    __tablename__ = "sync_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="running")
    from_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    counts: Mapped[dict] = mapped_column(JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class SyncJob(Base):
    __tablename__ = "sync_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    job_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    from_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cursor_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5)


class ShopfrontSyncCheckpoint(Base):
    __tablename__ = "shopfront_sync_checkpoints"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    checkpoint_key: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "checkpoint_key", name="uq_shopfront_sync_checkpoint"),)


class StoreMapping(Base):
    __tablename__ = "store_mappings"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    shopfront_outlet: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pos_company_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pos_outlet_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    enabled: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PosImportRun(Base):
    __tablename__ = "pos_import_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    import_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="staged")
    counts: Mapped[dict] = mapped_column(JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExternalSyncState(Base):
    __tablename__ = "external_sync_states"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("store_key", "entity_type", "source_id", name="uq_external_sync_state"),)


class DailySalesSummary(Base):
    __tablename__ = "daily_sales_summaries"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    business_date: Mapped[str] = mapped_column(String(10), index=True)
    outlet: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revenue: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    profit: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    transaction_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tax: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    discount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_range: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "business_date", "outlet", name="uq_daily_summary"),)


class ShopfrontReportSnapshot(Base):
    __tablename__ = "shopfront_report_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    report_type: Mapped[str] = mapped_column(String(32))
    period_key: Mapped[str] = mapped_column(String(64), default="all")
    rows: Mapped[list] = mapped_column(JSONType, default=list)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "report_type", "period_key", name="uq_shopfront_report_snapshot"),)


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    shopfront_sale_id: Mapped[str] = mapped_column(String(128), index=True)
    invoice_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_tax: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_discount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    customer_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    items: Mapped[list["SaleItem"]] = relationship(cascade="all, delete-orphan")
    __table_args__ = (
        UniqueConstraint("store_key", "shopfront_sale_id", name="uq_sale"),
        Index("ix_sales_store_created_at", "store_key", "created_at"),
        Index("ix_sales_store_status", "store_key", "status"),
    )


class SaleItem(Base):
    __tablename__ = "sale_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    # Shopfront can contain the same product more than once in one sale.
    # Keep the immutable SaleItem id so those lines are not collapsed.
    line_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    shopfront_product_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    line_total: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    tax: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    shopfront_product_id: Mapped[str] = mapped_column(String(128), index=True)
    sku: Mapped[str | None] = mapped_column(String(128), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    catalog_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("store_key", "shopfront_product_id", name="uq_product"),)


class ShopfrontSupplier(Base):
    __tablename__ = "shopfront_suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "source_id", name="uq_shopfront_supplier"),)


class ShopfrontPurchaseOrder(Base):
    __tablename__ = "shopfront_purchase_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    supplier_source_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    order_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "source_id", name="uq_shopfront_purchase_order"),)


class ShopfrontCustomer(Base):
    __tablename__ = "shopfront_customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(128), nullable=True)
    customer_group: Mapped[str | None] = mapped_column(String(255), nullable=True)
    loyalty_points: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    current_owing: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    deleted: Mapped[bool | None] = mapped_column(nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "source_id", name="uq_shopfront_customer"),)


class InventorySnapshot(Base):
    __tablename__ = "inventory_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    shopfront_product_id: Mapped[str] = mapped_column(String(128), index=True)
    outlet_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    outlet_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    inventory_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    __table_args__ = (UniqueConstraint("store_key", "shopfront_product_id", "outlet_id", name="uq_inventory_snapshot"),)


class InventorySnapshotManifest(Base):
    __tablename__ = "inventory_snapshot_manifests"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source_product_ids: Mapped[list] = mapped_column(JSONType, default=list)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    complete: Mapped[bool] = mapped_column(default=False)


class ShopfrontExtendedRecord(Base):
    __tablename__ = "shopfront_extended_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(192), index=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("store_key", "entity_type", "source_id", name="uq_shopfront_extended_record"),)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    store_key: Mapped[str] = mapped_column(String(64), index=True)
    event: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="received")
