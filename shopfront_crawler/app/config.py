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


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    shopfront_client_id: str = ""
    shopfront_client_secret: str = ""
    shopfront_redirect_uri: str = "http://localhost:8000/oauth/shopfront/callback"
    # Keep the initial consent request to permissions required for reporting,
    # product and inventory reads. Webhook permissions can be added later.
    shopfront_scopes: str = "run_sales_reports see_products see_history"
    # Advanced reports are not required for the crawler and may not be
    # enabled on every Shopfront application. Opt in only when needed.
    shopfront_enable_advanced_reports: bool = False
    # Webhook permissions are optional and can make the consent request fail
    # before the Shopfront application has been granted them.
    shopfront_enable_webhooks: bool = False
    shopfront_enable_supply_chain: bool = False
    shopfront_stores: str = "skr:skr"
    database_url: str = "sqlite:///./data/shopfront_crawler.db"
    token_encryption_key: str = ""
    sync_timezone: str = "Australia/Adelaide"
    sync_interval_minutes: int = 30
    sync_lookback_days: int = 3
    sync_daily_hour: int = 2
    sync_daily_minute: int = 0
    worker_poll_seconds: int = 2
    worker_stale_after_seconds: int = 900
    history_chunk_days: int = 14
    shopfront_history_start_year: int = 2010
    pos_api_base_url: str = ""
    pos_api_token: str = ""
    shopfront_integration_token: str = ""
    pos_company_id: str = ""
    pos_outlet_id: str = ""
    # Keep the crawler-to-POS mirror enabled by default. Formal Odoo business
    # writes remain separately gated below.
    pos_import_enabled: bool = True
    odoo_api_base_url: str = ""
    odoo_api_token: str = ""
    odoo_api_database: str = ""
    odoo_import_enabled: bool = True
    odoo_business_write_enabled: bool = False
    shopfront_products_query: str = DEFAULT_PRODUCTS_QUERY
    shopfront_inventory_query: str = DEFAULT_INVENTORY_QUERY
    shopfront_sale_detail_query: str = ""

    def model_post_init(self, __context: object) -> None:
        """Accept the old documented scope name while using Shopfront's current name."""
        aliases = {"see_sales": "see_history"}
        optional_webhook_scopes = {"see_webhooks", "create_webhooks", "edit_webhooks", "delete_webhooks"}
        scopes: list[str] = []
        for raw_scope in self.shopfront_scopes.replace(",", " ").split():
            scope = aliases.get(raw_scope.strip(), raw_scope.strip())
            if scope == "run_advanced_reports" and not self.shopfront_enable_advanced_reports:
                continue
            if scope in optional_webhook_scopes and not self.shopfront_enable_webhooks:
                continue
            if scope in {"see_suppliers", "see_stock_management"} and not self.shopfront_enable_supply_chain:
                continue
            if scope and scope not in scopes:
                scopes.append(scope)
        self.shopfront_scopes = " ".join(scopes)
        if self.shopfront_enable_supply_chain:
            for scope in ("see_suppliers", "see_stock_management"):
                if scope not in scopes:
                    scopes.append(scope)
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
