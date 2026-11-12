# Dokploy Deployment and Operations

POS code is maintained on `main` in `aishawn/aistore_pos`. Dokploy auto-deploys the POS Compose app from that branch. Do not deploy from old clones or include unrelated working-tree changes.

## Operating surfaces

| Surface | URL | Login / secret variable names | Use |
|---|---|---|---|
| Shopfront source | <https://skr.onshopfront.com/> | `AIWEI` / `SHOPFRONT_PASS` | Read-only source comparison; `/reports/misc` is the inventory-at-date report. Never use Register. |
| SKR Orithos store | <https://skr.orithos.com.au/> | `ORITHOS_SKR_USER` / `ORITHOS_SKR_PASS` | Read-only post-sync store verification. |
| Demo Orithos store | <https://demo.orithos.com.au/> | `admin` / `INITIAL_ADMIN_PASSWORD` | Default read-only UAT target and parity comparison with SKR. |
| Orithos control plane | <https://app.orithos.com.au/> | `admin` / `INITIAL_ADMIN_PASSWORD` | Platform administration. |
| Shopfront crawler | <https://crawler.orithos.com.au/> | `SHOPFRONT_INTEGRATION_TOKEN` for POS integration | Reads source APIs/web reports and syncs mapped data to Orithos. API docs: <https://developer.onshopfront.com/documentation/General/About>. |
| POS database (live) | host `45.63.26.89:5432`, db `postgres` | `POSTGRESQL_URL` (aliases `POSTGRESQL_URL1` / `POS_POSTGRESQL_URL`) | Live Orithos ledger since 2026-11-12 cutover. Never print the URL/password. Retired prior host: `45.90.109.111:5888`. |
| Crawler → POS ledger | same live POS host | crawler `DATABASE_URL` | Must match live `POSTGRESQL_URL` host; do not leave on the retired host. |
| Crawler DB | `45.63.26.89:5679` | `CRAWL_DATABASE_URL` | Crawler-owned Postgres; not the POS ledger. |
| Dokploy | <https://dokploy.orithos.com.au/> | `ORTHOS_DOKPLOY_USER` / `ORTHOS_DOKPLOY_PASS` | Deployment and environment management. |
| App server SSH | `45.63.26.89` | `SERVER_USER` / `SERVER_PASS` | Approved host for docker/`psql` diagnostics when the workstation cannot reach PG. |

## Database Cutover Reconciliation (2026-11-12)

- Live POS and crawler ledger use `45.63.26.89:5432`; crawler's separate `CRAWL_DATABASE_URL` remains on `45.63.26.89:5679`. Runtime inspection confirmed both. The retired `45.90.109.111:5888` remains read-only for comparison and must not be re-enabled.
- Restored 66 old-only Demo Shopfront sale identities for Adelaide 2026-11-06 from the new database mirror through the native importer. Final counts: old 2,372 / live 2,400 Shopfront identities; zero old keys missing, with 28 live-only identities preserved. The restored cohort matches its mirror exactly: $1,370.41, 113 sale items, 93 payments, zero unmatched items.
- Corrected the lagging `sale` and `sale_item` sequences after auditing 125 owned sequences. Final sequence values matched table maxima; global orphan checks found zero `sale_item` or `sale_payment` rows.
- Read-only day parity on 2026-11-06: Demo and SKR each have 189 native/mirror identities, 183 completed, revenue `$5,847.19`, and zero missing or amount differences. Four Demo and five SKR records differ only in status (`VOIDED` native vs `PARKED` mirror); native updates are newer than the mirror sync, so retain them pending source/action-history confirmation.
- Latest bounded repair check (read-only, 2026-11-12): all 264 selected identities (Demo 263, SKR 1) are present in both layers. Header amount/date fields, mapped item multisets, and normalized payment multisets match; 550 item rows and 321 payment rows; zero unmatched item rows, duplicate identities, orphan children, or sequence lag.
- Full historical scope remains unresolved: the live mirror currently has 157,059 `shopfront_sale` rows per store vs 1,089 Demo / 1,399 SKR native Shopfront `sale` rows. A natural-key join finds 311,631 mirror-only identities and one native-only identity. This cross-layer difference is not by itself proof of old-to-new database loss. Full-scope status differences total 30 (each store: 5 `VOIDED`/`CANCELLED`, 10 `VOIDED`/`PARKED`). Do not claim full-history parity, bulk-promote all mirror rows, or rewrite statuses until the intended native-history scope and retired-host snapshot/source action history are compared.
- POS runtime SHA at verification: `8ff23f0576ac3e0d4de82a3fad268ca4e29f077c`. This reconciliation changed live data/sequence state only; it did not deploy code.

Dokploy Compose services:

