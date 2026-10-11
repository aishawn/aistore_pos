#!/usr/bin/env python3
"""Fix broken @Insert annotations missing closing ) and "."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/main/java"


def fix_file(content: str) -> str:
    lines = content.split("\n")
    out = []
    for i, line in enumerate(lines):
        if i + 1 < len(lines) and re.match(r"\s*int insert\b", lines[i + 1]):
            stripped = line.rstrip()
            # #{x}))  -> #{x})")
            if stripped.endswith("}))"):
                line = stripped[:-3] + '})")'
            # #{x})"  -> #{x})")
            elif stripped.endswith('})"'):
                line = stripped + ')'
            elif stripped.endswith(')"'):
                pass
            elif stripped.endswith(")\"") and not stripped.endswith('")'):
                line = stripped + ")"
            elif stripped.endswith(')"') is False and stripped.endswith('"'):
                # ends with ...})"  already ok if ends with '")'
                if not stripped.endswith('")'):
                    line = stripped + ")"
            elif re.search(r"\#\{[^}]+\}\)$", stripped):
                line = stripped + '")'
            elif re.search(r"\#\{[^}]+\}\)\)$", stripped):
                line = stripped[:-1] + '")'
            elif stripped.endswith(')"') and not stripped.endswith('")'):
                line = stripped + ')'
            elif re.search(r"\#\{[^}]+\}\)\"$", stripped):
                line = stripped + ')'
        out.append(line)
    return "\n".join(out)


def main():
    changed = 0
    for f in ROOT.rglob("*Mapper.java"):
        original = f.read_text(encoding="utf-8")
        if "int insert" not in original:
            continue
        updated = fix_file(original)
        if updated != original:
            f.write_text(updated, encoding="utf-8")
            print(f"Fixed {f.relative_to(ROOT.parent.parent)}")
            changed += 1
    print(f"Done. {changed} files.")


if __name__ == "__main__":
    main()
