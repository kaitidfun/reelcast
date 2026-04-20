
## Plan: Redesign Auth Pages — SaaS Business Style (Notion/Linear)

Redesign Login, Register, and Forgot Password as a **split-screen SaaS layout**: branded hero on the left with value props + social proof, compact form on the right.

### Layout Structure

```text
┌─────────────────────────────┬──────────────────────────┐
│                             │                          │
│  LEFT (hidden on mobile)    │  RIGHT (form)            │
│  - Logo + wordmark          │  - Small header          │
│  - Big headline             │  - Form card (no border  │
│  - 3 value props w/ icons   │    on desktop, flush)    │
│  - Testimonial quote card   │  - OAuth buttons         │
│  - Trust badges (logos)     │  - Switch link           │
│  - Subtle gradient + grid   │  - Footer: legal links   │
│                             │                          │
└─────────────────────────────┴──────────────────────────┘
   lg: 55% width                  lg: 45% width
   Background: gradient + glow    Background: solid card
```

Mobile (<lg): hide left panel, show compact logo + form centered (similar to current).

### Left Panel Content (shared across all 3 pages)

- **Logo lockup** (top): Sparkles icon + "ReelCast" + tagline
- **Headline**: "Turn products into viral Reels in minutes."
- **Sub**: "The AI commercial studio for merchants, affiliates, and brands."
- **3 value props** (icon + title + 1-line desc):
  - Wand2 → "AI-generated scripts & B-roll"
  - Share2 → "One-click distribution to 7+ platforms"
  - TrendingUp → "Track sales & engagement in one dashboard"
- **Testimonial card**: Avatar + quote + name/role (mock)
- **Trust row**: small monochrome platform badges (TikTok, YouTube, Shopee, Lazada, Meta)

### Right Panel — Per Page

**Login.tsx**
- H2 "Welcome back" + sub "Sign in to your ReelCast Studio"
- Social buttons FIRST (Google, Facebook) — full width, stacked on mobile, side-by-side on sm+
- Divider "or sign in with email"
- Email + password (with Forgot link)
- Sign In button (primary gradient)
- "New to ReelCast? Create an account" link
- Footer: Terms · Privacy · © ReelCast

**Register.tsx**
- H2 "Create your account" + sub "Start generating Reels in minutes"
- Social buttons (Google, Facebook) at top
- Divider "or sign up with email"
- Role selector (keep 3 cards, refined styling)
- Display name, email, password, confirm password
- Register button
- Footer: same as Login

**ForgotPassword.tsx**
- H2 "Reset your password" + sub explanation
- Email field + Send Reset Link button
- Success state (keep existing pattern)
- "Back to Sign In" link
- Footer: same

### Visual Style

- Keep existing tokens (`bg-card`, `border-border`, `gradient-primary`, `shadow-elevated`, `gradient-glow`, Space Grotesk display, Inter body) — fits memory rules
- Left panel: `bg-gradient-to-br` with subtle dot-pattern overlay + animated glow blob
- Right panel: solid `bg-background`, form max-width ~400px, vertically centered
- Use Framer Motion stagger for left-panel value props (fade + slide)
- Add subtle "border-r border-border/50" between panels on lg+

### Files

- **Create** `src/components/auth/AuthLayout.tsx` — reusable split-screen wrapper, takes `children` for the right panel; left panel content is built-in (shared)
- **Edit** `src/pages/Login.tsx` — wrap form in `<AuthLayout>`, reorder OAuth-first
- **Edit** `src/pages/Register.tsx` — wrap form in `<AuthLayout>`, add OAuth buttons at top for consistency
- **Edit** `src/pages/ForgotPassword.tsx` — wrap form in `<AuthLayout>`

### Notes
- All copy in English (per Core memory rule)
- No new deps — uses existing lucide icons, framer-motion, shadcn primitives
- Mock data only (testimonial, trust badges) — no real API calls
- Mobile: left panel hidden via `hidden lg:flex`, right panel full-width centered

### Out of Scope
- Real OAuth integration
- Real password reset email delivery
- Saving form state / "remember me"
