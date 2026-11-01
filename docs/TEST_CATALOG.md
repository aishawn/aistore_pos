# Test Catalog

This is the stable list of test suites. It defines what should be tested and where the detailed evidence belongs. It is not a record of the latest pass/fail result.

## Result vocabulary

- `PASS`: expected behavior and required evidence are present.
- `BLOCKED`: environment, account, data, provider, or deployment identity prevented a valid check.
- `FAIL`: the checked behavior contradicts the expected behavior.
- `INFO`: an observation that is not an acceptance result.
- `NOT RUN`: the check was not executed in the session.

Every session report must also state: source SHA, runtime SHA if online, environment, read/write scope, and evidence file paths.

## Suite catalog

| ID | Suite | Scope | Default environment | Write policy | Main evidence |
|---|---|---|---|---|---|
| REL-001 | Release identity | Source/build/frontend/backend/runtime SHA | Dokploy | None | `UAT_RELEASE_IDENTITY_*.json` |
| UI-001 | Static route matrix | Routes, HTTP status, page errors, overflow, fixed controls | Local fixture or online read-only | Fixture writes only | `UAT_*STATIC*ROUTE*.json` |
| UI-002 | Responsive interaction | 320/390/768/1024/1440px, forms, dialogs, retries | Local fixture | No real writes | Feature-specific UAT JSON and screenshots |
| POS-001 | Checkout | Cart, payment, receipt, duplicate submit, recovery | Isolated or owner-approved `aipos_uat` | Real transaction write | `UAT_POS_CHECKOUT*.json` |
| POS-002 | Refund | Original order, amount, tax, stock, audit | Isolated or owner-approved `aipos_uat` | Real transaction write | `UAT_*REFUND*.json` |
| POS-003 | Register close | Cash/card totals, difference, close/reopen, retry | Isolated or owner-approved `aipos_uat` | Real cash/register write | `UAT_*REGISTER*CLOSE*.json` |
| INV-001 | Stock and stocktake | Search, quantity, concurrent update, idempotent retry | Local read-only, then approved write target | Stock write only in approved scope | `UAT_*STOCK*.json` |
| PUR-001 | Purchase and receiving | Supplier, partial/over receipt, retry, reconciliation | Approved Odoo target | Purchase/receipt write | `UAT_*PURCHASE*RECEIV*.json` |
| PRC-001 | Pricing | GST, cost, margin, stale price, POS read-back | Approved Odoo target | Price write after review | `UAT_*PRIC*.json` |
| CUS-001 | Customers and groups | CRUD, roles, pagination, search race, tenant scope | Local fixture, then approved Odoo target | Role-controlled writes | `UAT_*CUSTOMER*.json` |
| TEN-001 | Tenant and platform authorization | Host, bootstrap, platform/store roles, cross-tenant denial | Online or dedicated UAT | Controlled platform writes | `UAT_*TENANT*`, `UAT_*AUTH*` |
| RPT-001 | Reports and overview | Business date, timezone, refunds, totals, empty/error states | Online read-only | None | `UAT_*REPORT*.json` |
| AI-001 | Assistant routing | Intent, routes, clarification, safe unknowns | Online read-only or fixture | No business writes | `UAT_AI_WORKFLOW*.json` |
| AI-002 | AI provider features | Availability, OCR, voice, sommelier, provider errors | Online with configured provider | Preview/read-only by default | `UAT_AI_FEATURES*.json` |
| AI-003 | AI write safety | Guided actions, confirmation, no automatic writes | Fixture then approved target | Explicit confirmation only | `UAT_AI_*SAFETY*.json` |
| OPS-001 | Backup and recovery | Backup, restore, retry, runtime recovery | Dedicated operational environment | Controlled operational writes | `UAT_*BACKUP*`, `UAT_*RECOVER*` |
| R2-001 | R2 archive | Archive read, manifest, dry run, import reconciliation | R2 / approved TEST only | Import only when approved | `UAT_*R2*.json` |

## Adding a test

Add a stable suite or case here only when the behavior is reusable across sessions. Put a one-off check in the session report and keep its raw output in a dated `UAT_*.json` artifact.

