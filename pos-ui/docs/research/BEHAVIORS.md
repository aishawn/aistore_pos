# Behaviors — sea.onorithos.com (Sell screen)

The target URL resolves to the live **Orithos Point of Sale "Sell" screen** (a React SPA),
not a marketing page. We clone the static "empty cart" state as loaded.

## Interaction model
- **Overall:** Static single-screen app. No page scroll (main is `position:absolute`, fits viewport).
- **Sale key tiles:** `transition: background-color 0.2s ease-in-out`, `cursor: pointer` when enabled.
  Disabled tiles: `filter: brightness(0.5)` + `cursor: not-allowed`. (Disabled because cart is empty.)
- **No scroll-driven, time-driven, or carousel behavior.** No smooth-scroll library (no `.lenis`).

## Disabled vs enabled tiles (empty-cart state)
`brightness(0.5)` dims the disabled tiles — this is why Plus/Minus Quantity render as olive/brown
(they are light-green / peach base colors, halved in brightness).
- **Disabled (brightness 0.5):** Clear Sale, Plus Quantity, Minus Quantity
- **Enabled (full):** EFTPOS, Exact Cash, Cash Out, Case Quantity, More Functions, carlton

## Hover states
- Sale keys: background-color transition over 0.2s (subtle). Header icons: pointer cursor.
- Help-center link: standard anchor.

## Responsive behavior (verified at 1440 / 390)
- **Desktop (≥~1024px):** two columns — sell pad (`flex:1`) + cart sidebar (fixed 419px). Sales-keys grid visible.
- **Mobile (<~1024px):**
  - Header collapses: hides the **map-signs** and **volume** icons (keeps menu, logo, help, ONLINE, bell, avatar).
  - Search bar gains a trailing **"···"** options button (~50px) to its right.
  - **Sales-keys grid is hidden entirely.** Sell-pad shows only the search bar + empty product area.
  - Cart (Add Customer → summary → Finalise) sits at the bottom, full width, single column.
- Breakpoint chosen for clone: **1024px (lg)**.

## Header status
- "ONLINE" with a green globe icon (`fal fa-globe`), color `rgb(50,182,67)`.
- User avatar: grey circle placeholder with a person silhouette + "admin".
