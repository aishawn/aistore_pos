# Validation

Status: first-phase static validation PASS; deployed runtime NOT RUN. No production business writes performed. See [2026-11-06 session](../../../test-sessions/2026-11-06-pos-api-first-phase.md).

Required before enabling writes: Java 21 exact-SHA `mvn -B clean verify` through Dokploy; token create/revoke/expiry/scope tests; tenant isolation; Odoo `aipos_uat` read fixture; idempotency replay/conflict; and CLI REST fixture tests. The current implementation intentionally returns `501` for batch writes until those gates exist.
