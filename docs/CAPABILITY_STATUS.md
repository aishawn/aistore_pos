# Orithos POS — capability status

**Last updated:** 2026-10-16 (tenant isolation: signup bootstrap token auto-login; Odoo provision creates per-store `res.company`; BFF forces company — no fail-open to demo catalog)
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
| Open sell screen (Odoo products / scan / cart) | Accepted | Browser UAT: session `orithos_store1/00004`, two DEMO wines, category filter Red/White only, quote `$28.60`, Finalise disabled until quote ready. 2026-10-16 refinement adds register context persistence, safe register switching, explicit product/customer search loading/error/retry states, delayed status for slow product/quote/checkout requests, cart-bound Retry quote after tax failure, offline protection, contextual POS recovery help, and a per-user/register active cart draft that survives refresh, expires after 24 hours, and is re-quoted by Odoo. Deployed via `997d404`/`8bb6d45`/`518e796`; online smoke confirmed normal restore and stale-draft discard. Commit `1ba41f6` distinguishes an initial Odoo/session read failure from an unauthenticated state and exposes Retry; normal and simulated-failure online smoke passed with no page errors. Full payment regression remains pending. |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced. Local 2026-10-16 refinement remembers the selected register and scopes parked sales to that register; requires deployment and browser regression. |
| Checkout with GST + cash rounding | Accepted | Browser Card (`260-1-000009` / `$28.60`) and Cash (`260-1-000010` / `$38.39`) Finalise on `00004`; on-screen Sale complete receipt shown; stock moved 12→11 then restored by refunds. No live card terminal or drawer. No POS pricelist configured |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | Accepted | Browser refund of this-round receipts `260-1-000009` and `260-1-000010`; Odoo independent refunds `000009 REFUND` / `000010 REFUND`; free qty back to 12. Refunded receipts now explain the prior refund and hide the duplicate full-refund action (app `1673384`). Sales history exports the currently visible Odoo rows as CSV and supports read-only status filters (completed, refunded, cancelled, draft) through a server allowlist; online authenticated smoke confirmed Export visible and Last refreshed. Commit `3ccff72` adds desktop/mobile first-load skeleton rows while preserving search, filters, Refresh, and archive context; delayed-read smoke passed with no page errors and no refund action submitted. |
| Close register (Odoo session) | In progress | Production `3c2618e` requires counted cash in both UI and API for cash-enabled registers; direct API request without count returns 422 before Odoo writes. Session `00004` remains open pending actual drawer count and reconciliation. `db959d5` now remembers the selected register per Odoo user, matching Sell; online authenticated smoke confirmed Sell and Close both selected register `1`, with cash count and review controls present. Commit `e2e1812` adds a layout-preserving first-load skeleton; commit `3b19090` adds an AUD denomination counter that feeds the existing counted-cash value. Online `/close` smoke confirmed all 11 denomination controls and `$25.00` aggregation without submitting close. |
| Manage Cash (Odoo cash in/out) | Accepted | Live write on `orithos_store1/00004` via `/api/odoo/session/cash` + UI (`5fa78d5`); commit `2000ad0` adds a layout-preserving first-load skeleton and a real error/Retry state when bootstrap cannot be read. Online normal and simulated-failure smoke passed; no cash write was performed in this pass. Odoo 18 `try_cash_in_out` with partner/extras |
| Purchase receive (Odoo) | In progress | API + UI gates OK (401/404); no open PO on demo — full receive write UAT still needs isolation PO data |
| Credit sales / multi-tender split | Planned | |
| Offline-first sell | Planned | Competitor hard requirement; deferred |

## Stock & purchasing

| Capability | Status | Notes |
|---|---|---|
| Product catalogue (Odoo) | Accepted | `/products/odoo` shows DEMO wines; browser matrix re-check after hydrate shows SKUs and on-hand 12. The catalogue shows the last successful refresh time and labels retained rows as potentially stale when a refresh fails; online authenticated smoke confirmed Last refreshed. Commit `036580c` adds desktop/mobile first-load skeleton rows while preserving search and refresh controls; delayed-read smoke passed with no page errors or write action. |
| Supplier directory (Odoo) | In progress | `/suppliers/odoo` reads Odoo suppliers and now supports user-submitted company contacts with ABN duplicate blocking; commit `1333b3b` adds desktop/mobile first-load skeletons while preserving search and Refresh. Odoo `fields_get` confirmed writable fields and intercepted production browser UAT passed. No live supplier was created; permission and supplier-specific Odoo validation still need a real distributor entry |
| Purchases / RFQ list | Accepted | `/purchases/odoo` shell + Odoo list API; commit `6a8a393` adds layout-preserving first-load skeleton rows and keeps search/status controls visible while reads are pending. Online delayed-read smoke passed without exposing or submitting write actions. |
| Explainable replenishment suggestions | Accepted | Rules-based velocity; row-level reasons |
| Approve → draft RFQ (human gated) | Accepted | Never auto-confirms PO |
| Replenishment approval audit | In progress | Deployed code writes forecast method, cover target, suggested/ordered quantities and reasons as an internal Odoo chatter note (not supplier-facing terms); zeroed suggestions remain in the audit but are excluded from PO lines. Production schema and UI mock pass; live RFQ/message write is unverified pending an approved vendor/sample |
| Supplier invoice OCR → receive draft | In progress | OCR preview only when AI enabled; Classic MySQL save is **blocked** — use Odoo Purchases / Replenishment |
| Banner / buyer-group price files | Planned | |

