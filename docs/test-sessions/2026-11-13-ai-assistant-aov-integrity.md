# Test Session: 2026-11-13 AI assistant average-ticket integrity

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-13-ai-assistant-aov-integrity` |
| Started / timezone | 2026-11-13 00:50 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | `c3afe76c024d73eee60592f1eb4a11829fe91925` |
| Runtime SHA | Unknown; SKR/Demo public version probes timed out |
| Environment | Local script fixtures and static checks |
| Database | Not applicable |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-EVAL-LOCAL` | `node --test scripts/ai-eval/run-local-eval.test.mjs` | PASS 1/1 | Command output in task session | Confirms absent endpoint is BLOCKED, not assistant acceptance. Node `v22.22.2`. |
| `AI-EVAL-SYNTAX` | `node --check` on `run-local-eval.mjs` and `verify-skr-ai-readonly.mjs` | PASS | Command output in task session | No provider calls. |
| `AI-AOV-JAVA` | `mvn -B clean verify` | NOT RUN | None | Repository instructions require exact-candidate remote Java 21 verification; new tests are unverified. |
| `AI-AOV-ONLINE` | SKR/Demo public version probes and read-only reconciliation | BLOCKED | Two timed-out GET probes to `/api/public/version` | Runtime SHA, report parity and model cost not checked; no assistant/model requests were sent. |

## Summary

- Passed: evaluator test and AI script syntax checks.
- Blocked: exact-candidate Java 21 build and online read-only checks are pending; SKR/Demo version probes timed out after push.
- Failed: none in suites run.
- Not run: Java tests, deployment, browser/history/voice/navigation E2E, live report parity.
- Business impact: none observed; no database reads or writes in this session.

The pasted Docker failure occurred at 2026-11-12 23:17 +08. The seven-argument history assertion was corrected in commit `7a1d0bb4` at 23:21 +08; the pushed candidate includes the 15-argument provenance assertion. This chronology explains the pasted failure but does not prove a later full build passed.

## Follow-up

1. Run exact-candidate Java 21 `mvn -B clean verify` remotely and capture the complete log.
2. After deployment, verify running source/runtime SHA and compare sales, refunds, transaction count and average ticket with the same outlet/date report using read-only requests.
3. Complete history restore/clear, voice error/retry, navigation, and cross-tenant E2E before claiming full assistant acceptance.
