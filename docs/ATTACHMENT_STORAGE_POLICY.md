# Attachment & media storage policy

**Decided:** 2026-10-16 (multi-store Phase 3)

| Asset | Store in | Why |
|---|---|---|
| POS/accounting/inventory transactions | Odoo Postgres | Business SoT |
| Small POS tile thumbnails (optional) | Odoo filestore OK | Low volume |
| Large product photos, bulk exports, training media | **R2 / CDN** | Avoid Odoo disk blow-up at 200 stores |
| Shopfront historical sqlite/CSV | **R2** | Cold archive; see [R2_COLD_HISTORY_POLICY.md](R2_COLD_HISTORY_POLICY.md) |

## Rules

1. Do not bulk-upload high-resolution catalogue photos into Odoo `ir.attachment` by default.
2. Prefer URL fields or a thin Orithos media table pointing at R2 keys `media/{subdomain}/…`.
3. Odoo filestore backups remain part of the DB host disk plan; keep them small by externalizing media early.
