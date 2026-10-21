# Isolated UAT environment

Use `.env.uat.example` as the variable name template and copy it to ignored `.env.uat`. Set `ODOO_MASTER_PASSWORD` only on the host that creates the isolated database; use `scripts/create-isolated-odoo-database.mjs` before starting the stack. The UAT Compose overlay requires `RUNTIME_ENVIRONMENT=uat`, and both services must set `ODOO_DATABASE` and `ISOLATION_ODOO_DATABASE` to the same dedicated database. The value must not be `aipos`.

Start with a distinct project and keep the frontend bound to localhost until identity and access checks pass:

```powershell
docker compose -p orithos-uat --env-file .env.uat -f docker-compose.yml -f docker-compose.uat.yml up -d
node scripts/verify-release-identity.mjs
```

The version check requires `SOURCE_COMMIT` to be the exact full candidate SHA. A missing endpoint, unknown SHA, or mismatch is `BLOCKED`; it is not a deployment pass. Then call `/api/odoo/uat-context` as the platform/store admin and verify that both services attest the same dedicated database and SHA.

Prepare cashier, store manager, platform administrator and second-tenant accounts before any write. The first write run must use the isolated database and record order, payment, GST, stock, register and recovery evidence. Do not use production `aipos` for this run.
