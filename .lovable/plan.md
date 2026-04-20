
## Goal
Two changes:
1. Convert `AppLayout` to a **Canva-style floating content block** — main content sits inside a rounded card with breathing room around it, on a near-black backdrop.
2. Make the **sidebar logo clickable** → navigates to `/home`, and **remove the Home item** from the nav list (Home is now only reachable via the logo).

---

## 1. AppLayout — Floating Content Block (`src/components/AppLayout.tsx`)

**Root container**:
- Change wrapper from `bg-background` → `bg-[#0A0A0A]` (deep near-black backdrop).
- Keep `flex min-h-screen`.

**Sidebar**: stays `fixed` on the left (no layout change here). It will visually blend with the dark `#0A0A0A` backdrop. Border on the sidebar's right edge stays subtle (`border-border` is already low-contrast).

**Floating main block** (desktop ≥ md):
- Wrap the area to the right of the sidebar in a flex container with **8px padding** on top / right / bottom and 0 on the left (`md:p-2 md:pl-0`). On mobile, no padding (`p-0`).
- The `<main>` element becomes the floating card:
  - `flex-1`
  - `md:h-[calc(100vh-16px)]` (16px = top 8 + bottom 8) — full screen on mobile (`h-screen`)
  - `md:bg-card md:rounded-[24px] md:border md:border-border/50 md:shadow-2xl` — only on md+, mobile is flat
  - `overflow-y-auto` (scrollbar lives inside the rounded block)
  - `relative` (so the inner glow + content stack correctly)
- Push it past the fixed sidebar using `md:ml-20` on the wrapper (not on `<main>` directly anymore, so the rounded card doesn't fight the sidebar).

**Inside the floating block**:
- Keep `MobileHeader` at the top (mobile only).
- Move the `gradient-glow` overlay **inside** the `<main>` (so the glow is clipped by the rounded corners) — change `fixed inset-0` → `absolute inset-0`, drop the `md:ml-20`.
- Content padding stays `p-4 sm:p-6 md:p-8` inside a relative wrapper.

**Result**:
```text
┌─────────────────────────────────────────┐  ← bg #0A0A0A
│ ┌──┐ ┌─────────────────────────────────┐│
│ │  │ │                                 ││
│ │SB│ │  Floating card (rounded-[24px]) ││  ← scrollbar inside this card
│ │  │ │  bg-card, shadow-2xl            ││
│ │  │ │                                 ││
│ └──┘ └─────────────────────────────────┘│
└─────────────────────────────────────────┘
```

Mobile (`< md`): sidebar is hidden, main is full-screen flat (`h-screen`, `rounded-none`, no padding, no border) — same UX as today.

---

## 2. Sidebar — Logo as Home Link, Remove Home Nav Item (`src/components/AppSidebar.tsx`)

**Desktop rail (`RailContent`)**:
- Wrap the logo square in a `NavLink to="/home"` (replaces the plain `<div>`). Keep the existing tooltip on hover ("ReelCast — AI Commercial Studio"). Add `hover:scale-105 transition-transform`.
- When on `/home`, give the logo a subtle active treatment (e.g., `ring-2 ring-primary/40` or stronger `shadow-glow`) so users get feedback.
- Remove `{ to: "/home", icon: Home, label: "Home" }` from `navItems`. Drop the unused `Home` import from lucide.

**Mobile drawer (`DrawerContent`)**:
- Same `navItems` change applies (Home removed from the drawer list automatically).
- Wrap the drawer logo block in a `NavLink to="/home"` with `onClick={onNavigate}` so tapping the brand on mobile also goes home and closes the drawer.

**Mobile header (`MobileHeader`)**:
- Wrap the inline logo + "ReelCast" text in a `NavLink to="/home"` so the brand mark is also a home link from the top header.

---

## Files to Edit
- `src/components/AppLayout.tsx` — restructure to floating content block layout.
- `src/components/AppSidebar.tsx` — logo → `NavLink` to `/home`, remove Home from `navItems`, drop unused `Home` import.

No changes to routes, pages, or other components. No new dependencies.
