

## Goal
Make the backdrop (the area outside the floating content card) the **same color as the sidebar**, and **remove the sidebar's right border** so it blends seamlessly with the backdrop.

## Changes

### 1. `src/components/AppLayout.tsx`
- Change root wrapper background from `bg-[#0A0A0A]` → `bg-sidebar` so the dark gutter around the floating card matches the sidebar color exactly.

### 2. `src/components/AppSidebar.tsx`
- On the desktop `<aside>`: remove `border-r border-border` so the sidebar has no visible divider. It will blend into the matching backdrop, leaving only the floating card's own border to define the content area.
- Mobile header / drawer borders are unrelated and stay as-is.

## Result
```text
┌─────────────────────────────────────────┐  ← bg-sidebar (same on both sides)
│ ┌──┐ ┌─────────────────────────────────┐│
│ │SB│ │  Floating card                  ││
│ │  │ │  (only this has a border)       ││
│ └──┘ └─────────────────────────────────┘│
└─────────────────────────────────────────┘
   ↑ no border between sidebar and backdrop
```

## Files to Edit
- `src/components/AppLayout.tsx` — swap root bg color.
- `src/components/AppSidebar.tsx` — drop `border-r border-border` from the desktop `<aside>`.

No other changes.

