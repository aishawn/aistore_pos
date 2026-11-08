from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


# Keep the catalog query in code so an old, reduced deployment environment
# cannot silently drop descriptions, tax data, price tiers, or inventory
# controls. Shopfront returns internal errors for the legacy *Singles/*Cases
# inventory fields on some tenants, so those fields are intentionally omitted.
DEFAULT_PRODUCTS_QUERY = """{ products(first: 100) { edges { node {
  id name mdbId status type description image alternateImages createdAt updatedAt
  deletedAt deleted tempProduct useScales useBarcodeTemplates requestQuantity
  requestPrice minimumOrderQuantity orderNotes invoiceNotes preventManualDiscounts
  ignorePriceHostChanges ignoreBarcodeHostChanges
  category { id name } brand { id name } family { id name } tags { name }
  trackInventory caseQuantity cost lastCost averageCost globalCost globalLastCost
  globalAverageCost replacementCost costPercentage
  prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
  barcodes { code quantity } taxRate { id name } costTaxRate { id name }
  inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel
    reorderAmount reorderLimit maxQuantity onOrder }
} } } }"""

DEFAULT_INVENTORY_QUERY = """{ products(first: 100) { edges { node {
  id name mdbId inventory { outlet { id name } quantity singleLevel caseLevel
    reorderLevel reorderAmount reorderLimit maxQuantity onOrder }
} } } }"""

