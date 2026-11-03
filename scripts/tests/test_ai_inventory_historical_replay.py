import json
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "forecast-service"))

from scripts.ai_inventory_historical_replay import load_series


class InventoryHistoricalReplayTests(unittest.TestCase):
    def snapshots(self, quality):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(2)]
        sales = {"writeRequests": [], "series": [{
            "productId": 7,
            "dates": [item.isoformat() for item in dates],
            "units": [1, 0],
        }]}
        inventory = {
            "source": "odoo-readonly-jsonrpc",
            "dataQuality": quality,
            "businessTimezone": "Australia/Adelaide",
            "writeRequests": [],
            "qualityWarnings": [],
            "products": [{
                "productId": 7,
                "observations": [{
                    "date": item.isoformat(),
                    "capturedAt": datetime.combine(item, datetime.min.time().replace(hour=12)).isoformat() + "+10:30",
                    "dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS",
                    "availableQty": 1,
                    "isStockout": False,
                } for item in dates],
            }],
        }
        return sales, inventory

    def test_accepts_native_time_verified_inventory(self):
        sales, inventory = self.snapshots("NATIVE_ODOO_DAILY_SNAPSHOTS")
        with tempfile.TemporaryDirectory() as directory:
            sales_path = Path(directory) / "sales.json"
            inventory_path = Path(directory) / "inventory.json"
            sales_path.write_text(json.dumps(sales), encoding="utf-8")
            inventory_path.write_text(json.dumps(inventory), encoding="utf-8")
            rows = load_series(sales_path, inventory_path, 10)
        self.assertEqual([7], [row.productId for row in rows])

    def test_rejects_reconstructed_inventory_labels(self):
        sales, inventory = self.snapshots("ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE")
        with tempfile.TemporaryDirectory() as directory:
            sales_path = Path(directory) / "sales.json"
            inventory_path = Path(directory) / "inventory.json"
            sales_path.write_text(json.dumps(sales), encoding="utf-8")
            inventory_path.write_text(json.dumps(inventory), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "native Odoo daily inventory snapshots"):
                load_series(sales_path, inventory_path, 10)


if __name__ == "__main__":
    unittest.main()
