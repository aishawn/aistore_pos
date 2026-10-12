# Orithos POS — capability status

**Last updated:** 2026-10-13  
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
| Open sell screen (Odoo products / scan / cart) | Accepted | `/` → `OdooRegisterPage` |
| Park / resume sale (terminal localStorage) | Accepted | Not server-synced drafts |
| Checkout with GST + cash rounding | Accepted | Uses Odoo tax + register rounding |
| Pricelist rules & customer pricelist | In progress | Resolved via Odoo `_get_product_price` / `_compute_price_rule`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines |
| Full-sale refund from history | Accepted | Negative qty checkout + `refundOfOrderId` |
| Close register (Odoo session) | Accepted | `/close` → `action_pos_session_closing_control` |
| Credit sales / multi-tender split | Planned | |
| Offline-first sell | Planned | Competitor hard requirement; deferred |

## Stock & purchasing

| Capability | Status | Notes |
|---|---|---|
| Product catalogue (Odoo) | Accepted | `/products/odoo` |
| Purchases / RFQ list | Accepted | `/purchases/odoo` |
| Explainable replenishment suggestions | Accepted | Rules-based velocity; row-level reasons |
| Approve → draft RFQ (human gated) | Accepted | Never auto-confirms PO |
| Replenishment approval audit | In progress | Browser-local audit of suggested vs ordered |
| Supplier invoice OCR → receive draft | In progress | Spring AI path; optional when AI enabled |
| Banner / buyer-group price files | Planned | |

## Reporting & AI

| Capability | Status | Notes |
|---|---|---|
| Odoo reporting dashboard | Accepted | `/reports/dashboard` |
| Cashier assistant / NL reports | In progress | Spring Graph; requires `AI_ENABLED` |
| Wine / sommelier assistant | Planned (pilot demote) | Code exists; not P0 vs replenishment |
| Video loss-prevention AI | Planned | Explicitly post-MVP |

## Classic MySQL stack

| Capability | Status | Notes |
|---|---|---|
| Full Classic POS modules | Reference | Do not pilot as writable SoT |
| Dual-write Classic ↔ Odoo | Not planned | Product design forbids dual SoT |

## How to read README vs this file

- README may describe architecture and module maps.
- **Pilot promises and marketing copy must follow this tri-state table.**
- Prefer saying “In progress” over implying Accepted when field acceptance has not run.
