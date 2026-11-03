"""Verify a completed private Shopfront sale capture without network or DB writes.

Usage: python scripts/verify-shopfront-sales-evidence.py FOLDER --mirror MIRROR.json
Prints a summary only. Raw sale pages and optional mirror fingerprint stay private.
Matching fingerprints prove the declared projection, not accounting cost validity.
"""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def fingerprint(value):
    return digest(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode())


def number(value):
    require(value is not None and not isinstance(value, bool), "Missing source amount")
    n = Decimal(str(value))
    require(n.is_finite(), "Nonfinite source amount")
    return n


def fixed(value):
    n = number(value)
    rounded = n.quantize(Decimal("0.000001"))
    require(n == rounded, "Amount exceeds six-decimal comparison precision")
    return "0.000000" if n == 0 else format(rounded, "f")


def timestamp(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(stamp.tzinfo is not None, "Naive source timestamp")
    return stamp.astimezone(timezone.utc)


def verify(folder, mirror=None):
    folder = Path(folder)
    result = json.loads((folder / "result.json").read_bytes())
    require(result.get("complete") is True and result.get("endCursorReached") is True,
            "Completed terminal capture required")
    require(result.get("invalidOrders") == 0, "Invalid source orders remain")
    scope = result["scope"]
    start, end = timestamp(scope["fromUtc"]), timestamp(scope["toUtcExclusive"])
    require(start < end, "Invalid capture period")
    raw_manifest = (folder / "pages-manifest.json").read_bytes()
    require(digest(raw_manifest) == result["manifestSha256"], "Manifest hash mismatch")
    manifest = json.loads(raw_manifest)
    require(len(manifest) == result["pages"] and len(manifest) > 0, "Page count mismatch")
    expected_names = [f"{i+1:06d}.json" for i in range(len(manifest))]
    require([p["file"] for p in manifest] == expected_names, "Invalid page sequence")
    require(sorted(p.name for p in folder.glob("[0-9]" * 6 + ".json")) == expected_names,
            "Saved pages differ from manifest")
    all_ids, line_ids, cursors, rows = set(), set(), set(), []
    statuses = Counter()
    totals = {k: Decimal(0) for k in ("totalPrice", "totalTax", "totalCost")}
    refunds, differences = 0, 0
    for i, page in enumerate(manifest):
        raw = (folder / page["file"]).read_bytes()
        require(digest(raw) == page["sha256"], "Source page hash mismatch")
        conn = json.loads(raw)
        edges, info = conn["edges"], conn["pageInfo"]
        require(len(edges) == page["rows"], "Page row count mismatch")
        require(info["hasNextPage"] is (i < len(manifest) - 1), "Missing terminal page")
        if info["hasNextPage"]:
            cursor = info.get("endCursor")
            require(bool(cursor) and cursor not in cursors and bool(edges), "Repeated/empty cursor")
            cursors.add(cursor)
        for edge in edges:
            sale = edge["node"]
            ident = sale["id"]
            require(isinstance(ident, str) and bool(ident) and ident not in all_ids,
                    "Duplicate/invalid source order ID")
            all_ids.add(ident)
            stamp = timestamp(sale["createdAt"])
            require(start <= stamp < end, "Source order outside exact period")
            statuses[sale["status"]] += 1
            if sale["status"] != "COMPLETED":
                continue
            lines = []
            require(bool(sale["items"]), "Completed order lacks lines")
            line_totals = {k: Decimal(0) for k in totals}
            for item in sale["items"]:
                lid = item["id"]
                require(isinstance(lid, str) and bool(lid) and lid not in line_ids,
                        "Duplicate/invalid source line ID")
                line_ids.add(lid)
                refunds += number(item["quantity"]) < 0
                for key, field in (("totalPrice", "totalPrice"), ("totalTax", "tax"), ("totalCost", "cost")):
                    line_totals[key] += number(item[field])
                lines.append([lid, (item.get("item") or {}).get("id") or "",
                              *[fixed(item[k]) for k in ("quantity", "totalPrice", "tax", "cost")]])
            for key in totals:
                totals[key] += number(sale[key])
            differences += any(line_totals[k] != number(sale[k]) for k in totals)
            rows.append([ident, sale["status"], stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                         *[fixed(sale[k]) for k in totals], sorted(lines, key=lambda x: x[0])])
    rows.sort(key=lambda x: x[0])
    summary = {"scope": scope, "pages": len(manifest), "allSourceOrders": len(all_ids),
               "completedOrders": len(rows), "completedLines": len(line_ids), "refundLines": refunds,
               "sourceOrderLineDifferences": differences, "statusCounts": dict(statuses),
               "totals": {k: str(v) for k, v in totals.items()},
               "allSourceIdsSha256": fingerprint(sorted(all_ids)),
               "completedIdsSha256": fingerprint([r[0] for r in rows]),
               "financialProjectionSha256": fingerprint(rows),
               "manifestSha256": digest(raw_manifest), "resultSha256": digest((folder / "result.json").read_bytes()),
               "businessWrites": 0, "accountingVerified": False, "atomicSnapshot": False}
    for key, value in (("orders", len(all_ids)), ("completedOrders", len(rows)),
                       ("completedLines", len(line_ids)), ("refundLines", refunds),
                       ("sourceOrderLineDifferences", differences), ("statusCounts", dict(statuses))):
        require(result[key] == value, "Terminal summary mismatch: " + key)
    require(all(number(result["totals"][k]) == v for k, v in totals.items()), "Terminal financial totals mismatch")
    net = totals["totalPrice"] - totals["totalTax"]
    profit = net - totals["totalCost"]
    require(number(result["netSales"]) == net and number(result["grossProfit"]) == profit,
            "Terminal margin amounts mismatch")
    summary.update(netSales=str(net), grossProfit=str(profit),
                   grossMarginPercent=str(profit / net * 100) if net > 0 else None)
    if mirror is not None:
        other = json.loads(Path(mirror).read_bytes())
        require(all(other["scope"].get(k) == scope.get(k) for k in ("store", "timezone")) and
                other["scope"]["from"] == scope["fromDay"] and
                other["scope"]["to"] == scope["toDayExclusive"], "Mirror scope mismatch")
        keys = ("allSourceOrders", "completedOrders", "completedLines", "allSourceIdsSha256",
                "completedIdsSha256", "financialProjectionSha256")
        summary["mirrorChecks"] = {k: summary[k] == other[k] for k in keys}
        summary["mirrorProjectionMatches"] = all(summary["mirrorChecks"].values())
        summary["mirrorFingerprintSha256"] = digest(Path(mirror).read_bytes())
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder")
    parser.add_argument("--mirror")
    args = parser.parse_args()
    try:
        report = verify(args.folder, args.mirror)
    except (ValueError, KeyError, TypeError, OSError, ArithmeticError) as exc:
        parser.exit(1, f"Capture verification failed: {exc}\n")
    print(json.dumps(report, indent=2))
    if report.get("mirrorProjectionMatches") is False:
        raise SystemExit(2)
