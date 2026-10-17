# Store admin P0 — stocktake, receive, Manage Cash (Odoo scope)

**Host:** `{slug}.orithos.com.au` (pilot: `demo.orithos.com.au`)  
**SoT:** Odoo only (no Classic MySQL writes)  
**Scope decision:** [ADMIN_GAP_SCOPE.md](ADMIN_GAP_SCOPE.md)  
**Build after / alongside:** platform P0; still respect roadmap — do not ship Marketing/Gift cards before these.

## Goal

Give a liquor store owner three daily ops surfaces that today are Classic-only or stubs:

1. **Stocktake / inventory adjustment**
2. **Purchase receive** (and credit-note path boundaries)
3. **Manage Cash** (cash in/out while session open) + keep **Close Register** cash count as the end-of-day path

## Current baseline

| Area | Pilot today | Classic reference |
|---|---|---|
| Stocktake | Not in sidebar; no Odoo BFF | [pos-ui/docs/STOCKTAKES.md](../pos-ui/docs/STOCKTAKES.md), `/stocktake*`, Express/External |
| Purchases | List + detail + confirm RFQ; receipts listed read-only with deep link to Odoo | Classic `/orders/receive/*` |
| Manage Cash | `/manage-cash` implemented | Odoo cash in/out on an open POS session; see [CAPABILITY_STATUS.md](CAPABILITY_STATUS.md) and the isolation UAT evidence |
| Close register | Counted cash required when cash method enabled | `/api/odoo/session/close` |

---

## 1. Stocktake / inventory adjustment

### Product choice (pilot)

Ship **one** path first: **Express-style count → apply variance to Odoo**, not the full Classic Advanced + External suite.

| Mode | In P0? | Notes |
|---|---|---|
| Express count (scan/search, qty) | **Yes** | Primary UX for bottle shops |
| Advanced named stocktake with expected qty toggle | Phase 2 | Can reuse Classic UI patterns later |
| External CSV import | Phase 2 | Keep Classic pages hidden |
| Blind count (hide expected) | Optional toggle in P0 if cheap | Default: show Odoo `free_qty` / warehouse qty |

### Odoo models & operations

| Step | Odoo model / API | Orithos behaviour |
|---|---|---|
| Resolve warehouse / location | `stock.warehouse` / `stock.location` via POS config or company stock location | Fail closed if location ambiguous; no write across companies |
| Read on-hand | `product.product` `qty_available` / `free_qty` with `location` context, or `stock.quant` | Same company scope as other Odoo BFF routes (`allowed_company_ids`) |
| Draft adjustment | Prefer **`stock.quant` inventory mode** or **`stock.inventory` / adjustment** depending on Odoo version on `aipos` | **Spike required** against live Odoo before coding writes — pin version in UAT JSON |
| Apply | Validate then apply; human confirm on variance summary | Never auto-apply from AI/OCR |

**Out of P0**

- Lot/serial for wine (unless Odoo already forces tracking — then block SKU with clear error)
- Multi-outlet transfer as part of stocktake
- Writing Classic `stocktake` MySQL tables

### UI / nav

- Route: `/stock/stocktake` (or `/stocktake/odoo` to mirror `/products/odoo`)
- Sidebar: under **Stock**, label **Stocktake**
- Flow: choose outlet/location → scan lines → review variance table (expected, counted, delta) → Confirm apply → show Odoo move/adjustment reference
- Permissions: store admin or role permission `stock.adjust` (add to roles UI if missing; until then admin-only)

### Acceptance

1. Count 1 DEMO/R2 SKU, apply −1, product list on-hand drops by 1 in Odoo and Orithos.
2. Cancel before apply leaves stock unchanged.
3. Failed Odoo session shows reconnect path (same as other `/api/odoo/*`).
4. Isolation DB only for first write UAT — not production `aipos` until store owner approves.

---

## 2. Purchase receive & credit notes

### Product choice (pilot)

Extend **Odoo Purchases** detail — do not revive Classic `/orders/receive/new` as writable SoT.

