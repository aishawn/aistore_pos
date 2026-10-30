from app.config import Settings
from app.db import Base
from app.models import Product, ShopfrontPurchaseOrder, ShopfrontSupplier
from app.shopfront import PURCHASE_ORDERS_QUERY, SUPPLIERS_QUERY
from app.sync import _without_credentials
from sqlalchemy import create_engine, inspect


def test_supply_chain_scopes_are_opt_in_and_added_together():
    disabled = Settings(shopfront_scopes="run_sales_reports see_products see_history")
    assert "see_suppliers" not in disabled.shopfront_scopes
    assert "see_stock_management" not in disabled.shopfront_scopes

    enabled = Settings(
        shopfront_enable_supply_chain=True,
        shopfront_scopes="run_sales_reports see_products see_history",
    )
    assert "see_suppliers" in enabled.shopfront_scopes
    assert "see_stock_management" in enabled.shopfront_scopes


def test_supplier_query_never_requests_supplier_authentication():
    assert "authentication" not in SUPPLIERS_QUERY.lower()
    assert "username" not in SUPPLIERS_QUERY.lower()
    assert "password" not in SUPPLIERS_QUERY.lower()
    assert "see_suppliers" not in SUPPLIERS_QUERY


def test_purchase_order_query_is_limited_to_supplier_orders():
    assert "orders(type: ORDER" in PURCHASE_ORDERS_QUERY
    assert "authentication" not in PURCHASE_ORDERS_QUERY.lower()


def test_supplier_payload_recursively_removes_credentials():
    source = {
        "id": "supplier-1",
        "name": "Supplier",
        "authentication": [{"username": "user", "password": "secret", "accountNumber": "123"}],
        "contact": {"email": "supplier@example.invalid", "api_token": "token-value"},
    }
    sanitized = _without_credentials(source)
    assert sanitized == {
        "id": "supplier-1",
        "name": "Supplier",
        "contact": {"email": "supplier@example.invalid"},
    }


def test_new_mirror_models_create_in_sqlite():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    assert {"shopfront_suppliers", "shopfront_purchase_orders"}.issubset(set(inspector.get_table_names()))
    product_columns = {column["name"] for column in inspector.get_columns("products")}
    assert "catalog_last_seen_at" in product_columns
    engine.dispose()


def test_incremental_product_fetch_uses_metadata_and_stock_cursors():
    import asyncio
    import json

    import httpx

    from app.shopfront import ShopfrontClient

    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        requests.append(payload)
        product_id = "metadata-change" if "updatedAfter" in payload["query"] else "stock-change"
        return httpx.Response(200, json={"data": {"products": {
            "edges": [{"node": {"id": product_id, "name": product_id}}],
            "pageInfo": {"hasNextPage": False, "endCursor": None},
        }}})

    async def run():
        client = ShopfrontClient(
            "skr", "client", "secret", "http://localhost/callback", "scope",
            http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        rows = await client.fetch_products_incremental("token", "2026-10-30T00:00:00+00:00")
        await client.close()
        return rows

    rows = asyncio.run(run())
    assert {row["id"] for row in rows} == {"metadata-change", "stock-change"}
    assert len(requests) == 2
    assert "updatedAfter: $since" in requests[0]["query"]
    assert "lastStocktakedAfter: $since" in requests[1]["query"]
    assert all(request["variables"]["since"] == "2026-10-30T00:00:00+00:00" for request in requests)
