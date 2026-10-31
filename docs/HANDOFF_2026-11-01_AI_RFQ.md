# AI replenishment / RFQ verification — 2026-11-01

## Implemented and verified before this change

- Real SKR sales: 20 SKUs × 56 complete store-local dates matched independent Odoo order-line reads (435 lines, including one refund and 19 UTC/local date crossings), with zero mismatches. SKR was read only.
- Anomalous inventory, costs and purchase units block automatic quantity suggestions. The observed SKR sample contained 1,000 products, 932 requiring data review; this is a capped sample, not catalogue-wide acceptance.
- One correctly company-scoped inventory snapshot captured 12,984 products, one warehouse, no missing quantity fields. Daily scheduling exists; multi-day continuity remains unproven.
- Business-cost model selection and similar-product cold start are implemented; merchant cost calibration and held-out financial improvement remain unverified. Interval coverage is not empirically calibrated.
- Demo API manual procurement check on runtime `abe71691da32b7485517409b1ae862e41e1e32dc`: draft `P02371` (93748), company 127, product 518006, quantity 1, supplier 3740. Independent Odoo readback confirmed draft state, quantity/unit and one approval audit. Suggested quantity was zero; this tests manual procurement plumbing, not positive-demand prediction or the complete suggestion UI. The UAT draft was left unconfirmed and unsent.

## Durable RFQ request handling

The client retains a request UUID for one review. The server reserves it atomically in SQLite before creating an Odoo RFQ, scoped by Odoo endpoint/database/company. A completed retry returns the saved response; a changed payload conflicts; an unresolved outcome remains pending and requires checking purchases. Reservations do not expire automatically. Compose mounts a named volume and configures `RFQ_IDEMPOTENCY_DB`; missing storage fails closed before creation.

Local checks: Node 24 TypeScript and targeted ESLint passed; 43 UI unit tests passed, including a real temporary SQLite test with independent journal clients, payload conflict, company separation and completed replay. These do not prove remote volume persistence or online concurrency. Online validation will be recorded separately after deployment.

Operational limits: one shared frontend volume supports the current Compose deployment. Scaling across hosts requires shared transactional storage. Closing/reopening the review or refreshing the browser does not recover the original request UUID; users must check purchases after an uncertain outcome. SKR physical timezone is not independently confirmed (missing company state); Demo lacks country/state. Shared `aipos_uat` is not production tenant isolation.

Next: deploy and verify exact runtime SHA; exercise duplicate/concurrent Demo API submissions and independently read back the single draft; expose inventory freshness/coverage and verify subsequent scheduled captures. Do not write SKR or auto-confirm purchase orders.

## Completed online acceptance

Deployment `mtww1RvpQvwJdB905wlwH` completed for runtime `95e9b14b5414fefa34cdc46ea8cde1e3ae15bce8`, with 489 backend tests passing. Concurrent identical Demo API submissions returned 409/201; a completed retry returned 201 with the same ID. A changed quantity with the same key returned 409. Independent Odoo reads found exactly one new draft `P02372` (93749), company 127, quantity 1 in Units and one audit. After a documentation auto-deployment replaced the frontend (runtime `dec0a96f45996ddf0ae0c4fde71dd068a8f8538e`), replay returned the same draft, and order/audit counts remained one. The persisted journal survived deployment. See `UAT_AI_RFQ_IDEMPOTENCY_DEMO_2026-11-01.json`. No confirmation, sending or SKR business writes occurred.

The scoped local history now contains two adjacent business dates and 12,984 products. The latest capture was `2026-10-31T16:23:05Z`; freshness is FRESH with no date gaps. These captures span less than one elapsed day, so they do not prove stable daily scheduling. Latest scheduled-task result is 0; next run reported November 2 at 02:00 local. Inventory checker adjustments remain uncommitted work owned by another workflow; seven focused pytest checks passed against those working files, not this deployment.

Remaining priorities: repair inventory/cost/unit source anomalies, confirm actual store timezone, expose freshness/coverage, and collect sufficient inventory observations for business-cost backtesting. Positive-demand suggestion UI acceptance and merchant financial improvement remain unproven.

## Server inventory capture progress

Source/runtime `556ae9362ad7f69d585ef7df664ee554ead2d499` adds a dedicated Compose worker and durable volume, separate per company. Frontend mounts it read-only and shows freshness, complete catalogue/warehouse counts, missing fields and history gaps. Backend remote build passed 489 tests; focused Python tests 18 passed, Node status test passed, TypeScript passed, targeted lint had no errors (two existing React effect warnings).

First native server captures succeeded: SKR/company 5 at `2026-10-31T16:57:16Z`, 12,984 active explicitly company-owned products, 1/1 warehouse, no missing quantities, 12,983 missing supplier lead times. Demo/company 127 at `2026-10-31T16:57:29Z`, 12,335 company products, 2/2 warehouses, no missing quantities, 12,335 missing supplier lead times. Both correctly display Needs review. Browser API/UI checks passed on desktop and 390px mobile after waiting for navigation transitions; no horizontal overflow. The collector enforces a read-method allowlist before network calls; browser probes blocked non-auth mutation methods. SKR business writes were not performed.

The local Windows task was disabled after both server captures succeeded. Prior local snapshots are preserved separately and have not been imported as server history. Only one server business date is observed; actual daily continuity remains pending. Next SKR scheduled capture is at the next configured Adelaide 02:00; Demo uses UTC 02:00. The physical SKR timezone confirmation has been requested from the owner. Missing supplier lead times remain a real source-data gap, not values to invent. See `INVENTORY_SNAPSHOT_OPERATIONS.md` and `UAT_AI_SERVER_INVENTORY_2026-11-01.json`.
