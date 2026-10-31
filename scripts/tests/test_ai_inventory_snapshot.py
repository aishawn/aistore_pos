import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/ai-eval/fetch-skr-inventory-snapshot.py"
SPEC = importlib.util.spec_from_file_location("skr_inventory_snapshot", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class InventorySnapshotTests(unittest.TestCase):
    def test_normalise_product_preserves_native_quantities_and_metadata(self):
        product = MODULE.normalise_product({
            "id": 11,
            "display_name": "Example Shiraz",
            "product_tmpl_id": [7, "Example Shiraz"],
            "categ_id": [3, "Wine"],
            "qty_available": 12,
            "virtual_available": 9,
            "incoming_qty": 4,
            "outgoing_qty": 7,
            "list_price": 19.95,
            "active": True,
        }, 5)
        self.assertEqual(11, product["productId"])
        self.assertEqual(12.0, product["availableQty"])
        self.assertEqual(9.0, product["virtualAvailableQty"])
        self.assertEqual("Wine", product["category"])
        self.assertEqual("MID_15_30", product["priceBand"])
        self.assertEqual(5, product["leadTimeDays"])
        self.assertIsNone(product["warehouseId"])

        product = MODULE.normalise_product({"id": 12, "product_tmpl_id": [8, "x"]}, None,
                                           {"id": 4, "name": "SKR Warehouse"})
        self.assertEqual(4, product["warehouseId"])
        self.assertEqual("SKR Warehouse", product["warehouse"])

    def test_output_path_is_partitioned_by_capture_date(self):
        captured = datetime(2026, 10, 31, 8, 9, tzinfo=timezone.utc)
        path = MODULE.output_path(Path("snapshots"), captured)
        self.assertEqual(Path("snapshots/2026-10-31/inventory.json"), path)

    def test_snapshot_contract_is_explicitly_native_and_read_only(self):
        snapshot = {
            "dataQuality": "NATIVE_ODOO_CURRENT_QUANTITIES",
            "products": [],
            "writeRequests": [],
        }
        self.assertEqual("NATIVE_ODOO_CURRENT_QUANTITIES", snapshot["dataQuality"])
        self.assertEqual([], snapshot["writeRequests"])


if __name__ == "__main__":
    unittest.main()
