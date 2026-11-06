# Orithos Backend (Spring Boot 3 + MyBatis + PostgreSQL 16+ + Redis 7.0 + JWT)

A reverse-engineered backend for the Orithos POS clone, implemented from
`docs/research/API.md` and `docs/research/schema.sql`. It exposes a clean REST API
(JSON envelope `{ code, message, data }`) backed by MyBatis mappers, with JWT auth,
RBAC, and Redis for token state + report caching.

> This is an emulation of the documented contracts — not the vendor's server.

## Stack
- Spring Boot 3.3 / Java 21
- MyBatis (annotation mappers + one XML mapper for dynamic product filtering)
- PostgreSQL 16+
- External Redis 7.0 (JWT refresh whitelist + access-token denylist, report cache)
- JWT (HS256, jjwt) + Spring Security (stateless)

## Prerequisites
- JDK 21, Maven 3.9+
- PostgreSQL database configured through `POSTGRESQL_URL`
- Redis 7.0 reachable through `POS_REDIS_URL`

## Setup
```bash
# 1. Create DB and tables
psql "$POSTGRESQL_URL" -f src/main/resources/db/schema.sql
# optional demo data:
psql "$POSTGRESQL_URL" -f src/main/resources/db/seed.sql

# 2. Configure (env vars override application.yml)
export DB_HOST=localhost DB_PORT=3306 DB_NAME=orithos DB_USER=root DB_PASSWORD=root
export POS_REDIS_URL=redis://localhost:6379/0
export JWT_SECRET="please-change-this-to-a-32-byte-plus-secret"

# 3. Run
mvn spring-boot:run
# or: java -jar target/orithos-backend-0.1.0.jar
```
On first start, `DataInitializer` seeds an **admin / 123456** user automatically.

## Auth flow
```bash
# Login -> returns accessToken + refreshToken
curl -s localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'

# Use the access token
curl -s localhost:8080/api/products -H "Authorization: Bearer <accessToken>"

# Refresh / logout
curl -s localhost:8080/api/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"..."}'
curl -s localhost:8080/api/auth/logout  -H "Authorization: Bearer <accessToken>" -X POST
```
- Access tokens carry `userId`, `username`, `admin`, and `authorities` (`ROLE_*`, `perm:*`).
- Logout blacklists the JTI in Redis (`jwt:blacklist:<jti>`) until it expires.
- Refresh tokens are whitelisted per user in Redis (`jwt:refresh:<userId>`).

## Implemented endpoints
| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `/refresh`, `/logout`, `GET /api/auth/me` |
| Users | `GET/POST /api/users`, `DELETE /api/users/{id}` |
| Products | `GET /api/products` (filters: name, categoryId, brandId, familyId, supplierId, status, page, size), `GET/POST/PUT/DELETE /api/products/{id}` |
| Classifications | `GET/POST /api/classifications/{brand\|category\|family\|tag}`, `PUT/DELETE …/{id}` |
| Suppliers | `GET/POST/PUT/DELETE /api/suppliers` (paged) |
| Customers | `GET/POST/PUT/DELETE /api/customers` (paged), `GET/POST/DELETE /api/customers/groups` |
| Payment methods | `GET/POST/PUT/DELETE /api/payment-methods` |
| Tax rates | `GET/POST/PUT/DELETE /api/tax-rates` |
| Sales | `GET /api/sales` (paged, read), `GET /api/sales/{id}` |
| Reports | `POST /api/reports` (SQL-like DSL → mock series, Redis-cached by `cache.id`) |
| Roles & Permissions | `GET/POST/PUT/DELETE /api/roles`, `GET/PUT /api/roles/{id}/permissions`, `GET /api/permissions` |
| Orders & Invoices | `GET /api/orders` (paged), `GET/POST/PUT /api/orders/{id}`, `PUT /api/orders/{id}/{send\|receive\|cancel\|reopen}` |
| Stocktake | `GET /api/stocktakes` (paged), `GET/POST/PUT /api/stocktakes/{id}`, `PUT …/{complete\|cancel\|apply}`, `POST …/{id}/products` |
| Gift Cards | `GET/POST/PUT /api/gift-cards`, `GET /api/gift-cards/movements` |
| Promotions | `GET/POST/PUT/DELETE /api/promotions` (+`/activate`,`/deactivate`), `GET/POST/PUT/DELETE /api/promotion-categories` |
| Outlets / Registers | `GET/POST/PUT/DELETE /api/outlets`, `/api/registers` (+`POST /api/registers/{id}/close`, `/movements`) |
| Register Closures | `GET /api/register-closures` (paged), `GET /api/register-closures/{id}` |
| Customer Payments | `GET/POST /api/customer-payments`, `PUT /api/customer-payments/{id}/void` |
| Pricing | `GET/POST/PUT/DELETE /api/price-lists` (with items), `/api/price-sets` |
| Config | `GET/POST/PUT/DELETE /api/receipts`, `/api/statements`, `/api/transferees`, `/api/barcode-templates`; `GET/PUT /api/settings` |
| Utilities | `/api/future-prices`, `/api/future-costs`, `/api/mail-log`, `/api/security-events`, `/api/vendor-connections`, `/api/trashed-items`, `/api/notifications` |

## Project layout
```
com.orithos
  common/      ApiResult, PageResult, BusinessException, GlobalExceptionHandler, Ids
  config/      SecurityConfig, RedisConfig, DataInitializer
  security/    JwtService, JwtAuthenticationFilter, TokenStore, JwtProperties, AuthUser, CurrentUser
  modules/
    auth/        AuthController + dto
    user/        User/Role/Permission + mappers + UserService + UserController
    classification/  generic Brand/Category/Family/Tag CRUD
    tax/ payment/ supplier/ customer/ product/ sale/ report/
resources/
  application.yml
  db/schema.sql, db/seed.sql
  mapper/ProductMapper.xml
```

## Extending to the rest of the domain
Every remaining table in `db/schema.sql` follows the same pattern demonstrated here:
1. Entity (`@Data` POJO) mirroring the table columns.
2. `@Mapper` interface — annotation SQL for simple CRUD, or an XML mapper (see
   `ProductMapper.xml`) when you need dynamic `<where>`/joins.
3. `@RestController` returning `ApiResult` / `PageResult`.

All core domains are now implemented (35 controllers, 35 mappers). The full operation
catalog is in `docs/research/graphql-operations.json` (~110 queries + ~180 mutations) and
the field shapes in `docs/research/graphql-schema-full.json` — use these to flesh out the
deeper write operations (e.g. full `createSale`/`createOrderByMatch` payloads, host-sync,
order reviews) which are scaffolded at the CRUD level here.

If you want the frontend clone (the Next.js app in the repo root) to call this API instead
of its inline mock data, point its fetches at `http://localhost:8080/api/...` with the
`Authorization: Bearer` header.
