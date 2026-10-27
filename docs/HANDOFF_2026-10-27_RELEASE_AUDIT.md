# Release Audit Handoff - 2026-10-27

## Runtime snapshot

- Primary UAT target: `https://demo.orithos.com.au`
- Current runtime SHA: `c3562d2bc4c92e3f979283c6edcfdc8c688bc7b7`
- `/api/public/version`: frontend and backend report the same SHA.
- `/ai`, `/ai/identify`, `/assistant`, and `/products`: HTTP 200.
- Demo Odoo binding: company `2`, provision status `ready`.
- `skr.orithos.com.au` Odoo binding: company `5`, provision status `ready`.

## Current test results

- AI critical matrix on runtime `c3562d2b`: 3/4 passed. The remaining failure was a Chinese stock clarification phrase; the local fallback wording now includes `具体商品名称或条码`.
- Platform admin login: HTTP 200.
- Platform tenant list `/api/admin/tenants`: HTTP 500 on runtime `c3562d2b`.
- Root cause identified: active PostgreSQL mappers used MySQL `CONCAT()` syntax.

## Local candidate fixes not deployed

- `8002f5d9`: PostgreSQL-compatible vendor search.
- `9591565b`: PostgreSQL-compatible platform audit and failure searches.
- `eb8c1ddd`: clearer missing-stock fallback wording.
- `59b5accf`: AI product identification workspace route.

The backend changes require an exact-SHA Java 21 remote `mvn -B clean verify`
before GitHub push under the repository gate. The local machine only has Java 8
and no Docker, so these commits remain unpushed.

## Environment mode

Deployment, debugging, and UAT remain intentionally unified on:

```text
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
```

This gives controlled shared UAT behavior, not independent production database
isolation.

## Remaining release blockers

1. Remote Java 21 build and deployment of the tenant SQL fixes and AI wording fix.
2. Re-run platform tenant list, audit, and failure pages after deployment.
3. PostgreSQL backup and restore rehearsal; the Dokploy PostgreSQL service currently has no backup configuration.
4. Full sales/refund/GST/inventory/cash reconciliation, device validation, and customer-visible limitations before GO.
