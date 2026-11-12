# Test Session: 2026-11-13 AI assistant readiness follow-up

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-13-ai-assistant-readiness-followup` |
| Started / timezone | 2026-11-13 02:00 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Base SHA | `845e479f` (working tree dirty) |
| Runtime SHA | Frontend/backend `da91a4a4bea832be67abc1a225fe0e63f0384bb6` on SKR and Demo |
| Environment | Local POS checkout, Windows; Java 21 Maven tests, Node UI tests/typecheck; read-only SKR/Demo HTTP and Dokploy deployment checks |
| Database | Read-only SKR/Demo native overview for Adelaide 2026-11-12; no direct database access |
| Real business writes | 0 |
| Online AI questions | 4 attempted (SKR deterministic English and covered Chinese answers passed; two unlisted Chinese variants yielded no parsed assistant data) |
| Model cost | Not available from the online response evidence; AUD 10 cap cannot be independently confirmed |

## Suites executed

| Suite | Command | Result | Scope |
|---|---|---|---|
| Backend | `mvn -B test` | PASS 660/660 | Full POS API unit/integration test suite; not container `clean verify` |
| Assistant controller | `mvn -B -Dtest=AiAssistantControllerTest test` | PASS 4/4 | Response metadata, history append, safe provider failure |
| POS UI unit | `npm run test:unit` | PASS 201/201 | UI library test suite, including provenance/history helpers |
| POS UI types | `npm run typecheck` | PASS | TypeScript only; no production bundle |
| Initial deploy probe | `GET /api/public/version`, `/api/health` | TEMPORARY FAIL | During rollout both frontends reported `695eee7d`, backend was `null`, and health returned 502 |
| Constructor regression | `mvn -B -Dtest=ReportQueryServiceSpringInjectionTest test` | PASS 1/1 | Spring context creates report service through the annotated JDBC constructor |
| Dokploy deployment | POS Compose deployment history | PASS | `695eee7d` and subsequent `da91a4a4` are both marked Done |
| Runtime identity / health | SKR and Demo `GET /api/public/version`; unauthenticated `/api/health` probe | PASS | Both frontend and backend report `da91a4a4`; `/api/health` responds 401, not 502 |
| SKR live AI/report reconciliation | Authenticated `What were sales yesterday?` vs same-day `native-overview` | PASS, narrow scope | 2026-11-12: sales AUD 5,173.94 and gross profit AUD 1,985.28 match; deterministic route, fallback false, available status, Adelaide timezone, zero write requests |
| Chinese covered fast path | Authenticated `昨天销售额如何？` vs same-day SKR `native-overview` | PASS, narrow scope | HTTP 200 / API code 0 in 531 ms; `report_sales`, `source=deterministic`, fallback false, sales AUD 5,173.94 and gross profit AUD 1,985.28 match, zero write requests |
| Unlisted Chinese variants | Authenticated `昨天销售额是多少？` on SKR and Demo | INCONCLUSIVE | The earlier PowerShell harness did not retain response status/body; this wording is not in the explicit fast-path variant test list, so deterministic routing is not established |

## Changes covered

- Authoritative native overview is shared by report and AI sales/AOV paths; cached for 10 seconds with vendor/outlet/date-range keying and source timestamp.
- Replenishment checks report permission before cache access, derives `dataAsOf` from persisted sale updates, and logs safe category/elapsed time/data-gap count.
- Assistant UI displays API report period separately from requested range and restores provenance fields from history details.
- High-frequency Chinese and English yesterday-sales utterances route deterministically.
- AI dashboard prompt now identifies the Orithos POS dashboard and Orithos workflow.
- The pasted Docker failure is fixed in the current tree: `AiAssistantControllerTest` verifies the full 15-argument history append including provenance.
- Deployment exposed another startup regression missed by unit tests: multiple `ReportQueryService` constructors required explicit Spring injection selection. The production constructor is now annotated and guarded by a Spring context test.

## Limits and follow-up

- The initial 502 was transient during deployment. Dokploy marks `695eee7d` and the later `da91a4a4` deployment Done; both stores now report frontend/backend SHA `da91a4a4bea832be67abc1a225fe0e63f0384bb6`.
- Live data reconciliation is proven for one SKR English and one explicitly covered Chinese yesterday-sales utterance, both on one date. Demo numerical reconciliation, unlisted Chinese wording, and exact online model spend remain unverified.
- The unlisted Chinese probes may have invoked the model; no provider usage record was available. Therefore the AUD 10 online-cost cap is not evidenced by this session.
- Rate limit, provider timeout/retry, prompt injection, cross-tenant runtime, and real microphone behavior were not exercised.
- Full UI history restore/clear, voice failure recovery, request cancellation/retry, navigation and `writeRequests=[]` still require fixed-identity online read-only acceptance.
- `mvn -B test` ran locally on Java 21 and passed 660/660; it is not exact-SHA remote workflow evidence. Dokploy reports successful container builds/deployments for the runtime commits, but this session did not capture complete remote test logs for those exact commits.
