# Test Session: 2026-11-09 Demo migration diff + partial receive

| Field | Value |
|---|---|
| Session ID | `2026-11-09-demo-migration-partial-receive` |
| Environment | Online Demo `https://demo.orithos.com.au` + PostgreSQL `postgres` |
| Runtime SHA | `f858bbbfde44aee3ec28907440306cad0877a8dd` |
| Business writes | Yes — create purchase order, seed one line, two partial receipts (Demo UAT tenant) |

## Migration diff (Demo Orithos vs Shopfront SKR catalogue)

| Metric | Demo Orithos | Shopfront reference |
|---|---|---|
| Sellable products (search / SQL) | 1 | ~10,849 active source products (prior SKR source sessions) |
| Inventory rows (outlet 1) | 1 | ~10,852 source inventory rows (prior sessions) |
| Native purchase orders before UAT | 0 | n/a (Shopfront PO archive is mirror-only) |
| Suppliers visible to Demo | 3 | Shopfront supplier archive separate |

Verdict: Demo remains a seed ledger. Catalogue parity for SKR cutover is **not** met; Shopfront→Orithos import must load the ~10849 catalogue before SKR native write cutover.

## Partial receive results

| Check | Result | Notes |
|---|---|---|
| `POST /api/orders` create | PASS | Order `#1` / `UAT-PO-1794203903848` after `include_freight` smallint fix |
| Seed order line qty 4 cases | PASS | `order_product` id `1`, product `1` |
| First partial receive qty 1 | PASS | Receipt `#1`, status `PARTIALLY_RECEIVED` |
| Idempotent replay same key | PASS | Same `receiptId`, `replayed=true` |
| Second partial receive qty 1 | PASS | Receipt `#2`, received qty now `2`, still `PARTIALLY_RECEIVED` |

Machine evidence: [2026-11-09-demo-migration-partial-receive.json](./2026-11-09-demo-migration-partial-receive.json)

## Follow-up

- Flip crawler `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos` only after this session (same store key feeds Demo + SKR hosts).
- Do not enable SKR on `NativePosGate` until Orithos holds reconciled ~10849 products/stock.
