# Odoo Integration Contract

## Authority

- Odoo is the business source of truth for products, prices, inventory, sales, refunds, purchasing, receiving, customers, and reports.
- The Classic Spring/PostgreSQL POS tree is reference code only. Do not use it as a live fallback or dual-write target.
- Keep `ODOO_DATABASE`, `ODOO_DATABASE_UAT`, and `ISOLATION_ODOO_DATABASE` aligned to the current approved target, currently `aipos_uat`.

## Authentication and scope

- POS login credentials and Odoo service credentials are separate. `INITIAL_ADMIN_PASSWORD` is not the Odoo admin password.
- Every Odoo request must carry the current tenant/company context and, where relevant, the warehouse/outlet context.
- Host, JWT vendor scope, outlet scope, and Odoo company scope must agree. Reject cross-tenant access rather than returning another tenant's data.

## Reads and recovery

- Safe read failures must distinguish unavailable service, unauthorized session, valid empty result, and malformed provider response.
- Session auto-recovery may replay only safe reads. Never automatically replay sales, refunds, purchases, receiving, stock, price, role, supplier, import, cash, or register-close writes.
- A valid empty Odoo result must not fall back to stale Classic or R2 business data.

## Writes

- Writes require the current `AGENTS.md` `aipos_uat` scope gate: database, tenant, approved operation, backup/restore path, rollback approach, and evidence record.
- Use idempotency or duplicate-submit protection where the workflow can be retried.
- Preserve Odoo response identifiers and reconciliation inputs without logging credentials or raw provider payloads.
- A write is not accepted merely because the API returned success; verify resulting Odoo state and relevant stock, tax, payment, or audit effects.

## Errors and diagnostics

- Do not expose raw Odoo RPC responses, provider bodies, access tokens, cookies, or passwords in UI, logs, handoffs, or UAT artifacts.
- Log only the minimum model/method, status/type, correlation identifier, and sanitized failure category needed to debug.
- Keep source commit, deployment identity, and business result separate in evidence.
