# Isolated UAT environment (optional special-case runbook)

> Current default policy: deployment, debugging, and owner-approved live-trial transactions use the shared `aipos_uat` database. Use this runbook only when a task explicitly requires a separate isolated database and runtime. It is not a blanket gate for every current UAT write.

Use `.env.uat.example` as the variable name template and copy it to ignored `.env.uat`. Set `ODOO_MASTER_PASSWORD` only on the host that creates the isolated Odoo database; use `scripts/create-isolated-odoo-database.mjs` before starting the stack. UAT needs two separate data stores: the dedicated Odoo database selected by `ODOO_DATABASE` and `ISOLATION_ODOO_DATABASE` (same value, never `aipos`), and the POS runtime PostgreSQL database selected by `POSTGRESQL_URL`. The POS URL must point to a dedicated UAT PostgreSQL database, never the production POS database. `POSTGRESQL_URL` is required by the base Compose file and is repeated in the UAT overlay so a missing isolated value fails clearly.

Start with a distinct project and keep the frontend bound to localhost until identity and access checks pass:

```powershell
docker compose -p orithos-uat --env-file .env.uat -f docker-compose.yml -f docker-compose.uat.yml up -d
$env:PILOT_EXPECTED_SOURCE_COMMIT = (git rev-parse HEAD).Trim()
$env:PILOT_BASE_URL = "https://uat.orithos.com.au"
node scripts/verify-release-identity.mjs
Remove-Item Env:PILOT_EXPECTED_SOURCE_COMMIT, Env:PILOT_BASE_URL
```

The frontend and backend build identities are read from the checked-out Git metadata during each Dokploy build. Run the version check with `PILOT_EXPECTED_SOURCE_COMMIT` set to the exact full candidate SHA. A missing endpoint, unknown SHA, or mismatch is `BLOCKED`; it is not a deployment pass. Then call `/api/odoo/uat-context` as the platform/store admin and verify that both services attest the same dedicated database and SHA.

Prepare cashier, store manager, platform administrator and second-tenant accounts before any write. For this special-case isolated run, the first write run must use the isolated database and record order, payment, GST, stock, register and recovery evidence. Do not use production `aipos` for this run. For the normal shared-live-trial policy, follow [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) and the scope/backup/rollback gates in `AGENTS.md`.
