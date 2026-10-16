# Isolation Odoo UAT runbook (Phase 1)

**Purpose:** Prove sell → refund → stock restore on an **isolated** Odoo database before production `aipos` write UAT.

## Prerequisites

| Item | Requirement |
|---|---|
| Odoo DB | Dedicated DB (recommended name `aipos_uat`) **or** a dedicated TEST company the store owner approved |
| Env | `ODOO_DATABASE` on the UAT runner must equal `ISOLATION_ODOO_DATABASE` |
| Catalog | Seeded products with verified GST/price (or a small DEMO set) |
| Session | Open POS session on that DB/company |
| Creds | Pilot admin password in `.env` (`INITIAL_ADMIN_PASSWORD`); never commit secrets |

## Cold history policy

- Shopfront / R2 historical receipts stay on **R2** (read-only archive).
- Production tenants must **not** bulk-import ~150k historical `pos.order` rows.
- Demo-only historical import scripts remain opt-in (`scripts/import-r2-sales-receipts.py --apply`) and must target TEST only.

See [R2_COLD_HISTORY_POLICY.md](R2_COLD_HISTORY_POLICY.md).

## Run

```bash
# PowerShell
$env:ISOLATION_ODOO_DATABASE = "aipos_uat"
$env:ODOO_DATABASE = "aipos_uat"
$env:PILOT_BASE_URL = "https://demo.orithos.com.au"   # or local tenant host
node scripts/pilot-isolation-write-uat.mjs
```

The script **exits non-zero** if `ODOO_DATABASE` ≠ `ISOLATION_ODOO_DATABASE`, so it cannot silently hit production `aipos`.

## Acceptance

1. One Card + one Cash sale complete with receipt numbers.
2. Full refund of both sales; on-hand quantities restore.
3. Evidence written to `docs/UAT_ISOLATION_WRITE_<date>.json` with `database`, `isolationGate: pass`, receipt ids, and stock before/after.
4. No Classic MySQL stock/order writes.

## After PASS

Update [PILOT_RELEASE_READINESS.md](PILOT_RELEASE_READINESS.md) P0 rows for sales/refund reconciliation. Close-register and purchase receive remain separate evidence items.
