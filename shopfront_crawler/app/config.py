from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    shopfront_stores: str = "skr:skr"
    database_url: str = "sqlite:///./data/shopfront_crawler.db"
    token_encryption_key: str = ""
    sync_timezone: str = "Australia/Adelaide"
    sync_interval_minutes: int = 30
    sync_lookback_days: int = 3
    sync_daily_hour: int = 2
    sync_daily_minute: int = 0
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
    shopfront_products_query: str = "{ products(first: 100) { edges { node { id name status cost globalCost prices { price } barcodes { code } category { name } brand { name } inventory { quantity outlet { id name } } } } } }"
    shopfront_inventory_query: str = "{ products(first: 100) { edges { node { id name inventory { quantity outlet { id name } } } } } }"
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
            if scope and scope not in scopes:
                scopes.append(scope)
        self.shopfront_scopes = " ".join(scopes)

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
