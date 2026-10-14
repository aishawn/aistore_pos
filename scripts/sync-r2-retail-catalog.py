"""Replace R2 catalogue MOCK price/tax fallbacks in Odoo without touching stock.

Dry-run is the default. The --apply mode writes only list_price, taxes_id,
available_in_pos, and description_sale for R2 TEST templates in database aipos.
"""
import argparse
import importlib.util
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts" / "import-r2-test-catalog.py"
spec = importlib.util.spec_from_file_location("r2_catalog_source", IMPORTER_PATH)
source = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = source
spec.loader.exec_module(source)


def rpc(session, base, model, method, args, kwargs=None):
    response = session.post(
        f"{base}/web/dataset/call_kw",
        json={"jsonrpc": "2.0", "method": "call", "params": {
            "model": model, "method": method, "args": args, "kwargs": kwargs or {}
        }, "id": 1}, timeout=60,
    ).json()
    if response.get("error"):
        data = response["error"].get("data", {})
        raise RuntimeError(f"Odoo {model}.{method} failed: {data.get('name', 'RPC_ERROR')}")
    return response.get("result")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="update only R2 TEST price/tax fields in Odoo aipos")
    parser.add_argument("--sqlite-file", help="use a local SQLite file after verifying size and SHA against R2 manifest")
    args = parser.parse_args()

    sqlite_path, manifest, temporary = source.download_verified(args.sqlite_file)
    try:
        products, skipped_revisions = source.read_products(sqlite_path)
    finally:
        if temporary:
            Path(sqlite_path).unlink(missing_ok=True)

    prices = [item for item in products if item["price_gross"] is not None]
    no_prices = [item for item in products if item["price_gross"] is None]
    if len({item["source_id"] for item in products}) != len(products):
        raise RuntimeError("R2 source IDs are not unique after revision de-duplication")

    base = "https://odoo.orithos.com.au"
    session = requests.Session()
    env = source.ENV
    credentials = {
        "db": "aipos",
        "login": env.get("ODOO_SERVICE_USERNAME") or env["ODOO_USER"],
        "password": env.get("ODOO_SERVICE_PASSWORD") or env["ODOO_PASS"],
    }
    auth = session.post(f"{base}/web/session/authenticate", json={
        "jsonrpc": "2.0", "method": "call", "params": credentials, "id": 1,
    }, timeout=30).json().get("result") or {}
    if not auth.get("uid"):
        raise RuntimeError("Odoo authentication failed")

    rates = rpc(session, base, "account.tax", "search_read", [[
        ("type_tax_use", "=", "sale"), ("company_id", "=", 1), ("active", "=", True),
        ("amount_type", "=", "percent"),
    ]], {"fields": ["id", "amount", "name"], "limit": 100})
    rate_to_tax = {}
    for tax in rates:
        rate_to_tax.setdefault(round(float(tax["amount"]), 4), []).append(tax["id"])

    codes = [f"R2-{item['source_id'][:30]}" for item in products]
    categories = rpc(session, base, "product.category", "search_read", [[("name", "=", "R2 TEST DATA")]], {"fields": ["id"], "limit": 2})
    if len(categories) != 1:
        raise RuntimeError("Expected exactly one R2 TEST DATA category")
    rows = rpc(session, base, "product.template", "search_read", [[
        ("default_code", "in", codes), ("categ_id", "=", categories[0]["id"]),
    ]], {"fields": ["id", "default_code", "list_price", "taxes_id", "available_in_pos", "active", "description_sale"],
        "limit": 10000, "context": {"active_test": False}})
    by_code = {}
    for row in rows:
        by_code.setdefault(row["default_code"], []).append(row)

    missing_codes = [code for code in codes if code not in by_code]
    if missing_codes:
        raise RuntimeError(f"R2 sync stopped: {len(missing_codes)} imported product references are missing in Odoo")

    desired = []
    price_changes = 0
    tax_changes = 0
    pos_availability_changes = 0
    rate_unavailable = 0
    for item in products:
        code = f"R2-{item['source_id'][:30]}"
        rate = item["tax_rate"]
        price = item["price_gross"]
        tax_ids = []
        tax_supported = rate is None
        net_price = 0.0
        if price is not None:
            divisor = 1 + (rate or 0.0) / 100
            net_price = round(float(price) / divisor, 4)
        if rate is not None:
            matching = rate_to_tax.get(round(float(rate), 4), [])
            if len(matching) == 1:
                tax_ids = matching
                tax_supported = True
            else:
                tax_supported = False
                rate_unavailable += 1
        source_active = item["status"] != "NOT_ACTIVE"
        saleable = bool(source_active and price is not None and tax_supported)
        if price is None:
            price_note = "source catalogue has no quantity-1 price; no fallback price applied"
        else:
            price_note = f"source R2 retail gross {float(price):.2f}; tax rate {rate if rate is not None else 'not supplied'}%"
        if rate is not None and not tax_supported:
            tax_note = f"source tax rate {float(rate):g}% has no matching Odoo sale tax; unavailable in POS pending tax setup"
        elif rate is None:
            tax_note = "R2 source has no tax rate; unavailable in POS pending tax review"
        else:
            tax_note = f"source R2 tax rate {float(rate):g}%"
        note = f"R2 TEST DATA; {price_note}; {tax_note}; source snapshot SHA-256 {manifest['sha256']}"
        for existing in by_code[code]:
            values = {}
            if not math.isclose(float(existing["list_price"]), net_price, abs_tol=0.0002):
                values["list_price"] = net_price
                price_changes += 1
            if existing["taxes_id"] != tax_ids:
                values["taxes_id"] = [[6, 0, tax_ids]]
                tax_changes += 1
            should_be_available = bool(saleable and existing["active"])
            if bool(existing["available_in_pos"]) != should_be_available:
                values["available_in_pos"] = should_be_available
                pos_availability_changes += 1
            if (price is None or not tax_supported) and existing.get("description_sale") != note:
                values["description_sale"] = note
            if values:
                desired.append({"id": existing["id"], "default_code": code, "values": values})

    report = {
        "database": "aipos",
        "snapshotBytes": manifest["bytes"],
        "snapshotSha256": manifest["sha256"],
        "uniqueProducts": len(products),
        "historyRowsDeduplicated": skipped_revisions,
        "catalogPricesApplied": len(prices),
        "catalogPricesMissing": len(no_prices),
        "sourceTaxRates": {str(rate): sum(item["tax_rate"] == rate for item in products)
                            for rate in sorted({item["tax_rate"] for item in products if item["tax_rate"] is not None})},
        "sourceTaxMissing": sum(item["tax_rate"] is None for item in products),
        "sourceTaxRatesWithoutOdooMapping": rate_unavailable,
        "matchedOdooTemplates": len(rows),
        "templatesToUpdate": len(desired),
        "priceFieldChanges": price_changes,
        "taxFieldChanges": tax_changes,
        "posAvailabilityChanges": pos_availability_changes,
        "posProductsDisabledByThisSync": sum(
            "available_in_pos" in item["values"] and not item["values"]["available_in_pos"]
            for item in desired
        ),
        "mode": "apply" if args.apply else "dry-run",
        "stockFieldsWritten": False,
    }
    if not args.apply:
        print(json.dumps(report, indent=2))
        return

    backup = Path(tempfile.gettempdir()) / f"orithos-r2-retail-backup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    before = [{key: row.get(key) for key in ("id", "default_code", "list_price", "taxes_id", "available_in_pos", "active", "description_sale")}
              for row in rows]
    backup.write_text(json.dumps({"database": "aipos", "snapshotSha256": manifest["sha256"], "capturedAt": datetime.now(timezone.utc).isoformat(), "records": before}, indent=2), encoding="utf-8")

    for index, item in enumerate(desired, 1):
        rpc(session, base, "product.template", "write", [[item["id"]], item["values"]])
        if index % 50 == 0 or index == len(desired):
            print("UPDATED_RETAIL_TEMPLATES", index, "/", len(desired), flush=True)

    verified = rpc(session, base, "product.template", "search_read", [[("id", "in", [item["id"] for item in desired])]], {
        "fields": ["id", "list_price", "taxes_id", "available_in_pos"], "limit": len(desired),
        "context": {"active_test": False},
    })
    expected = {item["id"]: item["values"] for item in desired}
    mismatches = 0
    for row in verified:
        want = expected[row["id"]]
        if (("list_price" in want and not math.isclose(float(row["list_price"]), want["list_price"], abs_tol=0.0002))
                or ("taxes_id" in want and row["taxes_id"] != want["taxes_id"][0][2])
                or ("available_in_pos" in want and bool(row["available_in_pos"]) != want["available_in_pos"])):
            mismatches += 1
    report.update({"verifiedTemplates": len(verified), "verificationMismatches": mismatches, "backup": str(backup)})
    print(json.dumps(report, indent=2))
    if mismatches:
        raise RuntimeError(f"R2 retail sync verification found {mismatches} mismatch(es); recovery backup: {backup}")


if __name__ == "__main__":
    main()
