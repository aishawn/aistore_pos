# Design

## Boundary

Spring `pos-api` is the versioned REST facade. Browser JWT remains unchanged. CLI and automation use a revocable `op_` token stored as a BCrypt hash, scoped to one vendor. The request host and the token vendor must match. Odoo service credentials are server-side only; clients never receive Odoo cookies or database access.

## Odoo access

The facade resolves the vendor's ready `odoo_company_id`, authenticates the configured service account, and issues `search_read` with `allowed_company_ids`. Resource models and returned fields are allow-listed. A missing binding or incomplete Odoo configuration fails closed.

## Writes and asynchronous operations

Batch POST accepts 1-500 records and requires `api.write`, `api.batch`, a unique `sourceId` per row, and an `Idempotency-Key`. A unique `(vendor, token, key)` row is reserved before the operation is queued. An identical retry returns the recorded response; a changed request returns 409. Expired keys may be reused. Partial results stay attached to a durable operation record. A service restart changes unfinished operations to `unknown`; callers must reconcile Odoo before retrying.

Current write adapters cover ordinary POS sales, validated full-sale refunds, physical stock counts, and draft purchase orders. Sales require a fresh server-side quote and Odoo order UUID; refunds must reference every unrefunded original line and match the original total; inventory counts require a vendor-bound stock location and an expected quantity; purchase drafts use `sourceId` in `purchase.order.origin`. Server flags default to false in a fresh deployment and are enabled only for the isolated `aipos_uat` acceptance environment. Purchase receipts remain outside this API so writing a purchase cannot silently receive stock.

## Webhooks

Subscriptions are vendor scoped, limited to HTTPS public endpoints, and require a stable `POS_API_WEBHOOK_ENCRYPTION_KEY`. The secret is returned once and encrypted at rest. HMAC-SHA256 covers the exact request body. Durable deliveries retain event IDs and use bounded retries with a database lease. A receiver should deduplicate by event ID. Outbound runtime and DNS policies must also restrict egress; URL validation alone is not a network firewall.

## Documentation placement

The API reference page lives in `pos-ui` because it shares the store login, navigation, and account settings. The OpenAPI YAML is shipped from `pos-ui/public` and served by the same POS deployment. The Python CLI remains a thin client in `tools/`; neither needs an independent service.
