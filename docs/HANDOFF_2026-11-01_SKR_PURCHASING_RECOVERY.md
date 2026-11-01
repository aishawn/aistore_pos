# SKR purchasing recovery — 2026-11-01

## Cause and change

The crawler is rebuilding history and currently returns successful empty supplier and purchasing snapshots. The directory treated these as complete, despite the durable Odoo source ledger retaining 109 suppliers and 2,355 orders (2,343 native purchase orders; 12 source records have no native order).

The read-only directory now reads company- and store-scoped durable source records, including archived supplier contacts and all source orders, then merges crawler additions/updates by source ID. A partial crawler cannot erase preserved history. If the crawler is unavailable, a nonempty durable ledger remains readable. Odoo errors remain visible; HTTP 401 enables existing frontend session recovery. No business data, imports, stock, or running history job was changed.

## Verification before release

- Node 24 TypeScript: PASS. Targeted ESLint: zero errors, one pre-existing effect-state warning.
- Four ledger unit tests and twelve route checks: PASS (empty/partial mirror, tenant scope, inactive suppliers, zero amounts, incomplete reads, session recovery, crawler outage).
- Actual read-only Odoo source-ID reconciliation against saved Shopfront snapshots: suppliers 109/109, orders 2355/2355; zero missing IDs; zero mismatches across reference/name, status, contacts, tax ID, supplier, date, lines and numeric total. Amount precision matches crawler Numeric(18,4).
- No local application build. Dokploy build and real browser acceptance are pending at commit time.

## Limits

This restores purchasing visibility; it does not establish full-store synchronization. The crawler history rebuild remains running and 12 preserved orders lack native purchase orders. Shared aipos_uat remains the deployment database; formal production readiness is unchanged.
