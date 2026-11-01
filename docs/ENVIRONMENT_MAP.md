# Environment Map

This file records stable, non-secret environment metadata for the Orithos POS workspace.
Passwords, database connection strings, tokens, cookies, JWTs, API keys, and webhook values stay in ignored local environment files or Dokploy environment variables.

## Source Paths

| Component | Local path |
|---|---|
| POS | `C:\\shawn\\1code\\1project-new\\aistore_pos\\v1\\orithopos-master` |
| Odoo | `C:\\shawn\\1code\\1project-new\\aistore_pos\\v1\\orithos_odoo` |
| Shopfront crawler | `C:\\shawn\\1code\\1project-new\\aistore_pos\\v1\\shopfront_crawler` |
| Brand site | `C:\\shawn\\1code\\1project-new\\aistore_pos\\v1\\shipany-template-dev` |

## Public Application Endpoints

| Endpoint | Role | Login variable names |
|---|---|---|
| `https://demo.orithos.com.au/` | Demo store / POS pilot | Username: `admin`; password: `INITIAL_ADMIN_PASSWORD` |
| `https://skr.orithos.com.au/` | SKR store | `ORITHOS_SKR_USER`; `ORITHOS_SKR_PASS` |
| `https://app.orithos.com.au/` | Platform administration | Username: `admin`; password: `INITIAL_ADMIN_PASSWORD` |
| `https://orithos.com.au/signup` | Brand site store registration | Registration flow |
| `https://odoo.orithos.com.au/` | Odoo administration | `ODOO_USER`; `ODOO_PASS` |

## Dokploy Services

All normal deployment work targets GitHub `main`. A successful webhook or dashboard trigger is not deployment proof; verify build result, source SHA, runtime SHA, health, and the applicable smoke/UAT evidence separately.

| Service | Dokploy URL |
|---|---|
| POS Compose | `https://dokploy.modkie.com/dashboard/project/6v8D8TDLvzJCQRH93Dx_z/environment/tm97Mlr4oIRKCExPqVucV/services/compose/y4IqIQ8dvwEYL06Hppkjc` |
| Brand site application | `https://dokploy.modkie.com/dashboard/project/6v8D8TDLvzJCQRH93Dx_z/environment/tm97Mlr4oIRKCExPqVucV/services/application/vL9798BgWMVElGPZy-mpZ` |
| Odoo Compose | `https://dokploy.modkie.com/dashboard/project/6v8D8TDLvzJCQRH93Dx_z/environment/tm97Mlr4oIRKCExPqVucV/services/compose/trQzcdFfNnKqBpYNq6Izn` |

Dokploy account variables are `DOKPLOY_USER` and `DOKPLOY_PASS`. Do not record their values or a deployment webhook value here.

## Database Policy

The current owner-approved deployment/debugging/live-trial database is `aipos_uat`. Keep these deployment variables aligned:

```text
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
```

`aipos_uat` may receive real transactions under the current project policy. Before any business write, confirm the intended database and tenant, confirm the owner-approved scope, ensure a usable backup/restore path, and record the operation and resulting evidence. Do not silently write another database. Every UAT record must state whether it created real business data.

Historical handoffs may describe earlier isolation gates or NO-GO decisions. Those records are historical evidence and must not be rewritten to match this current policy.

## Deployment Workflow

1. Commit and push the intended change to GitHub `main`.
2. Allow the configured Dokploy service to deploy, or use the credential stored in the ignored environment variable.
3. Confirm the build completed for the intended source SHA and that the running containers report the expected runtime SHA.
4. Run the narrowest applicable smoke/UAT checks and record read/write scope, result, and limitations in the current handoff or a dedicated evidence file.
5. If Dokploy reports `Branch Not Match`, stop retrying and verify repository, branch, root, Compose file, and service binding first.
