# Header Specification

## Overview
- **Target file:** `src/components/Header.tsx`
- **Screenshot:** `docs/design-references/desktop-fullpage.png` (top 50px), `mobile-390.png`
- **Interaction model:** static (icons have pointer cursor only)

## DOM Structure
`<header>` is a flex row, 50px tall, bg `#313439`, full width. Children left→right:
1. Menu item (50px square): hamburger icon.
2. Logo item (50px square): cloud logo image (`/images/cloud.png`).
3. `.team-message` (flex:1): centered-left text "Need assistance? Check out our help center."
4. Right group (inline-flex of items): help, map-signs, volume, ONLINE status, bell, user.

## Computed Styles (exact)

### header
- height: 50px; display: flex; align-items: center; background: `#313439` (rgb(49,52,57)); position: relative
- font-family: Roboto; color default black (overridden per item)

### Left icon items (menu, logo, help, map-signs, volume, bell)
- Each wrapper: `header-item`, 50px wide × 50px tall, display:flex, align-items:center, justify-content:center, padding: 0 4px
- Icon glyphs: font-size 24px, color `#f8f8f8` (rgb(248,248,248)), thin stroke (`fal`). Use Lucide @ `size={24} strokeWidth={1.5}`.
- Hamburger: `MenuIcon`. Help: `HelpIcon` (circle-question). Map-signs: `MapSignsIcon`. Volume: `VolumeIcon`. Bell: `BellIcon`.

### Logo
- `<img src="/images/cloud.png">` — rendered ~39px wide × 25px tall (height auto, width ~39px). The cloud-with-blue-S mark. Container is a 50px flex cell.

### .team-message
- flex: 1 1 0; padding: 0 8px; color `#bdbdbd` (rgb(189,189,189)); font-size 16px; line-height 50px (vertically centered); white-space nowrap, overflow hidden, text-overflow ellipsis.
- Text: `Need assistance? ` then an `<a>` link.
- Link text: `Check out our help center` — color `#5ebbeb` (rgb(94,187,235)), no underline. Followed by a literal `.` (period) in muted color.

### ONLINE status (`.header-item.online`)
- inline-flex, align-center, padding 0 4px.
- `.status` row: flex align-center, color `#32b643` (rgb(50,182,67)).
- Globe icon (`GlobeIcon`, size 24, strokeWidth 1.5) margin ~4px, then `<p>ONLINE</p>` font-size 16px, color `#32b643`.

### User item
- inline-flex, padding 0 4px. Contains:
  - `.user-image`: 34px × 34px circle (border-radius 50%), grey background `#bdbdbd` (rgb(189,189,189)) with a white person silhouette centered (`UserIcon`, white, ~size 20). It's a placeholder avatar.
  - `<p>admin</p>`: margin 0 8px, color `#f8f8f8`, font-size 16px.

## States & Behaviors
- **Hover:** icons show `cursor:pointer`. No color change required (subtle/none). N/A animations.

## Assets
- Logo image: `public/images/cloud.png`
- Icons: from `src/components/icons.tsx` (Lucide): MenuIcon, HelpIcon, MapSignsIcon, VolumeIcon, GlobeIcon, BellIcon, UserIcon.

## Text Content (verbatim)
- "Need assistance? " + link "Check out our help center" + "."
- "ONLINE"
- "admin"

## Responsive Behavior
- **Desktop (≥1024px):** all items visible as above.
- **Mobile (<1024px):** HIDE the **map-signs** and **volume** items (use `hidden lg:flex` / `hidden lg:inline-flex`).
  Keep menu, logo, team-message (truncates with ellipsis), help, ONLINE, bell, user.
- Breakpoint: 1024px (Tailwind `lg`).

## Implementation notes
- This is a client-agnostic static component; no "use client" needed (no handlers required).
- Use semantic `<header>`. Right group right-aligned (team-message flex:1 pushes it right).
- Match icon color `#f8f8f8`, header bg via `bg-[#313439]`.
