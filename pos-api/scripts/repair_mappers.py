#!/usr/bin/env python3
"""Repair mapper files where @Insert( prefix was lost."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/main/java"
KEY_PROPERTY = {"ClassificationMapper.java": "c.id"}


def repair(content: str, filename: str) -> str:
    key_prop = KEY_PROPERTY.get(filename, "id")
    lines = content.split("\n")
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith('"INSERT INTO') and (not out or "@Insert" not in out[-1]):
            indent = line[: len(line) - len(line.lstrip())]
            has_options = out and "@Options(useGeneratedKeys" in out[-1]
            if not has_options:
                out.append(f'{indent}@Options(useGeneratedKeys = true, keyProperty = "{key_prop}")')
            out.append(f"{indent}@Insert({stripped}")
            i += 1
            continue

        if stripped.startswith("INSERT INTO ") and (not out or "@Insert" not in "".join(out[-3:])):
            # Broken text-block body without wrapper — collect until int insert
            indent = line[: len(line) - len(line.lstrip())]
            block = [line]
            j = i + 1
            while j < len(lines) and "int insert" not in lines[j]:
                block.append(lines[j])
                j += 1
            if j < len(lines):
                out.append(f'{indent}@Options(useGeneratedKeys = true, keyProperty = "{key_prop}")')
                out.append(f'{indent}@Insert("""')
                out.extend(block)
                out.append(f'{indent}"""')
                out.append(lines[j])
                i = j + 1
                continue

        out.append(line)
        i += 1

    result = "\n".join(out)
    result = re.sub(r"\(\s+(\w)", r"(\1", result)
    result = re.sub(r"VALUES \(\s+", "VALUES (", result)
    return result


def main():
    for f in ROOT.rglob("*Mapper.java"):
        original = f.read_text(encoding="utf-8")
        if '"INSERT INTO' in original or re.search(r"^\s+INSERT INTO \w", original, re.MULTILINE):
            updated = repair(original, f.name)
            if updated != original:
                f.write_text(updated, encoding="utf-8")
                print(f"Repaired {f.relative_to(ROOT.parent.parent)}")


if __name__ == "__main__":
    main()
