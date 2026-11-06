# POS API bounded queue and purchase price validation

Date: 2026-11-07

## Scope

Require explicit purchase line cost, bound asynchronous operation queue capacity, and make idempotency replay HTTP status consistent under concurrent requests.

## Evidence

- Candidate SHA: pending.
- Java 21 exact-candidate `mvn -B clean verify`: pending.
- `python -m unittest discover -s tools/tests -v`: 4/4 PASS.
- OpenAPI YAML schema checks and hash equality across the feature source and both published assets: PASS.
- `git diff --check`: PASS. Project docs checker: BLOCKED by 65 missing-file/link/evidence errors in the checkout.
- Runtime deployment and UAT checks: pending.
- Java 21 exact-candidate `mvn -B clean verify`: pending.
- No business writes or webhook deliveries were performed. Webhook signature and DNS endpoint validation regression tests are included but await the Java 21 gate.

## Limitations

The local checkout does not contain the referenced UAT isolation runbook. The sibling maintenance checkout says UAT must isolate both Odoo `aipos_uat` and POS PostgreSQL. Deployment and any business-write acceptance must wait until the runtime can attest the required isolation.
