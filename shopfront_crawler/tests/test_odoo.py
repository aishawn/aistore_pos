import asyncio

import httpx
import pytest

from app.odoo import OdooIntegrationError, OdooSyncClient


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"jsonrpc": "2.0", "error": {"message": "Odoo Server Error", "data": {"message": "column missing"}}}, "column missing"),
        ({"jsonrpc": "2.0", "result": {"ok": False, "error": "schema upgrade required"}}, "schema upgrade required"),
        ({"jsonrpc": "2.0", "result": {"ok": True, "run_id": 4}}, None),
    ],
)
def test_sync_requires_explicit_odoo_success(body, expected):
    async def run():
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
        http = httpx.AsyncClient(transport=transport)
        client = OdooSyncClient("https://odoo.example", "token", "aipos_uat", True, http=http)
        try:
            if expected:
                with pytest.raises(OdooIntegrationError, match=expected):
                    await client.sync("products", "skr", [])
            else:
                response = await client.sync("products", "skr", [])
                assert response["result"]["ok"] is True
        finally:
            await client.close()

    asyncio.run(run())