REQUIRED_SHOPFRONT_SCOPES = (
    "run_sales_reports", "run_inventory_reports", "run_purchase_reports",
    "run_advanced_reports", "run_misc_reports", "run_actions_reports",
    "view_reporting_dashboard", "see_products", "see_history", "see_customers",
    "see_customer_groups", "see_balances", "see_pricelists", "see_classifications",
    "see_suppliers", "see_stock_management", "see_stocktake", "see_promotions",
    "see_shelf_tickets", "see_product_backorders", "see_cost", "view_product",
    "view_revision_history", "manage_takings_see_totals", "view_register_closures",
    "see_recent_register_closures", "see_security_events", "see_trashed_items",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    shopfront_client_id: str = ""
    shopfront_client_secret: str = ""
    shopfront_redirect_uri: str = "http://localhost:8000/oauth/shopfront/callback"
    shopfront_scopes: str = " ".join(REQUIRED_SHOPFRONT_SCOPES)
    shopfront_enable_advanced_reports: bool = True
    # Webhook permissions are optional and can make the consent request fail
    # before the Shopfront application has been granted them.
    shopfront_enable_webhooks: bool = False
    shopfront_enable_supply_chain: bool = True
    shopfront_enable_customers: bool = True
    shopfront_stores: str = "skr:skr"
    database_url: str = "sqlite:///./data/shopfront_crawler.db"
    token_encryption_key: str = ""
    sync_timezone: str = "Australia/Adelaide"
    sync_interval_minutes: int = 30
    # Routine runs cover only today and yesterday. Historical repair is queued
    # explicitly so a missed day cannot expand every scheduled run.
    sync_lookback_days: int = 2
    sync_daily_times: str = "23:00,02:30"
    sync_full_inventory_times: str = "23:00,02:30"
    # Legacy hour/minute settings remain available for existing deployments.
    sync_daily_hours: str = "6,23"
    sync_daily_hour: int = 2
    sync_daily_minute: int = 0
    sync_full_inventory_hours: str = "6"
    worker_poll_seconds: int = 2
    worker_stale_after_seconds: int = 900
    # Commit historical Sale writes in bounded batches. A value of 1 keeps
    # the old per-sale durability behavior; larger values reduce database
    # round trips while the persisted cursor and idempotent source IDs keep
    # retries safe after a restart.
    sync_sale_commit_batch_size: int = 25
    # The full purchase-order directory can take several minutes to paginate.
    # Keep the bound finite while avoiding false partial results on large stores.
    shopfront_supply_chain_timeout_seconds: int = 900
    # Supplier and purchase-order directories change less often than sales.
    # Run the expensive full directory scan on this cadence; sales/inventory
    # remain on the daily three-day compensation window.
    shopfront_supply_chain_interval_days: int = 7
    history_chunk_days: int = 14
    shopfront_history_start_year: int = 2010
    pos_api_base_url: str = ""
    pos_api_token: str = ""
    pos_api_mirror_base_url: str = "https://skr.orithos.com.au"
    pos_api_mirror_token: str = ""
    shopfront_integration_token: str = ""
    pos_company_id: str = ""
    pos_outlet_id: str = ""
    # Keep the crawler-to-POS mirror enabled by default. Formal Odoo business
    # writes remain separately gated below.
    pos_import_enabled: bool = True
    # Bound POS sales transactions so one slow or malformed range does not
    # hold an oversized import transaction open.
    pos_sales_import_batch_size: int = 50
    # Historical compensation can re-read unchanged sales to validate report
    # counts. Once a catalog snapshot has been mirrored, re-sending every
    # product referenced by those unchanged sales adds latency without
    # changing POS state. Keep the switch configurable for recovery.
    pos_skip_unchanged_history_products: bool = True
    odoo_api_base_url: str = ""
    odoo_api_token: str = ""
    odoo_api_database: str = ""
    odoo_import_enabled: bool = True
    odoo_business_write_enabled: bool = False
    pos_ui_notify_url: str = "http://frontend:3000/api/internal/shopfront-sync-notify"
    orithos_shopfront_sync_notify_secret: str = ""
    report_sync_notification_url: str = ""
    shopfront_products_query: str = DEFAULT_PRODUCTS_QUERY
    shopfront_inventory_query: str = DEFAULT_INVENTORY_QUERY
    shopfront_sale_detail_query: str = ""

    def model_post_init(self, __context: object) -> None:
        """Accept the old documented scope name while using Shopfront's current name."""
        aliases = {"see_sales": "see_history"}
        optional_webhook_scopes = {"see_webhooks", "create_webhooks", "edit_webhooks", "delete_webhooks"}
        configured_scopes = self.shopfront_scopes.replace(",", " ").split()
        scopes: list[str] = []
        for raw_scope in (*REQUIRED_SHOPFRONT_SCOPES, *configured_scopes):
            scope = aliases.get(raw_scope.strip(), raw_scope.strip())
            if scope in optional_webhook_scopes and not self.shopfront_enable_webhooks:
                continue
            if scope and scope not in scopes:
                scopes.append(scope)
        self.shopfront_scopes = " ".join(scopes)
        if self.shopfront_enable_supply_chain:
            for scope in ("see_suppliers", "see_stock_management"):
                if scope not in scopes:
                    scopes.append(scope)
            self.shopfront_scopes = " ".join(scopes)
        if self.shopfront_enable_customers and "see_customers" not in scopes:
            scopes.append("see_customers")
            self.shopfront_scopes = " ".join(scopes)

        # Older Dokploy environments used a minimal query. Treat it as a
        # legacy default so newly deployed workers fetch the complete safe
        # catalog without requiring a manual environment edit.
        required_product_fields = ("description", "alternateImages", "taxRate", "prices")
        required_inventory_fields = ("singleLevel", "reorderLevel", "onOrder")
        legacy_inventory_fields = (
            "reorderLevelSingles",
            "reorderLevelCases",
            "reorderAmountSingles",
            "reorderAmountCases",
            "maxQuantitySingles",
            "maxQuantityCases",
        )
        if (
            not all(field in self.shopfront_products_query for field in required_product_fields)
            or any(field in self.shopfront_products_query for field in legacy_inventory_fields)
        ):
            self.shopfront_products_query = DEFAULT_PRODUCTS_QUERY
        required_inventory_fields = ("quantity", "outlet", "reorderLevel", "reorderAmount", "reorderLimit", "maxQuantity", "onOrder")
        if (
            not all(field in self.shopfront_inventory_query for field in required_inventory_fields)
            or any(field in self.shopfront_inventory_query for field in legacy_inventory_fields)
        ):
            self.shopfront_inventory_query = DEFAULT_INVENTORY_QUERY

    def stores(self) -> dict[str, dict[str, str]]:
        result: dict[str, dict[str, str]] = {}
        for item in self.shopfront_stores.split(","):
            item = item.strip()
            if not item:
                continue
            key, _, vendor = item.partition(":")
            result[key.strip()] = {"store_key": key.strip(), "vendor": (vendor or key).strip(), "timezone": self.sync_timezone}
        return result

    def daily_sync_hours(self) -> list[int]:
        try:
            hours = sorted({int(item.strip()) for item in self.sync_daily_hours.split(",") if item.strip()})
        except ValueError as exc:
            raise ValueError("SYNC_DAILY_HOURS must be comma-separated hours from 0 to 23") from exc
        if not hours or any(hour < 0 or hour > 23 for hour in hours):
            raise ValueError("SYNC_DAILY_HOURS must contain one or more hours from 0 to 23")
        return hours

    @staticmethod
    def _parse_sync_times(value: str, setting_name: str, *, allow_empty: bool = False) -> list[str]:
        times: set[str] = set()
        try:
            for item in value.split(","):
                item = item.strip()
                if not item:
                    continue
                hour_text, separator, minute_text = item.partition(":")
                if not separator or len(hour_text) != 2 or len(minute_text) != 2:
                    raise ValueError
                hour, minute = int(hour_text), int(minute_text)
                if not 0 <= hour <= 23 or not 0 <= minute <= 59:
                    raise ValueError
                times.add(f"{hour:02d}:{minute:02d}")
        except ValueError as exc:
            raise ValueError(f"{setting_name} must be comma-separated HH:MM values") from exc
        if not times and not allow_empty:
            raise ValueError(f"{setting_name} must contain at least one HH:MM value")
        return sorted(times)

    def daily_sync_times(self) -> list[str]:
        if self.sync_daily_times.strip():
            return self._parse_sync_times(self.sync_daily_times, "SYNC_DAILY_TIMES")
        return [f"{hour:02d}:{self.sync_daily_minute:02d}" for hour in self.daily_sync_hours()]

    def full_inventory_times(self) -> list[str]:
        if self.sync_full_inventory_times.strip():
            return self._parse_sync_times(self.sync_full_inventory_times, "SYNC_FULL_INVENTORY_TIMES")
        return [f"{hour:02d}:00" for hour in self.full_inventory_hours()]

    def full_inventory_hours(self) -> list[int]:
        try:
            hours = sorted({int(item.strip()) for item in self.sync_full_inventory_hours.split(",") if item.strip()})
        except ValueError as exc:
            raise ValueError("SYNC_FULL_INVENTORY_HOURS must be comma-separated hours from 0 to 23") from exc
        if any(hour < 0 or hour > 23 for hour in hours):
            raise ValueError("SYNC_FULL_INVENTORY_HOURS must contain hours from 0 to 23")
        return hours


@lru_cache
def get_settings() -> Settings:
    return Settings()
