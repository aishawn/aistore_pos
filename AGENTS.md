# AGENTS.md — Orithos POS

Shared project brief for **Cursor** and **Codex** (and any other coding agent). Read this first; follow links for depth. Do **not** put passwords, API keys, or tokens in this file.

**Working-state note (2026-10-16):** the pilot remains **NO-GO**. Treat `docs/CAPABILITY_STATUS.md`, `docs/PILOT_RELEASE_READINESS.md`, and the latest “当前交接快照” in `docs/HANDOFF_*.md` as the status source of truth; this file contains durable rules, not a replacement for UAT evidence.

## What this is

Orithos POS: Australian bottle-shop / specialty retail POS and inventory. Cashiers sell, stock, purchase, and report in one UI. Optional AI (cashier assistant, sommelier, invoice OCR) stays off in production until budgeted.

- **Business data source of truth:** Odoo (via `pos-ui` `/api/odoo/*`).
- **Classic Spring/MySQL POS:** in-repo **reference only**; do not pilot as writable SoT. No dual-write Classic ↔ Odoo.
- **Stack:** Next.js 16 (`pos-ui`) → Spring Boot 3.3 (`pos-api`) → MySQL 8 + Redis 7. Compose at repo root. Remote: GitHub `aishawn/aistore_pos`, branch `main`.

## Hosts (production)

| Host | Role |
|------|------|
| `https://app.orithos.com.au` | Control plane — `PlatformShell`, `/platform/*`, signup. **No** store Sidebar / Sell. |
| `https://demo.orithos.com.au` | Pilot store — full POS shell. Default UAT target. |
| `https://{slug}.orithos.com.au` | Other tenant stores (same POS shell as demo). |
| `https://odoo.orithos.com.au` | Odoo; database default `aipos` (pilot/test). |

Login uses username/password only (no subdomain field). Host → vendor. Pilot admin username: `admin`. Password: see Dokploy / local `.env` `INITIAL_ADMIN_PASSWORD` — never paste it here.

Details: [docs/TENANT_SUBDOMAIN.md](docs/TENANT_SUBDOMAIN.md), [DEPLOYMENT.md](DEPLOYMENT.md).

## Repo map

```text
orithopos/
├── pos-ui/           Next.js UI (edit pages under pos-ui/app; shared code under pos-ui/src)
├── pos-api/          Spring Boot API (Java 21)
├── docker-compose.yml
├── .env.example      Template only — copy to .env locally / set in Dokploy
├── DEPLOYMENT.md     Dokploy, env vars, smoke checklist
├── docs/             Handoffs, capability, UAT evidence, runbooks
└── scripts/          Pilot / UAT / R2 helpers
```

Local IDE: `pos-api/.env` from `pos-api/.env.example`; `pos-ui/.env.local` from `pos-ui/.env.local.example`; MySQL/Redis via `docker compose up -d mysql redis`.

Toolchain: Node **24+** (the UI package declares `engines.node >=24`) and Java **21**. From `pos-ui`, the normal static checks are `npm run lint`, `npm run typecheck`, and `npm run build`; from `pos-api`, use Maven with Java 21. Record the exact commit and environment when reporting verification.

## Secrets and shared context (Cursor ↔ Codex)

| Kind | Where | Commit? |
|------|--------|---------|
| Architecture, hosts, process | This file, `README.md`, `DEPLOYMENT.md`, `docs/*` | Yes |
| Progress / latest state | `docs/HANDOFF_*.md`, `docs/PILOT_RELEASE_READINESS.md`, `docs/CAPABILITY_STATUS.md` | Yes |
| Passwords, JWT, Odoo service account, R2 keys, DashScope | Root `.env`, `pos-*/.env*`, Dokploy Compose env | **No** (gitignored) |
| Cursor-only habit | `.cursor/rules/` | Yes (behaviour, not secrets) |

Both tools open the same workspace: they share Git docs and the same local `.env`. Chat history does **not** sync — update a handoff or this file when switching tools.

**Never** commit `.env`, `.env.local`, `.local/`, dumps, or real credentials. Prefer variable **names** in docs (“set `ODOO_SERVICE_PASSWORD` in Dokploy”).

## Deploy

