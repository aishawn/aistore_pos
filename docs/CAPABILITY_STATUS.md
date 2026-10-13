# Orithos POS — capability status

**Last updated:** 2026-10-13 (production sale/refund API UAT; refund response ID fix awaits deployment verification)
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
| Open sell screen (Odoo products / scan / cart) | Accepted | `/` → `OdooRegisterPage`. Production API UAT confirmed DEMO wine orders and inventory updates; browser-level visual/button testing still unverified because the in-app browser CDP focus call times out. |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced |
| Checkout with GST + cash rounding | In progress | Production Card and Cash sale/refund API UAT recorded correct Odoo payment, GST, order and inventory amounts. Refunds create separate negative Odoo orders, but the deployed Orithos response still returns the original sale ID; `55334f4` fixes lookup by refund UUID and awaits deployment verification. Browser-level checkout and receipt presentation remain unverified. No POS pricelist is configured. |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | In progress | Odoo created independent refunds and marked original lines fully refunded; `55334f4` fixes the response ID/receipt mismatch. Production must verify the deployment before treating refund UI as accepted. |
| Close register (Odoo session) | In progress | `/close` → `action_pos_session_closing_control`; live test-session close and final reconciliation remain unverified |
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
| Odoo session auto-recover | Accepted | Production login automatically connects as Odoo Administrator; `autoRecoverConfigured:true`. Cookie invalidation recovery and post-logout rejection were verified on 2026-10-13. |
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
- A Card attempt after deployment failed before order creation with Odoo 20 `int` / `_origin` error during tax computation. Sales History remained empty; the DEMO stock stayed unchanged. The error was traced to passing IDs for optional Odoo recordset arguments. A server-side quote endpoint and corrected tax call are in the working tree; deploy and verify the quote is `$28.60` total (`$26.00` subtotal + `$2.60` GST) before retrying any sale.

## 2026-10-13 production transaction UAT update

- With the owner-authorized test session `orithos_store1/00003`, three one-bottle DEMO sales were created and each was fully refunded: Card Sauvignon Blanc `$26.00 + $2.60 GST = $28.60`, Cash Shiraz `$34.90 + $3.49 GST = $38.39`, and a second Cash Shiraz `$38.39`. No live card terminal or drawer was involved; these validate Odoo POS accounting records only.
- Odoo created six separate paid orders (sale IDs 1, 3, 5; refund IDs 2, 4, 6). Refund totals/GST are negative, each original order line has `refunded_qty=1`, and final on-hand/free stock is 12 for both wines. Reporting showed net revenue `$0.00`, net tax `$0.00`, six transactions, and one open register.
- Defect found: checkout API returned the original sale's ID/receipt for each successful refund, although Odoo had created a separate refund order. Commit `55334f4` now finds the synced order by UUID within the same company/register/session; typecheck, targeted ESLint and diff check passed. Production still returned the original sale ID in the first post-push retest, so the fix is **not yet verified live**. Do not mark refund flow accepted until the Dokploy deployment is confirmed and a production response points to the matching refund order.
- The test session remains open. No cash adjustment or register close was performed. Closing it would disable the only currently open POS register; reconcile and decide whether to close/reopen after refund-response verification.
- Browser visual interaction testing remains unverified because the current in-app browser tab operation times out at `Emulation.setFocusEmulationEnabled`; this is not a passing UI test. AI calls and purchase confirmation were not performed.


## Store setup and account administration

| Capability | Status | Notes |
|---|---|---|
| Odoo session integration | In progress | Manual connection works; production auto-recover is off (`autoRecoverConfigured:false`). `5782acf` requires an authenticated Orithos session for Odoo APIs, clears the Odoo cookie on Orithos logout, and refreshes/retries Odoo API calls after an Orithos 401. Typecheck + targeted ESLint passed; Dokploy Done; production logout regression now returns 401 and clears the Odoo cookie. |
| Users / roles | In progress | `/settings/users` production page is a generic editor placeholder; roles page reported 0 records. Parallel invite/reset changes are uncommitted and not production-verified. |
| Payment / tax / outlet / register setup | In progress | Commit `de61b96` replaces payment/tax/outlet/register mock CRUD with allowlisted Odoo read-only views. Dokploy Done; page routes and deployed module markers verified; Odoo API returned 1 company/register, 2 products, 11 sales taxes. Visual interaction checks remain pending; auto-recover is still off. |
| Receipt / hardware setup | In progress | Production pages previously showed local/demo settings. Still needs a decision: migrate to Odoo-backed data where supported or explicitly label/disable as local terminal configuration. |
