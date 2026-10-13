# Dokploy deployment

This repository deploys the Spring Boot + MySQL + Redis services and the Next.js frontend from the root `docker-compose.yml`. The web app account is authenticated by the Spring API. Odoo is a separate business-data connection: the cashier signs in to Orithos first, then connects an Odoo staff account under **Setup → Integrations**.

## Configure the Dokploy application

1. Connect the Dokploy Compose application to `aishawn/aistore_pos` and the `main` branch. Use the repository root as the build context and `docker-compose.yml` as the Compose file. A push to `main` can then trigger Dokploy's configured deployment pipeline.
2. Set the required Compose environment variables in Dokploy before the first deployment: `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, and `CORS_ALLOWED_ORIGINS`. Use long, unique production secrets; `CORS_ALLOWED_ORIGINS` must contain the public frontend origin.
3. The frontend service defaults to `ODOO_BASE_URL=https://odoo.orithos.com.au` and `ODOO_DATABASE=aipos`. Override these values in Dokploy only if the Odoo host or database changes. They are passed server-side by Compose; do not add Odoo credentials or session tokens to `NEXT_PUBLIC_*` variables.
4. For Odoo session auto-recover (and Sommelier catalogue SoT), set **both** frontend and backend Compose env vars in Dokploy:
   - `ODOO_SERVICE_USERNAME`
   - `ODOO_SERVICE_PASSWORD`
   Use a dedicated least-privilege Odoo POS account. Never commit the password to Git. After saving env, run a normal **Deploy** (never **Fresh Volumes**).
5. Keep the database and Redis services on the private Compose network. Expose the frontend service on port `3000` through Dokploy's domain/proxy configuration and enable HTTPS.
6. Deploy, sign into Orithos and connect an Odoo staff account at **Setup → Integrations**. The default **Register → Sell** page uses Odoo. Confirm that the expected POS configuration, open session, payment methods and products appear. Classic MySQL routes are hidden unless `NEXT_PUBLIC_SHOW_CLASSIC_POS=true` (debug only). Do not pilot dual-write.
7. Optional AI: leave `AI_ENABLED=false` until DashScope is budgeted. Then set `AI_ENABLED=true`, `AI_DASHSCOPE_API_KEY`, and model URLs from `.env.example`. Invoice OCR save into Classic MySQL is disabled; use Odoo Purchases / Replenishment for draft RFQs.

## Orithos administrator account

- The initial Orithos username is `admin`. Find the initial password in the Dokploy application's Compose environment variables under `INITIAL_ADMIN_PASSWORD`; the value in a local `.env` file is relevant only if it matches the value deployed to Dokploy.
- The backend reads `INITIAL_ADMIN_PASSWORD` only when it creates the first `admin` row in a new database. Changing the variable later does not change an existing account's password, and the current password cannot be read back from the database.
- If `admin` already exists and the configured value does not work, ask the Dokploy owner to use the application's supported password-reset process. Do not delete the database volume to recreate the account; that would erase store data.

## Odoo requirements and current limits

- Odoo must be reachable from the frontend container over HTTPS. The app uses the Odoo JSON-RPC web session and the configured database.
- The Odoo staff user must have access to the relevant company, POS configuration, session, products, customers, payment methods, taxes and sale orders. Use an individual staff account, not a shared administrator password.
- Keep an Odoo POS session open before selling. Orithos can close a session from **Close Register** (`/api/odoo/session/close`); opening a session is still done in Odoo.
- The Odoo register resolves pricelist / customer prices via Odoo, supports GST, cash rounding, pack/case factors, park (local), full-sale refunds from history, and register close. Cross-currency pricelists and credit sales remain unsupported. See `docs/CAPABILITY_STATUS.md`.
- Pilot navigation exposes Odoo surfaces only (Sell, history, products, customers, purchases, replenishment, reporting). Classic MySQL is reference-only and not synchronized.

## Updating the deployment

After a change is pushed to `main`, Dokploy should deploy the Compose services if auto-deploy is enabled for this application. Check the Dokploy deployment log and verify the frontend domain, Orithos login, Odoo connection, product/customer pages, sales history, replenishment plan and reporting dashboard. Use an Odoo test database and test POS session for checkout verification; do not create test sales in the live store.

### Smoke checklist after every Deploy

1. Dokploy deployment status is **Done** and the commit SHA matches `origin/main` (or contains at least the intended fix commit).
2. Open https://app.orithos.com.au/login → sign in as `admin`.
3. **Setup → Integrations**: Odoo shows Connected (or Connect with staff account). Confirm the auto-recover note matches Dokploy (`autoRecoverConfigured` via `/api/odoo/session` when logged in).
4. Sell `/`: register selector loads; when no session, **Open Odoo POS** is visible.
5. Close `/close`: empty/disabled state is correct when no session is open.
6. If Autodeploy missed the push, trigger a normal **Deploy** once; then check GitHub webhook delivery and Dokploy Watch Paths. Do not create duplicate Compose apps.

For a manual deployment from the repo root, create the deployment environment in Dokploy (or a protected `.env` file) and run:

```sh
docker compose pull
docker compose build
docker compose up -d
```

Do not commit `.env` files or database dumps. Back up MySQL before changing its schema or volume configuration.
