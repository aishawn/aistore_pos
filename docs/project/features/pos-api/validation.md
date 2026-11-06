# Validation

Status: Java 21 exact-SHA verification PASS for `491f23cf`; Dokploy deployment is live on both store hosts with `ODOO_DATABASE=aipos_uat`. Runtime smoke verification confirms unauthenticated resource access is rejected with `401`. No production business writes were performed. UAT write flags are enabled only for the isolated sales, inventory, and purchase adapters. A full authenticated fixture still requires a temporary vendor token and isolated Odoo records.

Required for ongoing acceptance: token create/revoke/expiry/scope tests; tenant isolation; Odoo `aipos_uat` read fixture; isolated sale/refund/inventory/purchase fixtures; idempotency replay/conflict; partial batch results; webhook signature/retry tests; and CLI REST fixture tests. Purchase receipt receiving remains intentionally outside this API; purchase writes create draft orders only.
