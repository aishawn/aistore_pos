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

`/api/odoo/reporting-dashboard?period=today&view=summary` provides the lightweight Home overview (three statistical RPCs on computation, no product rankings, graph or sales details). Historical periods use `period=yesterday|last_week|last_month`. `/api/odoo/dead-stock` reads its independent daily result.

`refresh=true` queues/coalesces a forced computation. HTTP 202 returns a `taskId`; polling the same authenticated endpoint with `task=<id>` checks scope, period, boundaries and revision. Poll requests must omit `refresh`. Polling pauses while hidden and is abortable. No standalone unauthenticated status endpoint exists.

Responses retain existing report fields and add `generatedAt`, `queryThrough`, `cacheStatus`, `updateStatus`, and optionally `taskId`. `Server-Timing` separates authentication and cache reads. Cached `queryMetrics` describes the original computation, not RPCs performed on a cache hit. The browser keeps visited report periods and prevents obsolete responses from replacing newer selections. Dead-stock refresh is independent. Actual preparation/cutoff times are shown; read time does not replace snapshot time.

Redis failure falls back to authenticated live queries, coalesced per process and limited to two globally/one per store with a bounded wait queue. Confirmed application writes invalidate revisions after success. External Odoo writes become visible on the next scheduled calculation or manual refresh.

Other reads use an explicit browser whitelist: lists 30 seconds; categories, customer groups, pricelists, suggestions and replenishment five minutes; bootstrap/session 15 seconds. Requests include full filters/page/body and browser identity. Successful writes clear reads; identity/store changes abort old flights and clear results. Financial/stock write validation, quotes and refund eligibility remain live. Suggestions/replenishment also have scoped server singleflight caches; replenishment no longer shares solely by company. Customer group counts use at most four concurrent reads. Inventory pagination retains immutable five-minute query/session snapshots; identical queries reuse the snapshot and explicit refresh creates a new one.

## Verification and limits

- Node 24: 27 targeted date/cache/inventory/client-retry unit checks pass; TypeScript and targeted ESLint pass. No local application build.
- Actual Reports handler: six groups cover calendar query/comparison domains, legacy parameters and authentication. Inventory handler: nine checks include reuse, explicit refresh and snapshot consistency.
- Actual independent worker + real local Redis/AOF + fixture Odoo/backend: 16 checks pass, including unattended preparation, zero sales RPCs on snapshot hits, isolation, coalesced refresh, write invalidation, failure/backoff, rejected obsolete publication, Redis restart and outage fallback. Local snapshot P95 was 316 ms; this is fixture latency, not live UAT. Two worker failure logs are deliberately induced by these tests.
- Intercepted Edge UI: 33 checks at 390/1024/1440, zero page errors. Visited-period switches render below 100 ms with no new report/dead-stock requests; checks include rapid switching, preparing, refresh failure, empty state and overflow. Fixtures do not reconcile real business totals.
- Baseline Demo read-only requests before this change took 1009/1123/1652 ms for yesterday/week/month. Baseline runtime SHA and underlying RPC counts were not captured. Its `today&view=summary` probe ran against the legacy handler and does not prove Today support.
- Demo target configured explicitly: vendor 1/company 137, `aipos_uat`, Australia/Adelaide. This is shared UAT, not isolated customer production. No business writes were used for verification. Deployment/runtime and live timing evidence are recorded separately after deployment.

Evidence: `UAT_REPORT_CACHE_ROUTE_LOCAL_2026-11-03.json`, `UAT_REPORT_CACHE_UI_LOCAL_2026-11-03.json`, `UAT_REPORT_CACHE_BASELINE_ONLINE_2026-11-03.json`, and the existing calendar/inventory handler evidence. Reproduction scripts are `scripts/pilot-report-cache-local.cjs` and `scripts/pilot-report-cache-ui-local.cjs`.
