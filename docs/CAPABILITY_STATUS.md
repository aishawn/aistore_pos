# Orithos POS — capability status

**Last updated:** 2026-10-13 (pilot UAT plus settings migration in working tree; not yet deployed)
**Source of truth for business data:** Odoo (via `pos-ui` `/api/odoo/*`).  
Classic Spring/MySQL POS remains in-repo as **reference only** (hidden from sidebar unless `NEXT_PUBLIC_SHOW_CLASSIC_POS=true`).

Statuses:

| Status | Meaning |
|---|---|
| **Accepted** | Implemented against Odoo and suitable for pilot acceptance testing |
| **In progress** | Code present; needs field validation or incomplete edge cases |
| **Planned** | Documented product intent; not a pilot commitment |

## Register & sales

| Capability | Status | Notes |
|---|---|---|
| Open sell screen (Odoo products / scan / cart) | Accepted | `/` → `OdooRegisterPage`. 2026-10-13: session `orithos_store1/00003` open; demo wines searchable with stock; add-to-cart + pack sizes OK. Checkout not exercised on production (no approved test sale). |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced |
| Checkout with GST + cash rounding | Accepted | Uses Odoo tax + register rounding; live finalise deferred until an approved test order |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | Accepted | Negative qty checkout + `refundOfOrderId`; live refund deferred |
| Close register (Odoo session) | Accepted | `/close` → `action_pos_session_closing_control`. With open session, close UI is available; do not close the pilot test session unless finished UAT |
| Manage Cash | Planned | Sidebar entry removed in upcoming deploy; deep-link page shows Coming soon (no Odoo writes) |
| Credit sales / multi-tender split | Planned | |
| Offline-first sell | Planned | Competitor hard requirement; deferred |

## Stock & purchasing

| Capability | Status | Notes |
|---|---|---|
| Product catalogue (Odoo) | Accepted | `/products/odoo` shows DEMO wines with on-hand 12 after test stock prep |
| Supplier directory (Odoo, read-only) | In progress | `/suppliers/odoo` loads; production partner data still thin |
| Purchases / RFQ list | Accepted | `/purchases/odoo` shell + Odoo list API |
| Explainable replenishment suggestions | Accepted | Rules-based velocity; row-level reasons |
| Approve → draft RFQ (human gated) | Accepted | Never auto-confirms PO |
| Replenishment approval audit | In progress | Browser-local audit of suggested vs ordered |
| Supplier invoice OCR → receive draft | In progress | OCR preview only when AI enabled; Classic MySQL save is **blocked** — use Odoo Purchases / Replenishment |
| Banner / buyer-group price files | Planned | |

## Reporting & AI

| Capability | Status | Notes |
|---|---|---|
| Odoo reporting dashboard | Accepted | `/reports/dashboard` loads under Orithos login |
| Cashier assistant / NL reports | In progress | Spring Graph; requires Dokploy `AI_ENABLED` + DashScope key |
| Wine / sommelier assistant | In progress | Code now prefers Odoo catalogue when `ODOO_SERVICE_*` is set on backend; still disabled until AI flag + service account deploy |
| Video loss-prevention AI | Planned | Explicitly post-MVP |

## Ops / integration

| Capability | Status | Notes |
|---|---|---|
| Odoo manual connect | Accepted | Integrations Connected as `yu18888xiao@gmail.com` |
| Odoo session auto-recover | In progress | Code shipped (`6e8df73`); **Dokploy must still set** `ODOO_SERVICE_USERNAME` / `ODOO_SERVICE_PASSWORD` then Redeploy. Verified missing today (`user:null` after DELETE). Integrations UI will show recover status after next deploy |
| Deploy currency (`83bdafb`+) | Accepted | Production shows **Open Odoo POS** on closed-register empty state |

## Classic MySQL stack

| Capability | Status | Notes |
|---|---|---|
| Full Classic POS modules | Reference | Do not pilot as writable SoT |
| Dual-write Classic ↔ Odoo | Not planned | Product design forbids dual SoT |

## How to read README vs this file

- README may describe architecture and module maps.
- **Pilot promises and marketing copy must follow this tri-state table.**
- Prefer saying “In progress” over implying Accepted when field acceptance has not run.

## 2026-10-13 UAT notes (no production sale)

- Test stock: DEMO-SB-2024 and DEMO-SHIRAZ21 set to **12** via `scripts/prepare-odoo-test-session.mjs`.
- Test session: `orithos_store1/00003` left **opened** for further checkout UAT.
- Confirmed: search/categories, add line, pack factor UI, park/discard.
- Not done on purpose: Finalise sale, refund, cash adjust, purchase confirm, close session.


## Store setup and account administration

| Capability | Status | Notes |
|---|---|---|
| Odoo session integration | In progress | Manual connection works; production auto-recover is off. |
| Users / roles | In progress | `/settings/users` production page is a generic editor placeholder; roles page reported 0 records. Parallel invite/reset changes are uncommitted and not production-verified. |
| Payment / tax / outlet / register setup | In progress | Current local changes replace payment/tax/outlet/register mock CRUD with allowlisted Odoo read-only views. Typecheck + targeted ESLint passed; changes are uncommitted and not deployed/visually verified. Until deployment, production still shows local/demo values; do not treat them as live Odoo configuration. |
| Receipt / hardware setup | In progress | Production pages previously showed local/demo settings. Still needs a decision: migrate to Odoo-backed data where supported or explicitly label/disable as local terminal configuration. |
