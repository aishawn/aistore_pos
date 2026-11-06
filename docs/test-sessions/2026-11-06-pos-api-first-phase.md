# 2026-11-06 POS API first phase

## Scope

Candidate source SHA: working tree (not committed). Runtime/deployment: NOT RUN. Business writes: 0.

## Checks

- PASS: `pos-api` Java 21 Maven compile with tests skipped.
- PASS: `python -m py_compile tools/orithos-pos`.
- PASS: `python scripts/check-project-docs.py` (71 Markdown files and evidence assertions).
- PASS: `git diff --check`.
- NOT RUN: Dokploy exact-SHA `mvn -B clean verify`, deployed API token, Odoo `aipos_uat` read fixture, live tenant isolation, write/idempotency/webhook suites.

## Limitations

Only token lifecycle, scope filter, tenant/company-scoped Odoo read facade and thin CLI are implemented. Batch writes deliberately fail closed with `501` until resource-specific Odoo write policies and UAT isolation evidence are complete. No production data was changed.
