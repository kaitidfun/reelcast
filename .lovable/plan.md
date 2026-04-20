
## Goal
Two changes:
1. Compact the **left sidebar** to a Canva-style narrow rail with icon + small label below, and minimize the profile/sign-out section.
2. Add a **new Home page** at `/home` with greeting + search, two large quick-action cards, recent videos in 9:16 portrait, campaigns, and a footer.

---

## 1. Sidebar Redesign (`src/components/AppSidebar.tsx` + `src/components/AppLayout.tsx`)

**Width**: shrink from `w-64` (256px) to `w-20` (80px) — wider than the icons but tight, Canva-style.

**Nav item layout**: vertical stack inside each item — icon on top, **tiny label below** (`text-[10px]`, `font-medium`).

```text
┌──────┐
│ 🏠   │   ← icon (h-5 w-5)
│ Home │   ← text-[10px]
└──────┘
```
- Active state: keeps the gradient pill but as a rounded square (`rounded-xl`, `py-2.5`).
- Hover: subtle `bg-sidebar-accent` + `scale-105` icon.
- Logo at top: shrink to icon-only (the small gradient sparkle square, no "ReelCast" wordmark; full name shows as tooltip on hover).

**Bottom section (profile + sign out)** — minimal:
- Just the **circular avatar** (h-9 w-9) and a small **LogOut icon button** (h-8 w-8, ghost style) stacked vertically. No name, no "Sign Out" label.
- Avatar links to `/account`. Tooltip on hover shows name.

**Layout update**: `AppLayout.tsx` — change `md:ml-64` → `md:ml-20` in both the `<main>` and the `gradient-glow` overlay so content reflows correctly.

**Mobile**: `MobileHeader` (Sheet drawer) keeps its current full-width nav with labels on the side — no change needed there since it's a drawer, not the rail.

---

## 2. New Home Page (`src/pages/Home.tsx`)

**Route**: add `<Route path="/home" element={<Home />} />` in `src/App.tsx` inside the protected `AppLayout` block. (Dashboard at `/` stays as-is.)

**Add nav item** in `AppSidebar.tsx`: insert `{ to: "/home", icon: Home, label: "Home" }` at the **top** of `navItems` (before Dashboard), using Lucide `Home` icon.

### Page structure (top → bottom)

**A. Header row**
- Left: `Welcome back, Creator!` — `font-display text-2xl font-bold` (uses `user.displayName` from `useAuth` if available, else "Creator").
- Center/Right: pill-shaped **search bar** — `rounded-full`, `bg-card`, `border border-border`, `px-5 py-2.5`, with `Search` Lucide icon left + placeholder "Search videos, products, campaigns…". Max width ~480px.

**B. Quick Actions — 2 large cards side-by-side** (`grid-cols-1 md:grid-cols-2 gap-6`)
- Each card: `rounded-2xl`, large height (`min-h-[160px]`), centered content (icon + label).
- **Card 1 — "Create new video"**: featured. Uses `border-gradient` (existing utility) for the gradient outline. Big `Plus` icon (h-10 w-10) above text. Hover: `shadow-glow-lg` + slight scale. Click → `navigate("/create")`.
- **Card 2 — "Create new product"**: standard `border-border bg-card`. Same layout, big `Plus` icon. Hover: `border-primary/40` + `shadow-card`. Click → `navigate("/library")`.

**C. Recent Videos**
- Heading: `Recent Videos` (`font-display text-lg font-semibold`).
- Grid: `grid-cols-2 md:grid-cols-4 gap-4`.
- Each card: **9:16 aspect ratio** (use existing `AspectRatio` component with `ratio={9/16}`).
- Inside: dark gray gradient background (`bg-gradient-to-br from-muted to-card`), centered small `Play` icon in a circle (`h-10 w-10 rounded-full bg-card/60 backdrop-blur`), title overlay at bottom (`text-xs font-medium`).
- Hover: scale 1.02, play icon scales up, subtle ring.
- 4 mock videos with titles (e.g., "Summer Drop", "Watch Reveal", "Skin Routine", "Tech Review").

**D. Campaigns**
- Heading: `Campaigns`.
- Long horizontal "folder-like" cards — `rounded-2xl`, `border border-border bg-card`, `p-5`, `flex items-center gap-4`.
- Each card has a small folder icon tile (gradient bg, `rounded-xl`), campaign name, item count ("12 reels · 3 platforms"), and a chevron right.
- Stack vertically (`space-y-3`), 3 mock campaigns ("Summer Sale 2026", "New Arrivals Q2", "Affiliate Boost").

**E. Footer**
- Centered text at very bottom: `Copyright © ReelCast` — `text-xs text-muted-foreground/60`, `text-center`, `pt-12 pb-4`.

### Style requirements applied throughout
- All cards: `rounded-2xl` (some `rounded-xl` for nav).
- Generous padding (`p-6` to `p-8`) and `space-y-8` between sections.
- Hover states on every interactive card (transitions, shadow lifts, gradient borders).
- Entrance animations via `framer-motion` (`initial opacity 0 y 20`, staggered `delay`).

---

## Files to Edit / Create
- **Edit** `src/components/AppSidebar.tsx` — narrow rail, icon+label vertical stack, minimal profile/logout, add `/home` nav item.
- **Edit** `src/components/AppLayout.tsx` — change `md:ml-64` → `md:ml-20`.
- **Edit** `src/App.tsx` — register `/home` route.
- **Create** `src/pages/Home.tsx` — new page per spec above.

No new dependencies. No changes to auth, Dashboard, or other pages.
