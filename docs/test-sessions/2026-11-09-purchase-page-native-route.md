# Test Session: 2026-11-09 purchase page native route

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-09-purchase-page-native-route` |
| Started / timezone | 2026-11-09 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | Base `3a1712a2`; candidate is an uncommitted working tree |
| Runtime SHA | POS Demo/SKR/App `3a1712a2` before candidate; crawler source fingerprint `47cfc1e1e05ca9e9188c74360df09f78eb37a6b0008d9f205ef7f6d8e0ae0597` |
| Environment | Local checks and online read-only health/version probes |
| Database | Not connected |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `UI-001` | `npm run typecheck` | PASS | Local command output | Node 22.22.2; package requires Node 24+ |
| `UI-001` | `npm run test:unit` | PASS | 211 tests, 0 failures | Includes a new allow/deny source-host mapping regression |
| `UI-001` | `git diff --check` | PASS | Local command output | Includes only whitespace validation |
| `UI-001` | Targeted ESLint | PASS | No diagnostics | Changed route, pages, source component and host-scope test |
| `UI-001` | `python scripts/check-project-docs.py` | PASS | 81 Markdown files | Corrected a stale reporting validation link to the existing follow-up session |
| `UI-001` | Demo/SKR authenticated `/purchases` smoke | NOT RUN |  | Candidate not deployed; no login variable available to this process |

## Summary

- Passed: typecheck, targeted ESLint and 211 frontend unit tests.
- Blocked: authenticated online purchase page verification awaits deployment.
- Failed: none.
- Not run: targeted lint, production build, database integration, purchase/receipt writes.
- Business impact: the candidate redirects the normal purchase list to the Orithos API and reads historical Shopfront records directly from the crawler. No purchase, receipt, or inventory transaction was written.

## Follow-up

1. Push the reviewed UI-only candidate to `main` and wait for Dokploy deployment.
2. Confirm Demo and SKR frontend/backend runtime SHA, then sign in and read `/purchases`, native `/api/orders`, and the archived Shopfront section.
3. Run full purchase and receipt acceptance only in an isolated test tenant; reconcile stock movements and duplicate retries before enabling a production store.
