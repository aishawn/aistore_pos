import asyncio
import json

import httpx
import pytest

from app.odoo import OdooIntegrationError, OdooSyncClient


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"jsonrpc": "2.0", "error": {"message": "Odoo Server Error", "data": {"message": "column missing"}}}, "column missing"),
        ({"jsonrpc": "2.0", "result": {"ok": False, "error": "schema upgrade required"}}, "schema upgrade required"),
        ({"jsonrpc": "2.0", "result": {"ok": True, "run_id": 4, "item_count": 0}}, None),
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


@pytest.mark.parametrize("snapshot_complete, expected_flags", [(True, {"replace": True, "snapshot_complete": True}), (False, {})])
def test_inventory_snapshot_flags_are_only_sent_for_complete_snapshot(snapshot_complete, expected_flags):
    async def run():
        captured = {}

        def handle(request):
            captured.update(json.loads(request.content)["params"])
            return httpx.Response(200, json={"jsonrpc": "2.0", "result": {"ok": True, "item_count": 1}})

        http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        client = OdooSyncClient("https://odoo.example", "token", "aipos_uat", True, http=http)
        try:
            await client.sync("inventory", "skr", [{"source_id": "product-1"}], snapshot_complete=snapshot_complete)
        finally:
            await client.close()

        assert {key: captured[key] for key in expected_flags} == expected_flags
        assert {key for key in captured if key in {"replace", "snapshot_complete"}} == set(expected_flags)

    asyncio.run(run())


def test_inventory_snapshot_finalizer_sends_full_source_id_set_without_replacing_mirror():
    async def run():
        captured = {}

        def handle(request):
            captured.update(json.loads(request.content)["params"])
            return httpx.Response(200, json={"jsonrpc": "2.0", "result": {"ok": True, "item_count": 0, "business": {}}})

        http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        client = OdooSyncClient("https://odoo.example", "token", "aipos_uat", True, business_write=True, http=http)
        try:
            await client.sync(
                "inventory",
                "skr",
                [],
                snapshot_finalize=True,
                snapshot_source_ids=["product-1", "product-2"],
            )
        finally:
            await client.close()

        assert captured["snapshot_finalize"] is True
        assert captured["snapshot_source_ids"] == ["product-1", "product-2"]
        assert "snapshot_complete" not in captured
        assert captured["items"] == []

    asyncio.run(run())
