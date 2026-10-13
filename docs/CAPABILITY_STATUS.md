# Orithos POS — capability status

**Last updated:** 2026-10-13 (24-route matrix + role permission UI verification; production deploy `f2f16db`)
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
| Open sell screen (Odoo products / scan / cart) | Accepted | Browser UAT: session `orithos_store1/00004`, two DEMO wines, category filter Red/White only, quote `$28.60`, Finalise disabled until quote ready |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced |
| Checkout with GST + cash rounding | Accepted | Browser Card (`260-1-000009` / `$28.60`) and Cash (`260-1-000010` / `$38.39`) Finalise on `00004`; on-screen Sale complete receipt shown; stock moved 12→11 then restored by refunds. No live card terminal or drawer. No POS pricelist configured |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | Accepted | Browser refund of this-round receipts `260-1-000009` and `260-1-000010`; Odoo independent refunds `000009 REFUND` / `000010 REFUND`; free qty back to 12 |
| Close register (Odoo session) | In progress | API closed `00003` earlier; browser close UI verified for open `00004` but register left open after this-round net-zero UAT |
| Manage Cash | Planned | Not in pilot sidebar; deep-link `/manage-cash` is Coming soon (no Odoo writes) |
| Credit sales / multi-tender split | Planned | |
| Offline-first sell | Planned | Competitor hard requirement; deferred |

## Stock & purchasing

| Capability | Status | Notes |
|---|---|---|
| Product catalogue (Odoo) | Accepted | `/products/odoo` shows DEMO wines; browser matrix re-check after hydrate shows SKUs and on-hand 12 |
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
| Odoo reporting dashboard | Accepted | `/reports/dashboard` browser UAT pass |
| Cashier assistant / NL reports | In progress | Spring Graph; keep `AI_ENABLED=false` until budget |
| Wine / sommelier assistant | In progress | Routes load; AI kept off this round (no model calls) |
| Video loss-prevention AI | Planned | Explicitly post-MVP |

## Ops / integration

| Capability | Status | Notes |
|---|---|---|
| Odoo manual connect | Accepted | Manual Connect remains available |
| Odoo session auto-recover | Accepted | Production `autoRecoverConfigured:true`; login auto-connects as Administrator; cookie recovery and logout rejection previously verified |
| Deploy currency (`83bdafb`+) | Accepted | Production shows **Open Odoo POS** on closed-register empty state |

## Classic MySQL stack

| Capability | Status | Notes |
|---|---|---|
| Full Classic POS modules | Reference | Do not pilot as writable SoT |
| Dual-write Classic ↔ Odoo | Not planned | Product design forbids dual SoT |

## Store setup and account administration

| Capability | Status | Notes |
|---|---|---|
| Odoo session integration | Accepted | Auto-recover on; Orithos logout clears Odoo cookie / protected APIs return 401 |
| Users / roles | Accepted | `fe9b163`: role CRUD with permission checkboxes; users invite shows role select + SMTP copy-link messaging; production create/delete role exercised (cleanup deleted `Pilot Clerk *`) |
| Payment / tax / outlet / register setup | Accepted | Odoo read-only views; browser matrix pass |
| Company settings | Accepted | Honest status page (not connected to Odoo); live links to Integrations / Payment / Tax / Registers |
| Sale keys | Accepted | Honest status page; removed from pilot sidebar |
| Receipt / hardware setup | Accepted | Honest not-connected status pages; printer/drawer still unimplemented |

## How to read README vs this file

- README may describe architecture and module maps.
- **Pilot promises and marketing copy must follow this tri-state table.**
- Prefer saying “In progress” over implying Accepted when field acceptance has not run.

## 2026-10-13 browser UAT (session `00004`)

- Deployed app commit `f2f16db` (role list now displays actual assigned permissions; role permissions + honest company/sale-keys pages).
- Page matrix evidence: `docs/UAT_PAGE_MATRIX_2026-10-13.json` (24/24 routes pass after waiting for Odoo catalogue hydration; the inventory assertion now matches the displayed `12Units` format).
- Role CRUD evidence: production UI created a temporary role, selected `AI Report Cost`, showed the saved grant in the role list, and deleted the role. API confirmed the grant; no test role remains. Earlier leftover `Pilot Clerk 344840` was also removed.
- Odoo auto-recovery regression: production Odoo session DELETE followed by GET reconnected automatically; POS bootstrap returned `orithos_store1/00004` as opened. After Orithos logout, anonymous Odoo session GET returned 401.
- Write evidence: Card `$28.60` receipt `260-1-000009`, Cash `$38.39` receipt `260-1-000010`, refunds created, stock restored to 12/12 — `docs/UAT_WRITE_2026-10-13.json`.
- AI remained off; SMTP still unconfigured (invite/reset copy-link path verified in UI copy).
- Session `orithos_store1/00004` left **opened** after net-zero this-round sales/refunds.
