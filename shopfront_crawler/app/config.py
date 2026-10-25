from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    shopfront_client_id: str = ""
    shopfront_client_secret: str = ""
    shopfront_redirect_uri: str = "http://localhost:8000/oauth/shopfront/callback"
    shopfront_scopes: str = "run_advanced_reports run_sales_reports see_products see_history see_webhooks create_webhooks"
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
    pos_company_id: str = ""
    pos_outlet_id: str = ""
    pos_import_enabled: bool = False
    shopfront_products_query: str = "{ products(first: 100) { edges { node { id name status cost globalCost prices { price } barcodes { code } category { name } brand { name } inventory { quantity outlet { id name } } } } } }"
    shopfront_inventory_query: str = "{ products(first: 100) { edges { node { id name inventory { quantity outlet { id name } } } } } }"
    shopfront_sale_detail_query: str = ""

    def model_post_init(self, __context: object) -> None:
        """Accept the old documented scope name while using Shopfront's current name."""
        self.shopfront_scopes = " ".join(
            "see_history" if scope == "see_sales" else scope
            for scope in self.shopfront_scopes.split()
        )

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
