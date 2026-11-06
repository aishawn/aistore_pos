# 2026-11-07 POS API resource coverage

## Scope

Commit `6f87c3b5dce2dd6337fc41b2f29503d2412512b5` adds read-only resource families for pricing, classifications, payment methods, outlets, and registers, and binds idempotency hashes to both resource and request payload. The candidate is on `main` and is present in SKR/Demo runtime `790746508292918290aa4608a711aa00f488c5ce`.

## Checks

- PASS: `python -m unittest discover -s tools/tests -v` (4/4 CLI fixtures), including the five new resource list commands.
- PASS: targeted POS docs ESLint.
- PASS: PyYAML parses `pos-ui/openapi.yaml`; the generic read-resource enum contains 12 resources; `pos-ui/openapi.yaml` and both generated public copies are byte-identical.
- PASS: GitHub Actions remote Java 21 `mvn -B clean verify` for exact candidate SHA `6f87c3b5dce2dd6337fc41b2f29503d2412512b5`; 516 tests, 0 failures/errors. Run [42269157682](https://github.com/aishawn/aistore_pos/actions/runs/42269157682).
- PASS: SKR and Demo `/api/public/version` report runtime SHA `79074650`; their public OpenAPI assets return HTTP 200 and contain the 12-resource enum.
- NOT RUN: authenticated live reads for the new Odoo model mappings, valid business writes, webhook delivery, and cleanup.

## Limits

No backend build was run locally. The successful remote exact-SHA verification occurred after the candidate was pushed because the workflow-fix push also advanced `main` through the candidate; this does not satisfy the repository's pre-push ordering rule. The first workflow run stopped before Maven on a container safe-directory error; workflow commit `79074650` fixed that and the exact SHA passed on rerun. The category endpoint returns Odoo's shared taxonomy; all other added resources apply the vendor company filter. No token was created and no business data was written in this session.
