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


def test_legacy_row_is_consumed_once_for_repeated_product_sale_and_refund(monkeypatch):
    import asyncio
    from datetime import date
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app import sync
    from app.config import Settings
    from app.db import Base
    from app.models import Sale, SaleItem, Store

    a = {"id": "line-sale", "item": {"id": "water", "name": "Water"}, "quantity": 24, "totalPrice": 52, "tax": 4.73, "cost": 52.81}
    b = {**a, "id": "line-refund", "quantity": -24, "totalPrice": -64.99, "tax": -5.91, "cost": -52.81}
    row = {"id": "sale", "status": "COMPLETED", "createdAt": "2026-04-18T02:00:09Z", "totalPrice": -12.99, "totalTax": -1.18, "totalCost": 0, "items": [a, b], "payments": []}

    class Client:
        async def fetch_outlets(self, *_): return []
        async def fetch_sales_graphql(self, *_): return [row]
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
        for _ in range(2):
            asyncio.run(sync.sync_store(db, Settings(), store, date(2026, 4, 18), date(2026, 4, 18), include_catalog=False))
            items = db.scalars(select(SaleItem).order_by(SaleItem.line_key)).all()
            assert len(items) == 2
            by_id = {item.line_key: item for item in items}
            assert by_id["line-sale"].quantity == 24
            assert by_id["line-refund"].quantity == -24
            assert sum(item.cost for item in items) == 0
    engine.dispose()
