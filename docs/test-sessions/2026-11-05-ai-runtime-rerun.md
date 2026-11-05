# Test Session: 2026-11-05 AI Runtime Read-Only Rerun

## Scope

This session reran the authenticated read-only AI harness against SKR and Demo after the latest automatic deployments. It used login, Odoo session initialization, assistant questions, report GET/POST checks, dead-stock GET, and replenishment GET. No RFQ, purchase order, product, inventory, or sales write was issued.

## Evidence

| Store | Runtime SHA | Generated at | Evidence SHA-256 |
|---|---|---|---|
| SKR | `7df0f9cdc40ef7bb0600e37fcfe2c960b3a803da` | `2026-11-05T11:54:03Z` | `7e5fd23150ac012f64c794ec4c156b4d823481e7d68faf887c287a09b63afd56` |
| Demo | `55f186cd63ee35d833819133e3f17e382624dae8` | `2026-11-05T12:01:08Z` | `3b3690c5eea1ca8a988a453920d18a283a7d8c6c062e44c5aa703325accceba5` |

Raw JSON remains in the ignored `.local/ai-eval/` directory of the verification worktree.

## Results

| Check | SKR | Demo |
|---|---:|---:|
| Login | PASS | PASS |
| Odoo session | PASS (HTTP 200) | PASS (HTTP 200) |
| Yesterday/exact-date/weekly AI sales questions | BLOCKED/502 | BLOCKED/502 |
| Dead-stock AI question | BLOCKED/502 | BLOCKED/502 |
| Direct report and forecast GET/POST probes | 401 | 401 |
| “What do we need to buy?” | Safe navigation to `/stock/replenishment` | Safe navigation to `/stock/replenishment` |
| Write requests | `[]` | `[]` |
| Page errors | 0 | 0 |

The same failure pattern in both stores points to a shared current-runtime authentication/report route problem. This is not an accuracy result and does not replace the earlier successful 2026-11-05 sales reconciliation evidence. It blocks current online AI acceptance until the runtime route/session contract is repaired and rerun.

## Decision

Keep production forecast policy, manual review gates, and procurement automation unchanged. Continue native inventory capture and offline model work; do not submit RFQs or purchase orders from this result.

## Deployment Follow-Up

After the record was pushed, both `https://demo.orithos.com.au/api/public/version` and `https://skr.orithos.com.au/api/public/version` returned HTTP 200 with frontend and backend commit `3602173f649e426cf067e4e751f3ef36ca45dde7` (`2026-11-05T12:08:11Z`). This confirms deployment identity only; the failed AI/runtime checks above were not silently reclassified as passing.
