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
