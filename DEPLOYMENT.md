# Dokploy deployment

This repository deploys the existing Spring Boot + MySQL + Redis application and Next.js frontend from the root `docker-compose.yml`. The Odoo register is an additional frontend integration; it does not replace the existing Spring-backed modules yet.

## Configure the Dokploy application

1. Connect the Dokploy Compose application to `aishawn/aistore_pos` and the `main` branch. Use the repository root as the build context and `docker-compose.yml` as the Compose file. A push to `main` can then trigger Dokploy's configured deployment pipeline.
2. Set the required Compose environment variables in Dokploy before the first deployment: `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, and `CORS_ALLOWED_ORIGINS`. Use long, unique production secrets; `CORS_ALLOWED_ORIGINS` must contain the public frontend origin.
3. Set `ODOO_BASE_URL` and `ODOO_DATABASE` for the **frontend** service. For example, use the Odoo HTTPS origin (no `/web` suffix) and the exact database name used by the Odoo installation. These values are passed server-side by Compose; do not add Odoo credentials or session tokens to `NEXT_PUBLIC_*` variables.
4. Keep the database and Redis services on the private Compose network. Expose the frontend service on port `3000` through Dokploy's domain/proxy configuration and enable HTTPS.
5. Deploy, then sign into Orithos and connect an Odoo staff account at **Settings → Integrations**. Open **Register → Odoo POS** and confirm that the expected POS configuration, open session, payment methods, and products appear.

## Odoo requirements and current limits

- Odoo must be reachable from the frontend container over HTTPS. The app uses the Odoo JSON-RPC web session and the configured database.
- The Odoo staff user must have access to the relevant company, POS configuration, session, products, customers, payment methods, taxes and sale orders. Use an individual staff account, not a shared administrator password.
- Keep an Odoo POS session open in Odoo before using the Orithos register. This integration does not open or close Odoo sessions.
- The checkout currently supports exact-tender payments and standard product prices. It refuses customer-specific or rule-based pricelists, cross-currency pricelists, overpayment/change, refunds and credit sales until those workflows are implemented.
- Existing pages and the default `/` register remain backed by Spring Boot/MySQL. Use `/register/odoo` for the Odoo-backed register. Do not treat the two backends as synchronized: a sale in one is not automatically visible in the other.

## Updating the deployment

The repository has no deployment credentials. After a reviewed change is pushed to `main`, Dokploy should build the Compose services if auto-deploy is enabled for this application. Check Dokploy's deployment log and then verify the frontend domain, Orithos login, Odoo connection, and a test sale in an appropriate Odoo test database before live trading.

For a manual deployment from the repo root, create the deployment environment in Dokploy (or a protected `.env` file) and run:

```sh
docker compose pull
docker compose build
docker compose up -d
```

Do not commit `.env` files or database dumps. Back up MySQL before changing its schema or volume configuration.
