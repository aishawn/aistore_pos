#!/usr/bin/env python3
"""Audit which migration tables should skip renumbering (PK != single column id)."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_renumber_migration import ordered, tables_without_id  # noqa: E402

schema = Path(__file__).resolve().parents[1] / "src/main/resources/db/orithos.sql"
text = schema.read_text(encoding="utf-8")

skip = tables_without_id(schema, [t for t, _ in ordered])

print("Skip renumber (PK is not `id`):")
for table in sorted(skip):
    m = re.search(rf"CREATE TABLE `{table}`\s*\((.*?)\)\s*ENGINE", text, re.S)
    pk = "?"
    if m:
        pk_m = re.search(r"PRIMARY KEY \(([^)]+)\)", m.group(1))
        if pk_m:
            pk = pk_m.group(1)
    print(f"  {table}: PK={pk}")
