"""Move one store's legacy POS category references to store-owned categories.

Dry-run by default. No category deletion, ownership transfer, stock or price writes.
Apply requires an explicit company ID/name and a fresh journal inside .local/.
Run while category editing/imports are paused; rerunning safely resumes partial work.
"""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.request


def normalize(name):
    return " ".join(name.split()).casefold()


def read_pages(rpc, model, domain, fields):
    rows = []
    last = 0
    while True:
        page = rpc(model, "search_read", [domain + [["id", ">", last]]],
                   fields=fields, order="id asc", limit=200)
        if not page:
            return rows
        rows.extend(page)
        last = page[-1]["id"]


def migrate(rpc, company_id, expected_name, apply=False, journal=None):
    companies = rpc("res.company", "search_read", [[["id", "=", company_id]]], fields=["id", "name"], limit=1)
    if len(companies) != 1 or companies[0]["name"] != expected_name:
        raise ValueError("Company identity does not match; no migration performed")
    cats = read_pages(rpc, "pos.category", ["|", ["company_id", "=", False], ["company_id", "=", company_id]],
                      ["id", "name", "parent_id", "company_id"])
    by_id = {row["id"]: row for row in cats}
    shared = [row["id"] for row in cats if not row["company_id"]]
    products = read_pages(rpc, "product.template", [["company_id", "=", company_id], ["pos_categ_ids", "in", shared]],
                          ["id", "company_id", "pos_categ_ids"]) if shared else []
    config_fields = rpc("pos.config", "fields_get", [], attributes=["relation", "type"])
    config_fields = [name for name, field in config_fields.items() if field.get("relation") == "pos.category" and field.get("type") == "many2many"]
    configs = read_pages(rpc, "pos.config", [["company_id", "=", company_id]], ["id", "company_id", *config_fields]) if config_fields else []
    owned = [row for row in cats if row["company_id"] and row["company_id"][0] == company_id]
    # A plan uses negative IDs for categories which will be created on apply.
    mapping, creations, updates = {}, [], []
    visiting = set()

    def local_id(category_id):
        if category_id in mapping:
            return mapping[category_id]
        if category_id in visiting or category_id not in by_id:
            raise ValueError("Missing or cyclic category ancestry; no migration performed")
        visiting.add(category_id)
        row = by_id[category_id]
        parent = local_id(row["parent_id"][0]) if row["parent_id"] else False
        if row["company_id"]:
            if row["company_id"][0] != company_id:
                raise ValueError("Category belongs to another company")
            target = row["id"]
            if parent != (row["parent_id"][0] if row["parent_id"] else False):
                updates.append(("pos.category", row["id"], "parent_id", parent, row["parent_id"]))
        else:
            matches = [item for item in owned if normalize(item["name"]) == normalize(row["name"])
                       and (item["parent_id"][0] if item["parent_id"] else False) == parent]
            if len(matches) > 1:
                raise ValueError("Ambiguous store category; resolve duplicates before migration")
            if matches:
                target = matches[0]["id"]
            else:
                target = -(len(creations) + 1)
                values = {"name": row["name"], "parent_id": parent, "company_id": company_id}
                creations.append((target, values))
                owned.append({"id": target, "name": row["name"], "parent_id": [parent, ""] if parent else False, "company_id": [company_id, ""]})
        mapping[category_id] = target
        visiting.remove(category_id)
        return target

    for row in list(owned):
        local_id(row["id"])
    for model, records, fields in [("product.template", products, ["pos_categ_ids"]), ("pos.config", configs, config_fields)]:
        for row in records:
            if not row["company_id"] or row["company_id"][0] != company_id:
                raise ValueError("Cross-company record returned; refusing writes")
            for field in fields:
                before = row[field]
                after = sorted({local_id(category_id) for category_id in before})
                if sorted(before) != after:
                    updates.append((model, row["id"], field, after, before))
    report = {"companyId": company_id, "companyName": expected_name, "categoriesToCreate": len(creations),
              "productsToUpdate": len({row[1] for row in updates if row[0] == "product.template"}),
              "configFieldsToUpdate": sum(row[0] == "pos.config" for row in updates),
              "categoryParentsToUpdate": sum(row[0] == "pos.category" for row in updates), "applied": apply}
    if not apply:
        return report
    if journal is None:
        raise ValueError("A fresh migration journal is required")
    journal = Path(journal)
    if ".local" not in journal.resolve().parts:
        raise ValueError("Keep migration journals in an ignored .local directory")
    journal.parent.mkdir(parents=True, exist_ok=True)
    snapshot = dict(report, categories=cats, products=products, configs=configs, creations=creations, updates=updates, completed=[])
    with journal.open("x", encoding="utf-8") as file:
        json.dump(snapshot, file, indent=2)

    def save(operation):
        snapshot["completed"].append(operation)
        journal.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")

    actual_ids = {}
    for planned_id, values in creations:
        values = dict(values, parent_id=actual_ids.get(values["parent_id"], values["parent_id"]))
        actual_id = rpc("pos.category", "create", [values])
        if type(actual_id) is not int or actual_id < 1:
            raise ValueError("Category creation not confirmed; inspect journal before rerunning")
        actual_ids[planned_id] = actual_id
        save({"createdCategoryId": actual_id, "plannedId": planned_id})
    for model, record_id, field, after, before in updates:
        current = rpc(model, "search_read", [[["id", "=", record_id], ["company_id", "=", company_id]]], fields=[field], limit=1)
        if not current or current[0][field] != before:
            raise ValueError("Category references changed during migration; rerun after pausing edits")
        if field == "parent_id":
            expected = actual_ids.get(after, after)
            values = {field: expected}
        else:
            expected = sorted({actual_ids.get(value, value) for value in after})
            # Link/unlink only the affected category IDs, never delete related records.
            values = {field: [[3, value, 0] for value in before if value not in expected]
                             + [[4, value, 0] for value in expected if value not in before]}
        if rpc(model, "write", [[record_id], values]) is not True:
            raise ValueError("Category update not confirmed; inspect journal before rerunning")
        verified = rpc(model, "search_read", [[["id", "=", record_id], ["company_id", "=", company_id]]], fields=[field], limit=1)
        actual = verified[0][field] if verified else None
        if field == "parent_id":
            actual = actual[0] if actual else False
        else:
            actual = sorted(actual) if actual is not None else None
        if actual != expected:
            raise ValueError("Category update readback mismatch")
        save({"model": model, "id": record_id, "field": field, "after": expected})
    # A second complete plan must have no work: catches missed references, including archived products.
    remaining = migrate(rpc, company_id, expected_name)
    if any(remaining[key] for key in ["categoriesToCreate", "productsToUpdate", "configFieldsToUpdate", "categoryParentsToUpdate"]):
        raise ValueError("Migration incomplete; inspect journal and rerun")
    report["verified"] = True
    save({"verified": True})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--company-id", type=int, required=True)
    parser.add_argument("--expected-company-name", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--journal", type=Path)
    args = parser.parse_args()
    env = {}
    if args.env_file.exists():
        for line in args.env_file.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip("\"").strip("'")
    env.update(os.environ)
    base = env.get("ODOO_BASE_URL", "").rstrip("/")
    database = env.get("ODOO_DATABASE")
    if not base.startswith("https://") or not database or args.company_id < 1:
        raise ValueError("Configure HTTPS ODOO_BASE_URL, ODOO_DATABASE and a positive company ID")
    if args.apply and env.get("ISOLATION_ODOO_DATABASE") != database:
        raise ValueError("Apply requires ODOO_DATABASE = ISOLATION_ODOO_DATABASE")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def envelope(path, params):
        request = urllib.request.Request(base + path, json.dumps({"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}).encode(),
                                         {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
        with opener.open(request, timeout=45) as response:
            body = json.load(response)
        if "error" in body or "result" not in body:
            raise RuntimeError("Odoo operation failed; no write retries were attempted")
        return body["result"]

    session = envelope("/web/session/authenticate", {"db": database, "login": env.get("ODOO_SERVICE_USERNAME") or env.get("ODOO_USER"),
                                                     "password": env.get("ODOO_SERVICE_PASSWORD") or env.get("ODOO_PASS")})
    if not session.get("uid"):
        raise ValueError("Odoo authentication failed")
    context = {"allowed_company_ids": [args.company_id], "force_company": args.company_id, "active_test": False}

    def rpc(model, method, call_args, **kwargs):
        return envelope("/web/dataset/call_kw", {"model": model, "method": method, "args": call_args, "kwargs": dict(kwargs, context=context)})

    print(json.dumps(dict(migrate(rpc, args.company_id, args.expected_company_name, args.apply, args.journal), database=database)))


if __name__ == "__main__":
    main()
