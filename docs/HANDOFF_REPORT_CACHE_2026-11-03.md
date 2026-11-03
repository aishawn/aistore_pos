# Report preparation and page read caching

Reports defaults to Yesterday and keeps only Yesterday, Last week and Last month. Store-local midnight, Monday and month boundaries are shared by the API and worker. Yesterday compares with the same weekday last week; historical weeks/months compare with the preceding complete week/month. Existing hours and `this_week` requests remain supported.

## Operation

- `report-worker` is an independent Node 24 Compose service. It uses the existing Odoo service credentials for reads only. It never discovers additional companies. Configure `REPORT_SNAPSHOT_TARGETS` with verified database, vendor, company, host, timezone and sample-data marker; an empty array disables collection. Database, allowed companies and Odoo-derived timezone are validated before work.
- Redis DB 1, prefix `orithos:reports:v1:`, stores snapshots, revisions, jobs and leases. Compose enables AOF on the existing persistent Redis volume. Do not recreate volumes for deployment.
- Today summary updates every five minutes. Historical periods update at local 00:10 and 02:00; dead-stock analysis at 02:30. A minute-level scheduler checks for missed runs and startup gaps. No page visit is needed. First-time startup may calculate before the normal scheduled time.
- Keys include database, tenant, company, host, Odoo UID/permission scope, timezone, actual period bounds, sample-data version and schema version. Seven-day retention permits recovery; a different current period boundary is never served as the requested period.
- One heavy task per store, two globally. Leases expire after 90 seconds and renew every 20 seconds. Failed jobs retry after 1/5/15 minutes, then hourly. Only successful, current-revision, lease-owning computations publish results. Failed refreshes preserve the last successful snapshot.
- Shared company snapshots are restricted to current app administrators whose authenticated Odoo database/UID exactly matches the worker identity. Other users query using their own Odoo session and receive isolated process-local results. Every server read rechecks current app permission and store binding. New targets need explicit configuration; they are not inferred from service-account access.

## API and UI

`/api/odoo/reporting-dashboard?period=today&view=summary` provides the lightweight Home overview (six read RPCs on computation, including the concurrently introduced inventory/yesterday margin metrics, no product rankings, graph or sales details). Historical periods use `period=yesterday|last_week|last_month`. `/api/odoo/dead-stock` reads its independent daily result.

`refresh=true` queues/coalesces a forced computation. HTTP 202 returns a `taskId`; polling the same authenticated endpoint with `task=<id>` checks scope, period, boundaries and revision. Poll requests must omit `refresh`. Polling pauses while hidden and is abortable. No standalone unauthenticated status endpoint exists.

Responses retain existing report fields and add `generatedAt`, `queryThrough`, `cacheStatus`, `updateStatus`, and optionally `taskId`. `Server-Timing` separates authentication and cache reads. Cached `queryMetrics` describes the original computation, not RPCs performed on a cache hit. The browser keeps visited report periods and prevents obsolete responses from replacing newer selections. Dead-stock refresh is independent. Actual preparation/cutoff times are shown; read time does not replace snapshot time.

Redis failure falls back to authenticated live queries, coalesced per process and limited to two globally/one per store with a bounded wait queue. Confirmed application writes invalidate revisions after success. External Odoo writes become visible on the next scheduled calculation or manual refresh.

Other reads use an explicit browser whitelist: lists 30 seconds; categories, customer groups, pricelists, suggestions and replenishment five minutes; bootstrap/session 15 seconds. Requests include full filters/page/body and browser identity. Successful writes clear reads; identity/store changes abort old flights and clear results. Financial/stock write validation, quotes and refund eligibility remain live. Suggestions/replenishment also have scoped server singleflight caches; replenishment no longer shares solely by company. Customer group counts use at most four concurrent reads. Inventory pagination retains immutable five-minute query/session snapshots; identical queries reuse the snapshot and explicit refresh creates a new one.

## Verification and limits

- Node 24: 27 targeted date/cache/inventory/client-retry unit checks pass; TypeScript and targeted ESLint pass. No local application build.
- Actual Reports handler: six groups cover calendar query/comparison domains, legacy parameters and authentication. Inventory handler: nine checks include reuse, explicit refresh and snapshot consistency.
- Actual independent worker + real local Redis/AOF + fixture Odoo/backend: 16 checks pass, including unattended preparation, zero sales RPCs on snapshot hits, isolation, coalesced refresh, write invalidation, failure/backoff, rejected obsolete publication, Redis restart and outage fallback. Local snapshot P95 was 311 ms after the final follow-up; this is fixture latency, not live UAT. Two worker failure logs are deliberately induced by these tests.
- Intercepted Edge UI: 33 checks at 390/1024/1440, zero page errors. Visited-period switches render below 100 ms with no new report/dead-stock requests; checks include rapid switching, preparing, refresh failure, empty state and overflow. Fixtures do not reconcile real business totals.
- Baseline Demo read-only requests before this change took 1009/1123/1652 ms for yesterday/week/month. Baseline runtime SHA and underlying RPC counts were not captured. Its `today&view=summary` probe ran against the legacy handler and does not prove Today support.
- Demo target configured explicitly: vendor 1/company 137, `aipos_uat`, Australia/Adelaide. This is shared UAT, not isolated customer production. No business writes were used for verification. Deployment/runtime and live timing evidence are recorded separately after deployment.

