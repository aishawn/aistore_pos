# Orithos POS API

**Status: retired.** The former `/api/pos/v1` external API depended on Odoo for resource reads, quotes, sales, inventory, and purchase operations. Requests to its old base path now return HTTP `410 Gone` with a migration message.

Use the authenticated, tenant-scoped Orithos store APIs documented in the application OpenAPI document. No Odoo fallback is available.
