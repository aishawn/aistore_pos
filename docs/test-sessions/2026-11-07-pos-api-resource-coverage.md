# 2026-11-07 POS API resource coverage candidate

## Scope

Local candidate only. It adds read-only resource families for pricing, classifications, payment methods, outlets, and registers. The working `main` runtime is unchanged by this candidate.

## Checks

- PASS: `python -m unittest discover -s tools/tests -v` (4/4 CLI fixtures), including the five new resource list commands.
- PASS: targeted POS docs ESLint.
- PASS: PyYAML parses `pos-ui/openapi.yaml`; the generic read-resource enum contains 12 resources; `pos-ui/openapi.yaml` and both generated public copies are byte-identical.
- NOT RUN: Java 21 exact-SHA `mvn -B clean verify`, live reads for the new Odoo model mappings, authenticated business writes, webhook delivery, and cleanup.

## Limits

No backend build was run locally. The candidate is uncommitted and undeployed while the required remote exact-SHA pre-push gate remains unavailable under the main-only branch constraint. The category endpoint returns Odoo's shared taxonomy; all other added resources apply the vendor company filter.
