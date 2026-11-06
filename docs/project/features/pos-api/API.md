# API 使用手册

Base path: `https://{store-host}/api/pos/v1`. Authenticate with `Authorization: Bearer op_...`; tokens are created by a vendor administrator via `POST /auth/tokens` using the current browser JWT. The token is returned once and stored only as a hash.

Read endpoints currently support `products`, `customers`, `suppliers`, `sales`, `orders`, and `purchases`:

```http
GET /products?offset=0&limit=100
GET /products/123
```

Responses include `requestId`, resource, pagination values and `items`; individual reads return one Odoo record. Limits are 1-500. Odoo company binding must be ready. Scopes: `api.read`, `api.write`, `api.batch`, `api.webhook`, `api.admin`.

`POST /{resource}:batch` requires `api.write`, `api.batch`, and `Idempotency-Key`. `sales`, `inventory`, and `purchases` are accepted when their server-side feature flags are enabled; a sale record with `refundOfOrderId` is a validated full-sale refund. The request returns an asynchronous `operationId` and per-record results with `created`, `updated`, `skipped`, or `failed` status. The same key and request hash replays the original response without repeating the Odoo write; a changed body returns `409`. Purchase writes create draft purchase orders and deliberately do not receive stock. Webhook subscriptions require `api.webhook`, an HTTPS public endpoint, and `POS_API_WEBHOOK_ENCRYPTION_KEY`; delivery uses HMAC signatures, durable delivery records, and bounded retries.
