# API 使用手册

Base path: `https://{store-host}/api/pos/v1`. Authenticate with `Authorization: Bearer op_...`; tokens are created by a vendor administrator via `POST /auth/tokens` using the current browser JWT. The token is returned once and stored only as a hash.

Read endpoints support products, inventory, customers, suppliers, sales, orders, purchases, pricing, classifications, payment methods, outlets, and registers. All collection routes accept `offset` and `limit` (1-500); each resource also has a single-record route:

```http
GET /products?offset=0&limit=100
GET /products/123
GET /sales/8064930
GET /pricing
GET /classifications
GET /payment-methods
GET /outlets
GET /registers
```

Pricing, payment methods, outlets, and registers are filtered to the API token vendor's Odoo company. Classifications return the shared Odoo product-category tree because categories are global taxonomy. These five additional resource families are read-only; batch writes remain limited to sales, inventory, and purchases.

Collection responses include `requestId`, resource, pagination values and `items`; individual reads return one Odoo record. A sale detail also includes `lines` with `id`, `productId`, `quantity`, `refundedQuantity`, `refundableQuantity`, `unitPrice`, `discountPercent`, `taxIds`, and `uomFactor`, so an API client can prepare a validated refund without querying Odoo directly. Limits are 1-500. Odoo company binding must be ready. Scopes: `api.read`, `api.write`, `api.batch`, `api.webhook`, `api.admin`.

`POST /{resource}:batch` requires `api.write`, `api.batch`, and `Idempotency-Key`. Keys are retained for 24 hours. Reuse the same key and identical payload when retrying an uncertain request; that replays the original response without repeating the Odoo write. A changed body with the same key returns `409`. The CLI generates a key per invocation by default; pass `--idempotency-key` to reuse one across separate invocations. `sales`, `inventory`, and `purchases` are accepted when their server-side feature flags are enabled; a sale record with `refundOfOrderId` is a validated full-sale refund. Refund lines must use negative quantities and include the original Odoo POS line ID in `refundedOrderLineId`; the complete unrefunded line set is required. Refunds do not require a quote signature because their price and taxes are read from the original sale. The request returns an asynchronous `operationId` and per-record results with `created`, `updated`, `skipped`, or `failed` status. Purchase writes create draft purchase orders and deliberately do not receive stock. Webhook subscriptions require `api.webhook`, an HTTPS public endpoint, and `POS_API_WEBHOOK_ENCRYPTION_KEY`; delivery uses HMAC signatures, durable delivery records, and bounded retries. `GET /webhooks/{id}/deliveries` returns paginated event ID, type, status, attempt count, next retry time, and delivered time without exposing payloads or signing secrets.