- POS: <https://dokploy.orithos.com.au/dashboard/project/ewJIOao2VS7KNdhRg7rzn/environment/9RNFH68veP4p9K47vtMfl/services/compose/V3BuMZuSCowVe-OKWIR6J>
- AI services: <https://dokploy.orithos.com.au/dashboard/project/ewJIOao2VS7KNdhRg7rzn/environment/9RNFH68veP4p9K47vtMfl/services/compose/n9P_rkiIncyltEzhq6gRP>
- Shopfront crawler: <https://dokploy.orithos.com.au/dashboard/project/ewJIOao2VS7KNdhRg7rzn/environment/9RNFH68veP4p9K47vtMfl/services/compose/JHfNJMWCJGqpq0_5aovzZ?tab=deployments>

Credentials are held only in ignored local env files or Dokploy Secrets. Do not copy values into Git, command output, screenshots, handoffs, or test reports. The owner authorizes relevant local or Dokploy environment changes; change only variables needed for the task, verify the target service/environment, and report names and results without values.

## Data Flow and Sync Checks

```text
Shopfront (read-only source) → shopfront-crawler → Orithos POS API/PostgreSQL → SKR and Demo
```

Orithos is the POS backend and operational ledger. Shopfront is the upstream source for the real store data being synced; it is not a POS backend. Odoo is deprecated: do not add its credentials, runtime reads, writes, fallbacks, scheduled jobs, or new dependencies. Remaining legacy removal and physical decommission status is tracked in the root [HANDOFF.md](HANDOFF.md); do not claim complete retirement until its acceptance checks pass.

Both SKR and Demo are expected to contain the same synced Shopfront data. Sync runs may be scheduled and manually triggered multiple times per day. Before queuing a run, inspect crawler status and avoid duplicates while an applicable job is active. Use the current crawler configuration and its README for the active schedule and endpoints; do not copy an old schedule into a new runbook.

For each affected store and Adelaide business date, verify:

1. The crawler job reached a terminal successful state; queued or partial work is not completion.
2. Shopfront source report/API values, crawler run/mirror status, and downstream acknowledgement/import results agree for the relevant data domain.
3. SKR and Demo Orithos APIs agree on stable external IDs, counts, business fields, and sampled records. Use the read-only store pages to confirm the same records are visible.
4. Report differences, unmapped IDs, missing permissions, stale snapshots, skipped rows, and incomplete source data explicitly. Similar totals do not prove row-level parity.

Use Shopfront `/reports/misc` only as a read-only reference for the data it reports. Never use Shopfront Register or create transactions to generate, repair, or validate source data. Do not infer missing prices, GST, ABN, product mappings, or inventory quantities.

## Deployment

1. Confirm the POS remote is `aishawn/aistore_pos`, the branch is `main`, and the intended commit contains only scoped files. Preserve unrelated dirty changes.
2. Push to `origin/main`; the configured Dokploy POS service should deploy automatically. Do not use **Fresh Volumes** for ordinary code or login issues.
3. Confirm Dokploy status is **Done**, inspect the build log, and compare the deployed/source SHA with `origin/main` and `/api/public/version`.
4. Run the read-only smoke checks below. If a deploy failed, diagnose the first failing layer (webhook/source binding, build, container health, runtime config, API, or UI) before changing code or retrying.

The POS app's current Compose configuration and `*.env.example` files are authoritative for required values. Use the shared `SHOPFRONT_INTEGRATION_TOKEN` and configured Orithos sync-notification URL/secret as documented there. Confirm the active import path writes to Orithos and never enables Odoo writes. Keep the configured native-POS-only guard enabled while it protects the unscoped legacy API surface; do not remove that guard until an equivalent has been verified.

Odoo is not required for new deployments. Do not add `ODOO_*` variables to new environments. Existing Odoo-related configuration may remain during domain-by-domain code retirement; remove it only after the matching runtime dependency is gone and the no-Odoo-config/network acceptance in the current handoff passes.

For any change touching `pos-api/`, the exact candidate SHA must pass Java 21 `mvn -B clean verify` in the approved remote pre-push workflow before push. Local static checks or a build after push do not satisfy this gate. If candidate-SHA evidence is unavailable, leave the backend change unpushed and report the blocker.

## Read-only Smoke After Deploy

- Verify Dokploy **Done**, source commit SHA, runtime SHA, and `/api/public/version` for the POS service.
- Sign into `app.orithos.com.au` and verify the platform shell. Sign into both `demo.orithos.com.au` and `skr.orithos.com.au` and verify the store shell and affected pages.
- For sync-related changes, compare crawler job status and source/API/page data for both stores using the checks above.
- Do not perform sales, refunds, receiving, stock, register-close, or other business writes during production smoke tests. Use an approved isolated Orithos test environment for write UAT unless the owner explicitly approves a production write.
- If a failure occurs, capture the affected URL/API, store, business date/timezone, source/runtime SHA, read/write scope, response class, and sanitized evidence. Make the narrow root-cause fix and repeat the relevant check.

If Dokploy returns `Branch Not Match`, confirm the Compose source is `aishawn/aistore_pos`, ref `main`, repository root `/`, and Compose file `docker-compose.yml`. The webhook response itself is not deployment evidence.
