#!/usr/bin/env python3
"""Remove Ids.next() primary-key assignments from Java source."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/main/java"
SKIP_INVOICE = "CheckoutService.java"

for f in ROOT.rglob("*.java"):
    if f.name == SKIP_INVOICE:
        continue
    content = f.read_text(encoding="utf-8")
    if "Ids.next()" not in content:
        continue
    original = content
    content = re.sub(r"\s*if\s*\([^)]*\.getId\(\)\s*==\s*null\)\s*\w+\.setId\(Ids\.next\(\)\);\n", "\n", content)
    content = re.sub(r"\s*\w+\.setId\(Ids\.next\(\)\);\n", "\n", content)
    content = re.sub(r"\s*\w+\.setId\(com\.orithos\.common\.Ids\.next\(\)\);\n", "\n", content)
    content = re.sub(r"mapper\.insertBarcode\(Ids\.next\(\),\s*", "mapper.insertBarcode(", content)
    content = re.sub(r"mapper\.insertRelated\(Ids\.next\(\),\s*", "mapper.insertRelated(", content)
    content = re.sub(r"customerEmailMapper\.insert\(Ids\.next\(\),\s*", "customerEmailMapper.insert(", content)
    content = re.sub(r"import com\.orithos\.common\.Ids;\n", "", content)
    if content != original:
        f.write_text(content, encoding="utf-8")
        print(f"Updated {f.relative_to(ROOT.parent.parent)}")
