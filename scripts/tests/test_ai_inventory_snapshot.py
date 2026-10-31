import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/ai-eval/fetch-skr-inventory-snapshot.py"
SPEC = importlib.util.spec_from_file_location("skr_inventory_snapshot", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class InventorySnapshotTests(unittest.TestCase):
    def test_environment_values_include_process_environment(self):
        previous = os.environ.get("SKR_TEST_ENV_VALUE")
        os.environ["SKR_TEST_ENV_VALUE"] = "available-to-scheduler"
        try:
            self.assertEqual("available-to-scheduler", MODULE.env_values()["SKR_TEST_ENV_VALUE"])
        finally:
            if previous is None:
                os.environ.pop("SKR_TEST_ENV_VALUE", None)
            else:
                os.environ["SKR_TEST_ENV_VALUE"] = previous

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
            "standard_price": 11.25,
            "type": "product",
            "sale_ok": True,
            "purchase_ok": True,
            "active": True,
        }, 5)
        self.assertEqual(11, product["productId"])
        self.assertEqual(12.0, product["availableQty"])
        self.assertEqual(9.0, product["virtualAvailableQty"])
        self.assertEqual("Wine", product["category"])
        self.assertEqual("MID_15_30", product["priceBand"])
        self.assertEqual(11.25, product["cost"])
        self.assertEqual("product", product["productType"])
        self.assertTrue(product["isStockable"])
        self.assertTrue(product["isPurchaseable"])
        self.assertTrue(product["isReplenishmentEligible"])

        service = MODULE.normalise_product({"id": 14, "type": "service"}, None)
        self.assertFalse(service["isStockable"])
        self.assertFalse(service["isReplenishmentEligible"])

        promoted = MODULE.normalise_product({"id": 13, "product_tmpl_id": [9, "Promo"]}, None,
                                            promotion={"id": 44, "compute_price": "percentage", "percent_price": 15},
                                            promotion_quality="ODOO_PRICELIST_RULES_READ")
        self.assertEqual("ACTIVE_RULE", promoted["promotionStatus"])
        self.assertEqual(44, promoted["promotionRuleId"])
        self.assertEqual(5, product["leadTimeDays"])
        self.assertIsNone(product["warehouseId"])

        product = MODULE.normalise_product({"id": 12, "product_tmpl_id": [8, "x"]}, None,
                                           {"id": 4, "name": "SKR Warehouse"})
        self.assertEqual(4, product["warehouseId"])
        self.assertEqual("SKR Warehouse", product["warehouse"])

    def test_missing_native_quantities_remain_missing(self):
        product = MODULE.normalise_product({"id": 10}, None)
        self.assertIsNone(product["availableQty"])
        self.assertIsNone(product["virtualAvailableQty"])

    def test_paginated_reads_keep_explicit_company_context(self):
        client = object.__new__(MODULE.Odoo)
        client.context = {"allowed_company_ids": [5], "force_company": 5}
        calls = []
        def call(path, params):
            calls.append(params)
            if params["method"] == "search_count":
                return 3
            return [{"id": 1}, {"id": 2}, {"id": 3}]
        client.call = call
        self.assertEqual(3, len(client.read("product.product", [], ["id"], limit=3)))
        self.assertEqual([5], calls[0]["kwargs"]["context"]["allowed_company_ids"])
        self.assertEqual("search_count", calls[1]["method"])
        client.count = lambda model, domain: 4
        with self.assertRaisesRegex(RuntimeError, "truncated"):
            client.read("product.product", [], ["id"], limit=3)

    def test_output_path_is_partitioned_by_capture_date(self):
        captured = datetime(2026, 10, 31, 8, 9, tzinfo=timezone.utc)
        path = MODULE.output_path(Path("snapshots"), captured)
        self.assertEqual(Path("snapshots/2026-10-31/inventory.json"), path)

    def test_output_path_uses_store_business_date_after_utc_day_boundary(self):
        captured = datetime(2026, 10, 31, 16, 0, tzinfo=timezone.utc)
        path = MODULE.output_path(Path("snapshots"), captured, "Australia/Adelaide")
        self.assertEqual(Path("snapshots/2026-11-01/inventory.json"), path)

    def test_jsonrpc_retries_transient_gateway_failure(self):
        class Response(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        class Opener:
            def __init__(self):
                self.calls = 0

            def open(self, _request, timeout):
                self.calls += 1
                if self.calls == 1:
                    raise urllib.error.HTTPError("https://odoo.invalid", 502, "Bad Gateway", {}, io.BytesIO())
                self.timeout = timeout
                return Response(b'{"result":{"ok":true}}')

        client = object.__new__(MODULE.Odoo)
        client.base = "https://odoo.invalid"
        client.opener = Opener()

        with patch.object(MODULE.time, "sleep"):
            result = client.call("/rpc", {"method": "read"})

        self.assertEqual({"ok": True}, result)
        self.assertEqual(2, client.opener.calls)

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
