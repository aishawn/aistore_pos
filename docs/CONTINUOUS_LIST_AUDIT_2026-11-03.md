# Continuous list audit and repairs — 2026-11-03

Scope: follow-up to the ordinary Products snapshot-free append repair. Audited every IntersectionObserver-backed list in pos-ui and checked manually paginated record/editing screens for the same invalid append prerequisite.

| Page | Finding and repair |
| --- | --- |
| Customers / Suppliers / Purchase orders | Advance the next offset by rows consumed from the API, independently of deduplication. Lock append synchronously; ignore superseded responses. Retry a failed append at the same offset while retaining successful rows. Reset on filters and refresh. |
| Purchase orders | Reattach the observer when returning from Transfers, because its scrolling region and sentinel are recreated. |
| Product Base Prices | Finish continuous loading with the actual scroll container, a manual fallback, stale-response protection and same-batch retry. Preserve rows when append or refresh fails. |
| Stock List | Finish continuous loading with synchronous request locking, consumed-row offsets, deduplication, stale-response protection and a manual fallback. An append failure pauses automatic requests until Retry. |
| Price Suggestions | Refresh replaces accumulated results from offset zero. Margin changes reset results and invalidate earlier requests. Add guarded append, deduplication, the actual observer root, and retry/fallback controls. |
| Products / Inventory report | Reattach the shared observer after returning from the full-page Stocktake view. Preserve the preceding ordinary-product versus report-snapshot API distinction. |
| Sales daily history | Inspected existing offset, request guard, stale-response handling and view-dependent observer. No additional changes included in this scope. |

Workspace records, balances, price lists, customer groups, gift cards, bulk price editing, Shopfront purchasing and lookup controls retain explicit pagination. They do not use the faulty snapshot prerequisite; changing those editing workflows was unnecessary. Stock List sorting remains over loaded rows, not a new globally sorted server query. Inventory report server sorting and totals are unchanged.

Verification uses scripts/pilot-continuous-lists-local.cjs against local Next webpack dev and intercepted API fixtures. It covers Customers, Suppliers, Purchase orders, Base Prices, Stock List and Price Suggestions at 390px and 1440px: automatic append, failure preservation and pause, same-offset Retry, duplicate rows, monotonic pagination, append concurrency, terminal request suppression, superseded-query responses, query reset, and horizontal overflow. Refresh restarts from zero and replaces appended rows on the five pages with refresh controls. Purchase navigation additionally exercises Transfers and back. Source-level observer dependency verification covers the shared Products/Inventory Stocktake return change.

TypeScript, targeted ESLint (zero errors; hooks/accessibility warnings remain), script syntax and scoped whitespace checks are required. This is local UI regression evidence only, not live Odoo business acceptance. No real business writes, local production build or Maven. Deployment identity and authenticated SKR scrolling remain separate verification steps; available demo credentials did not authenticate SKR in the preceding task.

Local result: **140/140 PASS**, browser errors 0, real business writes 0. TypeScript PASS; targeted ESLint exits 0 (27 warnings); script syntax and scoped whitespace checks PASS. SKR before this follow-up push runs frontend/backend `40906c80d78ace6d83f874605bff0486a1cd9911`.

After merging origin/main, the shared dirty worktree fails TypeScript because its preserved, uncommitted WorkspaceRecordsPanel predates the remote fillHeight interface. The actual committed candidate `d3269afe97fa3000bc97a59a94fe07f1cf4f095c` passed `tsc --noEmit` from a separate git-archive source directory with the same installed dependencies. Unrelated worktree edits were preserved and excluded from these commits.

Delivery status: push to origin/main attempted twice and failed to connect to github.com:443 (about 21 seconds each). Local main contains the scoped repair and integration; it is not pushed. SKR still reports frontend/backend `40906c80d78ace6d83f874605bff0486a1cd9911`. Retry normal git push when connectivity returns; no force push.
