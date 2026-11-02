"""Read-only research report for supplier lead times inferred from Odoo receipts."""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FETCHER = Path(__file__).with_name("fetch-skr-inventory-snapshot.py")
spec = importlib.util.spec_from_file_location("inventory_fetcher", FETCHER)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load read-only Odoo client")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
Odoo = module.Odoo
env_values = module.env_values


def parse_odoo_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    text = value.replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def relation_id(value: object) -> int | None:
    return value[0] if isinstance(value, list) and value and isinstance(value[0], int) else None


def median_or_none(values: list[float]) -> float | None:
    return round(statistics.median(values), 2) if values else None


def raw_read(client: object, model: str, domain: list, fields: list[str], limit: int = 100000) -> list[dict]:
    """Read while preserving an empty JSON list as a valid empty result."""
    rows: list[dict] = []
    page_size = min(limit, 2000)
    for offset in range(0, limit, page_size):
        payload = {"jsonrpc": "2.0", "method": "call", "params": {
            "model": model, "method": "search_read", "args": [domain],
            "kwargs": {"fields": fields, "limit": min(page_size, limit - offset), "offset": offset, "order": "id asc"},
        }, "id": 1}
        request = urllib.request.Request(
            client.base + f"/web/dataset/call_kw/{model}/search_read",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "orithos-ai-lead-time/1"},
        )
        with client.opener.open(request, timeout=90) as response:
            body = json.load(response)
        if body.get("error"):
            raise RuntimeError(str(body["error"].get("data", {}).get("message", "Odoo read failed"))[:240])
        page = body.get("result")
        if not isinstance(page, list):
            raise RuntimeError("Odoo returned a non-list search_read result")
        rows.extend(page)
        if len(page) < page_size:
            return rows
    raise RuntimeError("Odoo read exceeded safe pagination limit")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company-id", type=int, required=True)
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.days < 30 or args.days > 730:
        raise SystemExit("--days must be between 30 and 730")

    values = env_values()
    client = Odoo(
        values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au"),
        values.get("ODOO_DATABASE", "aipos_uat"),
        values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER") or "",
        values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS") or "",
    )
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d %H:%M:%S")
    order_domain = [["company_id", "=", args.company_id], ["date_order", ">=", since], ["state", "in", ["purchase", "done"]]]
    try:
        orders = raw_read(client, "purchase.order", order_domain,
                          ["id", "partner_id", "date_order", "company_id"], limit=100000)
    except Exception as error:
        report = {"result": "BLOCKED", "reason": "purchase_order_read_failed", "detail": str(error)[:240], "writeRequests": []}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report))
        return 2

    order_by_id = {int(row["id"]): row for row in orders if isinstance(row.get("id"), int)}
    order_ids = sorted(order_by_id)
    receipts: list[dict] = []
    for start in range(0, len(order_ids), 5000):
        batch = order_ids[start:start + 5000]
        if not batch:
            continue
        receipts.extend(raw_read(client, "stock.picking", [["purchase_id", "in", batch], ["state", "=", "done"]],
                                 ["id", "purchase_id", "date_done", "scheduled_date", "company_id"], limit=100000))

    observations: list[dict] = []
    supplier_values: dict[int, list[float]] = {}
    for receipt in receipts:
        order_id = relation_id(receipt.get("purchase_id"))
        order = order_by_id.get(order_id or 0)
        ordered = parse_odoo_datetime(order.get("date_order")) if order else None
        received = parse_odoo_datetime(receipt.get("date_done"))
        supplier_id = relation_id(order.get("partner_id")) if order else None
        if not ordered or not received or not supplier_id:
            continue
        lead_days = (received - ordered).total_seconds() / 86400
        if lead_days < 0 or lead_days > 365:
            continue
        supplier_values.setdefault(supplier_id, []).append(lead_days)
        observations.append({"supplierId": supplier_id, "orderId": order_id, "receiptId": receipt.get("id"), "leadTimeDays": round(lead_days, 2)})

    suppliers = [{
        "supplierId": supplier_id,
        "receiptCount": len(values),
        "medianLeadTimeDays": median_or_none(values),
        "p25LeadTimeDays": round(statistics.quantiles(values, n=4, method="inclusive")[0], 2) if len(values) >= 2 else median_or_none(values),
        "p75LeadTimeDays": round(statistics.quantiles(values, n=4, method="inclusive")[2], 2) if len(values) >= 2 else median_or_none(values),
        "minLeadTimeDays": round(min(values), 2),
        "maxLeadTimeDays": round(max(values), 2),
    } for supplier_id, values in sorted(supplier_values.items())]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "companyId": args.company_id,
        "database": values.get("ODOO_DATABASE", "aipos_uat"),
        "lookbackDays": args.days,
        "source": "odoo.purchase.order_to_stock.picking_done_read_only",
        "researchOnly": True,
        "ordersRead": len(order_ids),
        "completedReceiptsRead": len(receipts),
        "validLeadTimeObservations": len(observations),
        "supplierCount": len(suppliers),
        "suppliers": suppliers,
        "observations": observations,
        "writeRequests": [],
        "interpretation": "Inferred operational lead time; do not write into supplier master data without owner review.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("companyId", "ordersRead", "completedReceiptsRead", "validLeadTimeObservations", "supplierCount", "writeRequests")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
