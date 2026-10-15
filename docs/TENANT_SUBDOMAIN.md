# Tenant subdomains + self-service trial

Orithos stores are addressed as `{slug}.orithos.com.au`, similar to Shopfront’s `{vendor}.onshopfront.com`.

## Host roles

| Host | Role |
|---|---|
| `https://app.orithos.com.au` | **Control plane / console** — signup, `PlatformShell` + `/platform/*` (Stores). No store Sidebar / Sell / Odoo register chrome. |
| `https://demo.orithos.com.au` | **Pilot / demo store** — full POS shell (Sidebar, Sell, history, stock, settings) |
| `https://{slug}.orithos.com.au` | Other registered tenant stores (same POS shell as demo) |

Legacy slug `default` is renamed to `demo` on deploy (see `migration_vendor_demo_slug.sql`). Do not treat `demo` as a reserved infra host.

### Console vs store shells

- **Reuse:** brand tokens, Logo, login styling, `AdminPageLayout` / `ListTable` / auth.
- **Do not reuse on `app.*`:** store `Sidebar`, Sell cart panel, Odoo register chrome, AI float on POS.
- Middleware and `AppShell` hard-lock the control plane: paths outside auth + `/platform/*` (and `/settings/account` for password reset) redirect to `/platform/stores`. Login ignores `?next=/` and always lands on the console.

## Flow

1. Open `https://app.orithos.com.au/signup`
2. Choose organisation name + subdomain (live availability check)
3. `POST /api/public/signup` creates vendor (trial) + outlet + owner + seed data
4. Browser redirects to `https://{slug}.orithos.com.au/auth/bootstrap?token=…`
5. Bootstrap exchanges the one-time token for HttpOnly JWT cookies on that host

Login on a tenant host (e.g. `demo.orithos.com.au`) uses Host → vendor (no subdomain field). Login on `app.` is **console-only**: username/password against the platform-operator vendor — no subdomain field (stores get their slug at signup). Platform-operator admins stay on the console; other users of that vendor may still hand off via bootstrap to the store host.

## DNS / TLS

- Add a wildcard record `*.orithos.com.au` pointing at the same edge as `app.orithos.com.au` (covers `demo` and future tenants)
- Issue a certificate covering `*.orithos.com.au` (and apex if needed)
- Reverse proxy must forward `Host` / `X-Forwarded-Host` and `X-Forwarded-Proto` to the Next.js frontend (which forwards them to the API)

## Dokploy

Dokploy’s Domains UI rejects `*.orithos.com.au`. Keep Domains as:

- `app.orithos.com.au` → `frontend` / port `3000` / HTTPS

Optional explicit domain for clarity:

- `demo.orithos.com.au` → same `frontend` / `3000` / HTTPS

Wildcard routing is declared on the `frontend` service in [`docker-compose.yml`](../docker-compose.yml) via Traefik `HostRegexp` labels (low priority so `app` / `odoo` Host rules still win). After pull, run a normal **Deploy** (not Fresh Volumes). With Cloudflare orange-cloud on `*`, browser TLS is usually fine without a separate LE wildcard.

Set Compose env (if overriding defaults):

- `APP_PLATFORM_OPERATOR_SLUG=demo`
- `APP_TENANT_RESERVED_SLUGS=www,app,api,odoo,cdn,support,mail,status` (do **not** include `demo`)

## Environment

| Variable | Purpose |
|---|---|
| `APP_TENANT_BASE_DOMAIN` | Base domain (`orithos.com.au`) |
| `APP_TENANT_SCHEME` | `https` in production, `http` locally |
| `APP_TRIAL_DAYS` | Default trial length |
| `APP_PLATFORM_OPERATOR_SLUG` | Store whose admins may open `/platform/stores` on `app.*` (default `demo`) |
| `APP_TENANT_RESERVED_SLUGS` | Infra-only hosts; must not include the pilot store `demo` |
| `CORS_ALLOWED_ORIGINS` | Include `https://*.orithos.com.au` |
| `NEXT_PUBLIC_TENANT_BASE_DOMAIN` | Frontend preview / redirects |
| `NEXT_PUBLIC_TENANT_SCHEME` | Frontend URL scheme |

## Local testing

Set API `APP_TENANT_BASE_DOMAIN=localhost` and `APP_TENANT_SCHEME=http`. Modern browsers resolve `acme.localhost` to loopback. Sign up from `http://localhost:3000/signup`, then open `http://acme.localhost:3000`. Pilot store: `http://demo.localhost:3000`.

## Isolation model

- `vendor.subdomain` is the SaaS tenant key
- Business rows still use `outlet_id`; each signup creates one outlet under the vendor
- JWT carries `vendorId`; API rejects tokens whose vendor does not match the Host vendor
