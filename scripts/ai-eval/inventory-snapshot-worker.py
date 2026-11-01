"""Persistent daily Odoo inventory captures. No Odoo business writes or HTTP listener."""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time
from datetime import datetime, timezone, date
from pathlib import Path
from zoneinfo import ZoneInfo


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(value, output, allow_nan=False)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def summarise(snapshot: dict, company_id: int, database: str) -> dict:
    if (snapshot.get("companyId") != company_id or snapshot.get("database") != database
            or snapshot.get("scopeVersion") != 2 or snapshot.get("source") != "odoo-readonly-jsonrpc"):
        raise ValueError("snapshot scope mismatch")
    captured = datetime.fromisoformat(snapshot["capturedAt"])
    business_day = date.fromisoformat(snapshot["businessDate"])
    if captured.tzinfo is None or captured.astimezone(ZoneInfo(snapshot["businessTimezone"])).date() != business_day:
        raise ValueError("snapshot business date mismatch")
    products = snapshot["products"]
    ids = {p["productId"] for p in products}
    coverage = snapshot["coverage"]
    if not products or len(ids) != len(products) or len(products) != coverage["expectedProducts"]:
        raise ValueError("incomplete product coverage")
    warehouses = snapshot["warehouseInventory"]
    if len({w["warehouseId"] for w in warehouses}) != coverage["expectedWarehouses"]:
        raise ValueError("incomplete warehouse coverage")
    for warehouse in warehouses:
        if len(warehouse["quantities"]) != len(ids) or {p["id"] for p in warehouse["quantities"]} != ids:
            raise ValueError("incomplete warehouse products")
    def missing(rows, fields):
        return {field: sum(not isinstance(row.get(field), (int, float))
                           or isinstance(row.get(field), bool) or not math.isfinite(row[field])
                           for row in rows) for field in fields}
    missing_fields = missing(products, ("availableQty", "virtualAvailableQty", "incomingQty", "outgoingQty", "cost", "leadTimeDays"))
    warehouse_missing = sum(sum(missing(w["quantities"], ("qty_available", "virtual_available", "incoming_qty", "outgoing_qty")).values()) for w in warehouses)
    supplier_coverage = snapshot.get("supplierLeadTimeCoverage") or {}
    if not supplier_coverage:
        supplier_coverage = {
            "quality": "LEGACY_SNAPSHOT",
            "supplierInfoRows": None,
            "productsWithLeadTime": sum(isinstance(row.get("leadTimeDays"), (int, float)) and not isinstance(row.get("leadTimeDays"), bool) for row in products),
            "productsMissingLeadTime": missing_fields["leadTimeDays"],
        }
    return {"lastSuccessAt": captured.isoformat(), "latestBusinessDate": business_day.isoformat(),
            "businessTimezone": snapshot["businessTimezone"],
            "expectedProducts": coverage["expectedProducts"], "capturedProducts": len(products),
            "productCoverage": len(products) / coverage["expectedProducts"],
            "expectedWarehouses": coverage["expectedWarehouses"], "capturedWarehouses": len(warehouses),
            "missingFields": missing_fields, "missingWarehouseQuantityFields": warehouse_missing,
            "supplierLeadTimeCoverage": supplier_coverage}


def due(now: datetime, target: dict, status: dict, startup: bool) -> bool:
    local = now.astimezone(ZoneInfo(target["timezone"]))
    if status.get("latestBusinessDate") == local.date().isoformat():
        return False
    last_attempt = status.get("lastAttemptAt")
    # Retry failed captures hourly without hammering Odoo every minute.
    if last_attempt and (now - datetime.fromisoformat(last_attempt)).total_seconds() < 3600:
        return False
    return startup or local.hour >= 2


def capture(root: Path, target: dict, database: str, now: datetime, run=subprocess.run) -> dict:
    company_id = target["companyId"]
    company_root = root / str(company_id)
    status_path = company_root / "status.json"
    try:
        previous = read_json(status_path)
    except (OSError, ValueError):
        previous = {}
    if previous.get("companyId") != company_id or previous.get("database") != database:
        previous = {}
    status = {**previous, "version": 1, "companyId": company_id, "database": database,
              "lastAttemptAt": now.isoformat(), "lastAttemptStatus": "RUNNING", "lastError": None,
              "schedule": "Daily at 02:00 store time; startup catch-up; hourly failure retry"}
    atomic_json(status_path, status)
    try:
        env = {**os.environ, "SKR_ODOO_COMPANY_ID": str(company_id),
               "SKR_BUSINESS_TIMEZONE": target["timezone"], "SKR_INVENTORY_SNAPSHOT_ROOT": str(company_root)}
        day = now.astimezone(ZoneInfo(target["timezone"])).date().isoformat()
        destination = company_root / day / "inventory.json"
        # Reuse a successful capture if the worker was replaced before status publication.
        try:
            summarise(read_json(destination), company_id, database)
        except (OSError, ValueError, KeyError, TypeError):
            result = run([sys.executable, str(Path(__file__).with_name("fetch-skr-inventory-snapshot.py"))],
                         env=env, capture_output=True, timeout=1800, check=False)
            if result.returncode:
                raise ValueError("capture failed")
        observations = []
        invalid = 0
        for path in sorted(company_root.glob("????-??-??/inventory.json")):
            try:
                summary = summarise(read_json(path), company_id, database)
                if path.parent.name != summary["latestBusinessDate"]:
                    raise ValueError("snapshot path mismatch")
                observations.append(summary)
            except (OSError, ValueError, KeyError, TypeError):
                invalid += 1
        if not observations or observations[-1]["latestBusinessDate"] != day:
            raise ValueError("no valid capture for today")
        latest = observations[-1]
        first = observations[0]["latestBusinessDate"]
        gaps = (date.fromisoformat(day) - date.fromisoformat(first)).days + 1 - len(observations)
        status.update(latest)
        status.update(observedDays=len(observations), firstBusinessDate=first, gapDays=gaps,
                      invalidSnapshots=invalid, lastAttemptStatus="SUCCESS")
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        status.update(lastAttemptStatus="FAILED", lastError="CAPTURE_OR_VALIDATION_FAILED")
    atomic_json(status_path, status)
    return status


def main() -> None:
    root = Path(os.environ.get("INVENTORY_SNAPSHOT_ROOT", "/data"))
    database = os.environ["ODOO_DATABASE"]
    targets = json.loads(os.environ.get("INVENTORY_SNAPSHOT_TARGETS", "[]"))
    ids = set()
    for target in targets:
        if not isinstance(target["companyId"], int) or target["companyId"] <= 0 or target["companyId"] in ids:
            raise ValueError("invalid or duplicate inventory company")
        ids.add(target["companyId"])
        ZoneInfo(target["timezone"])
    startup = True
    while True:
        for target in targets:
            now = datetime.now(timezone.utc)
            try:
                status = read_json(root / str(target["companyId"]) / "status.json")
            except (OSError, ValueError):
                status = {}
            if status.get("database") != database or status.get("companyId") != target["companyId"]:
                status = {}
            if due(now, target, status, startup):
                result = capture(root, target, database, now)
                print(json.dumps({"companyId": target["companyId"], "status": result["lastAttemptStatus"]}), flush=True)
        startup = False
        time.sleep(60)


if __name__ == "__main__":
    main()
