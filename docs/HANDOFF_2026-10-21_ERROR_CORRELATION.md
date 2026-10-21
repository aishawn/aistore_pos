# Handoff: Odoo Error Correlation

## Scope

Frontend-only reliability update for Price Suggestions and Reporting Dashboard. No `pos-api` files are included. Business data remains read-only.

## Changes

- Generate a UUID before each Odoo page request and send it as `X-Correlation-ID`.
- Display the response correlation ID when present, otherwise retain and display the outgoing UUID. This also gives a useful ID when a proxy returns an error without response headers.
- Ignore stale responses before updating the displayed ID so an older request cannot replace the current error's ID.
- Local UAT covers gateway responses with and without correlation headers, retry ID regeneration, and the displayed ID.

## Verification

- Node 24.19.0 TypeScript check: passed.
- Targeted ESLint for both components: passed.
- Local 390px Playwright fixture: 13/13 passed; no page errors, no horizontal overflow, and no business writes. Evidence: `UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_CURRENT.json` and `screenshots/2026-10-24-odoo-error-correlation-current/`.
- Dokploy reports the deployment as Done for source SHA `e7dc67ddcc7c61e5f3b225be84457e142ef914a7`; Demo `builtAt=2026-10-21T13:35:45.867Z`. The public version endpoint still has empty frontend/backend commit fields, so runtime commit identity from the app itself remains unavailable.
- Post-deploy Demo 390px read-only UAT: `11/11 PASS`. Price Suggestions returned HTTP 502, but the request sent a UUID, the error state displayed it, and Retry sent a new UUID which was displayed. Reporting Dashboard returned HTTP 200. No horizontal overflow or business writes. Evidence: `UAT_ODOO_ERROR_CORRELATION_ONLINE_AFTER_E7DC67D.json`.
- Broader post-deploy checks: `138 routes x 390/1440 = 272/276 PASS`; four failures are `/platform/audit` and `/platform/failures` returning 404 at both widths because those working-tree pages were not in the deployed candidate. Core interactions `14/14 PASS`, settings `26 PASS`, table/accessibility `14/14 PASS`, and `unexpectedWrites=0`. Evidence files are `UAT_ALL_STATIC_PAGES_POST_E7DC67D.json`, `UAT_INTERACTION_POST_E7DC67D.json`, `UAT_SETTINGS_MOBILE_POST_E7DC67D.json`, and `UAT_TABLE_A11Y_ONLINE_POST_E7DC67D.json`.
- No production build was run locally. Java sources were not changed.

## Deployment follow-up

- Owner confirmed the latest Dokploy deployment status is successful. This confirms the deployment panel state only; no SHA was supplied.
- Read-only GitHub check still reports `origin/main=e7dc67ddcc7c61e5f3b225be84457e142ef914a7`; local `HEAD=6aeb3cf3b131bc74f8cc3d51075053f186e56d58` is one docs-only commit ahead. The Audit/Failures pages and their backend dependencies remain working-tree WIP, so the reported successful deployment cannot be attributed to them.
- Anonymous requests to `https://app.orithos.com.au/platform/audit` and `/platform/failures` return `307` to `/login?next=%2Fplatform%2Fstores`; the app version endpoint returns `401`. Authenticated page/API behavior and runtime SHA therefore remain unverified from this check. The prior four `404` results came from the Demo host static route matrix and remain evidence for that tested target only.
- Local fixture evidence for Audit/Failures remains `UAT_PLATFORM_AUDIT_LOCAL_2026-10-21.json`, `UAT_PLATFORM_FILTER_VALIDATION_LOCAL_2026-10-21.json`, and `UAT_PLATFORM_OPERATIONS_LOCAL_2026-10-21.json`; these intercept the APIs and do not prove backend or production behavior.
- Before deploying these pages, inspect and isolate the matching Java WIP, run the required Java 21 `mvn -B clean verify` on the exact candidate SHA, then confirm the Dokploy source SHA and run authenticated read-only UAT on `app.orithos.com.au`. Do not treat the owner's generic deployment-success confirmation as SHA or page-level acceptance evidence.

## Local interaction follow-up

- Failures now has a page-level Retry action matching Audit's transient-error behavior.
- Node 24.19.0 Playwright fixture: Audit/Failures at 390px and 1440px passed `4/4`; initial API error, Retry recovery, zero page errors, zero overflow, and zero non-GET writes. Evidence: `UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-24.json`.
- This remains frontend fixture evidence. Backend Java 21 verification, migration application, Dokploy source/runtime SHA, and authenticated `app.*` UAT are still open.

## Read-only online regression follow-up

