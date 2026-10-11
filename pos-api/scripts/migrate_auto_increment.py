#!/usr/bin/env python3
"""Migrate MyBatis INSERT statements from explicit id to useGeneratedKeys."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

KEY_PROPERTY = {
    "ClassificationMapper.java": "c.id",
}


def strip_id_from_insert(sql: str) -> str:
    sql = re.sub(r"\(\s*id\s*,", "(", sql, flags=re.IGNORECASE)
    sql = re.sub(r",\s*id\s*\)", ")", sql, flags=re.IGNORECASE)
    sql = re.sub(r"VALUES\s*\(\s*#\{id\}\s*,", "VALUES (", sql, flags=re.IGNORECASE)
    sql = re.sub(r"VALUES\s*\(\s*#\{c\.id\}\s*,", "VALUES (", sql, flags=re.IGNORECASE)
    sql = re.sub(r"VALUES\s*\(\s*#\{p\.id\}\s*,", "VALUES (", sql, flags=re.IGNORECASE)
    sql = re.sub(r",\s*#\{id\}\s*\)", ")", sql, flags=re.IGNORECASE)
    sql = re.sub(r",\s*#\{c\.id\}\s*\)", ")", sql, flags=re.IGNORECASE)
    sql = re.sub(r",\s*#\{p\.id\}\s*\)", ")", sql, flags=re.IGNORECASE)
    return sql


def is_param_only_insert(sql: str) -> bool:
    """INSERT where id is a standalone @Param, not an entity field."""
    return bool(re.search(r"VALUES\s*\(\s*#\{id\}\s*,", sql, re.IGNORECASE))


def process_java(content: str, filename: str) -> str:
    key_prop = KEY_PROPERTY.get(filename, "id")

    def patch_insert(match: re.Match) -> str:
        prefix = match.group(1)
        body = match.group(2)
        if "INSERT INTO" not in body.upper() or not re.search(r"\(\s*id\s*,", body, re.IGNORECASE):
            return match.group(0)

        param_only = is_param_only_insert(body)
        new_body = strip_id_from_insert(body)

        if param_only:
            return prefix + new_body

        if "@Options(useGeneratedKeys" in prefix:
            return prefix + new_body

        options = f'@Options(useGeneratedKeys = true, keyProperty = "{key_prop}")\n    '
        return options + prefix + new_body

    # Text-block @Insert(""" ... """)
    content = re.sub(
        r"((?:@Options\([^\n]*\)\n\s*)?)@Insert\(\"\"\"(.*?)\"\"\"\)",
        patch_insert,
        content,
        flags=re.DOTALL,
    )

    # String-concat @Insert("..." + "...")
    content = re.sub(
        r"((?:@Options\([^\n]*\)\n\s*)?)@Insert\(((?:\"[^\"]*\"(?:\s*\+\s*)?)+)\)",
        patch_insert,
        content,
        flags=re.DOTALL,
    )

    return content


def process_xml(content: str) -> str:
    if 'id="insert"' not in content:
        return content
    content = re.sub(
        r'<insert id="insert">',
        r'<insert id="insert" useGeneratedKeys="true" keyProperty="p.id">',
        content,
        count=1,
    )
    content = re.sub(
        r"INSERT INTO product \(\s*id\s*,",
        "INSERT INTO product (",
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r"VALUES \(\s*#\{p\.id\}\s*,",
        "VALUES (",
        content,
        flags=re.IGNORECASE,
    )
    return content


def main():
    changed = 0
    for f in (ROOT / "src/main/java").rglob("*Mapper.java"):
        original = f.read_text(encoding="utf-8")
        if "INSERT INTO" not in original or not re.search(r"\(\s*id\s*,", original, re.IGNORECASE):
            continue
        updated = process_java(original, f.name)
        if updated != original:
            f.write_text(updated, encoding="utf-8")
            changed += 1
            print(f"Updated {f.relative_to(ROOT)}")

    xml = ROOT / "src/main/resources/mapper/ProductMapper.xml"
    if xml.exists():
        original = xml.read_text(encoding="utf-8")
        updated = process_xml(original)
        if updated != original:
            xml.write_text(updated, encoding="utf-8")
            print(f"Updated {xml.relative_to(ROOT)}")

    print(f"Done. {changed} Java mapper files updated.")


if __name__ == "__main__":
    main()
