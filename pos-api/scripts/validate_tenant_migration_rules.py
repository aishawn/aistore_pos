"""Validate that every source table has an explicit tenant-copy classification."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = Path(__file__).with_name("tenant_migration_rules.json")


def classify(table: dict, rules: dict) -> tuple[str | None, str | None]:
    name = table["table"]
    override = rules.get("table_overrides", {}).get(name)
    if override:
        return override["scope"], override.get("owner_column")
    if name in rules.get("control_only", []):
        return "control_only", None
    if name in rules.get("replicate_to_each_shard", []):
        return "replicate_to_each_shard", None
    if name in rules.get("copy_vendor_root_to_shard", []):
        return "vendor_root", None
    if name in rules.get("indirect_vendor_scope", {}):
        return "indirect_vendor", None

    owners = table.get("ownership_columns", [])
    if len(owners) != 1:
        return None, None
    owner = owners[0]
    if owner == "vendor_id":
        return "vendor_id", owner
    if owner == "outlet_id":
        column = next((c for c in table.get("columns", []) if c["name"] == owner), None)
        if column and column["type"] in {"int2", "int4", "int8"}:
            return "outlet_id", owner
        return None, None
    if owner == "store_key":
        return "store_key", owner
    if owner == "tenant_id":
        return "control_only", None
    return None, None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "inventory",
        nargs="?",
        type=Path,
        default=ROOT / ".local" / "tenant-data-inventory.json",
        help="output from inventory_tenant_data.py",
    )
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))

    classifications: list[dict] = []
    unresolved: list[str] = []
    invalid_rules: list[str] = []
    tables_by_name = {table["table"]: table for table in inventory.get("tables", [])}
    for table in inventory.get("tables", []):
        scope, owner_column = classify(table, rules)
        if scope is None:
            unresolved.append(table["table"])
        else:
            if owner_column and owner_column not in {column["name"] for column in table.get("columns", [])}:
                invalid_rules.append(f"{table['table']}: missing owner column {owner_column}")
            classifications.append(
                {
                    "table": table["table"],
                    "scope": scope,
                    "owner_column": owner_column,
                    "note": rules.get("table_overrides", {}).get(table["table"], {}).get("note"),
                }
            )

    for child_name, relation in rules.get("indirect_vendor_scope", {}).items():
        child = tables_by_name.get(child_name)
        parent = tables_by_name.get(relation["parent_table"])
        if child is None or parent is None:
            continue
        child_columns = {column["name"] for column in child.get("columns", [])}
        parent_columns = {column["name"] for column in parent.get("columns", [])}
        for column_name in (relation["child_key"],):
            if column_name not in child_columns:
                invalid_rules.append(f"{child_name}: missing indirect child key {column_name}")
        for column_name in (relation["parent_key"], relation["parent_owner_column"]):
            if column_name not in parent_columns:
                invalid_rules.append(f"{relation['parent_table']}: missing indirect parent column {column_name}")

    known_tables = {table["table"] for table in inventory.get("tables", [])}
    stale_rules = sorted(
        (set(rules.get("control_only", [])) | set(rules.get("replicate_to_each_shard", []))
         | set(rules.get("copy_vendor_root_to_shard", []))
         | set(rules.get("indirect_vendor_scope", {}))
         | set(rules.get("table_overrides", {}))) - known_tables
    )
    counts: dict[str, int] = {}
    for entry in classifications:
        counts[entry["scope"]] = counts.get(entry["scope"], 0) + 1

    report = {
        "status": "BLOCKED" if unresolved or stale_rules or invalid_rules else "TABLES_CLASSIFIED",
        "migration_ready": False,
        "classification_only": True,
        "inventory_database": inventory.get("database"),
        "inventory_observed_at": inventory.get("observed_at"),
        "rules_version": rules.get("version"),
        "table_count": len(inventory.get("tables", [])),
        "classified_count": len(classifications),
        "scope_counts": counts,
        "unresolved_tables": unresolved,
        "stale_rules": stale_rules,
        "invalid_rules": sorted(set(invalid_rules)),
        "classifications": sorted(classifications, key=lambda item: item["table"]),
    }
    print(json.dumps(report, indent=2))
    if report["status"] == "BLOCKED":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
