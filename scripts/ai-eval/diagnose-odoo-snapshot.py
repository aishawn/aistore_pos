"""Read-only snapshot probes. Output fixed diagnostics, never RPC payloads or credentials."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request


SOURCES = {
    "products": ("product.product", ["id", "name", "display_name", "default_code", "list_price",
                                     "standard_price", "qty_available", "virtual_available", "taxes_id",
                                     "write_date", "product_tmpl_id"]),
    "suppliers": ("product.supplierinfo", ["id", "product_id", "product_tmpl_id", "partner_id",
                                          "delay", "min_qty", "price"]),
    "purchaseLines": ("purchase.order.line", ["id", "product_id", "product_qty", "qty_received",
                                              "date_planned", "order_id"]),
}


class ProbeFailure(Exception):
    pass


def error_category(error):
    # Error messages and debug fields may contain customer data, SQL or secrets.
    data = error.get("data") if isinstance(error, dict) else None
    name = data.get("name") if isinstance(data, dict) else None
    return {
        "odoo.exceptions.AccessError": "ACCESS_DENIED",
        "odoo.exceptions.AccessDenied": "AUTHENTICATION_DENIED",
        "odoo.http.SessionExpiredException": "SESSION_EXPIRED",
        "odoo.exceptions.MissingError": "MISSING_RECORD",
        "builtins.ValueError": "INVALID_REQUEST_OR_SCHEMA",
        "builtins.KeyError": "INVALID_REQUEST_OR_SCHEMA",
        "builtins.AttributeError": "INVALID_REQUEST_OR_SCHEMA",
        "odoo.exceptions.UserError": "BUSINESS_RULE",
        "odoo.exceptions.ValidationError": "VALIDATION_ERROR",
    }.get(name, "RPC_ERROR")


def configuration(env_file=None):
    values = {}
    if env_file:
        for line in Path(env_file).read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("\"'")
    for key in ("ODOO_BASE_URL", "ODOO_DATABASE", "ODOO_SERVICE_USERNAME", "ODOO_SERVICE_PASSWORD"):
        if key in os.environ:
            values[key] = os.environ[key]
        if not values.get(key):
            raise ProbeFailure("SOURCE_NOT_CONFIGURED")
    return values


def probe(config, company_id, warehouse_id=None):
    base = config["ODOO_BASE_URL"].rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")):
        raise ProbeFailure("HTTPS_REQUIRED")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(path, params):
        body = json.dumps({"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}).encode()
        request = urllib.request.Request(base + path, data=body, headers={
            "Content-Type": "application/json", "User-Agent": "orithos-ai-snapshot-probe/1",
        })
        try:
            with opener.open(request, timeout=20) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise ProbeFailure("HTTP_" + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError):
            raise ProbeFailure("TRANSPORT_UNAVAILABLE") from None
        except (ValueError, TypeError):
            raise ProbeFailure("INVALID_RESPONSE") from None
        if not isinstance(result, dict):
            raise ProbeFailure("INVALID_RESPONSE")
        if result.get("error") is not None:
            raise ProbeFailure(error_category(result["error"]))
        return result.get("result")

    auth = call("/web/session/authenticate", {
        "db": config["ODOO_DATABASE"], "login": config["ODOO_SERVICE_USERNAME"],
        "password": config["ODOO_SERVICE_PASSWORD"],
    })
    if not isinstance(auth, dict) or not auth.get("uid"):
        raise ProbeFailure("AUTHENTICATION_DENIED")
    allowed = auth.get("user_companies", {}).get("allowed_companies")
    if isinstance(allowed, dict) and str(company_id) not in allowed:
        raise ProbeFailure("COMPANY_NOT_ACCESSIBLE_OR_BINDING_STALE")
    context = {"allowed_company_ids": [company_id], "force_company": company_id}
    if warehouse_id:
        context["warehouse"] = warehouse_id
    results = []
    for stage, (model, fields) in SOURCES.items():
        started = time.monotonic()
        domain = [["company_id", "=", company_id]]
        if stage == "products":
            domain.insert(0, ["available_in_pos", "=", True])
        elif stage == "suppliers":
            domain = ["|", ["company_id", "=", False], ["company_id", "=", company_id]]
        else:
            domain.append(["state", "in", ["purchase", "done"]])
        try:
            rows = call("/web/dataset/call_kw", {"model": model, "method": "search_read", "args": [domain],
                        "kwargs": {"fields": fields, "context": context, "limit": 1, "order": "id asc"}})
            if not isinstance(rows, list):
                raise ProbeFailure("INVALID_RESPONSE")
            result = {"stage": stage, "status": "PASS", "sampleRows": len(rows)}
        except ProbeFailure as error:
            result = {"stage": stage, "status": "BLOCKED", "cause": str(error)}
        result["latencyMs"] = round((time.monotonic() - started) * 1000)
        results.append(result)
    return {"status": "PASS" if all(row["status"] == "PASS" for row in results) else "BLOCKED",
            "scope": "single-row schema/access probes only; not full sync acceptance",
            "companyId": company_id, "warehouseId": warehouse_id, "businessWrites": 0, "checks": results}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", help="Ignored env file; never committed or printed")
    parser.add_argument("--company-id", required=True, type=int, help="Bound Odoo company ID, NOT vendor/outlet ID")
    parser.add_argument("--warehouse-id", type=int)
    args = parser.parse_args(argv)
    if args.company_id <= 0 or (args.warehouse_id is not None and args.warehouse_id <= 0):
        parser.error("Odoo identifiers must be positive")
    try:
        result = probe(configuration(args.env_file), args.company_id, args.warehouse_id)
    except ProbeFailure as error:
        result = {"status": "BLOCKED", "cause": str(error), "businessWrites": 0}
    except Exception:
        # Never print unknown exception messages: they can embed URLs or credentials.
        result = {"status": "BLOCKED", "cause": "PROBE_UNAVAILABLE", "businessWrites": 0}
    print(json.dumps(result))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
