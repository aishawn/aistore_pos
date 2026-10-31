import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/ai-eval/build-inventory-history.py"
SPEC = importlib.util.spec_from_file_location("inventory_history", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def snapshot(date, quantity, price, *, version=None):
    return {
        "snapshotVersion": version or f"skr-odoo-native-inventory-{date}",
        "source": "odoo-readonly-jsonrpc",
        "capturedAt": f"{date}T02:00:00+00:00",
        "dataQuality": "NATIVE_ODOO_CURRENT_QUANTITIES",
        "writeRequests": [],
        "products": [{
            "productId": 7, "templateId": 7, "name": "Test Shiraz",
            "category": "Wine", "brand": "Test", "priceBand": "MID_15_30",
            "warehouseId": 2, "warehouse": "Test Warehouse",
            "availableQty": quantity, "virtualAvailableQty": quantity + 2,
            "incomingQty": 3, "outgoingQty": 1, "leadTimeDays": 4,
            "price": price, "cost": 11.25,
        }],
    }


class InventoryHistoryTests(unittest.TestCase):
    def test_build_history_records_native_stockout_and_price_change(self):
        result = MODULE.build_history([snapshot("2026-10-01", 4, 19.99), snapshot("2026-10-02", 0, 21.99)])
        product = result["products"][0]
        self.assertEqual("NATIVE_ODOO_DAILY_SNAPSHOTS", result["dataQuality"])
        self.assertEqual("INSUFFICIENT_HISTORY", result["backtestReadiness"])
        self.assertEqual(["2026-10-02"], product["actualStockoutDates"])
        self.assertEqual([{"date": "2026-10-02", "from": 19.99, "to": 21.99}], product["priceChanges"])
        self.assertEqual("NOT_CAPTURED", product["promotionDataQuality"])
        self.assertEqual([], result["writeRequests"])
        self.assertEqual(3.0, product["observations"][0]["incomingQty"])
        self.assertEqual(11.25, product["observations"][0]["cost"])

    def test_load_snapshots_deduplicates_retries_by_capture_date(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "2026-10-01" / "inventory.json"
            retry = root / "retry" / "inventory.json"
            first.parent.mkdir()
            retry.parent.mkdir()
            first.write_text(json.dumps(snapshot("2026-10-01", 4, 19.99)), encoding="utf-8")
            retry.write_text(json.dumps(snapshot("2026-10-01", 0, 19.99, version="retry")), encoding="utf-8")
            loaded = MODULE.load_snapshots(root)
            self.assertEqual(1, len(loaded))
            self.assertEqual("retry", loaded[0]["snapshotVersion"])

    def test_history_exposes_snapshot_gaps_as_data_quality(self):
        result = MODULE.build_history([snapshot("2026-10-01", 4, 19.99), snapshot("2026-10-03", 4, 19.99)])
        self.assertEqual(3, result["coverageDays"])
        self.assertEqual(2, result["observedDays"])
        self.assertEqual(["2026-10-02"], result["missingSnapshotDates"])
        self.assertEqual("GAPS_PRESENT", result["continuityStatus"])

    def test_rejects_write_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.mkdir(exist_ok=True)
            item = snapshot("2026-10-01", 4, 19.99)
            item["writeRequests"] = [{"method": "create"}]
            path = root / "inventory.json"
            path.write_text(json.dumps(item), encoding="utf-8")
            with self.assertRaises(ValueError):
                MODULE.load_snapshots(root)


if __name__ == "__main__":
    unittest.main()
