"""Inject outlet_id into schema.sql CREATE TABLE blocks that lack it."""
from __future__ import annotations

import re
from pathlib import Path

SKIP = {"outlet", "permission"}
COL = "  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',\n"

schema_path = Path(__file__).resolve().parents[1] / "src/main/resources/db/schema.sql"
text = schema_path.read_text(encoding="utf-8")

create_re = re.compile(
    r"(CREATE TABLE(?: IF NOT EXISTS)? )(`?)(\w+)\2(\s*\()(.*?)(\n\) ENGINE=InnoDB)",
    re.DOTALL | re.IGNORECASE,
)

added: list[str] = []
skipped_existing: list[str] = []


def patch_block(match: re.Match[str]) -> str:
    prefix, tick, name, open_paren, body, engine = match.groups()
    table = name.lower()
    if table in SKIP:
        return match.group(0)
    if re.search(r"\boutlet_id\b", body):
        skipped_existing.append(table)
        return match.group(0)

    if "PRIMARY KEY" not in body.upper():
        raise SystemExit(f"No PRIMARY KEY in {table}")

    if "outlet_id BIGINT NOT NULL DEFAULT 1" in body:
        return match.group(0)

    # Insert column immediately before PRIMARY KEY (own line or inline).
    new_body, n = re.subn(
        r"(?i)(\s*)PRIMARY KEY\s*\(",
        lambda m: f"\n{COL}{m.group(1)}PRIMARY KEY (",
        body,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"Failed to insert column in {table}")

    idx = f"idx_{table}_outlet"[:64]
    if f"KEY {idx}" not in new_body:

        def add_index(m: re.Match[str]) -> str:
            pk = m.group(0)
            if pk.rstrip().endswith(","):
                return pk + f"\n  KEY {idx} (outlet_id),"
            return pk + f",\n  KEY {idx} (outlet_id)"

        new_body, n = re.subn(
            r"(?i)PRIMARY KEY\s*\([^)]*\)\s*,?",
            add_index,
            new_body,
            count=1,
        )
        if n != 1:
            raise SystemExit(f"Failed to insert index in {table}")

        # Avoid double comma before next KEY / CONSTRAINT / )
        new_body = re.sub(r",\s*,", ",", new_body)

    added.append(table)
    return f"{prefix}{tick}{name}{tick}{open_paren}{new_body}{engine}"


new_text, count = create_re.subn(patch_block, text)
if count == 0:
    raise SystemExit("No CREATE TABLE blocks matched")

schema_path.write_text(new_text, encoding="utf-8")
print("patched tables:", len(added))
print(" ".join(added))
print("already had outlet_id:", len(skipped_existing), " ".join(skipped_existing))
