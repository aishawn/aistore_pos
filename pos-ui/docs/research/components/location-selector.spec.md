# LocationSelector Specification

## Overview
- **Target file:** `src/components/LocationSelector.tsx`
- **Trigger:** header signpost icon `#location-header` (`fal fa-map-signs`)
- **Interaction model:** click opens a full-screen modal (a 2-step wizard). Also shown automatically when no register is selected. Not dismissable by backdrop click on the live site (it is a required selection flow) — for the clone, provide a subtle close (Esc / clicking away) OR allow selecting an option to close.

## DOM Structure
- Overlay: `div.z-1.fixed.inset-0.bg-linear-to-br.from-stone-500.to-zinc-800.flex.items-center.justify-center`
  - scroller: `div.max-h-screen.w-full.p-8.overflow-auto`
    - card: `div.bg-white.rounded-lg.shadow-2xl.w-fit.mx-auto.p-8.pt-12.relative`
      - (step 2 only) back link: `div.absolute.top-4.text-gray-500.cursor-pointer.hover:text-gray-400` → `<i fa-long-arrow-left/> Back to outlet select`
      - `<h2 class="text-xl">Location Selector</h2>`
      - `<p>Please select which location best describes where your device is located.</p>`
      - `<div class="pt-8">` question + option cards

## Computed Styles (exact from getComputedStyle)

### Overlay
- position: fixed; inset: 0; z-index: 1; display: flex; align-items/justify: center
- background: `linear-gradient(to bottom right, oklch(0.553 0.013 58.071), oklch(0.274 0.006 286.033))`
  (Tailwind `bg-linear-to-br from-stone-500 to-zinc-800`)

### Card
- background: white; border-radius: 8px (rounded-lg); box-shadow: shadow-2xl (`0 25px 50px -12px rgba(0,0,0,0.25)`)
- width: fit-content; margin: 0 auto; padding: 32px, padding-top: 48px (p-8 pt-12); position: relative

### Heading
- `text-xl` (20px), bold-ish (default h2 weight)

### Subtitle `<p>`
- default text, black

### Question line ("Which outlet are you currently in?" / "Which register are you currently using at 11?")
- appears above option cards, with `pt-8` spacing.

### Option card
- `border-2 border-gray-200 rounded-lg p-4 mb-4 cursor-pointer shadow flex items-center transition-all`
- icon: `mr-2 text-xl`
- Two-line label supported: main label + a coloured/muted sub-label like "(Previously Selected)" or "(Global Mode)".

### Back link (step 2)
- `absolute top-4`; color gray-500; hover gray-400; icon fa-long-arrow-left.

## States & Behaviors
- **Step 1 — Outlet select:** question "Which outlet are you currently in?" Options:
  - "11" + sub "(Previously Selected)" — icon fa-map-pin (MapPinIcon)
  - "Not at an Outlet" + sub "(Global Mode)" — icon fa-globe-asia (GlobeIcon)
  - Selecting an outlet advances to Step 2.
- **Step 2 — Register select:** question "Which register are you currently using at 11?" Options:
  - "Register #1" + sub "(Previously Selected)" — icon fa-cash-register (RegisterIcon)
  - "Not using a register" — icon fa-map-pin (MapPinIcon)
  - "← Back to outlet select" returns to Step 1.
  - Selecting a register closes the modal.
- **Option hover:** transition-all; subtle (border/shadow) — keep border-gray-200 → slightly darker on hover.

## Per-State Content (verbatim)
- Title: "Location Selector"
- Subtitle: "Please select which location best describes where your device is located."
- Step1 question: "Which outlet are you currently in?"
- Step2 question: "Which register are you currently using at 11?"
- Sub-labels: "(Previously Selected)", "(Global Mode)"
- Back: "Back to outlet select"

## Assets / Icons
- MapPinIcon (fa-map-pin), GlobeIcon (fa-globe-asia), RegisterIcon (fa-cash-register), ArrowLeftIcon (fa-long-arrow-left) from icons.tsx.

## Responsive Behavior
- Card is `w-fit mx-auto`, centered; `max-h-screen overflow-auto` scroller with p-8 gutter.
- On mobile the card shrinks to content but keeps the 32px page gutter.
