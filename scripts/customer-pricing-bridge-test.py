"""Execute the public bridge with fake ORM records; no Odoo or network writes.

This checks bridge policy and dispatch, not the real Odoo pricing engine.
"""
import importlib.util
import math
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest


class AccessError(Exception):
    pass


class ValidationError(Exception):
    pass


odoo = ModuleType("odoo")
odoo.models = SimpleNamespace(Model=object)
odoo.fields = SimpleNamespace(Datetime=SimpleNamespace(now=lambda: "fixture-date"), Many2one=lambda *a, **k: None)
exceptions = ModuleType("odoo.exceptions")
exceptions.AccessError, exceptions.ValidationError = AccessError, ValidationError
sys.modules.update({"odoo": odoo, "odoo.exceptions": exceptions})
source = Path(__file__).resolve().parents[2] / "orithos_odoo/addons/orithos_au_retail/models/pos_pricing.py"
spec = importlib.util.spec_from_file_location("pricing_bridge", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Record(SimpleNamespace):
    def ensure_one(self):
        pass

    def check_access(self, mode):
        if getattr(self, "denied", False):
            raise AccessError("Denied")

    def with_company(self, company):
        return self

    def browse(self, record_id):
        if record_id != self.id:
            raise AccessError("Unknown record")
        return self

    def exists(self):
        return self

    def __len__(self):
        return 1


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.company = Record(id=41)
        self.currency = Record(name="AUD")
        self.product = Record(id=10, company_id=self.company, available_in_pos=True, lst_price=12)
        self.calls = []
        def price(product, quantity, date):
            self.calls.append((product.id, quantity, date))
            return 8 if quantity >= 12 else 10
        self.list = Record(id=3, name="Members", active=True, company_id=self.company, currency_id=self.currency, _get_product_price=price)
        self.partner = Record(id=1, company_id=self.company, property_product_pricelist=self.list)
        self.user = Record(company_ids=[self.company], has_group=lambda group: True)
        class Env(dict):
            pass
        class EmptyPartner(Record):
            def __len__(self):
                return 0
        self.env = Env({"res.partner": EmptyPartner(browse=self.partner.browse), "product.product": self.product})
        self.env.user = self.user
        self.env.context = {"allowed_company_ids": [41]}
        self.config = Record(env=self.env, company_id=self.company, currency_id=self.currency, pricelist_id=self.list)

    def quote(self, quantities=None, partner=False):
        return module.PosConfig.orithos_quote_prices(self.config, quantities if quantities is not None else [{"productId": 10, "quantity": 13}], partner)

    def test_customer_tier_and_engine_dispatch(self):
        result = self.quote(partner=1)
        self.assertEqual(result["priceSource"], "customer")
        self.assertEqual(result["prices"], [{"productId": 10, "unitPrice": 8}])
        self.assertEqual(self.calls, [(10, 13, "fixture-date")])

    def test_register_and_base_fallback(self):
        self.assertEqual(self.quote()["priceSource"], "register")
        self.config.pricelist_id = False
        self.assertEqual(self.quote()["prices"][0]["unitPrice"], 12)
        self.assertEqual(self.quote()["priceSource"], "base")

    def test_engine_failure_never_uses_base(self):
        self.list._get_product_price = lambda *a, **k: (_ for _ in ()).throw(ValidationError("Broken rule"))
        with self.assertRaises(ValidationError):
            self.quote()

    def test_company_and_role_scope(self):
        for mutate in [lambda: self.env.context.update(allowed_company_ids=[99]), lambda: setattr(self.user, "company_ids", []), lambda: setattr(self.user, "has_group", lambda group: False)]:
            self.setUp()
            mutate()
            with self.assertRaises(AccessError):
                self.quote()

    def test_foreign_relations_and_currency(self):
        for record in [self.partner, self.product, self.list]:
            record.company_id = Record(id=99)
            with self.assertRaises(AccessError):
                self.quote(partner=1)
            record.company_id = self.company
        self.list.currency_id = Record(name="NZD")
        with self.assertRaises(ValidationError):
            self.quote()

    def test_invalid_public_inputs(self):
        for quantities in [[], [None], [False], [{"productId": -1, "quantity": 1}], [{"productId": 10, "quantity": math.inf}], [{"productId": 10, "quantity": True}], [{"productId": 10, "quantity": 1}] * 2]:
            with self.subTest(quantities=quantities), self.assertRaises(ValidationError):
                self.quote(quantities)
        for partner in [True, -1, "1", [1]]:
            with self.subTest(partner=partner), self.assertRaises(ValidationError):
                self.quote(partner=partner)


if __name__ == "__main__":
    unittest.main(verbosity=2)
