# Page Topology — Orithos Sell screen

Viewport 1440×900. Root: `#root` → `header` (50px) + `main` (absolute, top:50px, fills rest).

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER  bg #313439  height 50px  (flex)                                │
│ [≡] [logo] Need assistance? Check out our help center.   [?][signpost] │
│                                              [🔊][🌐 ONLINE][🔔][o admin]│
├──────────────────────────────────────────────────────────────────────┤
│ MAIN  (p-2 wrapper) → .action-mode-keys (flex row, gap via padding)    │
│ ┌───────────────────────────────────┐ ┌────────────────────────────┐  │
│ │ SELL PAD (flex:1, ~997px)         │ │ CART SIDEBAR (419px fixed) │  │
│ │ ┌───────────────────────────────┐ │ │ + Add Customer  (h75,      │  │
│ │ │ Search input (50px, white)    │ │ │   bold, bottom divider)    │  │
│ │ └───────────────────────────────┘ │ │                            │  │
│ │ Sales-keys area (#f8f8f8)         │ │ (empty product list)       │  │
│ │   10×10 CSS grid of .sale-key     │ │                            │  │
│ │   tiles (see sell-pad spec)       │ │ ── summary row (h93) ──     │  │
│ │                                   │ │  0 Products      $0.00      │  │
│ │                                   │ │  Savings $0.00    TOTAL     │  │
│ │                                   │ │  Discount $0.00            │  │
│ │ [⌨ Sales Keys] [P Parked Sales]   │ │ ┌────────────────────────┐ │  │
│ │  (tabs, white bar, h50)           │ │ │      FINALISE  (blue)  │ │  │
│ └───────────────────────────────────┘ │ └────────────────────────┘ │  │
│                                        └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Sections (build order)
1. **Header** — `src/components/Header.tsx` — static, dark bar.
2. **SellPad** — `src/components/SellPad.tsx` — search + sales-keys grid + bottom tabs.
3. **CartSidebar** — `src/components/CartSidebar.tsx` — Add Customer + summary + Finalise.
4. **Page assembly** — `src/app/page.tsx` — header on top, then a flex row (sell pad + cart) filling `calc(100vh - 50px)`.

## Layout facts
- Header height: 50px, bg `#313439`.
- Main content padding: 8px (`p-2`) all around the `.action-mode-keys` flex row.
- Sell pad and cart separated by an 8px gap; cart width 419px, sell pad flex:1.
- Each column has a thin `0.667px solid` border (renders as a ~1px light divider).
- No vertical page scroll at desktop; content height = viewport − 50px header.
