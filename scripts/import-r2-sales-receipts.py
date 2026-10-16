"""Import R2 Shopfront sales_receipts into Odoo aipos as formal pos.order rows.

Dry run is the default. Apply only with --apply.

- Completed receipts only; walk-in customers (partner_id=false)
- Lines matched by product name → R2-{source_id} (no product ids in source)
- Undated receipts use --fallback-date
- After apply, stock is reset to the current R2 products_detail snapshot
  unless --skip-stock-reset is set (debug only)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import time
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

GST_FACTOR = 1.10
LOCATION_ID = 5
COMPANY_ID = 1
PSEUDO_PAYMENT = re.compile(r"^\(.*\)$|change", re.I)


def rpc(session, base, model, method, args, kwargs=None, timeout=120, retries=5):
    last_error = None
    for attempt in range(retries):
        try:
            response = session.post(
                f"{base}/web/dataset/call_kw",
                json={
                    "jsonrpc": "2.0",
                    "method": "call",
                    "params": {"model": model, "method": method, "args": args, "kwargs": kwargs or {}},
                    "id": 1,
                },
                timeout=timeout,
            ).json()
            if response.get("error"):
                data = response["error"].get("data", {})
                message = data.get("message") or data.get("name") or response["error"].get("message") or "RPC_ERROR"
                raise RuntimeError(f"Odoo {model}.{method} failed: {message}")
            return response.get("result")
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, requests.exceptions.ChunkedEncodingError) as exc:
            last_error = exc
            wait = min(60, 2 ** attempt)
            print(f"RPC_RETRY {model}.{method} attempt={attempt + 1}/{retries} wait={wait}s error={exc}", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"Odoo {model}.{method} failed after {retries} retries: {last_error}")


def parse_amount(value) -> float:
    try:
        parsed = float(re.sub(r"[^0-9.-]", "", str(value if value is not None else "")) or 0)
    except (TypeError, ValueError):
        return 0.0
    return parsed if parsed == parsed else 0.0


def parse_json(value, fallback):
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str) or not value.strip():
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def normalize_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    # Shopfront often appends this suffix on discontinued SKUs while the
    # catalogue row still uses the base product name.
    cleaned = re.sub(r"\s*-\s*deleted\s*$", "", cleaned, flags=re.I).strip()
    return cleaned.casefold()


def download_verified(local_path=None, allow_stale_sqlite=False):
    s3 = boto3.client(
        "s3",
        endpoint_url=ENV["R2_ENDPOINT"],
        aws_access_key_id=ENV["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=ENV["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
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
        local_sha = digest.hexdigest()
        if count != item["bytes"] or local_sha != item["sha256"]:
            if not allow_stale_sqlite:
                raise RuntimeError("Local SQLite size/SHA-256 does not match current R2 manifest")
            print(json.dumps({
                "warning": "stale_sqlite_allowed",
                "localBytes": count,
                "localSha256": local_sha,
                "manifestBytes": item["bytes"],
                "manifestSha256": item["sha256"],
            }), flush=True)
            # Keep reporting the local digest so resume/UAT stay consistent with
            # the snapshot that produced the in-progress import.
            item = {"key": item["key"], "bytes": count, "sha256": local_sha}
        return path, item, False
    fd, path = tempfile.mkstemp(prefix="orithos-r2-sales-", suffix=".sqlite3")
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
    for (raw,) in db.execute(
        "SELECT values_json FROM records WHERE dataset='products_detail' ORDER BY last_seen_at DESC, id DESC"
    ):
        row = json.loads(raw)
        detail = json.loads(row[4])
        source_id = str(detail.get("id") or row[0])
        if source_id in seen:
            continue
        seen.add(source_id)
        stock_rows = detail.get("inventory") or []
        quantity = float(stock_rows[0].get("quantity", 0)) if stock_rows else 0.0
        products.append({
            "source_id": source_id,
            "name": str(detail.get("name") or row[1]).strip(),
            "type": str(detail.get("type") or row[3]).upper(),
            "quantity": quantity,
            "default_code": f"R2-{source_id[:30]}",
        })
    db.close()
    return products


def read_receipts(path):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    db.execute("PRAGMA temp_store = MEMORY")
    schemas = db.execute(
        "SELECT headers_json FROM records WHERE dataset='sales_receipts' GROUP BY headers_json"
    ).fetchall()
    receipts = []
    for (headers_json,) in schemas:
        headers = parse_json(headers_json, [])
        if not isinstance(headers, list) or "invoice_number" not in headers or "items_json" not in headers:
            continue
        index = {name: i for i, name in enumerate(headers)}

        def at(values, name, default=None):
            i = index.get(name)
            if i is None or i >= len(values):
                return default
            return values[i]

        for (values_json,) in db.execute(
            "SELECT values_json FROM records WHERE dataset='sales_receipts' AND headers_json = ?",
            (headers_json,),
        ):
            values = parse_json(values_json, [])
            if not isinstance(values, list):
                continue
            invoice = str(at(values, "invoice_number") or "").strip()
            status = str(at(values, "status") or "").strip()
            sale_id = str(at(values, "sale_id") or "").strip()
            sale_date = str(at(values, "sale_date") or "").strip()
            sale_time = str(at(values, "sale_time") or "00:00:00").strip() or "00:00:00"
            items = parse_json(at(values, "items_json"), [])
            payments = parse_json(at(values, "payments_json"), [])
            if not isinstance(items, list):
                items = []
            if not isinstance(payments, list):
                payments = []
            base_price = parse_amount(at(values, "base_price"))
            savings = parse_amount(at(values, "savings"))
            discount = parse_amount(at(values, "discount"))
            rounding = parse_amount(at(values, "rounding"))
            change = parse_amount(at(values, "change"))
            tax = parse_amount(at(values, "tax"))
            surcharges = 0.0
            for row in parse_json(at(values, "surcharges_json"), []):
                if isinstance(row, dict):
                    surcharges += parse_amount(row.get("amount") or row.get("total"))
            subtotal = max(0.0, base_price - savings - discount)
            total = round(subtotal + rounding + surcharges, 2)
            receipts.append({
                "invoice_number": invoice,
                "sale_id": sale_id,
                "status": status,
                "sale_date": sale_date,
                "sale_time": sale_time,
                "items": items,
                "payments": payments,
                "tax": tax,
                "rounding": rounding,
                "change": change,
                "total": total,
                "has_date": bool(re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", sale_date)),
            })
    db.close()
    return receipts


def date_order_from_receipt(receipt, fallback_date: str) -> tuple[str, bool]:
    if receipt["has_date"]:
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", receipt["sale_date"])
        if match:
            day, month, year = match.groups()
            time_part = receipt["sale_time"] if re.match(r"^\d{2}:\d{2}:\d{2}$", receipt["sale_time"]) else "00:00:00"
            return f"{year}-{month.zfill(2)}-{day.zfill(2)} {time_part}", False
    return fallback_date, True


def receipt_uuid(receipt) -> str:
    key = receipt["sale_id"] or receipt["invoice_number"]
    # Keep uuids filesystem/RPC friendly; Shopfront invoices often start with '#'.
    key = re.sub(r"[^A-Za-z0-9._-]+", "-", str(key)).strip("-") or "unknown"
    return f"r2-{key}"[:64]


def map_payment_method(method_name: str, methods_by_key: dict):
    raw = (method_name or "").strip()
    if not raw or PSEUDO_PAYMENT.search(raw):
        return None, "pseudo"
    upper = raw.upper()
    if "CASH" in upper:
        return methods_by_key.get("cash"), "cash"
    if "EFTPOS" in upper or "CARD" in upper or "CREDIT" in upper:
        return methods_by_key.get("card") or methods_by_key.get("bank"), "card"
    if "DEPOSIT" in upper or "TRANSFER" in upper or "DIRECT" in upper:
        return methods_by_key.get("bank") or methods_by_key.get("card"), "bank"
    return methods_by_key.get("cash"), "fallback_cash"


def build_name_maps(products):
    by_norm = {}
    ambiguous = set()
    for product in products:
        key = normalize_name(product["name"])
        if not key:
            continue
        if key in by_norm and by_norm[key]["source_id"] != product["source_id"]:
            ambiguous.add(key)
        else:
            by_norm[key] = product
    for key in ambiguous:
        by_norm.pop(key, None)
    return by_norm, ambiguous


def authenticate(session, base):
    login = session.post(
        f"{base}/web/session/authenticate",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "db": "aipos",
                "login": ENV.get("ODOO_SERVICE_USERNAME") or ENV["ODOO_USER"],
                "password": ENV.get("ODOO_SERVICE_PASSWORD") or ENV["ODOO_PASS"],
            },
            "id": 1,
        },
        timeout=30,
    ).json().get("result") or {}
    if not login.get("uid"):
        raise RuntimeError("Odoo authentication failed")
    return login["uid"]


def load_odoo_product_map(session, base, products):
    codes = [p["default_code"] for p in products]
    by_code = {}
    for start in range(0, len(codes), 500):
        batch = codes[start:start + 500]
        rows = rpc(
            session,
            base,
            "product.product",
            "search_read",
            [[("default_code", "in", batch)]],
            {
                "fields": ["id", "default_code", "name", "taxes_id", "product_tmpl_id", "lst_price"],
                "limit": len(batch) + 20,
                "context": {"active_test": False},
            },
        )
        for row in rows:
            code = row.get("default_code")
            if code:
                by_code[code] = row
    return by_code


def resolve_open_session(session, base, config_id=None):
    domain = [("company_id", "=", COMPANY_ID)]
    if config_id:
        domain.append(("id", "=", config_id))
    else:
        domain.append(("name", "ilike", "orithos_store1"))
    configs = rpc(
        session,
        base,
        "pos.config",
        "search_read",
        [domain],
        {"fields": ["id", "name", "current_session_id", "payment_method_ids"], "limit": 5},
    )
    if not configs:
        raise RuntimeError("POS config not found")
    config = configs[0]
    current = config.get("current_session_id")
    if not (isinstance(current, (list, tuple)) and current):
        raise RuntimeError(f"POS config {config['name']} has no open session; run prepare-odoo-test-session.mjs first")
    session_id = current[0]
    sessions = rpc(
        session,
        base,
        "pos.session",
        "search_read",
        [[("id", "=", session_id)]],
        {"fields": ["id", "name", "state", "user_id"], "limit": 1},
    )
    if not sessions or sessions[0].get("state") != "opened":
        raise RuntimeError(f"POS session {session_id} is not opened")
    methods = rpc(
        session,
        base,
        "pos.payment.method",
        "search_read",
        [[("id", "in", config.get("payment_method_ids") or [])]],
        {"fields": ["id", "name", "is_cash_count", "type"], "limit": 50},
    )
    methods_by_key = {}
    for method in methods:
        name = str(method.get("name") or "").upper()
        if method.get("is_cash_count") or method.get("type") == "cash" or "CASH" in name:
            methods_by_key.setdefault("cash", method["id"])
        elif method.get("type") in {"bank", "pay_later"} or "EFTPOS" in name or "CARD" in name:
            methods_by_key.setdefault("card", method["id"])
        else:
            methods_by_key.setdefault("bank", method["id"])
    if "cash" not in methods_by_key and methods:
        methods_by_key["cash"] = methods[0]["id"]
    if "card" not in methods_by_key and methods:
        methods_by_key["card"] = methods[-1]["id"]
    return config, sessions[0], methods_by_key


def lookup_uuids(session, base, uuids):
    """Exact uuid IN lookups — cheap for small batches (post-sync confirm)."""
    wanted = [u for u in uuids if u]
    found = set()
    for start in range(0, len(wanted), 200):
        batch = wanted[start:start + 200]
        rows = rpc(
            session,
            base,
            "pos.order",
            "search_read",
            [[("uuid", "in", batch)]],
            {"fields": ["uuid"], "limit": len(batch) + 5},
        )
        for row in rows:
            if row.get("uuid"):
                found.add(row["uuid"])
    return found


def existing_uuids(session, base, uuids):
    """Resolve which candidate uuids already exist (startup skip only).

    One paginated scan of r2-% orders, then intersect with the wanted set.
    Do NOT call this per batch — use lookup_uuids for confirmations.
    """
    wanted = set(uuids)
    if not wanted:
        return set()
    found = set()
    offset = 0
    page = 5000
    while True:
        rows = rpc(
            session,
            base,
            "pos.order",
            "search_read",
            [[("uuid", "=like", "r2-%")]],
            {"fields": ["uuid"], "limit": page, "offset": offset, "order": "id asc"},
        )
        if not rows:
            break
        for row in rows:
            uuid = row.get("uuid")
            if uuid and uuid in wanted:
                found.add(uuid)
        if len(rows) < page:
            break
        offset += len(rows)
    return found


def prepare_order(receipt, name_map, odoo_by_code, methods_by_key, fallback_date, max_drift, uid, session_id, tax_id):
    uuid = receipt_uuid(receipt)
    if not receipt["invoice_number"]:
        return None, {"uuid": uuid, "reason": "missing_invoice"}
    if not receipt["items"]:
        return None, {"uuid": uuid, "invoice": receipt["invoice_number"], "reason": "no_items"}

    lines = []
    line_total_incl = 0.0
    for index, item in enumerate(receipt["items"]):
        if not isinstance(item, dict):
            return None, {"uuid": uuid, "invoice": receipt["invoice_number"], "reason": "bad_item", "index": index}
        name = str(item.get("name") or "").strip()
        qty = parse_amount(item.get("quantity"))
        line_amount = parse_amount(item.get("amount"))
        if not name or qty == 0:
            return None, {"uuid": uuid, "invoice": receipt["invoice_number"], "reason": "empty_line", "name": name}
        source = name_map.get(normalize_name(name))
        if not source:
            return None, {"uuid": uuid, "invoice": receipt["invoice_number"], "reason": "unmatched_product", "name": name}
        odoo = odoo_by_code.get(source["default_code"])
        if not odoo:
            return None, {
                "uuid": uuid,
                "invoice": receipt["invoice_number"],
                "reason": "missing_odoo_product",
                "code": source["default_code"],
                "name": name,
            }
        unit_incl = abs(line_amount / qty)
        price_unit = round(unit_incl / GST_FACTOR, 4)
        qty_signed = qty if line_amount >= 0 else -abs(qty)
        price_subtotal = round(price_unit * qty_signed, 2)
        price_subtotal_incl = round(line_amount, 2)
        line_total_incl += price_subtotal_incl
        taxes = odoo.get("taxes_id") or ([tax_id] if tax_id else [])
        lines.append([0, 0, {
            "product_id": odoo["id"],
            "qty": qty_signed,
            "price_unit": price_unit,
            "discount": 0,
            "price_subtotal": price_subtotal,
            "price_subtotal_incl": price_subtotal_incl,
            "tax_ids": [[6, 0, taxes]],
            "pack_lot_ids": [],
        }])

    date_order, used_fallback = date_order_from_receipt(receipt, fallback_date)
    expected_total = round(receipt["total"], 2)
    # Absorb cash-rounding / cent drift into the last line so Odoo line sum
    # matches the Shopfront receipt total (required for sync_from_ui paid check).
    line_sum = round(line_total_incl, 2)
    drift = abs(line_sum - expected_total)
    if drift > max_drift and abs(line_sum + receipt["rounding"] - expected_total) <= max_drift:
        expected_total = round(line_sum + receipt["rounding"], 2)
        drift = abs(line_sum - expected_total)
    if drift > max_drift:
        return None, {
            "uuid": uuid,
            "invoice": receipt["invoice_number"],
            "reason": "total_drift",
            "expected": expected_total,
            "computed": line_sum,
            "drift": round(drift, 4),
        }
    if lines and abs(line_sum - expected_total) > 0.0001:
        delta = round(expected_total - line_sum, 2)
        last = lines[-1][2]
        last["price_subtotal_incl"] = round(last["price_subtotal_incl"] + delta, 2)
        if last["qty"]:
            unit_incl = last["price_subtotal_incl"] / last["qty"]
            last["price_unit"] = round(unit_incl / GST_FACTOR, 4)
            last["price_subtotal"] = round(last["price_unit"] * last["qty"], 2)
        line_total_incl = expected_total

    # This Odoo build's sync_from_ui rejects amount_return / over-tender and
    # negative change lines ("Order / is not fully paid"). Always pay exactly
    # amount_total with one positive method; Shopfront change is discarded.
    tender_methods = []
    for payment in receipt["payments"]:
        if not isinstance(payment, dict):
            continue
        method_id, kind = map_payment_method(str(payment.get("method") or payment.get("type") or ""), methods_by_key)
        if kind == "pseudo" or not method_id:
            continue
        pay_amount = parse_amount(payment.get("amount"))
        if pay_amount <= 0:
            continue
        tender_methods.append((method_id, pay_amount, kind))

    if tender_methods:
        primary_method = tender_methods[0][0]
        # Prefer card when the largest positive tender is card/EFTPOS.
        primary_method = max(tender_methods, key=lambda item: item[1])[0]
    else:
        primary_method = methods_by_key.get("cash") or methods_by_key.get("card")
        if not primary_method:
            return None, {"uuid": uuid, "invoice": receipt["invoice_number"], "reason": "no_payment_method"}

    amount_return = 0.0
    paid = expected_total
    payment_commands = [[0, 0, {
        "amount": expected_total,
        "name": date_order,
        "payment_method_id": primary_method,
    }]]

    tax_total = round(sum(cmd[2]["price_subtotal_incl"] - cmd[2]["price_subtotal"] for cmd in lines), 2)
    order = {
        "amount_paid": round(paid, 2),
        "amount_return": amount_return,
        "amount_tax": tax_total,
        "amount_total": expected_total,
        "date_order": date_order,
        "fiscal_position_id": False,
        "pricelist_id": False,
        "name": f"Order {uuid}",
        "is_refund": expected_total < 0,
        "last_order_preparation_change": "{}",
        "lines": lines,
        "partner_id": False,
        "session_id": session_id,
        "payment_ids": payment_commands,
        "uuid": uuid,
        "user_id": uid,
        "to_invoice": False,
    }
    meta = {
        "uuid": uuid,
        "invoice": receipt["invoice_number"],
        "used_fallback_date": used_fallback,
        "date_order": date_order,
        "line_count": len(lines),
        "amount_total": expected_total,
    }
    return order, meta


def set_r2_storable(session, base, template_ids, storable: bool):
    for start in range(0, len(template_ids), 500):
        batch = template_ids[start:start + 500]
        rpc(session, base, "product.template", "write", [batch, {"is_storable": storable}])


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
        return create_quants_resilient(session, base, vals[:middle], rejected) + create_quants_resilient(
            session, base, vals[middle:], rejected
        )


def reset_stock_from_products(session, base, products, odoo_by_code):
    """Reconcile WH/Stock (location 5) to current R2 snapshot quantities."""
    template_ids = []
    source_for_template = {}
    for product in products:
        odoo = odoo_by_code.get(product["default_code"])
        if not odoo:
            continue
        tmpl = odoo["product_tmpl_id"][0] if isinstance(odoo.get("product_tmpl_id"), (list, tuple)) else odoo.get("product_tmpl_id")
        if not tmpl:
            continue
        template_ids.append(tmpl)
        source_for_template[tmpl] = product

    stockable = [tmpl for tmpl, source in source_for_template.items() if source["type"] != "INTEGRATED"]
    integrated = [tmpl for tmpl, source in source_for_template.items() if source["type"] == "INTEGRATED"]
    for start in range(0, len(stockable), 500):
        rpc(session, base, "product.template", "write", [stockable[start:start + 500], {"is_storable": True}])
    if integrated:
        rpc(session, base, "product.template", "write", [integrated, {"is_storable": False}])

    variants = []
    for start in range(0, len(template_ids), 500):
        batch = template_ids[start:start + 500]
        variants.extend(rpc(
            session,
            base,
            "product.product",
            "search_read",
            [[("product_tmpl_id", "in", batch)]],
            {"fields": ["id", "product_tmpl_id"], "limit": len(batch) + 20, "context": {"active_test": False}},
        ))

    product_ids = [v["id"] for v in variants]
    existing_quants = []
    for start in range(0, len(product_ids), 500):
        batch = product_ids[start:start + 500]
        existing_quants.extend(rpc(
            session,
            base,
            "stock.quant",
            "search_read",
            [[("location_id", "=", LOCATION_ID), ("product_id", "in", batch)]],
            {"fields": ["id", "product_id", "quantity"], "limit": max(len(batch) * 3, 100), "context": {"active_test": False}},
        ))
    quants_by_product = {}
    for quant in existing_quants:
        quants_by_product.setdefault(quant["product_id"][0], []).append(quant)

    quants_to_create = []
    quant_targets = {}
    negative_normalized = 0
    for variant in variants:
        tmpl = variant["product_tmpl_id"][0]
        source = source_for_template.get(tmpl, {})
        qty = float(source.get("quantity") or 0.0)
        if qty < 0:
            negative_normalized += 1
            qty = 0.0
        if source.get("type") == "INTEGRATED":
            qty = 0.0
        current = sorted(quants_by_product.get(variant["id"], []), key=lambda item: item["id"])
        if current:
            quant_targets[current[0]["id"]] = qty
            for extra in current[1:]:
                quant_targets[extra["id"]] = 0.0
        elif qty > 0:
            quants_to_create.append({"product_id": variant["id"], "location_id": LOCATION_ID, "inventory_quantity": qty})

    for target in sorted(set(quant_targets.values())):
        target_ids = [qid for qid, value in quant_targets.items() if value == target]
        for start in range(0, len(target_ids), 500):
            rpc(session, base, "stock.quant", "write", [target_ids[start:start + 500], {"inventory_quantity": target}])

    rejected = []
    quant_ids = list(quant_targets)
    for start in range(0, len(quants_to_create), 100):
        quant_ids.extend(create_quants_resilient(session, base, quants_to_create[start:start + 100], rejected))
    for start in range(0, len(quant_ids), 100):
        rpc(session, base, "stock.quant", "action_apply_inventory", [quant_ids[start:start + 100]])
        print("APPLIED_STOCK_ADJUSTMENTS", min(start + 100, len(quant_ids)), "REJECTED", len(rejected), flush=True)
    return {
        "stockQuantRowsReconciled": len(quant_ids),
        "negativeStockRowsNormalizedToZero": negative_normalized,
        "rejectedStockRows": len(rejected),
        "createdQuants": len(quants_to_create),
    }


def load_resume(path: Path | None):
    if not path or not path.exists():
        return {
            "doneUuids": [],
            "imported": 0,
            "skippedExisting": 0,
            "rejected": [],
            "undatedUsedFallback": 0,
            "errors": [],
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("doneUuids", [])
    data.setdefault("imported", 0)
    data.setdefault("skippedExisting", 0)
    data.setdefault("rejected", [])
    data.setdefault("undatedUsedFallback", 0)
    data.setdefault("errors", [])
    return data


def save_resume(path: Path, data: dict):
    # Cap rejected/errors lists in the resume file to keep it manageable.
    payload = dict(data)
    payload["rejected"] = data.get("rejected", [])[-500:]
    payload["errors"] = data.get("errors", [])[-200:]
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Import R2 sales receipts into Odoo pos.order")
    parser.add_argument("--apply", action="store_true", help="write orders to Odoo aipos")
    parser.add_argument("--sqlite-file", help="use a local SQLite file verified against the R2 manifest")
    parser.add_argument(
        "--allow-stale-sqlite",
        action="store_true",
        help="continue with --sqlite-file even if it no longer matches the live R2 manifest (resume only)",
    )
    parser.add_argument("--limit", type=int, default=0, help="max receipts to process (0 = all)")
    parser.add_argument("--resume", help="path to resume/progress JSON")
    parser.add_argument("--fallback-date", default="2019-01-01 00:00:00", help="date_order for undated receipts")
    parser.add_argument("--config-id", type=int, help="pos.config id (default: orithos_store1)")
    parser.add_argument("--max-total-drift", type=float, default=0.05, help="reject if line total drifts beyond this")
    parser.add_argument("--batch-size", type=int, default=1, help="orders per sync_from_ui call")
    parser.add_argument("--skip-stock-reset", action="store_true", help="debug only: do not re-apply R2 stock")
    parser.add_argument("--stock-reset-only", action="store_true", help="only re-apply R2 stock quants (no order import)")
    parser.add_argument("--keep-storable", action="store_true", help="do not flip is_storable=False during import")
    parser.add_argument("--report", help="write final report JSON path")
    args = parser.parse_args()

    if args.stock_reset_only:
        path, manifest, temporary = download_verified(args.sqlite_file, allow_stale_sqlite=args.allow_stale_sqlite)
        try:
            products = read_products(path)
        finally:
            if temporary:
                os.unlink(path)
        base = (ENV.get("ODOO_BASE_URL") or "https://odoo.orithos.com.au").rstrip("/")
        http = requests.Session()
        authenticate(http, base)
        odoo_by_code = load_odoo_product_map(http, base, products)
        stock_reset = reset_stock_from_products(http, base, products, odoo_by_code)
        report = {
            "result": "stock_reset_only",
            "database": "aipos",
            "snapshotSha256": manifest["sha256"],
            "stockReset": stock_reset,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }
        print(json.dumps(report, indent=2))
        if args.report:
            Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
        return

    path, manifest, temporary = download_verified(args.sqlite_file, allow_stale_sqlite=args.allow_stale_sqlite)
    try:
        products = read_products(path)
        receipts = read_receipts(path)
    finally:
        if temporary:
            os.unlink(path)

    name_map, ambiguous = build_name_maps(products)
    completed = [r for r in receipts if r["status"] == "Completed" and r["invoice_number"]]
    # Prefer dated receipts first so History/Reporting look sensible early in a limited run.
    dated = [r for r in completed if r["has_date"]]
    undated = [r for r in completed if not r["has_date"]]
    def sale_sort_key(receipt):
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", receipt["sale_date"])
        if not match:
            return (datetime.min, receipt["sale_time"], receipt["invoice_number"])
        day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        try:
            stamp = datetime(year, month, day)
        except ValueError:
            stamp = datetime.min
        return (stamp, receipt["sale_time"], receipt["invoice_number"])

    dated.sort(key=sale_sort_key, reverse=True)
    undated.sort(key=lambda r: r["invoice_number"], reverse=True)
    completed = dated + undated
    if args.limit and args.limit > 0:
        completed = completed[: args.limit]

    # Dry-run matching without Odoo (name map only).
    dry_stats = {
        "database": "aipos",
        "snapshotBytes": manifest["bytes"],
        "snapshotSha256": manifest["sha256"],
        "products": len(products),
        "ambiguousProductNames": len(ambiguous),
        "receiptsTotal": len(receipts),
        "completedSelected": len(completed),
        "dated": sum(1 for r in completed if r["has_date"]),
        "undated": sum(1 for r in completed if not r["has_date"]),
        "mode": "apply" if args.apply else "dry-run",
        "matchPreview": {"ok": 0, "unmatched_product": 0, "no_items": 0, "other": 0},
        "sampleRejects": [],
    }
    for receipt in completed:
        if not receipt["items"]:
            dry_stats["matchPreview"]["no_items"] += 1
            continue
        ok = True
        reason = None
        for item in receipt["items"]:
            if not isinstance(item, dict):
                ok = False
                reason = "bad_item"
                break
            name = str(item.get("name") or "").strip()
            if not name or parse_amount(item.get("quantity")) == 0:
                ok = False
                reason = "empty_line"
                break
            if normalize_name(name) not in name_map:
                ok = False
                reason = "unmatched_product"
                break
        if ok:
            dry_stats["matchPreview"]["ok"] += 1
        else:
            key = reason if reason in dry_stats["matchPreview"] else "other"
            dry_stats["matchPreview"][key] = dry_stats["matchPreview"].get(key, 0) + 1
            if len(dry_stats["sampleRejects"]) < 20:
                dry_stats["sampleRejects"].append({
                    "invoice": receipt["invoice_number"],
                    "reason": reason,
                    "item": next((str(i.get("name")) for i in receipt["items"] if isinstance(i, dict) and normalize_name(str(i.get("name") or "")) not in name_map), None),
                })

    print(json.dumps(dry_stats, indent=2))
    if not args.apply:
        if args.report:
            Path(args.report).write_text(json.dumps(dry_stats, indent=2), encoding="utf-8")
        return

    base = ENV.get("ODOO_BASE_URL") or "https://odoo.orithos.com.au"
    base = base.rstrip("/")
    http = requests.Session()
    uid = authenticate(http, base)
    odoo_by_code = load_odoo_product_map(http, base, products)
    missing_codes = [p["default_code"] for p in products if p["default_code"] not in odoo_by_code]
    if missing_codes:
        print(json.dumps({"warning": "odoo_products_missing", "count": len(missing_codes), "sample": missing_codes[:20]}, indent=2))

    config, pos_session, methods_by_key = resolve_open_session(http, base, args.config_id)
    taxes = rpc(
        http,
        base,
        "account.tax",
        "search_read",
        [[("type_tax_use", "=", "sale"), ("amount", "=", 10), ("company_id", "=", COMPANY_ID), ("active", "=", True)]],
        {"fields": ["id"], "limit": 1},
    )
    tax_id = taxes[0]["id"] if taxes else None

    resume_path = Path(args.resume) if args.resume else Path(tempfile.gettempdir()) / (
        f"orithos-r2-sales-progress-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    progress = load_resume(resume_path if args.resume else None)
    done = set(progress.get("doneUuids") or [])
    print("RESUME_FILE", str(resume_path), "DONE", len(done), flush=True)

    template_ids = []
    for product in products:
        odoo = odoo_by_code.get(product["default_code"])
        if not odoo:
            continue
        tmpl = odoo["product_tmpl_id"][0] if isinstance(odoo.get("product_tmpl_id"), (list, tuple)) else None
        if tmpl and product["type"] != "INTEGRATED":
            template_ids.append(tmpl)

    if not args.keep_storable and template_ids:
        print("SET_STORABLE_FALSE", len(template_ids), flush=True)
        set_r2_storable(http, base, template_ids, False)

    pending_meta = []
    batch_orders = []
    batches_since_save = 0

    def flush_batch(force_save=False):
        nonlocal batch_orders, pending_meta, batches_since_save
        if not batch_orders:
            return
        try:
            synced = rpc(http, base, "pos.order", "sync_from_ui", [batch_orders], timeout=300)
            saved = {row.get("uuid") for row in (synced or {}).get("pos.order") or [] if row.get("uuid")}
            missing = [order["uuid"] for order in batch_orders if order["uuid"] not in saved]
            confirmed = set(saved)
            if missing:
                confirmed |= lookup_uuids(http, base, missing)
            for meta, order in zip(pending_meta, batch_orders):
                uuid = order["uuid"]
                if uuid in confirmed:
                    progress["imported"] += 1
                    done.add(uuid)
                    if meta.get("used_fallback_date"):
                        progress["undatedUsedFallback"] += 1
                else:
                    progress["errors"].append({"uuid": uuid, "invoice": meta.get("invoice"), "reason": "sync_unconfirmed"})
                    done.add(uuid)
        except RuntimeError as exc:
            if len(batch_orders) == 1:
                meta = pending_meta[0]
                reason = str(exc)[:500]
                progress["errors"].append({"uuid": meta["uuid"], "invoice": meta.get("invoice"), "reason": reason})
                # Only skip permanently for clearly non-retriable payload issues.
                if "Invalid field" in reason or "not fully paid" in reason.lower() or "ValidationError" in reason:
                    done.add(batch_orders[0]["uuid"])
            else:
                # Split and retry one-by-one
                singles = list(zip(pending_meta, batch_orders))
                batch_orders = []
                pending_meta = []
                for meta, order in singles:
                    batch_orders = [order]
                    pending_meta = [meta]
                    flush_batch(force_save=False)
                return
        batch_orders = []
        pending_meta = []
        batches_since_save += 1
        progress["doneUuids"] = list(done)
        progress["updatedAt"] = datetime.now(timezone.utc).isoformat()
        if force_save or batches_since_save >= 5:
            save_resume(resume_path, progress)
            batches_since_save = 0
        print(
            "PROGRESS",
            "imported", progress["imported"],
            "skipped", progress["skippedExisting"],
            "rejected", len(progress["rejected"]),
            "errors", len(progress["errors"]),
            flush=True,
        )

    # Prefetch existing uuids for this run slice to skip quickly.
    slice_uuids = [receipt_uuid(r) for r in completed]
    already = existing_uuids(http, base, [u for u in slice_uuids if u not in done])
    done |= already
    progress["skippedExisting"] += len(already)
    print("SKIP_EXISTING", len(already), flush=True)

    for receipt in completed:
        uuid = receipt_uuid(receipt)
        if uuid in done:
            continue
        order, meta = prepare_order(
            receipt,
            name_map,
            odoo_by_code,
            methods_by_key,
            args.fallback_date,
            args.max_total_drift,
            uid,
            pos_session["id"],
            tax_id,
        )
        if order is None:
            progress["rejected"].append(meta)
            done.add(uuid)
            continue
        batch_orders.append(order)
        pending_meta.append(meta)
        if len(batch_orders) >= max(1, args.batch_size):
            flush_batch()

    flush_batch(force_save=True)

    stock_reset = {"skipped": True}
    if not args.skip_stock_reset:
        print("STOCK_RESET_START", flush=True)
        if not args.keep_storable and template_ids:
            set_r2_storable(http, base, template_ids, True)
        stock_reset = reset_stock_from_products(http, base, products, odoo_by_code)
        stock_reset["skipped"] = False

    report = {
        "result": "complete",
        "database": "aipos",
        "companyId": COMPANY_ID,
        "configId": config["id"],
        "sessionId": pos_session["id"],
        "sessionName": pos_session.get("name"),
        "snapshotSha256": manifest["sha256"],
        "selectedReceipts": len(completed),
        "imported": progress["imported"],
        "skippedExisting": progress["skippedExisting"],
        "rejected": len(progress["rejected"]),
        "errors": len(progress["errors"]),
        "undatedUsedFallback": progress["undatedUsedFallback"],
        "sampleRejects": progress["rejected"][:30],
        "sampleErrors": progress["errors"][:30],
        "stockReset": stock_reset,
        "resume": str(resume_path),
        "demoHost": "https://demo.orithos.com.au",
        "finishedAt": datetime.now(timezone.utc).isoformat(),
    }
    progress["doneUuids"] = list(done)
    progress["report"] = report
    save_resume(resume_path, progress)
    report_path = Path(args.report) if args.report else ROOT / "docs" / f"UAT_R2_SALES_ODOO_IMPORT_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print("REPORT_FILE", str(report_path), flush=True)


if __name__ == "__main__":
    main()
