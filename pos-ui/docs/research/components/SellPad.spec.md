# SellPad Specification

## Overview
- **Target file:** `src/components/SellPad.tsx`
- **Screenshot:** `docs/design-references/desktop-fullpage.png` (left ~2/3), `mobile-390.png`
- **Interaction model:** static. Tiles: `transition: background-color 0.2s ease-in-out`; enabled = `cursor:pointer`, disabled = `cursor:not-allowed` + `filter:brightness(0.5)`.

## DOM Structure
```
div.sell-pad (flex:1, column, min-w-0, thin border)
├── div.search (h50)          → <input> full width
└── div.keys-area (flex:1, bg #f8f8f8, relative)
    └── div.grid               → 10-col × 10-row CSS grid, the 9 sale-key tiles
└── ul.tabs (h50, white)       → "Sales Keys" (selected) | "Parked Sales"
```

## Computed Styles (exact)

### Search input (wrapper `.display-options-visible`, h50)
- `<input>`: width 100%, height 50px, background `#ffffff`, color black, font-size 16px, padding 16px, border-radius 0.
- Border: ~1px solid `#bdbdbd` (thin box outline visible in screenshot). Use `border border-[#bdbdbd]`.
- placeholder text: `Search for Products and Customers...`, placeholder color `#757575` (rgb(117,117,117)).

### Keys area (`.sales-keys-container`)
- background `#f8f8f8` (rgb(248,248,248)); position relative; fills remaining height.
- The grid (`.sales-keys-folder`): `display:grid`, `grid-template-columns: repeat(10, 1fr)`, `grid-template-rows: repeat(10, 1fr)`, no gap. Absolutely fills the keys area.

### Sale-key tile (`.sale-key`)
- display:flex, align-items:center, justify-content:center; border: `0.667px solid #ffffff` (white hairline between tiles); border-radius 0.
- Background: per-tile color (below).
- Inner image: `<img>` square, **height: 100% (≈ tile inner height), width auto (square source 483×483), object-fit: fill, centered**. The PNG contains the icon AND label baked in.
- Disabled tiles: wrap the tile content with `filter: brightness(0.5)` and `cursor-not-allowed`.

## Sale key tiles (the 9 keys) — 10-col × 10-row grid, 1-based placement

| id            | image                         | bg (rgb)        | col (start/span) | row (start/span) | disabled |
|---------------|-------------------------------|-----------------|------------------|------------------|----------|
| EFTPOS        | /images/keys/eftpos.png       | 141, 18, 56     | 7 / 2            | 1 / 2            | no       |
| Plus Quantity | /images/keys/plus-quantity.png| 226, 245, 205   | 9 / 2            | 1 / 2            | **yes**  |
| Exact Cash    | /images/keys/exact-cash.png   | 226, 245, 205   | 7 / 2            | 3 / 2            | no       |
| Minus Quantity| /images/keys/minus-quantity.png| 252, 222, 171  | 9 / 2            | 3 / 2            | **yes**  |
| Cash Out      | /images/keys/cash-out.png     | 252, 222, 171   | 9 / 2            | 5 / 1            | no       |
| More Functions| /images/keys/more-functions.png| 206, 229, 252  | 1 / 1            | 9 / 2            | no       |
| carlton       | (none — text only)            | 222, 84, 84     | 10 / 1           | 9 / 1            | no       |
| Clear Sale    | /images/keys/clear-sale.png   | 252, 222, 171   | 8 / 1            | 10 / 1           | **yes**  |
| Case Quantity | /images/keys/case-quantity.png| 226, 245, 209   | 9 / 2            | 10 / 1           | no       |

Use CSS: `gridColumn: \`${colStart} / span ${colSpan}\``, `gridRow: \`${rowStart} / span ${rowSpan}\``.
(These may be passed via the `style` prop since they are data-driven grid coords — acceptable here.)

### carlton (text-only key)
- No image. Background `rgb(222,84,84)` (red). Centered text "carlton", color white (`#ffffff`), font-size 16px, font-weight 400, text-align center.

## Tabs (`ul`, bottom of sell pad)
- ul: flex, justify-content space-between, background `#ffffff`, height 50px, align-items center.
- Two `<li>`, each flex:1, text-align center, line-height 50px, font-size 19.2px, cursor pointer.
- **"Sales Keys"** (selected): color `#1c86f2` (rgb(28,134,242)); leading icon `KeyboardIcon` (size 19, strokeWidth 1.5), margin-right 8px, same blue.
- **"Parked Sales"**: color black (rgb(0,0,0)); leading icon `ParkingIcon`, margin-right 8px, black.
- A thin page-indicator bar sits just above the tabs: a 4px track (`#e0e0e0`) with a ~40%-wide blue (`#1c86f2`) segment at the left. (Represents the keypad horizontal pager — render statically.)

## Assets
- Key PNGs in `public/images/keys/` (listed above). Icons: KeyboardIcon, ParkingIcon from `icons.tsx`.

## Text Content (verbatim)
- Search placeholder: "Search for Products and Customers..."
- "carlton", "Sales Keys", "Parked Sales"

## Responsive Behavior
- **Desktop (≥1024px):** as above; sell pad is flex:1, grid visible.
- **Mobile (<1024px):** HIDE the keys grid and the page-indicator bar (`hidden lg:block`/`lg:grid`).
  Search bar gets a trailing 50px **"···"** button (three dots, `MoreHorizontal` or literal "···") with a left border; keep the tabs hidden too (mobile shows only search + empty area). Keep it simple: `lg:` reveals grid + tabs.
- Breakpoint: 1024px (`lg`).

## Implementation notes
- The keys area should fill available height; grid fills it. At desktop the whole screen has no scroll.
- Tile grid rows/cols are equal fractions (`1fr`), matching the live 99.54px × 73.36px cells at 1440px.
- Build as a presentational component. Sale-key data can be defined inline (typed `SaleKey[]` from `@/types/orithos`) or accepted as a prop. Define it inline in this component.
