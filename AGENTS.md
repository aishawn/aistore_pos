# AGENTS.md — Orithos POS

Shared project brief for **Cursor** and **Codex** (and any other coding agent). Read this first; follow links for depth. Do **not** put passwords, API keys, or tokens in this file.

**Working-state note (2026-10-29):** the pilot remains **NO-GO for formal production**. The deployed behavior SHA is `9cebe3ae8211000dedd7cfe10bfccaf6f6963589`; `main` may advance with documentation-only commits while Dokploy catches up. All deployment/debugging/trial traffic currently targets shared `aipos_uat`, so `isolated=false` is expected and must not be described as customer production isolation. Treat `docs/HANDOFF_2026-10-29_CURRENT.md`, `docs/UAT_CUSTOMER_TRIAL_RELEASE_STATUS_CURRENT.json`, `docs/CAPABILITY_STATUS.md`, and `docs/PILOT_RELEASE_READINESS.md` as the status sources of truth; this file contains durable rules, not a replacement for UAT evidence.

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

Login uses username/password only (no subdomain field). Host → vendor. Pilot admin username: `admin`. Demo credentials have been supplied in the current owner conversation; never copy the password into this file, handoffs, UAT artifacts, command logs, or Git. For repeatable browser checks, place it in an ignored local env file as `DEMO_ADMIN_PASSWORD` and read it without printing it.

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

Toolchain: Node **24+** (the UI package declares `engines.node >=24`) and Java **21**. **Owner preference: do not run local builds.** Use narrow static checks such as `npm run typecheck`, targeted ESLint, and script syntax checks when relevant. Run application builds and full backend verification through Dokploy; report the exact source/deployment SHA and build evidence. The default live read-only UAT target is `https://demo.orithos.com.au`.

## Secrets and shared context (Cursor ↔ Codex)

| Kind | Where | Commit? |
|------|--------|---------|
| Architecture, hosts, process | This file, `README.md`, `DEPLOYMENT.md`, `docs/*` | Yes |
| Progress / latest state | `docs/HANDOFF_*.md`, `docs/PILOT_RELEASE_READINESS.md`, `docs/CAPABILITY_STATUS.md` | Yes |
| Passwords, JWT, Odoo service account, R2 keys, DashScope, deployment webhook | Ignored local env files / environment variables / Dokploy Compose env | **No** (never put values in tracked files) |
| Cursor-only habit | `.cursor/rules/` | Yes (behaviour, not secrets) |

Both tools open the same workspace: they share Git docs and the same local `.env`. Chat history does **not** sync — update a handoff or this file when switching tools.

**Never** commit `.env`, `.env.local`, `.local/`, dumps, or real credentials. Prefer variable **names** in docs (“set `ODOO_SERVICE_PASSWORD` in Dokploy”).

The owner says API keys are already configured as environment variables. Inspect only variable names/presence when needed; never print values. The Dokploy webhook is a deployment credential: do not persist its URL in Git, handoff or command output. For repeatable deployment commands, load it from an ignored environment variable such as `DOKPLOY_WEBHOOK_URL`.

## Context and memory

Use each context source for one purpose; do not copy the full project history into this file.

| Context | Source of truth | Keep here |
|---------|-----------------|-----------|
| Durable rules and architecture | `AGENTS.md`, `README.md`, runbooks | Cross-task constraints, source-of-truth boundaries, verification gates |
| Current project state | `docs/HANDOFF_2026-10-19_CURRENT.md`, `docs/CAPABILITY_STATUS.md`, `docs/PILOT_RELEASE_READINESS.md` | Latest blockers, next actions, pilot decision; update the handoff after meaningful work |
| Verification evidence | `docs/UAT_*.json` and linked screenshots | Exact target, commit/deployment SHA, read/write scope, result and limitations |
| Historical rationale | Codex conversation history or Agent Memory plugin | Search when the reason for a prior decision is unclear; do not treat a chat summary as current product or deployment evidence |

