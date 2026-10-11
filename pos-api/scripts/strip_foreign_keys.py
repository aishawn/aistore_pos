#!/usr/bin/env python3
"""Remove FOREIGN KEY constraint lines from SQL dump/schema files."""
import re
import sys
from pathlib import Path

# Full line: optional trailing comma on previous line handled separately
FK_LINE = re.compile(
    r"^\s*,?\s*CONSTRAINT `[^`]+` FOREIGN KEY \([^)]+\) REFERENCES `[^`]+` \([^)]+\)"
    r"(?: ON DELETE \w+ ON UPDATE \w+)?\s*$",
    re.M,
)
# Unnamed CONSTRAINT (migration scripts)
FK_LINE_UNNAMED = re.compile(
    r"^\s*,?\s*CONSTRAINT \w+ FOREIGN KEY \([^)]+\) REFERENCES \w+ \([^)]+\)\s*$",
    re.M,
)


def strip_fks(text: str) -> str:
    text = FK_LINE.sub("", text)
    text = FK_LINE_UNNAMED.sub("", text)
    # Remove trailing comma before ) ENGINE when CONSTRAINT was last item
    text = re.sub(r",(\s*\)\s*ENGINE)", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else [
        root / "src/main/resources/db/orithos.sql",
    ]
    for path in paths:
        original = path.read_text(encoding="utf-8")
        updated = strip_fks(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            print(f"Stripped FKs from {path}")
        else:
            print(f"No FK lines in {path}")


if __name__ == "__main__":
    main()
