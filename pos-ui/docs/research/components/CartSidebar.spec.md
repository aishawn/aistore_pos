# CartSidebar Specification

## Overview
- **Target file:** `src/components/CartSidebar.tsx`
- **Screenshot:** `docs/design-references/desktop-fullpage.png` (right column), `mobile-390.png` (bottom block)
- **Interaction model:** static (empty-cart state). Finalise button has `cursor:pointer`.

## DOM Structure
```
div.cart (relative, w 419px, thin 0.667px black border)        ← outer column wrapper
└── div (flex, column, fills height)
    ├── div.add (h75, flex row, align-center)  → [+ icon] <h3>Add Customer</h3>   (bottom divider)
    ├── div.order-none (h0, empty)
    ├── div (flex:1, empty product list — grows to fill)
    ├── div.order-3 (h0, empty)
    └── div (relative, h~143)                  ← summary + finalise footer
        ├── div (flex row, h93)
        │   ├── div.sale-summary-basic  (w 209, pad 8, flex column, justify-center)
        │   │   → <p></p> · <p>0 Products</p> · <p>Savings: $0.00</p> · <p>Discount: $0.00</p>
        │   └── div.sale-summary-total  (w 209, pad 8, text-center)
        │       → <p>$0.00</p> (40px) · <p>Total</p> (24px, small-caps)
        └── button.Finalise (h50, full width)
```

## Computed Styles (exact values from getComputedStyle)

### Cart container (.cart)
- width: 419px (419.198px); position: relative; border: 0.667px solid rgb(0,0,0); height: fills (calc(100vh - 50px - 16px) inside p-2 row).
- font-family: Roboto; font-size: 16px; color: rgb(0,0,0); background: #fff.
- Inner wrapper: display:flex; flex-direction:column; height:100%.

### Add Customer row (.add)
- height: 75px; display:flex; flex-direction:row; align-items:center.
- **Bottom border divider** (visible hairline under the row): `border-bottom: 0.667px solid rgb(0,0,0)` → use `border-b border-black/100` thin. (Renders ~1px light line.)
- Plus icon `<i fal fa-plus>`: 20px×16px box, margin `0 8px 0 16px`, color black, thin. Use `PlusIcon` size ~18 strokeWidth 1.5.
- `<h3>Add Customer</h3>`: font-size 18.72px (~1.17rem); font-weight 700; color rgb(0,0,0).

### Product list (middle)
- An empty `flex: 1` div that grows to push the footer to the bottom. No content in empty-cart state. background #fff.

### Summary footer wrapper
- position: relative; contains the summary row (h93) then the Finalise button (h50).

### Summary row (flex row, h ~92.67px)
- Two equal halves, each width ~209px, padding 8px. Text color: `rgba(189,189,189,0.7)` (greyed — empty cart).

#### Left half (.sale-summary-basic)
- display:flex; flex-direction:column; justify-content:center; padding:8px.
- Lines (each `<p>`, font-size 16px, color rgba(189,189,189,0.7), line-height ~19px):
  - `0 Products`
  - `Savings: $0.00`
  - `Discount: $0.00`

#### Right half (.sale-summary-total)
- padding:8px; text-align:center; color rgba(189,189,189,0.7).
- `$0.00` total: font-size 40px. Rendered with the cents smaller/raised:
  - `$` and `0` at 40px, `.00` at ~24px top-aligned (superscript-style). Use spans:
    `<span class="text-[40px]">$0</span><span class="text-[24px] align-top">.00</span>`
- `Total` label: font-size 24px, **small-caps** → displays as "Tᴏᴛᴀʟ". Use `[font-variant:small-caps]`.

### Finalise button
- width: 100%; height: 50px; padding: 4px 8px; text-align:center.
- background-color: rgb(94,187,235); color: rgb(248,248,248).
- font-size: 32px; text is "Finalise" rendered **small-caps** → "Fɪɴᴀʟɪsᴇ". Use `[font-variant:small-caps]`.
- cursor: pointer.

## States & Behaviors
- Static. Finalise: `cursor:pointer`; subtle hover acceptable (none required). N/A animations.
- Empty-cart state: summary text is greyed via `rgba(189,189,189,0.7)`; "Savings"/"Discount" carry class `not-in-use` (still visible, just greyed).

## Text Content (verbatim)
- "Add Customer"
- "0 Products" / "Savings: $0.00" / "Discount: $0.00"
- "$0.00" / "Total"
- "Finalise"

## Assets
- Icons: `PlusIcon` from `src/components/icons.tsx`. No images.

## Responsive Behavior
- **Desktop (≥1024px):** fixed-width 419px column on the right; product list flex-1 fills; footer pinned to bottom.
- **Mobile (<1024px):** full width at the bottom of the page. The flex-1 product list collapses (no large fill); shows the Add Customer box, then the summary row, then the Finalise button stacked. In page.tsx the cart sits below the sell pad in a single column.
- **Breakpoint:** 1024px (`lg`).

## Implementation notes
- Presentational, static — no "use client" needed.
- Match border hairlines with thin black borders (`border-black`), which render light at 0.667px.
- The greyed summary uses one color token: `text-[rgba(189,189,189,0.7)]` (or `--sf-summary`).