1. Push to `main` → Dokploy Compose app (repo root `docker-compose.yml`) if auto-deploy is on.
2. Required Compose secrets (Dokploy): `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, `CORS_ALLOWED_ORIGINS`, plus tenant vars as in `.env.example`.
3. Odoo auto-recover needs **both** frontend and backend: `ODOO_SERVICE_USERNAME`, `ODOO_SERVICE_PASSWORD`. Normal **Deploy** only — never **Fresh Volumes** to “fix” login.
4. After deploy: smoke checklist in [DEPLOYMENT.md](DEPLOYMENT.md) (app console + demo store + Integrations Connected).

Changing `INITIAL_ADMIN_PASSWORD` in env does **not** reset an existing `admin` row.

## Hard rules for agents

1. **Odoo is SoT** for pilot sell / stock / purchase / reporting. Do not revive Classic MySQL as the live path.
2. **Do not write production `aipos`** for sell/refund/receive/close-register UAT unless the user explicitly approves. Prefer isolated DB (`aipos_uat` or approved TEST company) — see [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md). Isolation scripts must keep `ODOO_DATABASE` = `ISOLATION_ODOO_DATABASE`.
3. **R2 / Shopfront history** is a read-only archive for production tenants. Do not import historical receipts into a production Odoo database or use R2 data as a second live source of truth. The demo/TEST exception is explicit and narrow: `scripts/import-r2-sales-receipts.py --apply` may run only against the approved TEST company/database, after a dry run and manifest verification, and must reconcile stock to the R2 snapshot afterward. Scheduled R2 sync stays off unless explicitly enabled. Policies: [docs/R2_COLD_HISTORY_POLICY.md](docs/R2_COLD_HISTORY_POLICY.md) and [docs/R2_ARCHIVE_SYNC_PLAN.md](docs/R2_ARCHIVE_SYNC_PLAN.md).
4. **Do not invent GST, prices, ABN, or stock.** Missing source price/tax → keep product unsaleable; leave for owner/accountant.
5. **AI** (`AI_ENABLED`) stays false in production until DashScope is configured and budgeted.
6. **Pages:** change UI under `pos-ui/app` (not a duplicate tree under `pos-ui/src/app` if both exist). API client: `pos-ui/src/lib/api.ts`.
7. **Backend verify:** production image builds with **Java 21**. A machine with only Java 8 cannot run the full Maven suite.
8. **Writes need an explicit environment gate:** read-only browser/UAT checks may target production; sell, refund, receive, stock, cash, register-close, role, supplier, or import writes must target an approved isolated Odoo database/test company unless the user explicitly approves production. Keep `ODOO_DATABASE` equal to `ISOLATION_ODOO_DATABASE`; use [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md).
9. **Do not infer acceptance from mocks or page reachability:** fixture/intercepted-request UAT proves UI behavior only. For pilot claims, cite the relevant `docs/UAT_*.json`, deployment SHA, and whether the action was read-only or wrote business data.
10. **Git:** do not force-push `main`/`master`; do not commit secrets. This repo’s Cursor rule defaults to commit + push when a change set is finished (unless the user says keep local-only).

## Domain constraints (product)

- Shelf prices include GST; 10% GST = inclusive price / 11 (`GstMath`).
- Cash rounding to 5¢ (`CashRounding`); card stays exact.
- Business day / display timezone: use the store/Odoo company location (for example `Australia/Adelaide`), never a fixed Shanghai clock for business dates. Keep UTC for transport/audit timestamps and convert only at the store boundary.
- Multi-outlet / register model; inventory and sales hang off outlet.
- Amounts are decimal values, not floating point; preserve GST-inclusive shelf prices, payment-specific cash rounding, and the Odoo company/warehouse context when comparing totals or stock.

## Doc index (start here)

| Need | Doc |
|------|-----|
| Overview / run locally | [README.md](README.md) |
| Dokploy / smoke | [DEPLOYMENT.md](DEPLOYMENT.md) |
| app vs demo hosts | [docs/TENANT_SUBDOMAIN.md](docs/TENANT_SUBDOMAIN.md) |
| What works / gaps | [docs/CAPABILITY_STATUS.md](docs/CAPABILITY_STATUS.md) |
| Function checklist / test status | [docs/FUNCTIONALITY_CHECKLIST.md](docs/FUNCTIONALITY_CHECKLIST.md) |
| Pilot GO / NO-GO | [docs/PILOT_RELEASE_READINESS.md](docs/PILOT_RELEASE_READINESS.md) |
| Latest session handoff | The newest `docs/HANDOFF_*.md` by date; currently [docs/HANDOFF_2026-10-13.md](docs/HANDOFF_2026-10-13.md) is the durable handoff file, but trust its “当前交接快照” section over the filename. |
| Isolation write UAT | [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md) |
| R2 archive / cold history | [docs/R2_ARCHIVE_SYNC_PLAN.md](docs/R2_ARCHIVE_SYNC_PLAN.md), [docs/R2_COLD_HISTORY_POLICY.md](docs/R2_COLD_HISTORY_POLICY.md) |
| Telegram / Hermes product agent | [docs/ORITHOPOS_AGENT.md](docs/ORITHOPOS_AGENT.md) (runtime product-agent instructions; not this repo’s Cursor/Codex brief) |
| Scale / suspend ops | [docs/SCALE_OPS_RUNBOOK.md](docs/SCALE_OPS_RUNBOOK.md) |

UAT evidence lives as `docs/UAT_*.json` — prefer those over chat recall for “what passed on which SHA”. Do not edit a historical UAT deployment SHA to make it match a newer commit; create a new evidence file instead.

## When finishing a task

1. Read the relevant status/runbook docs before changing production-facing behavior.
2. Prefer small, reviewable diffs; match existing style and keep Odoo as the live business source.
3. Run the narrowest applicable checks, then report command, environment, result, and limitations. Do not call a mock or read-only pass a business acceptance.
4. Update the relevant handoff / capability / readiness doc if behavior or pilot status changed.
5. Push to `origin` when the change set is done so Dokploy can deploy (unless asked to keep local-only).
6. Confirm commit SHA, deployment SHA when known, and that secrets were not staged.
