# 2026-11-07 POS API docs and idempotency follow-up

## Scope

Read-only public runtime checks and local POS API/CLI verification. `main` was `a8befaf3` at inspection; SKR and Demo still reported runtime SHA `5ba3b317d0bbadbc9e37ef8b0e555aab978f6244`. No valid business write was sent.

## Checks

- PASS: SKR and Demo `/api/pos/v1/openapi.yaml` returned HTTP 200 with `text/yaml` and an OpenAPI document.
- PASS: SKR and Demo `/api-docs` returned HTTP 200. Browser accessibility inspection confirmed the API documentation content rendered.
- FINDING: `/openapi.yaml` returned the POS HTML shell rather than YAML. Main commit `3f7365ca` changes the docs page download link to `/api/pos/v1/openapi.yaml` and removes the incorrect Planned label for supported refunds. Deployment of that commit is not yet confirmed.
- PASS: `python -m unittest discover -s tools/tests -v` (3/3 CLI fixture tests).
- PASS: in `pos-ui`, `npm run typecheck` and `npm exec eslint -- app/api-docs/page.tsx`.
- FINDING: a safe live batch probe reproduced reuse of one token and idempotency key across `purchases:batch` and `sales:batch` returning the original purchase operation. The local controller candidate includes resource identity in the request hash and a focused unit test; the Java test has not run because the project requires remote Java 21 verification and forbids local backend builds.
- NOT RUN: exact-SHA Java 21 verification, deployment of backend candidate, valid sale/refund/inventory/purchase writes, webhook delivery/signature/retry, and cleanup.

## Limits

The read-only HTTP checks confirm route availability and runtime identity, not write correctness or tenant isolation. No business record was created or modified in this follow-up.
