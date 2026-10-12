# Dokploy deployment

This repository deploys the Spring Boot + MySQL + Redis services and the Next.js frontend from the root `docker-compose.yml`. The web app account is authenticated by the Spring API. Odoo is a separate business-data connection: the cashier signs in to Orithos first, then connects an Odoo staff account under **Setup → Integrations**.

## Configure the Dokploy application

1. Connect the Dokploy Compose application to `aishawn/aistore_pos` and the `main` branch. Use the repository root as the build context and `docker-compose.yml` as the Compose file. A push to `main` can then trigger Dokploy's configured deployment pipeline.
2. Set the required Compose environment variables in Dokploy before the first deployment: `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, and `CORS_ALLOWED_ORIGINS`. Use long, unique production secrets; `CORS_ALLOWED_ORIGINS` must contain the public frontend origin.
3. Set `ODOO_BASE_URL` and `ODOO_DATABASE` for the **frontend** service. For example, use the Odoo HTTPS origin (no `/web` suffix) and the exact database name used by the Odoo installation. These values are passed server-side by Compose; do not add Odoo credentials or session tokens to `NEXT_PUBLIC_*` variables.
4. Keep the database and Redis services on the private Compose network. Expose the frontend service on port `3000` through Dokploy's domain/proxy configuration and enable HTTPS.
5. Deploy, sign into Orithos and connect an Odoo staff account at **Setup → Integrations**. The default **Register → Sell** page uses Odoo. Confirm that the expected POS configuration, open session, payment methods and products appear. The legacy Spring/MySQL register remains available at **Register → Classic POS (MySQL)**.

## Odoo requirements and current limits

- Odoo must be reachable from the frontend container over HTTPS. The app uses the Odoo JSON-RPC web session and the configured database.
- The Odoo staff user must have access to the relevant company, POS configuration, session, products, customers, payment methods, taxes and sale orders. Use an individual staff account, not a shared administrator password.
- Keep an Odoo POS session open in Odoo before using the Orithos register. This integration does not open or close Odoo sessions.
- The Odoo register supports standard product prices, cash tender and change. Customer-specific or rule-based pricelists, cross-currency pricelists, refunds and credit sales are not implemented yet.
- Odoo-backed pages include the default register (`/`), `/register/odoo`, Odoo products and customers, Odoo sales history, purchase orders, replenishment planning, and the reporting dashboard. Legacy Spring/MySQL pages are labelled **Classic** in navigation; the two backends are not synchronized.

## Updating the deployment

After a change is pushed to `main`, Dokploy should deploy the Compose services if auto-deploy is enabled for this application. Check the Dokploy deployment log and verify the frontend domain, Orithos login, Odoo connection, product/customer pages, sales history, replenishment plan and reporting dashboard. Use an Odoo test database and test POS session for checkout verification; do not create test sales in the live store.

For a manual deployment from the repo root, create the deployment environment in Dokploy (or a protected `.env` file) and run:

```sh
docker compose pull
docker compose build
docker compose up -d
```

Do not commit `.env` files or database dumps. Back up MySQL before changing its schema or volume configuration.
