import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/ai-eval/build-reconstructed-inventory-history.py"
SPEC = importlib.util.spec_from_file_location("reconstructed_inventory_history", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def snapshot(stock=7.0, moves=None, dates=None, sales=None):
    dates = dates or ["2026-01-01", "2026-01-02"]
    return {
        "source": "skr-odoo-readonly-sales-and-inventory-moves",
        "generatedAt": "2026-01-04T02:00:00+00:00",
        "inventoryCurrentAsOf": "2026-01-04T02:00:00+00:00",
        "timezone": "Australia/Adelaide",
        "series": [{"productId": 7, "dates": dates, "units": [1.0] * len(dates)}],
        "salesDaily": sales or [],
        "inventoryCurrent": [{"productId": 7, "stock": stock}],
        "inventoryMoves": moves or [],
        "dataQuality": {
            "orderPaginationComplete": True,
            "orderLimitReached": False,
            "detailFailures": 0,
            "inventoryHistory": "AVAILABLE",
            "inventoryHistoryFrom": "2025-11-01T00:00:00+00:00",
            "inventoryHistoryTo": "2026-01-04T02:00:00+00:00",
        },
        "writeRequests": [],
    }


class ReconstructedInventoryTests(unittest.TestCase):
    def test_reverses_completed_receipt_and_delivery_at_local_day_close(self):
        payload = snapshot(moves=[
            {"productId": 7, "date": "2026-01-02 00:00:00", "state": "done",
             "quantity": 10, "sourceUsage": "supplier", "destinationUsage": "internal"},
            {"productId": 7, "date": "2026-01-02 01:00:00", "state": "done",
             "quantity": 3, "sourceUsage": "internal", "destinationUsage": "customer"},
        ])

        history = MODULE.build_history(payload)

        self.assertEqual([0.0, 7.0], [row["availableQty"] for row in history["products"][0]["observations"]])
        self.assertEqual([True, False], [row["isStockout"] for row in history["products"][0]["observations"]])
        self.assertTrue(history["researchOnly"])
        self.assertEqual([], history["writeRequests"])

    def test_internal_transfer_does_not_change_company_inventory(self):
        payload = snapshot(stock=4.0, moves=[
            {"productId": 7, "date": "2026-01-03 00:00:00", "state": "done",
             "quantity": 99, "sourceUsage": "internal", "destinationUsage": "internal"},
        ])

        history = MODULE.build_history(payload)

        self.assertEqual([4.0, 4.0], [row["availableQty"] for row in history["products"][0]["observations"]])

    def test_sales_conflict_excludes_only_stockout_labels(self):
        dates = [f"2025-12-{day:02d}" for day in range(1, 29)]
        payload = snapshot(stock=0.0, dates=dates, sales=[
            {"productId": 7, "date": day, "units": 1.0} for day in dates
        ])

        history = MODULE.build_history(payload)

        self.assertEqual("READY_WITH_PRODUCT_EXCLUSIONS", history["researchBacktestReadiness"])
        self.assertEqual(7, history["qualityWarnings"][0]["productId"])

    def test_incomplete_move_history_is_rejected(self):
        payload = snapshot()
        payload["dataQuality"]["inventoryHistory"] = "INCOMPLETE"

        with self.assertRaisesRegex(ValueError, "complete inventory move history"):
            MODULE.build_history(payload)


if __name__ == "__main__":
    unittest.main()
