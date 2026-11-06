# API 使用手册

Base path: `https://{store-host}/api/pos/v1`. Authenticate with `Authorization: Bearer op_...`; tokens are created by a vendor administrator via `POST /auth/tokens` using the current browser JWT. The token is returned once and stored only as a hash.

Read endpoints currently support `products`, `customers`, `suppliers`, `sales`, `orders`, and `purchases`:

```http
GET /products?offset=0&limit=100
GET /products/123
```

Responses include `requestId`, resource, pagination values and `items`; individual reads return one Odoo record. Limits are 1-500. Odoo company binding must be ready. Scopes: `api.read`, `api.write`, `api.batch`, `api.webhook`, `api.admin`.

`POST /{resource}:batch` requires `api.batch` and `Idempotency-Key`, but currently returns `501 not implemented`. No resource write path is enabled before per-resource Odoo policy and UAT isolation evidence exist. Webhooks and operations are not yet implemented.
