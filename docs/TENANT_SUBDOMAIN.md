# Tenant subdomains + self-service trial

Orithos stores are addressed as `{slug}.orithos.com.au`, similar to Shopfront’s `{vendor}.onshopfront.com`.

## Flow

1. Open `https://app.orithos.com.au/signup`
2. Choose organisation name + subdomain (live availability check)
3. `POST /api/public/signup` creates vendor (trial) + outlet + owner + seed data
4. Browser redirects to `https://{slug}.orithos.com.au/auth/bootstrap?token=…`
5. Bootstrap exchanges the one-time token for HttpOnly JWT cookies on that host

Login on a tenant host uses Host → vendor. Login on `app.` requires a subdomain field and hands off via the same bootstrap token.

## DNS / TLS

- Add a wildcard record `*.orithos.com.au` pointing at the same edge as `app.orithos.com.au`
- Issue a certificate covering `*.orithos.com.au` (and apex if needed)
- Reverse proxy must forward `Host` / `X-Forwarded-Host` and `X-Forwarded-Proto` to the Next.js frontend (which forwards them to the API)

## Dokploy

Dokploy’s Domains UI rejects `*.orithos.com.au`. Keep Domains as:

- `app.orithos.com.au` → `frontend` / port `3000` / HTTPS

Wildcard routing is declared on the `frontend` service in [`docker-compose.yml`](../docker-compose.yml) via Traefik `HostRegexp` labels (low priority so `app` / `odoo` Host rules still win). After pull, run a normal **Deploy** (not Fresh Volumes). With Cloudflare orange-cloud on `*`, browser TLS is usually fine without a separate LE wildcard.

## Environment

| Variable | Purpose |
|---|---|
| `APP_TENANT_BASE_DOMAIN` | Base domain (`orithos.com.au`) |
| `APP_TENANT_SCHEME` | `https` in production, `http` locally |
| `APP_TRIAL_DAYS` | Default trial length |
| `CORS_ALLOWED_ORIGINS` | Include `https://*.orithos.com.au` |
| `NEXT_PUBLIC_TENANT_BASE_DOMAIN` | Frontend preview / redirects |
| `NEXT_PUBLIC_TENANT_SCHEME` | Frontend URL scheme |

## Local testing

Set API `APP_TENANT_BASE_DOMAIN=localhost` and `APP_TENANT_SCHEME=http`. Modern browsers resolve `acme.localhost` to loopback. Sign up from `http://localhost:3000/signup`, then open `http://acme.localhost:3000`.

## Isolation model

- `vendor.subdomain` is the SaaS tenant key
- Business rows still use `outlet_id`; each signup creates one outlet under the vendor
- JWT carries `vendorId`; API rejects tokens whose vendor does not match the Host vendor
