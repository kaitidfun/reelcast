
## Goal
Make Login, Register, and Forgot Password pages feel like a real-world business product (think Stripe, Linear, Notion auth screens) while keeping the form vertically and horizontally centered. Stay in dark "Studio" theme with existing brand tokens.

## Approach: Centered Split-Card Layout

Currently each page is just a single small card centered on a glow background — looks like a demo. We'll upgrade to a **centered split layout** (form left, brand/marketing right) that still sits in the middle of the screen on desktop, and gracefully collapses to a single centered card on mobile.

```text
┌──────────────────────────────────────────────────┐
│  (subtle dot pattern + radial glow background)   │
│                                                  │
│        ┌─────────────────────────────────┐       │
│        │ FORM PANEL  │  BRAND PANEL      │       │
│        │             │                   │       │
│        │ Logo        │  ✦ Tagline        │       │
│        │ Sign In     │  • Trust point 1  │       │
│        │ [email]     │  • Trust point 2  │       │
│        │ [password]  │  • Trust point 3  │       │
│        │ [Sign In]   │  "★★★★★ quote"    │       │
│        │ ─ or ─      │  — Brand X        │       │
│        │ Google FB   │                   │       │
│        └─────────────────────────────────┘       │
│         © 2026 ReelCast · Privacy · Terms        │
└──────────────────────────────────────────────────┘
```

- Container: `max-w-5xl` card, centered with `flex items-center justify-center min-h-screen`.
- On `< lg`: brand panel hides, form panel becomes a single centered card (`max-w-md`).
- Background: keeps `gradient-glow` + adds subtle `dot-pattern` for texture.
- Footer line under card with copyright + Privacy/Terms links (mock).

## Per-Page Changes

### 1. `src/pages/Login.tsx`
- Split layout (form left / brand right).
- Brand panel: ReelCast logo lockup, tagline "AI-powered commerce reels for modern brands", 3 feature bullets with icons (Zap = Generate in seconds, ShieldCheck = Enterprise-grade, TrendingUp = Track ROI), and a small testimonial card.
- Form: tighter spacing, password visibility toggle (Eye / EyeOff), "Remember me" checkbox next to "Forgot password?", primary button full width.
- Replace the demo prefill text "Use the mock credentials below" with a small subtle "Demo mode" badge in the top corner of the form.
- Keep Google + Facebook OAuth buttons, divider, and Register link.

### 2. `src/pages/Register.tsx`
- Same split layout. Brand panel emphasizes "Join 10,000+ creators", trust badges (SOC 2, GDPR — mock chips), and one short benefit list.
- Form: keep 3 role tiles (Merchant / Affiliate / Brand), but improve hierarchy — section label "I am a…" above tiles.
- Add password-strength indicator bar under password field (weak / medium / strong based on length + variety).
- Add "I agree to Terms and Privacy Policy" checkbox required before submit.
- Add Google + Facebook OAuth buttons for consistency with Login.

### 3. `src/pages/ForgotPassword.tsx`
- Keep single centered card (no split — it's a focused task), but upgrade visuals:
  - Larger header with subtitle.
  - Email input with the same icon style.
  - After submit: success state stays, but adds "Resend email" button with 30-second cooldown timer and "Try a different email" link.
  - "Back to Sign In" as a clearer ghost button at the bottom.

## Shared Polish
- Add a small footer below each card: `© 2026 ReelCast · Privacy · Terms · Support` (links go to `#` for now).
- All cards use `glass-strong` + `shadow-elevated` for that premium real-world feel.
- Use `font-display` (Space Grotesk) for headings, keep Inter for body.
- Add subtle entrance animations via existing framer-motion (already in use).

## Files to Edit
- `src/pages/Login.tsx` — split layout, password toggle, remember-me, demo badge.
- `src/pages/Register.tsx` — split layout, password strength, terms checkbox, OAuth buttons.
- `src/pages/ForgotPassword.tsx` — upgraded success state with resend cooldown, footer.

No new dependencies, no routing changes, no auth logic changes — purely UX/visual upgrade on top of existing mock auth.