When resuming work, read this file, then the current handoff and the task-specific status/runbook; inspect the matching UAT evidence before repeating checks. Keep these states distinct in notes and reports: implemented, locally verified, deployed, and production-verified. Record failed login, missing deployment identity, blocked writes, and unrun checks as limitations rather than inferring a product failure or success. Agent Memory is optional retrieval for past decisions; save only durable rationale or reusable preferences, never credentials or a duplicate of volatile release status.

## Deploy

1. Confirm the intended commit is on `main`, then use the configured Dokploy deployment path (auto-deploy or the owner-provided webhook). Never deploy unrelated dirty working-tree files.
2. Required Compose secrets (Dokploy): `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, `CORS_ALLOWED_ORIGINS`, plus tenant vars as in `.env.example`.
3. Odoo auto-recover needs **both** frontend and backend: `ODOO_SERVICE_USERNAME`, `ODOO_SERVICE_PASSWORD`. Normal **Deploy** only — never **Fresh Volumes** to “fix” login.
4. Build and verify in Dokploy; then run the read-only smoke checklist in [DEPLOYMENT.md](DEPLOYMENT.md) against the demo store and Integrations Connected. Verify the running/source SHA before calling a change deployed.
5. If the webhook returns `Branch Not Match`, stop retries; verify the Dokploy repo, branch (`main`), repository root and Compose file in Source/Git settings before trying again.

Changing `INITIAL_ADMIN_PASSWORD` in env does **not** reset an existing `admin` row.

## Hard rules for agents

1. **Odoo is SoT** for pilot sell / stock / purchase / reporting. Do not revive Classic MySQL as the live path.
2. **Do not write production `aipos`** for sell/refund/receive/close-register UAT unless the user explicitly approves. Prefer isolated DB (`aipos_uat` or approved TEST company) — see [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md). Isolation scripts must keep `ODOO_DATABASE` = `ISOLATION_ODOO_DATABASE`.
3. **R2 / Shopfront history** is a read-only archive for production tenants. Do not import historical receipts into a production Odoo database or use R2 data as a second live source of truth. The demo/TEST exception is explicit and narrow: `scripts/import-r2-sales-receipts.py --apply` may run only against the approved TEST company/database, after a dry run and manifest verification, and must reconcile stock to the R2 snapshot afterward. Scheduled R2 sync stays off unless explicitly enabled. Policies: [docs/R2_COLD_HISTORY_POLICY.md](docs/R2_COLD_HISTORY_POLICY.md) and [docs/R2_ARCHIVE_SYNC_PLAN.md](docs/R2_ARCHIVE_SYNC_PLAN.md).
4. **Do not invent GST, prices, ABN, or stock.** Missing source price/tax → keep product unsaleable; leave for owner/accountant.
5. **AI** (`AI_ENABLED`) stays false in production until DashScope is configured and budgeted.
6. **Pages:** change UI under `pos-ui/app` (not a duplicate tree under `pos-ui/src/app` if both exist). API client: `pos-ui/src/lib/api.ts`.
7. **Backend pre-push gate (remote Java 21):** do not run local builds. Do not push any change touching `pos-api/` until `mvn -B clean verify` has completed successfully on Java 21 for that exact candidate SHA. A normal branch webhook that only builds an already-pushed branch is not a pre-push gate. If Dokploy/CI cannot build an unpushed candidate and expose its full log, leave the `pos-api` changes unpushed; never claim the requirement was met by a post-push build.
8. **Writes need an explicit environment gate:** read-only browser/UAT checks may target production; sell, refund, receive, stock, cash, register-close, role, supplier, or import writes must target an approved isolated Odoo database/test company unless the user explicitly approves production. Keep `ODOO_DATABASE` equal to `ISOLATION_ODOO_DATABASE`; use [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md).
9. **Do not infer acceptance from mocks or page reachability:** fixture/intercepted-request UAT proves UI behavior only. For pilot claims, cite the relevant `docs/UAT_*.json`, deployment SHA, and whether the action was read-only or wrote business data.
10. **Git:** do not force-push `main`/`master`; do not commit secrets. This repo’s Cursor rule defaults to commit + push when a change set is finished (unless the user says keep local-only).
11. **Do not switch the backend language/stack** to “fix” Dokploy test failures. Repeated red builds have been compile/test hygiene and pre-push skips, not a Spring Boot problem. Keep Java 21 / Spring Boot 3.3.

## pos-api pre-push gate (Dokploy)

Owner preference is no local builds. The required backend gate is the Dokploy Java 21 build command `mvn -B clean verify`, run inside `maven:3.9-eclipse-temurin-21`. Review the complete backend log and confirm its checkout SHA matches the intended commit before treating it as green. A compile error or Surefire failure aborts the whole Compose deploy (frontend is canceled too). A webhook response alone is not a build result.

**Before pushing a change that touches `pos-api/` (main or test sources, `pom.xml`, or `src/main/resources`):**

1. Review the changed Java sources and tests; run only non-build checks locally if useful.
2. Arrange a remote pre-push build of the candidate SHA in `maven:3.9-eclipse-temurin-21` and run `mvn -B clean verify`; inspect the complete backend log and confirm the tested SHA is the candidate.
3. Push only after that exact-SHA build succeeds. After push/deploy, separately confirm the Compose image build, container health, and runtime SHA before claiming deployment.
4. If no remote pre-push builder is available, the build fails, or any SHA cannot be confirmed, leave the backend changes unpushed and record the exact blocker. A post-push webhook/build does not retroactively satisfy this gate.

**Do not:**

- Treat a local static check or a green frontend check as proof that the backend build passed.
- Commit or push a new/changed `*Test.java` until it passes against the code in the **same** commit (no “test first, fix later on main”).
- Leave unfinished WIP Java sources in the tree while running verify for an unrelated fix — park/stash them; they can break compile for everyone.
- “Fix” red deploys by rewriting the backend in another language.

**Recent failure evidence (2026-10-20 to 2026-10-21):**

| Evidence | What happened | Classification / response |
|----------|---------------|---------------------------|
| 2026-10-20 webhook attempts (`4aacb74`, `435ec47`) | Dokploy returned `301 Branch Not Match`; no build was created | Source/branch binding failure, not a Maven failure. Stop retries and verify repo `aishawn/aistore_pos`, branch `main`, root `/`, and `docker-compose.yml`. |
| Dokploy #38 backend log (reviewed 2026-10-21) | Old build context reported missing `AiProviderConfig` in two controllers; the current source had the class and imports | Compile failure in the logged context, but not reproducible from that then-current source. Verify checkout SHA and build context before changing code; do not treat a later webhook response as proof. |
| Dokploy backend logs after the 2026-10-21 AI retest (5,640 returned lines) | 48 AI audit mapper parameter DEBUG records, 46 DashScope `InvalidParameter / url error` markers, and 24 classifier failure markers; raw counts, not deduplicated incidents. Runtime SHA was unavailable. | DEBUG mapper parameters expose assistant query text. The source default is now INFO and Odoo invalid-response diagnostics record only RPC model/method/response type; both changes remain unbuilt and unverified. Keep backend changes unpushed until the exact-SHA Java 21 gate passes; never copy raw parameters into evidence. |

**Recurring source/test failure classes to check before push (seen 2026-10-20):**

| Class | What to verify |
|-------|----------------|
| Missing imports / wrong package | New types (`Map`, mappers under `….mapper.…`) compile in **main and test** |
| Phrase / substring order | Longer aliases before shorter ones (e.g. `day before yesterday` before `yesterday`) |
| Regex intent routing | Both word orders (`supplier…pay` and `pay…supplier`) if both are in tests |
| Percentile / numeric helpers | Test expectations match the actual algorithm (nearest-rank vs interpolate) |
| AI fail-closed | Disabled AI must throw **before** `ObjectProvider.getIfAvailable()` / tenant catalogue access |
| Mockito `verify` counts | If the SUT calls a collaborator N times, asserts use `times(N)` |

When Dokploy exposes backend logs, record the Maven result, deployed SHA, and container/runtime identity in the handoff. A failed or branch-blocked webhook is not a build result.

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
| Current session handoff | [docs/HANDOFF_2026-10-29_CURRENT.md](docs/HANDOFF_2026-10-29_CURRENT.md) and [docs/UAT_CUSTOMER_TRIAL_RELEASE_STATUS_CURRENT.json](docs/UAT_CUSTOMER_TRIAL_RELEASE_STATUS_CURRENT.json); older `HANDOFF_*.md` files are historical records unless explicitly linked from the current handoff. |
| AI acceptance scope | [docs/AI_ASSISTANT_TEST_MATRIX.md](docs/AI_ASSISTANT_TEST_MATRIX.md), [docs/AI_ASSISTANT_TEST_PLAN.md](docs/AI_ASSISTANT_TEST_PLAN.md), [docs/AI_ASSISTANT_UTTERANCE_CATALOG.md](docs/AI_ASSISTANT_UTTERANCE_CATALOG.md) |
| Isolation write UAT | [docs/ISOLATION_ODOO_UAT_RUNBOOK.md](docs/ISOLATION_ODOO_UAT_RUNBOOK.md) |
| R2 archive / cold history | [docs/R2_ARCHIVE_SYNC_PLAN.md](docs/R2_ARCHIVE_SYNC_PLAN.md), [docs/R2_COLD_HISTORY_POLICY.md](docs/R2_COLD_HISTORY_POLICY.md) |
| Telegram / Hermes product agent | [docs/ORITHOPOS_AGENT.md](docs/ORITHOPOS_AGENT.md) (runtime product-agent instructions; not this repo’s Cursor/Codex brief) |
| Scale / suspend ops | [docs/SCALE_OPS_RUNBOOK.md](docs/SCALE_OPS_RUNBOOK.md) |
| Website logo / hero / stock images | Personal skill `website-images` (junction → `C:\shawn\1code\1project-new\tools\网站图像\SKILL.md`); live ModKie docs <https://modkie.com/docs> |

### Website images (cross-project skill)

When the user asks for logo、配图、hero、OG、AI 生成图 or AI 搜图 for this or any other site:

1. Read and follow `website-images` (`%USERPROFILE%\.agents\skills\website-images\SKILL.md` or `C:\shawn\1code\1project-new\tools\网站图像\SKILL.md`).
2. Generate via ModKie (`MODKIE_KEY` / `MODKIE_SYSTEM_API_KEY` in ignored `C:\shawn\1code\1project-new\api\v1\.env`). Search stock via backend_media using `PEXELS_API_KEY` / `PIXABAY_API_KEY` from that same `.env` — never print or commit key values.
3. Prefer search for real photography; generate for logos and original brand art. Save under the target project’s `public/` (or agreed path) and update references.

UAT evidence lives as `docs/UAT_*.json` — prefer those over chat recall for “what passed on which SHA”. Do not edit a historical UAT deployment SHA to make it match a newer commit; create a new evidence file instead.

## When finishing a task

1. Read the relevant status/runbook docs before changing production-facing behavior.
2. Prefer small, reviewable diffs; match existing style and keep Odoo as the live business source.
3. Run the narrowest applicable checks while iterating, then report command, environment, result, and limitations. Do not call a mock or read-only pass a business acceptance.
4. Follow the no-local-build preference. Use typecheck, targeted lint, and script syntax checks locally; use Dokploy for application builds and backend `mvn -B clean verify`, then record SHA-specific results.
5. Update the relevant handoff / capability / readiness doc if behavior or pilot status changed.
6. Push to `origin` when the change set is done so Dokploy can deploy (unless asked to keep local-only).
7. Confirm commit SHA, deployment SHA when known, and that secrets were not staged.