## Reporting & AI

AI remains disabled in production. The tenant report database account has no source-controlled default password; configuring `AI_REPORT_RO_PASSWORD` is required before outlet report access can be provisioned.

| Capability | Status | Notes |
|---|---|---|
| Odoo reporting dashboard | Accepted | `/reports/dashboard` browser UAT pass; 2026-10-16 refinements add a layout-preserving skeleton, retryable first-load and refresh failure states, explicit data-through vs loaded timestamps, and hide comparisons on low prior-period baselines. Commit `83815f2` is deployed and authenticated read-only smoke passed. |
| Cashier assistant / NL reports | In progress | Spring Graph; report permissions now resolve from the active DB role on every request (`8721a08`); 113 Java 21 build tests pass. Production AI remains disabled until budget, so no live report call UAT yet |
| Wine / sommelier assistant | In progress | Odoo remains authoritative even when its response is empty, preventing stale Classic MySQL fallback; page copy no longer claims AI is doing deterministic matching. Recommendation/detail price and free-stock parity passed 6/6 production read-only checks on `da508ce`; see `docs/UAT_SOMMELIER_REGRESSION_2026-10-13.json`. Still not verified against register-specific warehouse context or tax/pricelist customer totals. Image recognition and model-backed behavior remain off/unverified. |
| Video loss-prevention AI | Planned | Explicitly post-MVP |

## Ops / integration

| Capability | Status | Notes |
|---|---|---|
| Odoo manual connect | Accepted | Manual Connect remains available |
| Odoo session auto-recover | Accepted | Production `autoRecoverConfigured:true`; cookie removal recovers Replenishment on first request, and an already-open Products page recovers/retries its read-only records POST after Refresh. Only safe reads replay after recovery; checkout, RFQ, product/customer writes and close are never replayed. POS session `00004` remains open — `docs/UAT_ODOO_AUTORECOVER_2026-10-13.json` (6/6) |
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

- Deployed app commit `effcb7e` (includes cash-count close guard, AI report credential hardening, role permissions, honest company/Sale Keys status pages, and duplicate-refund status explanation).
- Page matrix evidence: `docs/UAT_PAGE_MATRIX_2026-10-13.json` (24/24 routes pass after waiting for Odoo catalogue hydration; the inventory assertion now matches the displayed `12Units` format).
- Role CRUD evidence: production UI created a temporary role, selected `AI Report Cost`, showed the saved grant in the role list, and deleted the role. API confirmed the grant; no test role remains. Earlier leftover `Pilot Clerk 344840` was also removed.
- Odoo auto-recovery regression: after production Odoo session DELETE, navigating directly to Replenishment restored the session through its first data request, without visiting Integrations or pressing Connect; POS bootstrap returned `orithos_store1/00004` as opened. After Orithos logout, anonymous Odoo session GET returned 401.
- Interaction evidence: `docs/UAT_INTERACTION_2026-10-13.json` records 8/8 passing read-only interactions, including refunded receipt `260-1-000009` showing prior-refund status and no duplicate full-refund action, catalogue search/edit prefill, form guards, CSV preview/cancel, replenishment coverage, and reporting range change. No product/customer, sale, RFQ, refund, or register-close write was performed in this pass.
- Operations evidence: `docs/UAT_OPS_READONLY_2026-10-13.json` confirms connected auto-recovery status, direct close API rejection without counted cash, session `00004` still open, and the purchase status filter. No draft RFQs currently exist, so purchase detail/receipt viewing remains unverified; no purchase or close write was performed.
- Write evidence: Card `$28.60` receipt `260-1-000009`, Cash `$38.39` receipt `260-1-000010`, refunds created, stock restored to 12/12 — `docs/UAT_WRITE_2026-10-13.json`.
- AI remained off; SMTP still unconfigured (invite/reset copy-link path verified in UI copy).
- Session `orithos_store1/00004` left **opened** after net-zero this-round sales/refunds.
