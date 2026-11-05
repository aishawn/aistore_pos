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

## Fixed-SHA Rerun

At the later stable runtime `69f613e0e20da43f85a19838420642bb54a79149` (`2026-11-05T12:20:23Z`), the same harness was rerun separately against both stores:

- SKR evidence SHA-256: `be87e3b19e3ef4e7055612fbc1956098658d651f771cc9bd423e3b40e7fb0ed5`.
- Demo evidence SHA-256: `d45fa8fa336d3872194408793a66f1439d743b950da4bcc35db67c30716d0e6f`.
- Both stores reproduced AI assistant `502` and report/forecast probe `401`; both returned safe replenishment navigation with `writeRequests=[]` and zero page errors.

This confirms a shared runtime/session failure on a fixed deployment SHA. Online AI acceptance remains blocked until the route/session contract is repaired.

## Root-Cause Probe

The harness was corrected to use `ODOO_USER`/`ODOO_PASS` (or service-account equivalents) for an explicit read-only `POST /api/odoo/session` when the initial GET has no Odoo user. The explicit POS session POST still returned Cloudflare HTTP 502. A direct read-only JSON-RPC login to `https://odoo.orithos.com.au/web/session/authenticate` timed out after 30 seconds, and the Odoo database selector GET also timed out. This points to the Odoo upstream being unavailable or unreachable at this check time; it is stronger evidence than an assumed cookie failure. No business write was attempted.

## Dokploy Read-Only Check

The Odoo compose was queried through Dokploy without changing it: `composeStatus=done`, Git source is the `main` branch, `composePath=./docker-compose.yml`, and `autoDeploy=true`. The newest listed Odoo deployment finished on 2026-11-04; there was no newer Odoo deployment during this check. This rules out a pending deployment as the immediate explanation, but does not prove the `web` container is healthy. Owner action is to inspect the Odoo compose/container health and logs in Dokploy, then rerun the direct Odoo health and POS AI probes.