- Real authenticated Demo/app check covered Purchases, Mail Log, Trashed Items, and Platform Stores at 390px and 1440px: `8/8 PASS`, with no horizontal overflow and no business writes. Search empty-state/clear behavior and the Stores create entry were included.
- Evidence: `docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json` and `docs/screenshots/2026-10-17-admin-list-batch/`. The runner records `sourceCommit=null` and `deployment=null`; this is runtime behavior evidence only, not SHA attribution.

## Next

Investigate the Price Suggestions HTTP 502 in Cloudflare/origin logs. Validate the `/platform/audit` and `/platform/failures` working-tree pages with isolated fixtures, then pass the Java 21 pre-push gate for their backend dependencies before including them in a deployment. Keep the missing runtime commit fields documented until the app exposes them.

## AI assistant UAT continuation (2026-10-21)

- Added a public `/api/public/version` probe to `scripts/pilot-ai-workflow-utterances-online-uat.mjs`. It captures HTTP status, frontend/backend commit and build times, and source-SHA match status without saving the version response body.
- `node --check` passed. The focused Demo smoke `Restock list please` returned **1/1 PASS** to `/stock/replenishment`; it issued no business writes. Evidence: `UAT_AI_WORKFLOW_RUNTIME_IDENTITY_SMOKE.json`.
- Runtime endpoint returned HTTP 200, frontend build time `2026-10-21T13:35:45.867Z`, null frontend/backend commits, null backend build time, and `matchesSourceCommit=false` against source HEAD `6aeb3cf3b131bc74f8cc3d51075053f186e56d58`. This verifies the served utterance only, not deployment of the current source.
- Latest full 216-case result remains **75 PASS / 116 BLOCKED / 25 FAIL**. Continue using the failed assertion breakdown and regression map in `AI_ASSISTANT_TEST_PLAN.md`; do not infer that static Java test coverage means tests passed.
- Do not run a local build. Do not push/deploy `pos-api` until Java 21 `mvn -B clean verify` passes on the exact candidate SHA. Resume with a source/runtime identity check, then repeat blocked and failed utterance subsets on that verified runtime.

### Focused prior-failure recheck

- Re-executed the 25 cases that failed the full catalog: **0 PASS / 0 BLOCKED / 25 FAIL**. The old Demo behavior reproduces all four groups: execution-intent requests route to read-only pages; report/history boundaries route to feature pages; Chinese bulk-price lookup lands on capped pricing; dated-sales replies omit AUD and singular-day wording. Evidence: `UAT_AI_WORKFLOW_PREVIOUS-FAILS_RECHECK_2026-10-21.json`.
- Every response was HTTP 200 / code 0 with an assertion mismatch, not a provider `50210`; correlation IDs are retained in evidence. Seven dated-sales replies had the correct `report_sales` intent but failed two answer-format checks.
- The same probe reports null frontend/backend commit and `matchesSourceCommit=false`. These are confirmed served-Demo defects, but cannot establish whether the local candidate fixes them. Backend Java tests remain unexecuted; remote exact-SHA Java 21 gate is still required.
- Post-update asset checks: 32 AI-related `.mjs` scripts passed `node --check`; 557 `docs/UAT_AI_*.json` artifacts parsed successfully. No local application build or Maven command was run.

### Current companion AI UAT

- Availability 3/3, capability gates PASS, route matrix 9/9, surface/auth 11/11, AI UI 2/2, Sommelier 10/10, invoice OCR preview 6/6 and metrics 9/9 passed in the latest read-only run.
- Features are 13 PASS / 1 BLOCKED (Price Suggestions upstream Cloudflare 502; OCR probe INFO). Reports are 15/16 (live stock source safely unavailable). The initial transcription run was 2 PASS / 2 BLOCKED because it did not receive fixtures; after generating temporary English/Chinese system-TTS audio outside the repo, the complete transcription rerun passed **4/4**. Evidence: `UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_CURRENT-CONTINUATION3-SYNTHETIC.json`.
- Evidence suffix: `UAT_AI_*_2026-10-21_CURRENT-CONTINUATION3.json`. Runtime SHA remains unavailable, and no business writes were sent.
- History/Platform completed 9 PASS / 2 BLOCKED / 0 FAIL (missing second-store and platform-operator credentials). Direct stock RPC completed 4 PASS / 5 BLOCKED / 1 INFO / 0 FAIL; blocked checks found no matching rows in the tested company/warehouse domains, so scope was not broadened.
- Static privacy scan covered 113 AI Java files and found zero direct logger calls containing question, prompt, answer, response, raw response or utterance values. This does not replace the required deployed-container log verification.
