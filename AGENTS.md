# Orithos POS — Agent Instructions

## Project entry and current state

- This is the POS repository: `aishawn/aistore_pos`, branch `main`. The maintained local checkout is `orithopos-master`; do POS work here, not in `pos-main`, old clones, or worktrees unless a task names one explicitly.
- At task start, confirm this repository, `main`, HEAD, and `git status`. Preserve unrelated local changes and stage only files in the task scope.
- Read this file, the root [HANDOFF](HANDOFF.md), and only the task's relevant tracked design/progress docs and tests. The root handoff is the single current operational status; older dated notes are historical evidence.
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
- Use the store timezone for business dates (SKR/Demo currently use `Australia/Adelaide`); use UTC for transport/audit timestamps.
- Business writes must use the Orithos API and an approved test environment unless the owner explicitly approves a production write. Do not use Odoo or Shopfront as a write target.
- Keep `AI_ENABLED=false` in production until the provider and budget are explicitly configured.
- Change Next.js pages under `pos-ui/app`; shared UI/API code is under `pos-ui/src`. The API client is `pos-ui/src/lib/api.ts`.

## Verification and release

- Owner preference is no local application builds. Use relevant type checks, focused lint, script checks, and tests. Application builds and backend verification run through the configured Dokploy/Java 21 workflow.
- Before pushing any `pos-api/` change, the exact candidate SHA must pass Java 21 `mvn -B clean verify` in the approved remote workflow. A post-push build does not satisfy this gate. If exact-SHA evidence is unavailable, do not push the backend change; report the blocker.
- Maintain `main` only. After required checks pass, commit and push only task-scoped files; never include unrelated dirty changes or secrets. Dokploy auto-deploys the POS Compose app from `main`.
- After deployment, confirm Dokploy status and deployed/source SHA. For sync or data changes, check crawler status and read-only source/API/UI parity on both SKR and Demo; iterate on concrete differences.
- Keep implementation, local checks, deployment, runtime identity, and online acceptance as separate claims. Record environment, scope, sample, result, limitations, source/runtime SHA, and links to evidence.

## Credentials and operating surfaces

- Use only secret variable names in docs and reports. Never print or commit secret values, cookies, tokens, full database URLs, or login artifacts. The owner authorizes relevant local or Dokploy environment changes; record variable names, target service/environment, and verification without recording values.
- Service URLs, Dokploy Compose links, login names, and environment variable names are maintained in [DEPLOYMENT.md](DEPLOYMENT.md). Do not duplicate that table in handoffs.
