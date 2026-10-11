# NotificationsPanel Specification

## Overview
- **Target file:** `src/components/NotificationsPanel.tsx`
- **Trigger:** header bell icon `.notification-bell` / `#notification-icon` (`fal fa-bell`)
- **Interaction model:** click-to-toggle right slide-in panel + dimming backdrop. Same pattern as `UserMenu`. Click backdrop to close.

## DOM Structure
- Backdrop: `div.fixed ... bg-black/40` covering the viewport.
- Panel: `div.transition-transform.fixed.w-max.max-w-[90%].shadow-md.right-0.z-1.bg-white`
  - Header row: `<h2 class="text-xl pl-4">Notifications</h2>` + refresh icon (`fa-sync`) on the left; "Delete All" on the right.
  - Scrollable list of notification buttons.
  - Each item = `<button class="w-full flex items-center text-left p-4 rounded-lg cursor-pointer bg-transparent hover:bg-black/10 text-black">`
    - icon: `<div class="text-3xl mr-4 ml-2 text-primary-dark"><i class="fal fa-database"/></div>`
    - body: `<div class="flex-1 relative"><div class="text-base pr-3 wrap-anywhere">TITLE</div><div><span class="duration">14 days ago</span></div><div>BODY</div></div>`
    - delete: trash icon (`fa-trash-alt`) on the right.

## Computed Styles (exact from getComputedStyle)

### Backdrop
- position: fixed; inset: 0; background: rgb(0,0,0)/0.4 (`bg-black/40`)

### Panel
- position: fixed; top: 50px; right: 0; width: 500px (w-max, capped max-w-[90%]); height: calc(100vh - 50px)
- background: rgb(255,255,255)
- box-shadow: shadow-md → `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)`
- z-index: 1
- transition: transform 0.15s cubic-bezier(0.4,0,0.2,1)
- Slide-in: closed = translate-x-full, open = translate-x-0

### Heading "Notifications"
- fontSize: 20px (text-xl); fontWeight: 400; color: black; padding-left: 16px (pl-4)

### "Delete All"
- fontSize: 16px; fontWeight: 700; color: oklch(0.439 0 0) (~neutral-600); clickable

### Notification item
- padding: 16px (p-4); border-radius: 8px (rounded-lg); hover background: rgba(0,0,0,0.1)
- icon: text-3xl, color primary-dark (#5ebbeb-ish blue) — use --sf-link-blue
- title: 16px (text-base)
- `.duration` timestamp: smaller, muted grey
- body: default text

## States & Behaviors
- **Open/close:** bell click toggles panel + backdrop (slide-in transform).
- **Item hover:** background → rgba(0,0,0,0.1).
- **Delete (trash):** removes the row (local state). **Delete All:** clears the list → empty state.
- **Refresh (fa-sync):** re-fetch (no-op/spin in clone).
- **Empty state:** when no notifications, show a simple centered muted message.

## Per-State Content (verbatim, real data)
- Item: title "Trial Data Created"; duration "14 days ago"; body "Trial data has been created for your vendor"; icon fa-database.

## Assets / Icons
- BellIcon (trigger), RefreshIcon (fa-sync), DatabaseIcon (fa-database), DeleteIcon (fa-trash-alt) from icons.tsx.

## Responsive Behavior
- Desktop: 500px panel from right.
- Mobile: max-w-[90%] (panel caps at 90% viewport width).
