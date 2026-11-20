# Orithos POS — Agent Instructions

## Project entry and current state

- This is the POS repository: `aishawn/aistore_pos`, branch `main`. The maintained local checkout is `orithopos-master`; do POS work here, not in `pos-main`, old clones, or worktrees unless a task names one explicitly.
- At task start, confirm this repository, `main`, HEAD, and `git status`. Preserve unrelated local changes and stage only files in the task scope.
- Read this file, the root [HANDOFF](HANDOFF.md), and only the task's relevant tracked design/progress docs and tests. The root handoff is the single current operational status; older dated notes are historical evidence.
- For feature state, evidence, and current validation boundaries, use the [project fact library](docs/project/README.md) when its corpus is present.
- A local `docs/project/` fact library may be available but is ignored from deployment clones; consult it when present, and do not make runtime or release instructions depend on local-only files. Run `python scripts/check-project-docs.py` after editing that library, when its required corpus is present.

## System boundaries

- Orithos (`pos-api` + PostgreSQL) is the POS backend and live retail ledger for SKR and Demo. Store pages and AI features use Orithos APIs for POS data.
- Shopfront is the upstream reference/source for the real store data that must be synced to both stores. `shopfront-crawler` reads Shopfront and delivers mapped data to Orithos; it is not the POS backend.
- Odoo is deprecated. Do not add Odoo reads, writes, fallbacks, credentials, scheduled jobs, or new runtime dependencies. Remove remaining legacy dependencies by domain after the Orithos path is verified. Do not migrate Odoo history or decommission its host without the acceptance evidence recorded in the current handoff.
- The Classic Spring/MySQL POS paths are reference-only. Do not restore them as a live ledger or dual-write source.

## Shopfront sync and data integrity

- Shopfront access is read-only. Use the source website and its APIs/reports, including `/reports/misc`, for comparison; never use Shopfront Register or create source transactions.
- Demo and SKR should contain the same synced Shopfront data. Daily syncs may run more than once; check current job status first and never start a duplicate while a job is active.
- Trace a sync through Shopfront source → crawler job/mirror → Orithos import/API → SKR and Demo. A successful fetch, queued job, matching totals, or reachable page alone does not prove parity.
- Verify terminal job status, source business date/timezone, stable external IDs, counts, important fields, and differences for both stores. Use read-only APIs and pages for acceptance; record missing scopes, stale snapshots, skipped rows, and unresolved mappings as blockers.
- Never invent prices, GST, ABN, tax mappings, product identity, or stock. Keep unresolved products unsaleable and report the source fields needed to resolve them.

## Task workflow

1. Confirm the request's expected behavior and observable acceptance criteria. Search the relevant symbols, callers, tests, and current feature notes; do not read the whole repository by default.
2. For bugs, reproduce or trace the failing path and state the root cause with evidence before changing code. Follow the full relevant path (UI → API → service → persistence, including crawler when applicable).
3. Make small, isolated changes directly. For cross-module, data, security, payment, inventory, or migration work, first give a concise diagnosis, affected boundaries, implementation choice, risks, and verification steps; keep the work in independently verifiable slices.
4. Run the narrowest relevant checks and inspect `git diff`. Do not claim a fix from mocks, compilation alone, a queued sync, or page reachability.
5. Parallelize only independent read-only investigation. Do not assign concurrent edits to shared files or add agents/tools by default.

## Business and safety invariants

- Enforce vendor and outlet scope in the backend. A shared database is not proof of tenant isolation.
- Shelf prices include GST; at 10%, GST is inclusive price / 11 (`GstMath`). Use decimal arithmetic. Round cash to 5 cents; keep card amounts exact.
- Use the store timezone for business dates (SKR/Demo currently use `Australia/Melbourne`); use UTC for transport/audit timestamps.
- Business writes must use the Orithos API and an approved test environment unless the owner explicitly approves a production write. Do not use Odoo or Shopfront as a write target.
- Keep `AI_ENABLED=false` in production until the provider and budget are explicitly configured.
- Change Next.js pages under `pos-ui/app`; shared UI/API code is under `pos-ui/src`. The API client is `pos-ui/src/lib/api.ts`.

## Verification and release

- Owner preference is no local application builds. Use relevant type checks, focused lint, script checks, and tests. The Java 21 candidate workflow may be used for backend verification, but it is not a pre-push requirement.
- Maintain `main` only. After required checks pass, commit and push only task-scoped files; never include unrelated dirty changes or secrets. Dokploy auto-deploys the POS Compose app from `main`.
- **Owner default (2026-11-13, reaffirmed 2026-11-19):** When a fix or optimization task is finished, automatically commit and push to `origin/main` without waiting for「上传 github」and **without asking** whether to push. Only skip commit/push when the owner explicitly keeps changes local-only in that chat. Never stage unrelated dirty files.
- After deployment, confirm Dokploy status and deployed/source SHA. For sync or data changes, check crawler status and read-only source/API/UI parity on both SKR and Demo; iterate on concrete differences.
- Keep implementation, local checks, deployment, runtime identity, and online acceptance as separate claims. Record environment, scope, sample, result, limitations, source/runtime SHA, and links to evidence.

