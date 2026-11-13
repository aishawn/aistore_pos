from app.shopfront import CATALOG_QUERY, ShopfrontClient
import app.main as main
from app.main import sales_trend_missing_dates, source_product_row, source_sale_snapshot_is_complete
from app.sync import _dedupe_sales, parse_decimal, sale_customer_reference, verify_webhook


def test_authorization_url_contains_required_parameters():
    client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "run_advanced_reports")
    url = client.authorization_url("state-123")
    assert "https://skr.onshopfront.com/oauth/authorize" in url
    assert "client_id=client" in url
    assert "state=state-123" in url


def test_parse_decimal_handles_currency():
    assert parse_decimal("$1,234.50") == 1234.50
    assert parse_decimal("not-a-number") is None


def test_sale_customer_reference_uses_nested_customer_not_sale_client_id():
    assert sale_customer_reference({
        "clientId": "sale-client-id",
        "customer": {"id": "customer-source-id", "clientId": "customer-client-id"},
    }) == "customer-source-id"
    assert sale_customer_reference({"clientId": "sale-client-id", "customer": None}) is None
    assert sale_customer_reference({"customerId": "customer-source-id"}) == "customer-source-id"


def test_inventory_report_totals_can_parse_currency_formatted_snapshot_values():
    assert main.re.sub(r"[^0-9.\\-]", "", "$1,234.50") == "1234.50"


def test_webhook_signature_verification():
    import hashlib
    import hmac

    body = b'{"id":"1"}'
    timestamp = "1700000000"
    signature = hmac.new(b"key", timestamp.encode() + body, hashlib.sha256).hexdigest()
    assert verify_webhook(body, signature, timestamp, "key")
    assert not verify_webhook(body, "bad", timestamp, "key")


def test_sales_trend_missing_dates_are_unclassified():
    from datetime import date

    class Row:
        def __init__(self, business_date):
            self.business_date = business_date

    assert sales_trend_missing_dates(
        date(2024, 1, 1), date(2024, 1, 3),
        [Row("2024-01-01"), Row("2024-01-03")],
    ) == ["2024-01-02"]


def test_source_sale_snapshot_requires_exact_unique_line_ids_and_payments():
    from types import SimpleNamespace

    raw = {"items": [{"id": "line-1"}, {"id": "line-2"}], "payments": []}
    stored = [SimpleNamespace(line_key="line-1"), SimpleNamespace(line_key="line-2")]

    assert source_sale_snapshot_is_complete(raw, stored)
    assert not source_sale_snapshot_is_complete(
        {**raw, "items": [{"id": "line-1"}, {"id": "line-3"}]}, stored
    )
    assert not source_sale_snapshot_is_complete(
        {**raw, "items": [{"id": "line-1"}, {"id": "line-1"}]}, stored
    )
    assert not source_sale_snapshot_is_complete({"items": raw["items"]}, stored)


def test_saved_reports_query_uses_only_schema_stable_fields():
    from app.shopfront import SAVED_REPORTS_QUERY

    assert "... on FavouriteReport" not in SAVED_REPORTS_QUERY
    assert "... on SpecialFavouriteReport" not in SAVED_REPORTS_QUERY
    assert "id name layers" in SAVED_REPORTS_QUERY


def test_source_product_gift_card_uses_shopfront_additional_field_safe_name():
    gift_card = source_product_row({
        "id": "product-1",
        "name": "Gift card",
        "status": "ACTIVE",
        "type": "PRODUCT",
        "additionalFields": [{"safeName": "vii_is_gift_card", "value": "true"}],
    })
    regular_product = source_product_row({
        "id": "product-2",
        "name": "Regular item",
        "status": "ACTIVE",
        "type": "PRODUCT",
        "additionalFields": [{"safeName": "vii_is_gift_card", "value": "false"}],
    })

    assert gift_card["is_gift_card"] is True
    assert regular_product["is_gift_card"] is False


def test_source_product_uses_quantity_one_retail_price_not_first_case_tier():
    product = source_product_row({
        "id": "product-price-tier",
        "name": "Case priced product",
        "status": "ACTIVE",
        "prices": [
            {"quantity": 6, "price": 24.00},
            {"quantity": 1, "price": 4.50},
        ],
    })

    assert product["price"] == 4.50
    assert isinstance(product["price"], float)


def test_live_catalog_query_avoids_unsupported_product_supplier_fields():
    assert "coreSupplier { id name }" not in CATALOG_QUERY
    assert "lastSupplier { id name }" not in CATALOG_QUERY
    assert "additionalFields { safeName value }" in CATALOG_QUERY


def test_source_product_row_unwraps_nested_product_supplier():
    from app.main import source_product_row

    row = source_product_row({
        "id": "p-nested",
        "name": "Nested supplier product",
        "status": "ACTIVE",
        "prices": [{"quantity": 1, "price": 2.5}],
        "coreSupplier": {"id": "sup-core", "name": "Core Co"},
        "suppliers": [
            {"supplier": {"id": "sup-core", "name": "Core Co"}, "code": "C-1"},
            {"supplier": {"id": "sup-alt", "name": "Alt Co"}, "code": "A-1"},
        ],
    })

    assert row["supplier"] == "Core Co"
    assert row["coreSupplier"]["id"] == "sup-core"
    assert row["suppliers"][0]["code"] == "C-1"


