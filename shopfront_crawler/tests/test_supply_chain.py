from sqlalchemy import create_engine, inspect

from app.config import Settings
from app.db import Base
from app.models import Product, ShopfrontExtendedRecord, ShopfrontPurchaseOrder, ShopfrontSupplier
from app.shopfront import CLASSIFICATION_QUERIES, CUSTOMER_GROUPS_QUERY, CUSTOMER_PAYMENTS_QUERY, EXTENDED_CONNECTION_QUERIES, EXTENDED_CONNECTION_ROOTS, PRICE_LISTS_QUERY, PURCHASE_ORDERS_QUERY, SAVED_REPORTS_QUERY, SUPPLIERS_QUERY, _add_cursor_pagination
from app.sync import without_credentials


def test_full_read_scopes_are_requested_even_when_optional_jobs_are_disabled():
    settings = Settings(
        shopfront_enable_supply_chain=False,
        shopfront_enable_customers=False,
        shopfront_scopes="run_sales_reports see_products see_history",
    )
    assert "see_suppliers" in settings.shopfront_scopes.split()
    assert "see_stock_management" in settings.shopfront_scopes.split()
    assert "see_customer_groups" in settings.shopfront_scopes.split()


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
    assert {"shopfront_suppliers", "shopfront_purchase_orders", "shopfront_extended_records"}.issubset(set(inspector.get_table_names()))
    engine.dispose()


def test_extended_shopfront_queries_use_cursor_pagination_for_every_connection():
    queries = {**CLASSIFICATION_QUERIES, **EXTENDED_CONNECTION_QUERIES, "customerPayments": CUSTOMER_PAYMENTS_QUERY}
    for entity, query in queries.items():
        paged = _add_cursor_pagination(query, EXTENDED_CONNECTION_ROOTS.get(entity, entity))
        assert "after: $after" in paged
        assert "pageInfo { hasNextPage endCursor }" in paged


def test_shopfront_extended_list_queries_match_scalar_and_interface_shapes():
    assert "creditTerms" in CUSTOMER_GROUPS_QUERY
    assert "creditTerms {" not in CUSTOMER_GROUPS_QUERY
    assert "period {" not in EXTENDED_CONNECTION_QUERIES["promotions"]
    assert "offset {" not in EXTENDED_CONNECTION_QUERIES["promotions"]
    assert "duration {" not in EXTENDED_CONNECTION_QUERIES["promotions"]
    assert "fallbackId: id" in PRICE_LISTS_QUERY
    assert "id name layers" in SAVED_REPORTS_QUERY
    assert "... on FavouriteReport" not in SAVED_REPORTS_QUERY
    assert "... on SpecialFavouriteReport" not in SAVED_REPORTS_QUERY


def test_extended_record_identity_includes_store_and_entity_type():
    unique = next(
        constraint for constraint in ShopfrontExtendedRecord.__table__.constraints
        if constraint.name == "uq_shopfront_extended_record"
    )
    assert {column.name for column in unique.columns} == {"store_key", "entity_type", "source_id"}

