# SKR inventory history review (2026-11-06)

## Read-only endpoint check

The authenticated SKR replenishment endpoint returned HTTP 200 on the deployed build `a084accc5555856e9ef3070f9d0212c7e7e9f675`. The check used the existing read-only probe with a seven-day coverage request. No Odoo write calls were observed and `writeRequests=[]`.

The endpoint reports `latestBusinessDate=2026-11-06`, `firstBusinessDate=2026-11-01`, `observedDays=6`, `gapDays=0`, `invalidSnapshots=0`, and `lastAttemptStatus=SUCCESS`. Product coverage is 13,293/13,293 (100%); warehouse coverage is 1/1; missing inventory quantity fields are zero. This is contiguous daily history for November 1 through 6.

The local native capture for November 6 also validates `PASS`: 13,293 products, no errors or warnings, and `writeRequests=[]`. Its recorded capture time is `2026-11-05T18:00:33Z`; the online history endpoint reports `lastSuccessAt=2026-11-05T15:30:45Z`. Both refer to business date November 6, but their capture timestamps differ by about 2.5 hours. Reconcile which capture is represented by the endpoint before using timestamps for freshness or lineage claims.

## Remaining limits

- Six observed days remain below the 28-day minimum for inventory-aware evaluation.
- Supplier lead-time coverage remains 0/13,293 (`ODOO_SUPPLIERINFO_UNAVAILABLE`); do not treat the endpoint as replenishment-ready.
- Promotion rules remain unavailable in the native capture.
- Inventory snapshots show once-daily availability, not intraday stockout timing or realized fill rate.
- The endpoint marks all 2,263 forecast products for review. Keep forecasts and replenishment recommendations review-only; do not change production policy or enable automatic purchasing.

## Evidence locations

- Local validation: `orithopos-master/.worktrees/ai-verification/.local/ai-eval/inventory-snapshots-scoped-v2/2026-11-06/validation.json`
- Local history: `orithopos-master/.worktrees/ai-verification/.local/ai-eval/inventory-history.json`
- Authenticated online probe: `orithopos-master/.worktrees/ai-verification/.local/ai-eval/inventory-history-heartbeat-2026-11-06.json`
