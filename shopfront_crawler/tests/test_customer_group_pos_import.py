from app.main import _normalized_customer_group_item, _normalized_customer_item
from app.models import ShopfrontCustomer


def test_normalized_customer_group_item_requires_source_id_and_name():
    assert _normalized_customer_group_item({"id": "g1", "name": "Staff Group"}) == {
        "source_id": "g1",
        "name": "Staff Group",
    }
    assert _normalized_customer_group_item({"id": "g1", "name": "  "}) is None
    assert _normalized_customer_group_item({"name": "Staff Group"}) is None


def test_normalized_customer_item_flattens_group_without_raw_payload():
    item = ShopfrontCustomer(
        store_key="skr",
        source_id="c1",
        client_id="10",
        code="C10",
        name="Staff Member",
        email="staff@example.test",
        phone=None,
        mobile=None,
        customer_group="Staff Group",
        deleted=False,
        raw_payload={
            "firstName": "Staff",
            "lastName": "Member",
            "customerGroup": {"id": "g-staff", "name": "Staff Group"},
            "emails": ["staff@example.test"],
        },
    )
    payload = _normalized_customer_item(item)
    assert "raw_payload" not in payload
    assert payload["customer_group"] == {"id": "g-staff", "name": "Staff Group"}
    assert payload["source_id"] == "c1"
    assert payload["emails"] == ["staff@example.test"]
