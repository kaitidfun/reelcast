
## Goal
Swap the panels on the auth pages so the brand/visual panel is on the **left** and the form is on the **right**. Reduce text on the brand panel and replace it with a strong **visual/image** treatment.

## Layout Change

```text
BEFORE:                          AFTER:
┌──────────┬──────────┐          ┌──────────┬──────────┐
│  FORM    │  BRAND   │   →      │  VISUAL  │  FORM    │
│  (left)  │  (right) │          │  (left)  │  (right) │
└──────────┴──────────┘          └──────────┴──────────┘
```

On mobile (`< lg`): visual panel hides, form stays centered (same as before).

## Visual Panel Redesign (Left Side)

Replace the heavy text block + 3 feature bullets + testimonial with a **mostly-visual** composition:

- **Hero image**: a stylized vertical "reel preview" mockup — a phone-shape frame showing a gradient product reel with play button, view counter, and floating UI chips (likes, sales). Built with pure CSS/Tailwind + Lucide icons (no external image needed — fits "Studio" theme & stays self-contained).
- **Floating decorative elements**: soft gradient orbs, a small "LIVE" pill, animated sparkle accents using framer-motion.
- **Minimal text**: just a short 4-6 word tagline at the bottom (e.g., "Reels that sell themselves.") + tiny ReelCast wordmark — no paragraphs, no bullet lists, no testimonial quote.
- Background: keeps the gradient + dot pattern, but stronger glow behind the phone mockup for a premium "product hero" feel.

## Per-Page Application

### `src/pages/Login.tsx`
- Swap grid order: visual panel → left (`order-1`), form panel → right (`order-2`).
- Replace current right-side brand content (tagline + 3 features + testimonial) with the new visual hero.
- Border between panels moves to the right edge of the visual panel.

### `src/pages/Register.tsx`
- Same swap. Visual panel left shows a slightly different variant — e.g., the phone reel with a "+12k creators" floating chip instead of the Login variant — to keep pages distinct but consistent.
- Remove the current "Join 10,000+ creators" paragraph + trust badges + benefit list from the panel; condense into one tiny tagline + the visual.

### `src/pages/ForgotPassword.tsx`
- Stays single-card centered (no split). No change here.

## Shared
- No new dependencies. Pure Tailwind + existing Lucide icons + framer-motion already installed.
- Footer, animations, glass styles, OAuth buttons, and form logic remain unchanged.
- Mobile view unchanged — visual panel is hidden, form is the centered card.

## Files to Edit
- `src/pages/Login.tsx`
- `src/pages/Register.tsx`
