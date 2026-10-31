import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "ai-eval" / "validate-inventory-snapshot.py"
SPEC = importlib.util.spec_from_file_location("snapshot_validator", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
validate = MODULE.validate


def product(product_id=1):
    return {
        "productId": product_id, "availableQty": 1, "virtualAvailableQty": 1,
        "incomingQty": 0, "outgoingQty": 0, "price": 10, "cost": 5,
        "leadTimeDays": 3, "warehouseId": 1, "promotionStatus": "NONE",
    }


def snapshot(products=None):
    return {
        "source": "odoo-readonly-jsonrpc",
        "snapshotVersion": "test-2026-10-31",
        "capturedAt": "2026-10-31T02:00:00+00:00",
        "writeRequests": [],
        "warehouseScope": "SINGLE_WAREHOUSE",
        "dataQuality": "NATIVE_ODOO_CURRENT_QUANTITIES",
        "products": products or [product()],
    }


def test_valid_snapshot_passes():
    assert validate(snapshot())["status"] == "PASS"


def test_duplicate_product_ids_fail_closed():
    report = validate(snapshot([product(), product(1)]))
    assert report["status"] == "FAIL"
    assert "duplicate productId values" in report["errors"]


def test_count_change_is_warning():
    report = validate(snapshot(), previous_count=10)
    assert report["status"] == "WARN"
    assert report["warnings"]
