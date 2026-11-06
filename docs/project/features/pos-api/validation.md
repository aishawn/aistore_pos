# Validation

Status: local static checks PASS; Java build, deployment and runtime acceptance NOT RUN. No production business writes performed. The write flags remain false by default. See [2026-11-06 expansion session](../../../test-sessions/2026-11-06-pos-api-expansion.md).

Required before enabling writes: Java 21 exact-SHA `mvn -B clean verify` through Dokploy; token create/revoke/expiry/scope tests; tenant isolation; Odoo `aipos_uat` read fixture; isolated sale/refund/inventory/purchase fixtures; idempotency replay/conflict; partial batch results; webhook signature/retry tests; and CLI REST fixture tests. Purchase receipt remains NOT IMPLEMENTED.
