from decimal import Decimal

from app.sync import sale_tax_amount


def test_explicit_zero_is_preserved_and_null_alias_does_not_hide_tax():
    assert sale_tax_amount({"totalTax": 0}) == Decimal(0)
    assert sale_tax_amount({"Tax Amount": None, "totalTax": "1.22"}) == Decimal("1.22")


def test_line_and_order_tax_are_amounts_not_rates():
    assert sale_tax_amount({"quantity": 6, "tax": "1.73"}, line=True) == Decimal("1.73")
    assert sale_tax_amount({"taxRate": 10}, line=True) is None
    assert sale_tax_amount({"taxAmount": "0.45"}, line=True) == Decimal("0.45")


def test_conflicting_invalid_and_missing_tax_remain_unresolved():
    assert sale_tax_amount({"tax": 0, "taxAmount": 1}, line=True) is None
    assert sale_tax_amount({"tax": "NaN"}, line=True) is None
    assert sale_tax_amount({"tax": "Infinity"}, line=True) is None
    assert sale_tax_amount({}, line=True) is None
    assert sale_tax_amount({"totalTax": "-0.45"}) == Decimal("-0.45")


def test_optional_sale_detail_timeout_records_warning_and_keeps_source_payload():
    import asyncio
    from app.sync import enrich_sale_detail

    class Client:
        async def fetch_sale_detail(self, *_):
            await asyncio.sleep(1)

    row = {"id": "sale-1", "items": [{"item": {"id": "product-1"}}]}
    warnings = []

    async def run():
        return await enrich_sale_detail(
            Client(), "token", "sale-1", row, "query", warnings,
            timeout_seconds=0.001,
        )

    assert asyncio.run(run()) is row
    assert warnings == [{
        "stage": "sale_detail",
        "sale_id": "sale-1",
        "message": "Optional sale detail unavailable; retained the complete-sale query payload.",
    }]


def test_legacy_row_is_consumed_once_for_repeated_product_sale_and_refund(monkeypatch):
    import asyncio
    from copy import deepcopy
    from datetime import date
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app import sync
    from app.config import Settings
    from app.db import Base
    from app.models import Sale, SaleItem, Store

    a = {"id": "line-sale", "item": {"id": "water", "name": "Water"}, "quantity": 24, "totalPrice": 52, "tax": 4.73, "cost": 52.81}
    b = {**a, "id": "line-refund", "quantity": -24, "totalPrice": -64.99, "tax": -5.91, "cost": -52.81}
    row = {"id": "sale", "status": "COMPLETED", "createdAt": "2026-04-18T02:00:09Z", "updatedAt": "2026-04-18T02:00:10Z", "totalPrice": -12.99, "totalTax": -1.18, "totalCost": 0, "items": [a, b], "payments": []}

    class Client:
        async def fetch_outlets(self, *_): return []
        async def fetch_sales_graphql(self, *_): return [deepcopy(row)]
        async def close(self): pass

    async def token(*_): return "fixture"
    monkeypatch.setattr(sync, "get_client", lambda *_: Client())
    monkeypatch.setattr(sync, "access_token", token)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        store = Store(store_key="skr", vendor="skr")
        sale = Sale(store_key="skr", shopfront_sale_id="sale", status="INCOMPLETE")
        sale.items.append(SaleItem(shopfront_product_id="water", line_key=None))
        db.add_all([store, sale]); db.commit()
        for attempt in range(3):
            if attempt == 1:
                row.update(linkedSale={"id": "original"}, totalRounding=0)
                for item in row["items"]:
                    item.update(caseQuantity=24, metaData="")
            asyncio.run(sync.sync_store(db, Settings(), store, date(2026, 4, 18), date(2026, 4, 18), include_catalog=False))
            items = db.scalars(select(SaleItem).order_by(SaleItem.line_key)).all()
            assert len(items) == 2
            by_id = {item.line_key: item for item in items}
            assert by_id["line-sale"].quantity == 24
            assert by_id["line-refund"].quantity == -24
            assert sum(item.cost for item in items) == 0
            if attempt:
                assert sale.raw_payload["linkedSale"] == {"id": "original"}
    engine.dispose()


def test_same_source_version_does_not_skip_new_refund_and_pack_evidence():
    from copy import deepcopy
    from datetime import datetime, timezone
    from app.models import Sale
    from app.sync import _sale_is_complete_and_unchanged

    old = {"id": "refund", "status": "COMPLETED", "updatedAt": "2026-11-01T00:00:00Z",
           "items": [{"id": "refund-line", "quantity": -1}], "payments": []}
    sale = Sale(status="COMPLETED", updated_at=datetime(2026, 11, 1, tzinfo=timezone.utc), raw_payload=deepcopy(old))
    incoming = {**deepcopy(old), "linkedSale": {"id": "original"}, "totalRounding": 0}
    incoming["items"][0].update(caseQuantity=6, metaData="")
    assert not _sale_is_complete_and_unchanged(sale, incoming, 1)
    sale.raw_payload = deepcopy(incoming)
    assert _sale_is_complete_and_unchanged(sale, incoming, 1)
    for key, changed in [("linkedSale", None), ("totalRounding", -0.01)]:
        updated = deepcopy(incoming); updated[key] = changed
        assert not _sale_is_complete_and_unchanged(sale, updated, 1)
    for key, changed in [("caseQuantity", 12), ("metaData", '{"originalLine":"line"}')]:
        updated = deepcopy(incoming); updated["items"][0][key] = changed
        assert not _sale_is_complete_and_unchanged(sale, updated, 1)


def test_sale_query_keeps_parent_refund_evidence_and_only_declares_used_outlet_variable():
    import asyncio
    import httpx
    from app.shopfront import ShopfrontClient

    async def run(outlets):
        calls = []
        def handler(request):
            import json
            body = json.loads(request.content); calls.append(body)
            assert ("$outlets" in body["query"]) == bool(outlets)
            assert body["variables"].get("outlets") == (outlets or None)
            return httpx.Response(200, json={"data": {"sales": {"edges": [{"node": {
                "id": "refund", "linkedSale": {"id": "original"}, "totalRounding": 0,
                "items": [{"id": "line", "caseQuantity": 6, "metaData": ""}]
            }}], "pageInfo": {"hasNextPage": False, "endCursor": None}}}})
        client = ShopfrontClient("skr", "", "", "", "", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        try:
            rows = await client.fetch_sales_graphql("fixture", "2026-11-02", "2026-11-02", outlet_ids=outlets)
            assert rows[0]["linkedSale"]["id"] == "original"
            assert rows[0]["items"][0]["caseQuantity"] == 6
            assert "linkedSale { id }" in calls[0]["query"]
            assert "caseQuantity" in calls[0]["query"] and "totalRounding" in calls[0]["query"]
        finally:
            await client.close()
    asyncio.run(run(None))
    asyncio.run(run(["outlet-1"]))