def test_duplicate_sale_edges_are_collapsed_and_merged():
    rows, duplicates = _dedupe_sales([
        {"id": "sale-1", "items": [{"id": "line-1"}], "payments": []},
        {"id": "sale-1", "items": [{"id": "line-1"}, {"id": "line-2"}], "payments": [{"id": "pay-1"}]},
        {"id": "sale-2", "items": []},
    ])
    assert duplicates == 1
    assert [row["id"] for row in rows] == ["sale-1", "sale-2"]
    assert len(rows[0]["items"]) == 2
    assert rows[0]["payments"] == [{"id": "pay-1"}]


def test_sale_commit_batch_setting_has_bounded_default():
    from app.config import Settings

    assert Settings().sync_sale_commit_batch_size == 25


def test_count_validation_is_present_before_history_cursor_advances():
    import inspect
    from app import sync

    source = inspect.getsource(sync.sync_store)
    assert "Shopfront report/Sale count mismatch" in source
    assert "complete Sale query returned no rows" in source


def test_history_retries_catalog_when_inventory_snapshot_is_empty():
    from app.main import should_include_catalog

    assert should_include_catalog("history", 3532, 0) is True
    assert should_include_catalog("history", 3532, 10973) is False
    assert should_include_catalog("daily_sync", 3532, 10973) is True


def test_empty_inventory_forces_full_catalog_query_in_history_runner():
    import inspect
    from app import main

    source = inspect.getsource(main._run_sync_background)
    assert "force_full_catalog = existing_inventory == 0" in source


def test_sale_query_requests_nested_product_fields():
    # Keep this assertion close to the client contract without making a live
    # request. The nested Product selection is required for item names.
    source = __import__("app.shopfront", fromlist=["ShopfrontClient"])
    import inspect
    text = inspect.getsource(source.ShopfrontClient.fetch_sales_graphql)
    assert "... on Product" in text
    assert "name description image alternateImages" in text


def test_report_continuation_key_is_consumed():
    import asyncio
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read()
        calls.append(payload)
        if len(calls) == 1:
            return httpx.Response(200, json={"completed": False, "key": "next", "data": {"data": [{"Revenue": "$1"}]}})
        return httpx.Response(200, json={"completed": True, "data": {"data": [{"Revenue": "$2"}]}})

    async def run():
        transport = httpx.MockTransport(handler)
        http = httpx.AsyncClient(transport=transport)
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=http)
        rows = await client.run_report("token", "SELECT revenue FROM sales BY outlet")
        await client.close()
        return rows

    rows = asyncio.run(run())
    assert [row["Revenue"] for row in rows] == ["$1", "$2"]
    assert b'"key":"next"' in calls[1]


