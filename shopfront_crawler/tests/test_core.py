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
