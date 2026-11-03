# Test Session: 2026-11-04 AI answer provenance

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-ai-answer-provenance` |
| Started / timezone | 2026-11-04 / Asia/Shanghai |
| Operator | Codex |
| Branch | `codex/assistant-provenance-ui` |
| Source SHA | `8f9c91718445f4eccc1a0ee018b93a10ccb0b541` |
| Runtime SHA | Local only; no deployed runtime tested |
| Environment | Local fixture / static checks |
| Database | Not applicable |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-001` | `npm run test:unit` (Node 24.19.0) | PASS: 153 tests, 0 failed | [E-AI-PROVENANCE-LOCAL](../project/evidence.json) | Includes 8 source/date helper tests; fixtures only |
| `AI-001` | `npm run typecheck` | PASS | [E-AI-PROVENANCE-LOCAL](../project/evidence.json) | TypeScript `tsc --noEmit` |
| `AI-001` | Targeted ESLint on SellAiPanel and provenance helper/tests | PASS: 0 errors | [E-AI-PROVENANCE-LOCAL](../project/evidence.json) | 3 existing effect warnings in SellAiPanel |
| `AI-001` | Node syntax check for `scripts/pilot-ai-provenance-ui-uat.mjs`; `git diff --check` | PASS | [E-AI-PROVENANCE-LOCAL](../project/evidence.json) | Script not run against a live store |

## Summary

- Passed: 153/153 UI unit tests, typecheck, targeted lint with zero errors, browser UAT script syntax, whitespace check.
- Blocked: None in local checks.
- Failed: None.
- Not run: Remote build/deployment and online SKR/Demo browser acceptance.
- Business impact: Assistant answer metadata now separates underlying Odoo source and routing method; sales queries can show requested range, actual returned row range and latest returned sales day. Backend `dataAsOf` remains a separate timestamp and is not fabricated when absent.

The npm lockfile install reported 37 audit findings (2 low, 23 moderate, 11 high, 1 critical). Dependencies were not upgraded. This does not change the feature test result, but remains a separate dependency maintenance item.

## Follow-up

1. Deploy this exact source SHA, then record the runtime SHA independently.
2. Run `scripts/pilot-ai-provenance-ui-uat.mjs` against SKR and Demo with credentials supplied through environment variables; verify visible source, route, requested range and latest returned sales date.
3. Keep the SKR date-quality gate, forecast quality gate and production default strategy unchanged until their separate evidence passes.
