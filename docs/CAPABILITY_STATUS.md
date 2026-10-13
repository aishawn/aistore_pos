# Orithos POS — capability status

**Last updated:** 2026-10-13 (production API sale/refund, close/reopen UAT; browser interaction remains unverified)
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
| Open sell screen (Odoo products / scan / cart) | In progress | `/` → `OdooRegisterPage`. Production API UAT confirmed DEMO wine orders and inventory updates; browser-level visual/button testing still unverified because the in-app browser CDP focus call times out. |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced |
| Checkout with GST + cash rounding | In progress | Production Card and Cash sale/refund API UAT recorded correct Odoo payment, GST, order and inventory amounts. `55334f4` is deployed: refund API returned the matching independent negative Odoo order ID/receipt. Browser-level checkout and receipt presentation remain unverified. No POS pricelist is configured. |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | In progress | Odoo created independent refunds and marked original lines fully refunded; API response ID/receipt was production-verified against refund order 8. Browser history/detail/refund interactions still unverified. |
| Close register (Odoo session) | In progress | Production API closed test session `00003` with zero cash balance/difference. An empty session `00004` was opened afterward to restore POS availability. Browser close flow still unverified. |
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

- With the owner-authorized test session `orithos_store1/00003`, four one-bottle DEMO sales were created and each was fully refunded: Card Sauvignon Blanc `$26.00 + $2.60 GST = $28.60`, and three Cash Shiraz orders `$34.90 + $3.49 GST = $38.39` each. No live card terminal or drawer was involved; these validate Odoo POS accounting records only.
- Odoo created eight separate paid orders (sale IDs 1, 3, 5, 7; refund IDs 2, 4, 6, 8). Refund totals/GST are negative, each original order line has `refunded_qty=1`, and final on-hand/free stock is 12 for both wines. Reporting showed net revenue `$0.00`, net tax `$0.00`, eight transactions.
- The initial refunds exposed a response bug: Orithos returned the original sale ID although Odoo created a separate refund. Commit `55334f4` finds the order by UUID within the same company/register/session. After deployment, the production refund response returned ID 8 and receipt `260-1-000008`, matching the separate Odoo refund order and payment `-$38.39`; inventory remained 12. Typecheck, targeted ESLint and diff check passed.
- Test session `orithos_store1/00003` closed successfully with opening cash `$0.00`, closing cash `$0.00`, difference `$0.00`, and eight posted orders (sales/refunds net to zero). To restore availability, empty session `orithos_store1/00004` was created/opened with opening cash `$0.00` and zero orders. Current register is open; no cash count adjustment was written.
- 19 production page routes returned HTTP 200 under an authenticated Orithos session, and auto-recovery remained enabled. This is route availability only, not visual or interactive acceptance. The in-app browser still times out at `Emulation.setFocusEmulationEnabled`; no AI calls or purchase confirmation were performed.


## Store setup and account administration

| Capability | Status | Notes |
|---|---|---|
| Odoo session integration | In progress | Manual connection works; production auto-recover is off (`autoRecoverConfigured:false`). `5782acf` requires an authenticated Orithos session for Odoo APIs, clears the Odoo cookie on Orithos logout, and refreshes/retries Odoo API calls after an Orithos 401. Typecheck + targeted ESLint passed; Dokploy Done; production logout regression now returns 401 and clears the Odoo cookie. |
| Users / roles | In progress | `/settings/users` production page is a generic editor placeholder; roles page reported 0 records. Parallel invite/reset changes are uncommitted and not production-verified. |
| Payment / tax / outlet / register setup | In progress | Commit `de61b96` replaces payment/tax/outlet/register mock CRUD with allowlisted Odoo read-only views. Dokploy Done; page routes and deployed module markers verified; Odoo API returned 1 company/register, 2 products, 11 sales taxes. Visual interaction checks remain pending; auto-recover is still off. |
| Receipt / hardware setup | In progress | `ce3cfe8` removes the unverified Epson/drawer/receipt defaults and fake Save action. Pages now show that device status, receipt printing and email delivery are not configured/verified. Actual printer/drawer integration and receipt rendering remain unimplemented. |