def test_transient_shopfront_failure_is_retried():
    import asyncio
    import httpx

    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(request.url.path)
        if len(attempts) < 3:
            return httpx.Response(503, text="temporary")
        return httpx.Response(200, json={"data": {"ok": True}})

    async def run():
        client = ShopfrontClient(
            "skr", "client", "secret", "http://localhost/callback", "scope",
            http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        result = await client.graphql("token", "{ ok }")
        await client.close()
        return result

    assert asyncio.run(run()) == {"ok": True}
    assert len(attempts) == 3


def test_product_catalog_fetch_follows_cursor_pages():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        calls.append(payload)
        query = payload["query"]
        after = (payload.get("variables") or {}).get("after")
        if "coreSupplier" in query:
            node = {
                "id": "p1" if after is None else "p2",
                "coreSupplier": {"id": "sup-1", "name": "Acme"} if after is None else None,
                "lastSupplier": None,
                "suppliers": [{"supplier": {"id": "sup-1", "name": "Acme"}, "code": "A1"}] if after is None else [],
            }
            connection = {
                "edges": [{"node": node}],
                "pageInfo": {"hasNextPage": after is None, "endCursor": "cursor-2" if after is None else None},
            }
        elif after is None:
            connection = {"edges": [{"node": {"id": "p1", "name": "First", "additionalFields": [{"safeName": "vii_is_gift_card", "value": "true"}]}}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor-2"}}
        else:
            connection = {"edges": [{"node": {"id": "p2", "name": "Second", "additionalFields": [{"safeName": "vii_is_gift_card", "value": "false"}]}}], "pageInfo": {"hasNextPage": False, "endCursor": None}}
        return httpx.Response(200, json={"data": {"products": connection}})

    async def run():
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        products = await client.fetch_products("token", CATALOG_QUERY)
        await client.close()
        return products

    products = asyncio.run(run())
    assert [product["id"] for product in products] == ["p1", "p2"]
    catalog_calls = [call for call in calls if "coreSupplier" not in call["query"]]
    assert all("additionalFields { safeName value }" in call["query"] for call in catalog_calls if "additionalFields" in call["query"])
    assert len(catalog_calls) == 2
    assert products[0]["additionalFields"][0]["safeName"] == "vii_is_gift_card"
    assert products[0]["coreSupplier"]["id"] == "sup-1"
    assert "pageInfo { hasNextPage endCursor }" in catalog_calls[0]["query"]
    assert catalog_calls[0]["variables"]["after"] is None
    assert catalog_calls[1]["variables"]["after"] == "cursor-2"


def test_incremental_product_query_keeps_stock_units_and_enriches_suppliers_separately():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        query = payload["query"]
        calls.append(query)
        if "coreSupplier" in query:
            connection = {
                "edges": [{"node": {
                    "id": "p1",
                    "coreSupplier": {"id": "sup-1", "name": "Acme"},
                    "lastSupplier": None,
                    "suppliers": [{"supplier": {"id": "sup-1", "name": "Acme"}, "code": "A1"}],
                }}],
                "pageInfo": {"hasNextPage": False, "endCursor": None},
            }
        else:
            connection = {
                "edges": [{"node": {"id": "p1", "caseQuantity": 6, "inventory": []}}],
                "pageInfo": {"hasNextPage": False, "endCursor": None},
            }
        return httpx.Response(200, json={"data": {"products": connection}})

    async def run():
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        products = await client.fetch_products_incremental("token", "2026-11-05T00:00:00Z")
        await client.close()
        return products

    products = asyncio.run(run())
    assert [product["id"] for product in products] == ["p1"]
    assert products[0]["coreSupplier"]["id"] == "sup-1"
    assert products[0]["suppliers"][0]["code"] == "A1"
    base_calls = [query for query in calls if "coreSupplier" not in query]
    assert len(base_calls) == 2
    assert all("caseQuantity" in query and "singleLevel" in query and "caseLevel" in query for query in base_calls)
    assert any("coreSupplier { id name }" in query for query in calls)


def test_product_id_query_avoids_supplier_fields_in_base_selection_then_enriches():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        query = payload["query"]
        calls.append(query)
        if "coreSupplier" in query:
            node = {
                "id": "p1",
                "coreSupplier": {"id": "sup-9", "name": "Nine"},
                "lastSupplier": None,
                "suppliers": [],
            }
        else:
            node = {"id": "p1", "name": "Product"}
        return httpx.Response(200, json={"data": {"products": {
            "edges": [{"node": node}],
            "pageInfo": {"hasNextPage": False, "endCursor": None},
        }}})

    async def run():
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        products = await client.fetch_products_by_ids("token", ["p1"])
        await client.close()
        return products

    products = asyncio.run(run())
    assert products == [{"id": "p1", "name": "Product", "coreSupplier": {"id": "sup-9", "name": "Nine"}, "lastSupplier": None, "suppliers": []}]
    assert "coreSupplier { id name }" not in calls[0]
    assert "lastSupplier { id name }" not in calls[0]
    assert any("coreSupplier { id name }" in query for query in calls[1:])


def test_inventory_fetch_reports_paged_product_progress():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        calls.append(payload)
        next_page = payload["variables"]["after"] is not None
        connection = {
            "edges": [{"node": {"id": "p2" if next_page else "p1"}}],
            "pageInfo": {"hasNextPage": not next_page, "endCursor": "cursor-2" if not next_page else None},
        }
        return httpx.Response(200, json={"data": {"products": connection}})

    async def run():
        progress = []
        pages = []
        async def on_progress(field: str, count: int) -> None:
            progress.append((field, count))
        async def on_page(field: str, rows: list[dict], cursor: str | None, has_next: bool) -> None:
            pages.append((field, [row["id"] for row in rows], cursor, has_next))
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        products = await client.fetch_inventory("token", "query Products($after: Cursor) { products(first: 100, after: $after) { edges { node { id } } pageInfo { hasNextPage endCursor } } }", on_progress, page_callback=on_page)
        await client.close()
        return products, progress, pages

    products, progress, pages = asyncio.run(run())
    assert [product["id"] for product in products] == ["p1", "p2"]
    assert progress == [("products", 1), ("products", 2)]
    assert pages == [("products", ["p1"], "cursor-2", True), ("products", ["p2"], None, False)]


def test_sales_query_keeps_line_product_identity_and_falls_back_for_tenant_schema():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        calls.append(payload["query"])
        if len(calls) == 1:
            return httpx.Response(200, json={"errors": [{"message": "field not supported"}]})
        return httpx.Response(200, json={"data": {"sales": {"edges": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}}})

    async def run():
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        sales = await client.fetch_sales_graphql("token", "2026-10-01", "2026-10-01")
        await client.close()
        return sales

    assert asyncio.run(run()) == []
    assert len(calls) == 2
    for field in ("id clientId status invoiceId", "name barcodes { code quantity }", "payments { id amount status subtype }"):
        assert field in calls[0]
    assert "category" not in calls[0]
    assert "field not supported" not in calls[1]