Evidence: `UAT_REPORT_CACHE_ROUTE_LOCAL_2026-11-03.json`, `UAT_REPORT_CACHE_UI_LOCAL_2026-11-03.json`, `UAT_REPORT_CACHE_BASELINE_ONLINE_2026-11-03.json`, and the existing calendar/inventory handler evidence. Reproduction scripts are `scripts/pilot-report-cache-local.cjs` and `scripts/pilot-report-cache-ui-local.cjs`.

Integration with concurrent main: retained daily-sales history, added its 30-second cache/version guards, and preserved the newly introduced dashboard inventory/yesterday-margin metrics in the prepared Today summary. Yesterday margin is unavailable if its bounded 5,000-line scan reaches the limit; missing costs remain unavailable. The earlier three-RPC summary unit result predates this integration; the final targeted test expects six RPCs and no graph/product rankings/recent sales.

## Deployed read-only UAT

Dokploy deployment `bz1SoyC2QP_TlkanGAtVZ` completed successfully for `bda1a8846575a7da82f0c922d4467d90164fbeec`; both public frontend/backend runtime identities matched. Worker and Redis were healthy. Twenty real Demo snapshot reads all returned HTTP 200/HIT, 350–714 ms end-to-end, P95 498 ms. Server cache reads took 1.2–9.2 ms; sales aggregation on each hit was zero. Stored computation counts were 16–17 RPCs for history and eight for Today (six statistics plus company/timezone metadata). Seven additional read-only checks passed: calendar bounds, coalesced concurrent refresh/task completion, independent dead-stock, lightweight Today payload and unauthenticated rejection. No business writes. Evidence: `UAT_REPORT_CACHE_VERIFY_ONLINE_2026-11-03.json`, `UAT_REPORT_CACHE_CHECKS_ONLINE_2026-11-03.json`, `UAT_REPORT_CACHE_HEALTH_ONLINE_2026-11-03.json`. These are observations from one small UAT sample, not an ongoing performance guarantee.

Final follow-up: force refresh evicts its previous browser entry and rejects its obsolete flight, so navigating back cannot restore pre-refresh data. Continuous scheduling waits until 00:10 for history and 02:30 for dead stock; startup catch-up and explicit user requests may prepare missing results earlier. Targeted cache/schedule regressions cover both rules.

## Final behavior SHA and remaining timing limit

`92ee91b2b1437f856855e929feb3d649800d5210` deployed successfully in Dokploy operation `UDCWyNEeDTlPn56fGuqP1`; public frontend/backend runtime identities both match. Worker and Redis are healthy. Historical snapshot generation times from the preceding deployment were retained after frontend/worker replacement, confirming shared reuse across container replacement. The seven real handler checks pass again. Real Edge browser checks at 390/1440 measured visited-period switches at 25/21 ms, no extra report/dead-stock request and no page errors.

The <1-second end-to-end P95 target is **not consistently achieved** from this test network. All 60 sampled requests across three runs hit snapshots and execute zero sales aggregates. The first run had P95 498 ms; the subsequent run alongside browser UAT had P95 1491 ms, and an additional serial run had P95 1697 ms (maximum 2314 ms). Server timing remains much smaller than the slow client round trips; do not present the first sample as a guaranteed latency or claim this isolates the precise network/proxy cause. Further regional network/proxy measurement would be needed to establish sustained end-to-end P95.

Final SHA-specific evidence is in `UAT_REPORT_CACHE_VERIFY_92EE91B2_ONLINE_2026-11-03.json`, `UAT_REPORT_CACHE_CONCURRENT_92EE91B2_ONLINE_2026-11-03.json`, `UAT_REPORT_CACHE_CHECKS_92EE91B2_ONLINE_2026-11-03.json`, `UAT_REPORT_CACHE_HEALTH_92EE91B2_ONLINE_2026-11-03.json` and `UAT_REPORT_CACHE_UI_92EE91B2_ONLINE_2026-11-03.json`. Earlier deployment evidence is preserved with its original identity. All live validation was read-only apart from generating report/cache jobs; no sales, refunds, stock, supplier or register writes. Local checks and runtime verification do not establish isolated production acceptance.
