# UserMenu Specification

## Overview
- **Target file:** `src/components/UserMenu.tsx`
- **Trigger:** clicking `#current-user` / `#user-information` (the avatar + "admin" text) in the header top-right.
- **Screenshot:** `docs/design-references/user-menu-open.png`
- **Interaction model:** click-to-open right slide-in panel + backdrop overlay; click overlay (or a control) to close.

## Behavior (was NOT cloned)
Original clone made the admin avatar call `onLogout` directly. **Correct behavior:** clicking admin opens a
right-hand slide-in "user menu" panel. Logout is a button *inside* that panel.

## DOM Structure (live)
```
#current-user.header-item[data-testid=sh-current-user]
  #user-information  (onclick -> opens panel)   avatar + <p>admin</p>
.overlay                                         (fixed black backdrop, fades in)
.user-menu (fixed right panel)
  .flex.flex-col.h-full
    .flex-1.overflow-auto  (md:w-[500px], w-screen on mobile)
      px-8 space-y-2:
        - Theme row: <label> paint-roller icon + "Theme" + <select> "Default" (max-w 150px)
        - Revenue chart (svg 500x256)
        - Transaction Count chart (svg 500x256)
    footer: <a> "Modify User" (outlined) + <button> "Logout" (filled blue)
```

## Computed Styles (exact from getComputedStyle)

### Panel (.user-menu)
- position: fixed; top: 50px; right: 0; bottom: 0
- width: 500px; maxWidth: 90% (mobile: w-screen)
- backgroundColor: rgb(255,255,255)
- boxShadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)  (Tailwind shadow-md)
- zIndex: 1 (sits above content; overlay behind it)
- transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)
- Slide: translateX(100%) closed -> translateX(0) open

### Overlay (.overlay)
- position: fixed; inset: 0; backgroundColor: rgb(0,0,0)
- transition: opacity 0.2s ease-in-out
- opacity ~0 -> dims page when open (use ~0.15 to match visible dim); click closes

### Section titles ("Revenue", "Transaction Count")
- fontSize: 14px; fontWeight: 400; color: oklch(0.371 0 0) (neutral-700); textAlign: center; fontFamily: Roboto

### Theme label
- text-xl, neutral-900, paint-roller icon in primary blue (mr-4)

### Select "Default"
- bordered, rounded-lg, border neutral-700, max-w 150px, readonly text "Default", caret-down icon

### Modify User (A)
- outlined: bg transparent, color oklch(0.588 0.158 241.966) (primary blue), border 0.67px solid primary
- borderRadius: 12px (rounded-xl); padding: 8px 32px; fontSize: 16px; fontWeight: 700; width ~202px
- cog/settings icon; href: /settings/users/{id}/edit  (clone -> /settings/account)

### Logout (button)
- filled: backgroundColor rgb(94,187,235) (--sf-link-blue); color white
- border 0.67px solid rgb(94,187,235); borderRadius 12px; padding 8px 32px; fontSize 16px; fontWeight 700; width ~202px
- sign-out icon

## Charts (demo data, in scope)
- SVG 500x256. Line: stroke rgb(94,187,235), 2px, fill none. Area fill: rgb(94,187,235) low opacity. Data-point circles: fill rgb(94,187,235).
- X-axis labels: Fri, Sat, Sun, Mon, Tue, Wed, Thu
- Revenue Y-axis: $0.00 .. $4.50 (step $0.50). Shape: flat at 0, spike to ~4.50 on Wed, back to 0 Thu.
- Transaction Count Y-axis: 0 .. 1. Shape: flat 0, spike to 1 on Wed, back to 0.

## Icons needed
- PaintRoller (Theme), Settings/cog (Modify User -> SettingsGearIcon exists), LogOut (Logout). Add PaintRollerIcon + LogOutIcon to icons.tsx.

## Responsive
- Desktop (>=768px): 500px panel from right.
- Mobile (<768px): full-screen width panel (w-screen), max-w-[90%].
