# Test Session: 2026-11-09 Shopfront Orithos import guards

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-09-shopfront-orithos-import-guards` |
| Started / timezone | 2026-11-09, Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | `0184be2201ed58b98cfabfdaba655585c51e0831` |
| Runtime SHA | `0184be2201ed58b98cfabfdaba655585c51e0831` on SKR and Demo frontend/backend |
| Environment | GitHub Actions Java 21 candidate build; online read-only version probe |
| Database | not applicable |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `SHOPFRONT-IMPORT-001` | [Exact candidate workflow](https://github.com/aishawn/aistore_pos/actions/runs/42573888903), `mvn -B clean verify` | PASS | Workflow run 42573888903 | Candidate parent and SHA were checked out from the uploaded bundle; 575 tests, 0 failures/errors. |
| `SHOPFRONT-IMPORT-002` | `git diff --check` | PASS | Local candidate before commit | No whitespace errors. |
| `SHOPFRONT-IMPORT-003` | `GET /api/openapi.json` and `/api/public/version` on SKR and Demo | PASS | Read-only probes | OpenAPI returned `200 application/json`; frontend/backend runtime SHA matches candidate on both hosts. |

## Summary

- Passed: exact-SHA remote Java 21 verification; 575 tests.
- Blocked: Shopfront-to-Orithos data import acceptance is pending; runtime deployment is verified.
- Failed: none on the passing candidate run. An initial candidate run exposed a Mockito matcher error in the new test; the test was corrected before the passing candidate was created.
- Not run: live business import, Shopfront sync enqueue, SKR cutover, Odoo retirement.
- Business impact: import guards prevent incomplete product/tax/price/case data and unsafe complete inventory replacement from being applied. Shopfront sales remain mirrored, not posted as formal Orithos sales.

## Follow-up

1. Verify Orithos store mapping, database isolation, tax coverage, and source staging counts before any Demo business import.
2. Implement and reconcile formal Shopfront sale, payment, and inventory-movement posting before considering SKR cutover.
3. Repeat the online runtime SHA check after subsequent deployments.

## Evidence rules

- No credentials, database URLs, or source customer records are included.
- Source verification, local code, remote build, and runtime deployment are recorded as separate states.
