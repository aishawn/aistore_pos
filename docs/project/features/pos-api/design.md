# Design

## Boundary

Spring `pos-api` is the versioned REST facade. Browser JWT remains unchanged. CLI and automation use a revocable `op_` token stored as a BCrypt hash, scoped to one vendor. The request host and the token vendor must match. Odoo service credentials are server-side only; clients never receive Odoo cookies or database access.

## Odoo access

The facade resolves the vendor's ready `odoo_company_id`, authenticates the configured service account, and issues `search_read` with `allowed_company_ids`. Resource models and returned fields are allow-listed. A missing binding or incomplete Odoo configuration fails closed.

## Staged writes

`api.write`, `api.batch`, and high-risk sale/refund/inventory actions are not advertised as working until each resource has an Odoo-specific policy, idempotency persistence, audit record, and UAT isolation evidence. This prevents the former dual-source failure mode.
