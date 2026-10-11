#!/usr/bin/env python3
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "src/main/java"
for f in root.rglob("*Mapper.java"):
    c = f.read_text(encoding="utf-8")
    orig = c
    c = re.sub(r'(\+ "VALUES \([^"]+\))"\s*\n(\s*int insert)', r'\1)\n\2', c)
    c = re.sub(
        r'(@Insert\("INSERT INTO \$\{table\} \(name, mdb_id\) VALUES \(\#\{c\.name\}, \#\{c\.mdbId\}\))"\s*\n',
        r'\1)\n',
        c,
    )
    c = re.sub(
        r'(@Insert\("INSERT INTO [^"]+VALUES \([^"]+\))"\s*\n(\s*int insert)',
        r'\1)\n\2',
        c,
    )
    if c != orig:
        f.write_text(c, encoding="utf-8")
        print("fixed", f.relative_to(root.parent.parent))