| Capability | P0 | Notes |
|---|---|---|
| View PO lines + `qty_received` | Done | [purchase-orders/[id]/route.ts](../pos-ui/app/api/odoo/purchase-orders/[id]/route.ts) |
| List related `stock.picking` + deep link | Done | Read-only |
| Confirm RFQ → PO | Done (POST confirm) | Explicit `confirm: true` |
| **Receive** from Orithos | **P0** | Validate picking / set done qty / `button_validate` |
| Partial receive | **P0** | Per-line qty ≤ remaining |
| Return / credit note create | **P1** | Keep guard pages; deep-link Odoo until scoped |
| Invoice OCR → receive draft | Stay In progress | Only when AI on; never Classic save |

### Odoo receive sequence (target)

1. Load PO; ensure `state` in `purchase` (ordered).
2. Load incoming pickings (`picking_type_code` = incoming) in `assigned` / `confirmed`.
3. For each move: set `qty_done` (or equivalent for Odoo version).
4. Call `button_validate` on `stock.picking`; handle backorder wizard if Odoo returns action (either create backorder or refuse partial with message — **pick one** in spike; prefer create backorder for partial).
5. Refresh detail; `qty_received` and receipt badges update.

**API sketch**

```
POST /api/odoo/purchase-orders/{id}/receive
Body: {
  confirm: true,
  pickingId?: number,          // optional if single open picking
  lines: [{ moveId: number, qtyDone: number }]
}
```

### UI

- On purchase detail: primary button **Receive stock** when open incoming picking exists.
- Modal: editable qty per line (default = remaining); confirm.
- Show success with picking name; keep “Open in Odoo” link for exceptions.

### Acceptance

1. Draft RFQ → confirm → receive full qty → stock increases; PO receipt status full/partial correct.
2. Partial receive creates consistent Odoo state (backorder or documented limitation).
3. Guard: no receive without `confirm: true`; wrong company → 403/404.
4. Classic receive routes remain non-SoT (no dual write).

---

## 3. Manage Cash + close-register relationship

### Distinction

| Flow | When | Odoo target |
|---|---|---|
| **Manage Cash** | Session **open**, mid-shift | Cash in / cash out on open `pos.session` |
| **Close Register** | End of shift | Already writes `cash_register_balance_end_real` then closing control |

Do **not** replace Close Register with Manage Cash. Manage Cash is float adjustments; Close is reconciliation.

### Manage Cash P0

**UI:** `/manage-cash` now provides the mid-shift cash in/out flow under **Register → Manage Cash**. Keep the end-of-day counted cash path on **Close Register**.

**Fields:** direction (`in` \| `out`), amount (AUD > 0), optional reason string (stored in Odoo note if supported).

**Odoo spike options** (pick one after probing `aipos`):

1. `pos.session` methods such as `try_cash_in_out` / cash box wizard (version-dependent), or
2. Create `account.bank.statement.line` / cash move linked to session if exposed, or
3. If no safe RPC: keep stub but add **honest** “Open cash in Odoo POS” deep link — **only acceptable as interim**, not as “Accepted”.

**Rules**

- Require open session from POS bootstrap (`configId` + session id).
- Reject when session not `opened`.
- Amounts rounded to cents; cash-out cannot exceed drawer without explicit override (default: block).
- All writes audited in UI toast with session name + timestamp.

### Close Register (ops, not new page)

- Already requires counted cash when cash payment method present.
- P0 ops checklist: document storeowner procedure in pilot readiness; the UI/API path is implemented, but repeat the cash in/out plus close sequence on an approved **isolation** DB before pilot acceptance.
- No UI redesign required beyond ensuring Manage Cash and Close do not double-count.

### Acceptance

1. Cash in $50 → Odoo session / cash statement reflects +50 (evidence screenshot + RPC ids).
2. Cash out blocked when it would drive drawer negative (or override logged).
3. Close still requires count; closing without count → 422.
4. Stub copy removed once write path Accepted.

---

## Shared constraints

- **Company scope:** every RPC uses the same `allowed_company_ids` pattern as existing Odoo BFF.
- **No Classic dual-write.**
- **Human confirm** on every stock or cash write.
- **AI off:** stocktake/receive must work with AI disabled.
- **Sidebar:** only add the three nav entries above; do not re-enable Classic Stock More hub in production.

## Suggested build order (store)

1. Purchase **receive** write (extends existing detail; highest reuse)
2. **Express stocktake** (largest remaining new surface)
4. Nav + capability status updates + UAT JSON on isolation Odoo

## Explicit non-goals until P1

Promotions, gift cards, customer balances/AR, shelf tickets, multi-tender, offline sell, SMTP productization beyond copy-link.
