"""Import R2 Shopfront customers and suppliers into Odoo aipos as res.partner.

Dry-run is the default. Apply with --apply.
Partners are tagged with ref R2-C-{id} / R2-S-{id} for idempotent re-runs.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import importlib.util
import requests

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "r2_catalog", ROOT / "scripts" / "import-r2-test-catalog.py"
)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


def rpc(session, base, model, method, args, kwargs=None):
    response = session.post(
        f"{base}/web/dataset/call_kw",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"model": model, "method": method, "args": args, "kwargs": kwargs or {}},
            "id": 1,
        },
        timeout=90,
    ).json()
    if response.get("error"):
        data = response["error"].get("data", {})
        raise RuntimeError(f"Odoo {model}.{method} failed: {data.get('message') or data.get('name')}")
    return response.get("result")


def read_partners(path):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    customers = []
    suppliers = []
    for (raw,) in db.execute("SELECT values_json FROM records WHERE dataset='graphql_customers'"):
        values = json.loads(raw)
        snap = json.loads(values[4]) if isinstance(values[4], str) else values[4]
        if not isinstance(snap, dict) or snap.get("Customer__deleted"):
            continue
        billing = snap.get("Customer__billing") or {}
        customers.append({
            "ref": f"R2-C-{str(snap.get('Customer__id') or values[1])[:40]}",
            "name": str(snap.get("Customer__name") or values[2] or "").strip() or "R2 Customer",
            "phone": billing.get("Contact__mobile") or billing.get("Contact__phone") or snap.get("Customer__mobile") or "",
            "email": billing.get("Contact__email") or "",
            "vat": snap.get("Customer__businessNumber") or "",
            "comment": f"R2 customer code={snap.get('Customer__code') or ''}",
        })
    for (raw,) in db.execute("SELECT values_json FROM records WHERE dataset='graphql_suppliers'"):
        values = json.loads(raw)
        snap = json.loads(values[4]) if isinstance(values[4], str) else values[4]
        if not isinstance(snap, dict) or snap.get("Supplier__deleted"):
            continue
        contact = snap.get("Supplier__contact") or {}
        suppliers.append({
            "ref": f"R2-S-{str(snap.get('Supplier__id') or values[1])[:40]}",
            "name": str(snap.get("Supplier__name") or values[2] or "").strip() or "R2 Supplier",
            "phone": contact.get("Contact__mobile") or contact.get("Contact__phone") or "",
            "email": contact.get("Contact__email") or "",
            "vat": snap.get("Supplier__businessNumber") or "",
            "comment": f"R2 supplier status={snap.get('Supplier__status') or ''}",
            "active": str(snap.get("Supplier__status") or "ACTIVE").upper() == "ACTIVE",
        })
    db.close()
    return customers, suppliers


def upsert_partners(session, base, rows, *, is_customer: bool, is_supplier: bool):
    created = updated = skipped = 0
    for row in rows:
        existing = rpc(
            session,
            base,
            "res.partner",
            "search_read",
            [[("ref", "=", row["ref"]), ("company_id", "in", [False, 1])]],
            {"fields": ["id", "ref"], "limit": 1, "context": {"active_test": False}},
        )
        vals = {
            "name": row["name"],
            "ref": row["ref"],
            "phone": row.get("phone") or False,
            "email": row.get("email") or False,
            "vat": row.get("vat") or False,
            "comment": row.get("comment") or False,
            "company_id": 1,
            "customer_rank": 1 if is_customer else 0,
            "supplier_rank": 1 if is_supplier else 0,
            "active": row.get("active", True),
        }
        if existing:
            rpc(session, base, "res.partner", "write", [[existing[0]["id"], vals]])
            updated += 1
        else:
            try:
                rpc(session, base, "res.partner", "create", [vals])
                created += 1
            except RuntimeError:
                skipped += 1
    return {"created": created, "updated": updated, "skipped": skipped}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--sqlite-file", required=True)
    parser.add_argument("--allow-stale-sqlite", action="store_true")
    args = parser.parse_args()

    path, manifest, temporary = catalog.download_verified(
        args.sqlite_file, allow_stale_sqlite=args.allow_stale_sqlite
    )
    try:
        customers, suppliers = read_partners(path)
    finally:
        if temporary:
            Path(path).unlink(missing_ok=True)

    report = {
        "database": "aipos",
        "snapshotSha256": manifest["sha256"],
        "customers": len(customers),
        "suppliers": len(suppliers),
        "mode": "apply" if args.apply else "dry-run",
        "sampleCustomers": customers[:3],
        "sampleSuppliers": suppliers[:3],
    }
    print(json.dumps(report, indent=2))
    if not args.apply:
        return

    base = (catalog.ENV.get("ODOO_BASE_URL") or "https://odoo.orithos.com.au").rstrip("/")
    http = requests.Session()
    auth = http.post(
        f"{base}/web/session/authenticate",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "db": "aipos",
                "login": catalog.ENV.get("ODOO_SERVICE_USERNAME") or catalog.ENV["ODOO_USER"],
                "password": catalog.ENV.get("ODOO_SERVICE_PASSWORD") or catalog.ENV["ODOO_PASS"],
            },
            "id": 1,
        },
        timeout=30,
    ).json().get("result") or {}
    if not auth.get("uid"):
        raise RuntimeError("Odoo authentication failed")

    result = {
        "result": "complete",
        "customers": upsert_partners(http, base, customers, is_customer=True, is_supplier=False),
        "suppliers": upsert_partners(http, base, suppliers, is_customer=False, is_supplier=True),
        "snapshotSha256": manifest["sha256"],
    }
    print(json.dumps(result, indent=2))
    (ROOT / "docs" / "UAT_R2_PARTNERS_IMPORT.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
