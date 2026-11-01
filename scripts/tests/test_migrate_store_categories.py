import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("migration", Path(__file__).resolve().parents[1] / "migrate_store_categories.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.data = {
            "res.company": [{"id": 5, "name": "Store"}],
            "pos.category": [
                {"id": 1, "name": "Food", "parent_id": False, "company_id": False},
                {"id": 2, "name": "Bread", "parent_id": [1, "Food"], "company_id": False},
                {"id": 3, "name": " food ", "parent_id": False, "company_id": [5, "Store"]},
                {"id": 4, "name": "Drink", "parent_id": False, "company_id": [5, "Store"]},
                {"id": 5, "name": "Bread", "parent_id": [4, "Drink"], "company_id": [5, "Store"]},
                {"id": 6, "name": "Food", "parent_id": False, "company_id": [9, "Foreign"]},
            ],
            "product.template": [
                {"id": 10, "company_id": [5, "Store"], "pos_categ_ids": [1, 2, 3], "active": False},
                {"id": 11, "company_id": [9, "Foreign"], "pos_categ_ids": [1, 2]},
            ],
            "pos.config": [{"id": 20, "company_id": [5, "Store"], "iface_available_categ_ids": [2]}],
        }
        self.writes = []

    def matches(self, row, domain):
        tokens = iter(domain)
        def expression(token):
            if token == "|":
                left, right = expression(next(tokens)), expression(next(tokens))
                return left or right
            key, op, expected = token
            value = row[key]
            if key in ["company_id", "parent_id"] and value:
                value = value[0]
            if op == "=":
                return value == expected
            if op == ">":
                return value > expected
            if op == "in":
                return bool(set(value) & set(expected)) if isinstance(value, list) else value in expected
            raise AssertionError(op)
        return all([expression(token) for token in tokens])

    def rpc(self, model, method, args, **kwargs):
        if method == "fields_get":
            return {"iface_available_categ_ids": {"type": "many2many", "relation": "pos.category"}}
        if method == "search_read":
            return copy.deepcopy([row for row in self.data[model] if self.matches(row, args[0])][:kwargs.get("limit", 200)])
        self.writes.append((model, method, copy.deepcopy(args)))
        if method == "create":
            self.assertEqual(model, "pos.category")
            values = copy.deepcopy(args[0])
            self.assertEqual(values["company_id"], 5)
            values["id"] = max(row["id"] for row in self.data[model]) + 1
            values["company_id"] = [5, "Store"]
            if values["parent_id"]:
                values["parent_id"] = [values["parent_id"], "Parent"]
            self.data[model].append(values)
            return values["id"]
        self.assertEqual(method, "write")
        row = next(row for row in self.data[model] if row["id"] == args[0][0])
        self.assertEqual(row["company_id"], [5, "Store"])
        for field, commands in args[1].items():
            for command, category_id, _ in commands:
                if command == 3:
                    row[field].remove(category_id)
                elif command == 4 and category_id not in row[field]:
                    row[field].append(category_id)
                else:
                    self.fail("Unexpected relation command")
        return True

    def test_dry_run_includes_archived_and_configs_without_writes(self):
        result = migration.migrate(self.rpc, 5, "Store")
        self.assertEqual(result["categoriesToCreate"], 1)
        self.assertEqual(result["productsToUpdate"], 1)
        self.assertEqual(result["configFieldsToUpdate"], 1)
        self.assertEqual(self.writes, [])

    def test_migration_preserves_paths_other_stores_and_shared_data_and_is_resumable(self):
        before = copy.deepcopy(self.data)
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / ".local" / "migration.json"
            result = migration.migrate(self.rpc, 5, "Store", True, journal)
            self.assertTrue(result["verified"])
            self.assertTrue(journal.exists())
        self.assertEqual(self.data["pos.category"][:6], before["pos.category"])
        self.assertEqual(self.data["product.template"][1], before["product.template"][1])
        created = self.data["pos.category"][-1]
        self.assertEqual(created["parent_id"][0], 3)
        self.assertNotEqual(created["parent_id"][0], 4)
        self.assertEqual(sorted(self.data["product.template"][0]["pos_categ_ids"]), [3, created["id"]])
        self.assertEqual(self.data["pos.config"][0]["iface_available_categ_ids"], [created["id"]])
        writes = len(self.writes)
        self.assertEqual(migration.migrate(self.rpc, 5, "Store")["productsToUpdate"], 0)
        self.assertEqual(len(self.writes), writes)

    def test_mismatched_company_and_ambiguous_or_cyclic_categories_fail_before_writes(self):
        with self.assertRaises(ValueError):
            migration.migrate(self.rpc, 5, "Wrong store")
        self.data["pos.category"].append({"id": 7, "name": "Food", "parent_id": False, "company_id": [5, "Store"]})
        with self.assertRaises(ValueError):
            migration.migrate(self.rpc, 5, "Store")
        self.data["pos.category"].pop()
        self.data["pos.category"][0]["parent_id"] = [2, "Bread"]
        with self.assertRaises(ValueError):
            migration.migrate(self.rpc, 5, "Store")
        self.assertEqual(self.writes, [])

    def test_partial_product_updates_can_be_resumed(self):
        rpc = self.rpc
        def interrupted(model, method, args, **kwargs):
            if model == "product.template" and method == "write":
                raise TimeoutError("Simulated interruption after category creation")
            return rpc(model, method, args, **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(TimeoutError):
                migration.migrate(interrupted, 5, "Store", True, Path(directory) / ".local" / "first.json")
            self.assertEqual(migration.migrate(self.rpc, 5, "Store")["categoriesToCreate"], 0)
            result = migration.migrate(self.rpc, 5, "Store", True, Path(directory) / ".local" / "resume.json")
            self.assertTrue(result["verified"])


if __name__ == "__main__":
    unittest.main()
