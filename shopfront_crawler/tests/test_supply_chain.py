from sqlalchemy import create_engine, inspect

from app.config import Settings
from app.db import Base
from app.models import Product, ShopfrontPurchaseOrder, ShopfrontSupplier
from app.shopfront import PURCHASE_ORDERS_QUERY, SUPPLIERS_QUERY
from app.sync import without_credentials


def test_supply_chain_scopes_are_opt_in():
    disabled = Settings(shopfront_scopes="run_sales_reports see_products see_history")
    assert "see_suppliers" not in disabled.shopfront_scopes
    assert "see_stock_management" not in disabled.shopfront_scopes

    enabled = Settings(
        shopfront_enable_supply_chain=True,
        shopfront_scopes="run_sales_reports see_products see_history",
    )
    assert "see_suppliers" in enabled.shopfront_scopes
    assert "see_stock_management" in enabled.shopfront_scopes


def test_queries_read_supplier_directory_and_orders_without_auth_secrets():
    assert "suppliers(first: 100" in SUPPLIERS_QUERY
    assert "orders(type: ORDER" in PURCHASE_ORDERS_QUERY
    assert "authentication" not in (SUPPLIERS_QUERY + PURCHASE_ORDERS_QUERY).lower()
    assert "password" not in (SUPPLIERS_QUERY + PURCHASE_ORDERS_QUERY).lower()


def test_supplier_payload_recursively_removes_secrets_and_account_numbers():
    source = {
        "id": "supplier-1",
        "name": "Supplier",
        "authentication": [{"username": "user", "password": "secret"}],
        "contact": {"email": "supplier@example.invalid", "api_token": "private"},
        "businessNumber": "ABN-1",
    }
    assert without_credentials(source) == {
        "id": "supplier-1",
        "name": "Supplier",
        "contact": {"email": "supplier@example.invalid"},
        "businessNumber": "ABN-1",
    }


def test_supplier_and_purchase_order_mirror_tables_are_idempotently_keyed():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    assert {"shopfront_suppliers", "shopfront_purchase_orders"}.issubset(set(inspector.get_table_names()))
    engine.dispose()

