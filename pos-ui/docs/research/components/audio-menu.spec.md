# AudioMenu Specification

## Overview
- **Target file:** `src/components/AudioMenu.tsx`
- **Trigger:** header volume icon `#audio-icon` (`fal fa-volume-up`)
- **Interaction model:** click-to-toggle dropdown anchored under the volume icon, with a full-page dimming backdrop. Click backdrop (outside) to close.

## DOM Structure
- Backdrop: `div.overlay` — fixed, covers viewport, black opacity 0.7, z-index 2.
- Menu: `div.audio-menu` — absolute dropdown, anchored to the `.header-item` (position:relative, 50px wide) that holds the volume icon.
  - Section "Master Volume" — label + `<span>- 100%</span>`, row [volume-down icon, range slider, volume-up icon], "Mute" button.
  - Section "Shopfront" — same structure.

## Computed Styles (exact from getComputedStyle)

### Backdrop (`.overlay`)
- position: fixed; inset: 0; background: rgb(0,0,0); opacity: 0.7; z-index: 2

### Menu (`.audio-menu`)
- position: absolute; top: 50px; right: 0; left: -350px (i.e. width 400 anchored to a 50px item → extends 350px left)
- width: 400px; background: rgb(248,248,248) (#f8f8f8 = --sf-pad-bg); padding: 16px
- borderRadius: 0; border: none; box-shadow: none; z-index: above overlay (menu sits over dim)

### Volume label (e.g. "Master Volume")
- black text; the "- 100%" suffix is muted/smaller grey.

### Range slider (`input[type=range]`)
- width: 264px; borderRadius: 4px
- track background: rgb(189,189,189) (#bdbdbd = --sf-muted)
- filled portion: linear-gradient of rgb(94,187,235) (#5ebbeb = --sf-link-blue), width = value%
- flanked left by `fa-volume-down`, right by `fa-volume-up` icons (grey)

### Mute button
- width: 90px; padding: 4px 8px; borderRadius: 6px
- background: rgb(248,248,248); border: 0.667px solid rgb(0,0,0)
- text "Mute"

## States & Behaviors
- **Open/close:** clicking the volume icon toggles the menu + backdrop. Clicking the backdrop closes.
- **Slider drag:** changes the "- NN%" label and the blue fill width. (Local state; no audio in clone.)
- **Mute button:** sets that channel to 0% (label "- 0%", fill empty). Purely visual in clone.

## Per-State Content
- Master Volume — default 100%
- Shopfront — default 100%

## Assets / Icons
- VolumeIcon (fa-volume-up), VolumeLowIcon (fa-volume-down) from icons.tsx.

## Text Content (verbatim)
- "Master Volume", " - 100%", "Mute", "Shopfront", " - 100%", "Mute"

## Responsive Behavior
- Desktop: 400px dropdown, anchored right under the volume icon.
- The volume icon is hidden below lg (per Header spec); menu only exists at ≥lg.
