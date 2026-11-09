# Test Session: 2026-11-09 SKR Orithos continuation

| Field | Value |
|---|---|
| Session ID | `2026-11-09-skr-orithos-continuation` |
| Environment | Read-only live crawler and SKR POS endpoints |
| Business writes | 0 |
| Deployment/config changes | 0 |

## Live evidence

- Crawler `/healthz` and OpenAPI were reachable. Authenticated GET to `/api/pos/mappings?store=skr` returned `enabled=true`, company `55`, outlet `87`.
- Latest `daily_sync` job `177` completed, but its payload has `source_only=true`, `full_inventory_snapshot=true`, and `manual_repair=true`. This run did not import the Shopfront snapshot into Orithos.
- Latest `extended_data` job `179` finished `partial` / `completed_with_warnings`, with `pos_staged=0`. Shopfront denied optional GraphQL roots including brands, categories, families, tags, promotions, backorders, stocktakes, closures, and price lists with 403. This is not evidence of a successful Orithos business-ledger sync.
- POS coverage GET returned HTTP 502. Product and inventory reconciliation GETs did not complete before the 12 second client timeout; no count parity was established in this session.
- Existing cutover evidence records Demo and SKR catalogue snapshots at 10,801 products, 10,681 inventory, 13,251 barcodes, and 10,865 unit prices each. Those are historical snapshots and do not establish current parity or completed sales reconciliation.
- Existing cutover evidence records the native write allowlist as vendor `1` only; SKR vendor `55` is not enabled. The POS runtime was previously recorded against shared database `postgres`, with tenant isolation attestation failing. Keep native writes and cutover blocked until independent database identity and attestation pass.
- `GET /enapi.json`, `/openapi.json`, and `/api-docs` on the SKR host returned HTTP 200 with `text/html`, which is the Next.js SPA fallback, not an API document. The actual JSON API description is `/api/openapi.json` (`application/json`); YAML is `/api/pos/v1/openapi.yaml` (`text/yaml`). No repository route defines `/enapi.json`.

## Priority

1. Confirm independent POS database provisioning, backup and tested restore, then pass Demo/SKR tenant attestation before authorizing native ledger writes.
2. Correct crawler scheduled-run configuration so a normal daily run is not `source_only`; confirm explicit routing to the intended Orithos target(s) and idempotent import receipts. Do not change production env or enqueue a run without the deployment owner’s operational approval.
3. Diagnose POS coverage 502 and slow product/inventory reconciliation from service logs and bounded endpoint timings; complete source-ID and signed inventory reconciliation before enabling SKR writes.
4. Run the isolated test-store business acceptance matrix (sale, refund, register close, stocktake, transfer, purchase receipt, Shopfront sale, Xero CSV), then authorize stores one at a time.
5. Retire Odoo domain by domain only after each store passes reconciliation and has a documented rollback/read-only plan.

## Limitation

This session only used public health/OpenAPI and authenticated crawler GET endpoints. No durable jobs were queued, no sync was triggered, no POS write was made, and no Dokploy settings or database state were changed. The environment in use is identified as `postgres` in prior deployment evidence; it was not independently verified as a dedicated database in this session.
