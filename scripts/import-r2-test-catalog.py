"""Import the private R2 catalogue into the single configured Odoo pilot database.

Dry run is the default. Apply only with --apply. Import is intentionally tagged
R2 TEST; it does not import customer or sales receipt history.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import boto3
import requests
from botocore.config import Config

ROOT = Path(__file__).resolve().parents[1]
ENV = {}
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        ENV[key.strip()] = value.strip()

def rpc(session, base, model, method, args, kwargs=None):
    response = session.post(
        f"{base}/web/dataset/call_kw",
        json={"jsonrpc": "2.0", "method": "call", "params": {
            "model": model, "method": method, "args": args, "kwargs": kwargs or {}
        }, "id": 1}, timeout=90,
    ).json()
    if response.get("error"):
        data = response["error"].get("data", {})
        raise RuntimeError(f"Odoo {model}.{method} failed: {data.get('name', 'RPC_ERROR')}")
    return response.get("result")

def create_resilient(session, base, vals, rejected, barcode_omitted):
    """Create a batch, recursively isolating Odoo-invalid individual records."""
    if not vals:
        return []
    try:
        result = rpc(session, base, "product.template", "create", [vals])
        return result if isinstance(result, list) else [result]
    except RuntimeError:
        if len(vals) == 1:
            retry = dict(vals[0])
            if retry.pop("barcode", None):
                try:
                    created = rpc(session, base, "product.template", "create", [[retry]])
                    barcode_omitted.append(retry["default_code"])
                    return created if isinstance(created, list) else [created]
                except RuntimeError:
                    pass
            rejected.append(vals[0]["default_code"])
            return []
        middle = len(vals) // 2
        return create_resilient(session, base, vals[:middle], rejected, barcode_omitted) + create_resilient(session, base, vals[middle:], rejected, barcode_omitted)

def create_quants_resilient(session, base, vals, rejected):
    if not vals:
        return []
    try:
        result = rpc(session, base, "stock.quant", "create", [vals])
        return result if isinstance(result, list) else [result]
    except RuntimeError:
        if len(vals) == 1:
            rejected.append(vals[0]["product_id"])
            return []
        middle = len(vals) // 2
        return create_quants_resilient(session, base, vals[:middle], rejected) + create_quants_resilient(session, base, vals[middle:], rejected)

def download_verified(local_path=None):
    s3 = boto3.client(
        "s3", endpoint_url=ENV["R2_ENDPOINT"],
        aws_access_key_id=ENV["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=ENV["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"), region_name="auto",
    )
    bucket = ENV["R2_BUCKET"]
    manifest = json.loads(s3.get_object(Bucket=bucket, Key="shopfront/manifest.json")["Body"].read())
    item = next(x for x in manifest["objects"] if x["key"] == "shopfront/shopfront.sqlite3")
    if local_path:
        path = str(Path(local_path).resolve())
        digest = hashlib.sha256()
        count = 0
        with open(path, "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
                count += len(chunk)
        if count != item["bytes"] or digest.hexdigest() != item["sha256"]:
            raise RuntimeError("Local SQLite size/SHA-256 does not match current R2 manifest")
        return path, item, False
    fd, path = tempfile.mkstemp(prefix="orithos-r2-", suffix=".sqlite3")
    os.close(fd)
    digest = hashlib.sha256()
    count = 0
    with open(path, "wb") as out:
        for chunk in s3.get_object(Bucket=bucket, Key=item["key"])["Body"].iter_chunks(1024 * 1024):
            if chunk:
                out.write(chunk)
                digest.update(chunk)
                count += len(chunk)
    if count != item["bytes"] or digest.hexdigest() != item["sha256"]:
        os.unlink(path)
        raise RuntimeError("R2 SQLite size/SHA-256 does not match manifest")
    return path, item, True

def read_products(path):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    products = []
    seen = set()
    duplicate_rows_skipped = 0
    # Records may contain several crawled revisions. Keep the newest source row.
    for (raw,) in db.execute("SELECT values_json FROM records WHERE dataset='products_detail' ORDER BY last_seen_at DESC, id DESC"):
        row = json.loads(raw)
        detail = json.loads(row[4])
        source_id = str(detail.get("id") or row[0])
        if source_id in seen:
            duplicate_rows_skipped += 1
            continue
        seen.add(source_id)
        prices = detail.get("prices") or []
        unit = next((p for p in prices if str(p.get("quantity")) == "1" and isinstance(p.get("price"), (int, float))), None)
        tax = detail.get("taxRate") or {}
        if isinstance(tax, dict):
            try:
                tax_rate = float(tax.get("amount"))
            except (TypeError, ValueError):
                tax_rate = None
        else:
            tax_rate = None
        barcode = next((b.get("code") for b in detail.get("barcodes", []) if isinstance(b, dict) and b.get("code")), None)
        stock_rows = detail.get("inventory") or []
        quantity = float(stock_rows[0].get("quantity", 0)) if stock_rows else 0.0
        products.append({
            "source_id": source_id,
            "name": str(detail.get("name") or row[1]).strip(),
            "status": str(detail.get("status") or row[2]).upper(),
            "type": str(detail.get("type") or row[3]).upper(),
            "category": detail.get("category", {}).get("name") if isinstance(detail.get("category"), dict) else None,
            "price_gross": float(unit["price"]) if unit else None,
            "price_source": "R2" if unit else "MOCK_COST_FALLBACK",
            "tax_rate": tax_rate,
            "cost": float(detail["cost"]) if isinstance(detail.get("cost"), (int, float)) else None,
            "barcode": str(barcode) if barcode else None,
            "quantity": quantity,
            "case_quantity": detail.get("caseQuantity"),
        })
    db.close()
    return products, duplicate_rows_skipped

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the R2 TEST catalogue to Odoo aipos")
    parser.add_argument("--sqlite-file", help="use a local SQLite file after verifying it against the current R2 manifest")
    args = parser.parse_args()
    path, manifest, temporary = download_verified(args.sqlite_file)
    try:
        products, duplicate_rows_skipped = read_products(path)
    finally:
        if temporary:
            os.unlink(path)

    priced = [p for p in products if p["price_gross"] is not None]
    missing = [p for p in products if p["price_gross"] is None]
    # Deterministic fallback keeps missing-price records explicitly MOCK. It is
    # deliberately not presented as an AI or market recommendation.
    costs = sorted(p["cost"] for p in priced if p["cost"] is not None and p["cost"] > 0)
    fallback_gross = round(costs[len(costs) // 2] * 2.5 * 1.1, 2) if costs else 25.00
    for p in missing:
        p["price_gross"] = round(max(p["cost"] or fallback_gross / 2.75, 1.0) * 2.5 * 1.1, 2)
        p["price_source"] = "MOCK_COST_FALLBACK"
    if any(not p["name"] for p in products):
        raise RuntimeError("R2 source contains unnamed product")
    duplicates = len(products) - len({p["source_id"] for p in products})
    if duplicates:
        raise RuntimeError(f"deduplicated R2 source still has {duplicates} duplicate IDs")

    print(json.dumps({
        "database": "aipos", "snapshotBytes": manifest["bytes"],
        "snapshotSha256": manifest["sha256"], "products": len(products),
        "duplicateHistoryRowsSkipped": duplicate_rows_skipped,
        "sourcePrices": len(priced), "mockPriceFallbacks": len(missing),
        "sourceTax10": sum(p["tax_rate"] == 10 for p in products),
        "missingOrNonstandardTax": sum(p["tax_rate"] != 10 for p in products),
        "barcodeCount": sum(bool(p["barcode"]) for p in products),
        "stockRows": len(products), "mode": "apply" if args.apply else "dry-run",
    }, indent=2))
    if not args.apply:
        return

    # Save a private recovery record outside the repository before any writes.
    base = "https://odoo.orithos.com.au"
    session = requests.Session()
    login = session.post(f"{base}/web/session/authenticate", json={
        "jsonrpc": "2.0", "method": "call", "params": {
            "db": "aipos", "login": ENV.get("ODOO_SERVICE_USERNAME") or ENV["ODOO_USER"],
            "password": ENV.get("ODOO_SERVICE_PASSWORD") or ENV["ODOO_PASS"],
        }, "id": 1,
    }, timeout=30).json().get("result") or {}
    if not login.get("uid"):
        raise RuntimeError("Odoo authentication failed")

    demos = rpc(session, base, "product.template", "search_read", [[("name", "ilike", "DEMO |")]], {
        "fields": ["id", "name", "active", "available_in_pos", "list_price", "barcode", "taxes_id", "default_code"],
        "context": {"active_test": False},
    })
    incoming_barcodes = {p["barcode"] for p in products if p["barcode"]}
    existing_barcodes = rpc(session, base, "product.product", "search_read", [[("barcode", "in", list(incoming_barcodes))]], {
        "fields": ["id", "barcode", "default_code", "product_tmpl_id"], "limit": 10000,
    }) if incoming_barcodes else []
    # Re-runs must ignore barcodes already owned by this same R2 import.
    conflicts = [x for x in existing_barcodes if not (x.get("default_code") or "").startswith("R2-")]
    if conflicts:
        raise RuntimeError(f"R2 import stopped: {len(conflicts)} source barcodes already belong to other Odoo products")
    temp_dir = Path(tempfile.gettempdir())
    backup = temp_dir / f"orithos-r2-import-before-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    backup.write_text(json.dumps({"database": "aipos", "capturedAt": datetime.now(timezone.utc).isoformat(), "demoProducts": demos}, indent=2), encoding="utf-8")
    print("PRIVATE_BACKUP", str(backup))

    categories = rpc(session, base, "product.category", "search_read", [[("name", "=", "R2 TEST DATA")]], {"fields": ["id"], "limit": 1})
    category_id = categories[0]["id"] if categories else rpc(session, base, "product.category", "create", [{"name": "R2 TEST DATA"}])
    taxes = rpc(session, base, "account.tax", "search_read", [[("type_tax_use", "=", "sale"), ("amount", "=", 10), ("company_id", "=", 1), ("active", "=", True)]], {"fields": ["id"], "limit": 1})
    if not taxes:
        raise RuntimeError("No active 10% sale GST found in Odoo company")
    tax_id = taxes[0]["id"]

    records = []
    for p in products:
        tax_rate = p["tax_rate"] if p["tax_rate"] is not None else 10.0
        # Odoo sale tax is exclusive; R2 retail prices are stored inclusive.
        net_price = round(p["price_gross"] / (1 + (10.0 if tax_rate != 10 else tax_rate) / 100), 4)
        stock_note = "; source negative stock normalized to MOCK 0" if p["quantity"] < 0 else ""
        note = f"R2 TEST DATA; price source={p['price_source']}; tax source={'R2' if p['tax_rate'] == 10 else 'MOCK 10% GST fallback'}{stock_note}; snapshot={manifest['sha256']}"
        vals = {
            "name": f"R2 TEST | {p['name']}", "default_code": f"R2-{p['source_id'][:30]}",
            "list_price": net_price, "standard_price": p["cost"] or 0.0,
            "available_in_pos": True, "sale_ok": True, "purchase_ok": True,
            "categ_id": category_id, "company_id": 1, "type": "service" if p["type"] == "INTEGRATED" else "consu",
            "is_storable": p["type"] != "INTEGRATED",
            "taxes_id": [[6, 0, [tax_id]]], "active": p["status"] != "NOT_ACTIVE",
            "description_sale": note,
        }
        if p["barcode"]:
            vals["barcode"] = p["barcode"]
        records.append((vals, p))

    source_by_code = {v["default_code"]: p for v, p in records}
    all_codes = list(source_by_code)
    already = rpc(session, base, "product.template", "search_read", [[("default_code", "in", all_codes)]], {
        "fields": ["id", "default_code", "categ_id"], "limit": len(all_codes) + 20, "context": {"active_test": False},
    })
    template_by_code = {row["default_code"]: row["id"] for row in already if row.get("default_code") in source_by_code}
    rejected_codes = []
    barcode_omitted_codes = []
    progress = temp_dir / f"orithos-r2-import-progress-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    def save_progress():
        progress.write_text(json.dumps({"database": "aipos", "categoryId": category_id,
            "createdTemplateIds": list(template_by_code.values()), "rejectedSourceCodes": rejected_codes,
            "barcodeOmittedSourceCodes": barcode_omitted_codes,
            "backup": str(backup)}, indent=2), encoding="utf-8")
    save_progress()
    pending = [(v, p) for v, p in records if v["default_code"] not in template_by_code]
    for start in range(0, len(pending), 40):
        batch = pending[start:start + 40]
        create_resilient(session, base, [v for v, _ in batch], rejected_codes, barcode_omitted_codes)
        save_progress()
        # Resolve IDs by their stable R2 internal reference after each batch.
        codes = [v["default_code"] for v, _ in batch]
        found = rpc(session, base, "product.template", "search_read", [[("default_code", "in", codes)]], {
            "fields": ["id", "default_code"], "limit": len(codes) + 5, "context": {"active_test": False},
        })
        template_by_code.update({x["default_code"]: x["id"] for x in found})
        save_progress()
        print("CREATED_PRODUCTS", len(template_by_code), "REJECTED", len(rejected_codes), flush=True)

    # Preserve the R2 outlet stock quantities as inventory adjustments in the
    # configured WH/Stock location (location 5); no past receipt history is imported.
    created_ids = list(template_by_code.values())
    stockable_ids = [template_id for code, template_id in template_by_code.items() if source_by_code[code]["type"] != "INTEGRATED"]
    integrated_ids = [template_id for code, template_id in template_by_code.items() if source_by_code[code]["type"] == "INTEGRATED"]
    for start in range(0, len(stockable_ids), 500):
        rpc(session, base, "product.template", "write", [stockable_ids[start:start + 500], {"is_storable": True}])
    if integrated_ids:
        rpc(session, base, "product.template", "write", [integrated_ids, {"is_storable": False}])
    negative_templates = [template_id for code, template_id in template_by_code.items() if source_by_code[code]["quantity"] < 0]
    for start in range(0, len(negative_templates), 500):
        rpc(session, base, "product.template", "write", [negative_templates[start:start + 500], {
            "description_sale": f"R2 TEST DATA; source stock was negative and normalized to MOCK 0; snapshot={manifest['sha256']}"
        }])
    variants = rpc(session, base, "product.product", "search_read", [[("product_tmpl_id", "in", created_ids)]], {
        "fields": ["id", "product_tmpl_id"], "limit": len(created_ids) + 10, "context": {"active_test": False},
    })
    source_for_template = {template_id: source_by_code[code] for code, template_id in template_by_code.items()}
    qty_by_template = {template_id: source["quantity"] for template_id, source in source_for_template.items()}
    quants_to_create = []
    quant_targets = {}
    existing_quants = rpc(session, base, "stock.quant", "search_read", [[
        ("location_id", "=", 5), ("product_id", "in", [v["id"] for v in variants]),
    ]], {"fields": ["id", "product_id", "quantity"], "limit": max(len(variants) * 3, 100), "context": {"active_test": False}})
    quants_by_product = {}
    for quant in existing_quants:
        quants_by_product.setdefault(quant["product_id"][0], []).append(quant)
    negative_stock_normalized = 0
    nonstockable_stock_omitted = 0
    for variant in variants:
        tmpl = variant["product_tmpl_id"][0]
        source = source_for_template.get(tmpl, {})
        qty = qty_by_template.get(tmpl, 0.0)
        if qty < 0:
            negative_stock_normalized += 1
            qty = 0.0
        if source.get("type") == "INTEGRATED":
            nonstockable_stock_omitted += int(qty > 0)
            qty = 0.0
        current = sorted(quants_by_product.get(variant["id"], []), key=lambda item: item["id"])
        if current:
            # Reconcile all existing quant rows to one canonical count. This
            # makes reruns safe and repairs any previous partial import.
            quant_targets[current[0]["id"]] = qty
            for extra in current[1:]:
                quant_targets[extra["id"]] = 0.0
        elif qty > 0:
            quants_to_create.append({"product_id": variant["id"], "location_id": 5, "inventory_quantity": qty})
    quant_ids = list(quant_targets)
    for target in sorted(set(quant_targets.values())):
        target_ids = [qid for qid, value in quant_targets.items() if value == target]
        for start in range(0, len(target_ids), 500):
            rpc(session, base, "stock.quant", "write", [target_ids[start:start + 500], {"inventory_quantity": target}])
    rejected_quants = []
    for start in range(0, len(quants_to_create), 100):
        ids = create_quants_resilient(session, base, quants_to_create[start:start + 100], rejected_quants)
        quant_ids.extend(ids)
        progress.write_text(json.dumps({"database": "aipos", "categoryId": category_id, "createdTemplateIds": created_ids, "createdQuantIds": quant_ids, "backup": str(backup)}, indent=2), encoding="utf-8")
    for start in range(0, len(quant_ids), 100):
        rpc(session, base, "stock.quant", "action_apply_inventory", [quant_ids[start:start + 100]])
        print("APPLIED_STOCK_ADJUSTMENTS", min(start + 100, len(quant_ids)), "REJECTED", len(rejected_quants), flush=True)

    if demos:
        rpc(session, base, "product.template", "write", [[x["id"] for x in demos], {"active": False, "available_in_pos": False}])
    print(json.dumps({"result": "complete", "catalogProducts": len(created_ids), "rejectedProducts": len(rejected_codes), "barcodesOmittedForOdooValidation": len(barcode_omitted_codes), "stockQuantRowsReconciled": len(quant_ids), "negativeStockRowsNormalizedToZero": negative_stock_normalized, "nonstockableRowsOmitted": nonstockable_stock_omitted, "rejectedStockRows": len(rejected_quants), "archivedDemoProducts": len(demos), "backup": str(backup), "progress": str(progress)}, indent=2))

if __name__ == "__main__":
    main()