## Live databases (cutover 2026-11-12) — do not reverse without owner ask

| Role | Host:port | Env var(s) | Notes |
|------|-----------|------------|--------|
| **Live POS ledger** (pos-api) | `45.63.26.89:5432` / db `postgres` | `POSTGRESQL_URL` | Sole live Orithos retail ledger for SKR + Demo (shared DB). Docker Postgres service on the Dokploy server. Prefer `sslmode=disable` for this local docker target. |
| Cutover alias (same URL) | same | `POSTGRESQL_URL1`, `POS_POSTGRESQL_URL` | Staging names used during migration; keep aligned with `POSTGRESQL_URL`. App runtime reads **`POSTGRESQL_URL` only**. |
| **Retired** prior POS host | `45.90.109.111:5888` | — | Pre-cutover live ledger. Do **not** point POS or crawler back here unless the owner explicitly requests rollback. |
| Crawler → POS ledger | same as live POS | crawler `DATABASE_URL` | Must target the **live POS** host (`45.63.26.89:5432`), not the retired host. |
| Crawler own DB (future/migrate) | `45.63.26.89:5679` | `CRAWL_DATABASE_URL` | Separate Shopfront-crawler Postgres; not the POS ledger. |

- After changing DB URLs: update **both** Dokploy Compose Environment (POS `V3BuMZuSCowVe-OKWIR6J`, crawler `JHfNJMWCJGqpq0_5aovzZ`) **and** recreate/redeploy services. Dokploy “Create Environment File” rewrites `/etc/dokploy/compose/.../code/.env` on deploy and can wipe SSH-only edits or `.env.bak-*`.
- Do not confuse Dokploy/`DB_PASSWORD` with the Postgres URL password; they are different secrets. Never print either.
- Local workstation Python/HTTP to store hosts is often blocked (Cloudflare 1010). Approved diagnostics: SSH to `45.63.26.89` (`SERVER_USER` / `SERVER_PASS`) and probe via docker `psql`, or use the browser on SKR/Demo/Dokploy.
- Reconciliation completed (2026-11-12): all 66 old-only Demo Shopfront sale identities from Adelaide 2026-11-06 were restored from the new host's `shopfront_sale*` mirror through the native sales importer. New native ledger has 2,400 Shopfront identities vs 2,372 on the retired host: zero old identities missing, 28 new-only identities preserved. The repaired 66 have exact mirror parity: $1,370.41, 113 item rows, 93 payment rows, zero unmatched items, and no stock movements.
- Sequence repair (2026-11-12): after checking all 125 owned sequences, only non-empty `sale.id` and `sale_item.id` were behind. Both were advanced under table write locks; final sequence values equaled their table maxima. Final anti-join found zero orphan `sale_item` and `sale_payment` rows.
- Residual source/native status differences on 2026-11-06: day parity on both outlets is 189 native/mirror identities, 183 completed, $5,847.19, and zero missing or amount mismatches. Four Demo and five SKR outlet rows remain `VOIDED` in native `sale` but `PARKED` in the mirror. Native status updates are newer (Nov 11) than the mirror's last sync (Nov 10); do not overwrite these states without checking the Shopfront source/action history.
- Latest bounded repair verification (2026-11-12): all 264 manifest sales (Demo 263, SKR 1) exist in both native and mirror data. Header amount/date fields, mapped item multisets, and normalized payment multisets match exactly (550 item rows, 321 payment rows); no unmatched native items, duplicate sale identities, orphan sale children, or sequence lag. This proves only the selected repair cohort, not full historical promotion.
- Full-scope warning (2026-11-12 read-only check): `shopfront_sale` has 157,059 mirror identities per store, while native `sale` has 1,089 Demo and 1,399 SKR Shopfront identities. The scoped join found 311,631 mirror identities without native rows and one native identity without a mirror. These are two data layers; this count alone does not prove cutover loss. There are also 30 full-scope status differences: per store, 5 native `VOIDED` vs mirror `CANCELLED` and 10 native `VOIDED` vs mirror `PARKED`. Do not bulk-promote all mirror history or overwrite statuses until intended native-history scope and Shopfront source/action history are reconciled against the retired-host snapshot.
- Runtime verification (2026-11-12): POS backend is up on live `POSTGRESQL_URL`, runtime SHA `8ff23f0576ac3e0d4de82a3fad268ca4e29f077c`; crawler is running with `DATABASE_URL` on the live POS host and `CRAWL_DATABASE_URL` on its separate `:5679` database. No code deployment was performed for this data reconciliation.

## Credentials and operating surfaces

- Use only secret variable names in docs and reports. Never print or commit secret values, cookies, tokens, full database URLs, or login artifacts. The owner authorizes relevant local or Dokploy environment changes; record variable names, target service/environment, and verification without recording values.
- Service URLs, Dokploy Compose links, login names, and environment variable names are maintained in [DEPLOYMENT.md](DEPLOYMENT.md). Do not duplicate that table in handoffs.
