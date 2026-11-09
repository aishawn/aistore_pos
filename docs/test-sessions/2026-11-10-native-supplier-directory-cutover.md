# Test Session: 2026-11-10 Native Supplier Directory Cutover

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-10-native-supplier-directory-cutover` |
| Started / timezone | 2026-11-10 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | `36713d45507618816add439a9a3fcf6cba160288` |
| Runtime SHA | SKR and Demo frontend/backend: `36713d45507618816add439a9a3fcf6cba160288` |
| Environment | Local checks; online read-only |
| Database | Production runtime; no authenticated business-data query |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `PUR-001` | GitHub `Backend Java 21 Verify`, run `42694462448`, exact SHA `36713d45`, `mvn -B clean verify` | PASS | [Workflow](https://github.com/aishawn/aistore_pos/actions/runs/42694462448) | 586 tests, 0 failures/errors; full log archived locally under ignored `.local/` |
| `UI-001` | POS UI `npm run typecheck` | PASS | Source SHA above | Final component export/import state checked |
| `UI-001` | POS UI `npm run build` | PASS | Source candidate; Next 16.4.3 | Build completed successfully |
| `UI-001` | Targeted ESLint on supplier component and route | PASS | Source candidate | 0 errors, 3 existing React effect warnings |
| `OPS-001` | SKR/Demo `/api/public/version`, `/enapi.json`, `/openapi.json`, unauthenticated supplier routes | PASS | Runtime version endpoint and OpenAPI | Both host runtime SHAs match; OpenAPI 200; supplier pages redirect to login as expected |
| `OPS-001` | Authenticated supplier records / create / update / delete | NOT RUN | Not applicable | No staff session was used; business writes 0 |

## Summary

- Passed: Java 21 full suite 586/586; UI typecheck/build; targeted lint with warnings; SKR and Demo deployment identity and public OpenAPI probes.
- Blocked: authenticated supplier list/detail and the logged-in legacy route redirect were not exercised.
- Failed: none.
- Not run: supplier data reads, supplier creation/update/deletion, procurement receive, stock, ledger reconciliation, and Odoo retirement checks.
- Business impact: suppliers page and creation now use tenant-scoped Orithos APIs; no supplier data was changed.

## Follow-up

1. In the approved test tenant, verify supplier search and creation with a unique ABN, reject a duplicate ABN within the same tenant, and confirm cross-tenant visibility is denied.
2. Continue domain migration; `/api/odoo/*` remains in use by other POS features and Odoo has not been retired.

## Evidence rules

- The production probes were read-only and did not access supplier business records.
- Deployment is verified by exact runtime SHA on both store hosts.
- No credentials or authenticated response bodies are recorded here.
