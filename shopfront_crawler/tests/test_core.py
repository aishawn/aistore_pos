from app.shopfront import ShopfrontClient
from app.sync import parse_decimal, verify_webhook


def test_authorization_url_contains_required_parameters():
    client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "run_advanced_reports")
    url = client.authorization_url("state-123")
    assert "https://skr.onshopfront.com/oauth/authorize" in url
    assert "client_id=client" in url
    assert "state=state-123" in url


def test_parse_decimal_handles_currency():
    assert parse_decimal("$1,234.50") == 1234.50
    assert parse_decimal("not-a-number") is None


def test_webhook_signature_verification():
    import hashlib
    import hmac

    body = b'{"id":"1"}'
    timestamp = "1700000000"
    signature = hmac.new(b"key", timestamp.encode() + body, hashlib.sha256).hexdigest()
    assert verify_webhook(body, signature, timestamp, "key")
    assert not verify_webhook(body, "bad", timestamp, "key")


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


def test_product_catalog_fetch_follows_cursor_pages():
    import asyncio
    import json
    import httpx

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read())
        calls.append(payload)
        if payload["variables"]["after"] is None:
            connection = {"edges": [{"node": {"id": "p1", "name": "First"}}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor-2"}}
        else:
            connection = {"edges": [{"node": {"id": "p2", "name": "Second"}}], "pageInfo": {"hasNextPage": False, "endCursor": None}}
        return httpx.Response(200, json={"data": {"products": connection}})

    async def run():
        client = ShopfrontClient("skr", "client", "secret", "http://localhost/callback", "scope", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        products = await client.fetch_products("token", "{ products(first: 100) { edges { node { id name } } } }")
        await client.close()
        return products

    products = asyncio.run(run())
    assert [product["id"] for product in products] == ["p1", "p2"]
    assert len(calls) == 24
    assert "pageInfo { hasNextPage endCursor }" in calls[0]["query"]
    assert calls[1]["variables"]["after"] == "cursor-2"
    assert calls[2]["variables"]["after"] is None


def test_sales_query_requests_product_metadata_and_falls_back_for_tenant_schema():
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
    for field in ("category { id name }", "prices { quantity price", "taxRate { id name }", "inventory { outlet { id name }"):
        assert field in calls[0]
    assert "field not supported" not in calls[1]
