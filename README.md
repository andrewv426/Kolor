# Kolor

A daily photo-editing game (working title *color-gradle*). One photo a day, five minutes, ten Lightroom-style sliders. Submit your edit to unlock a gallery of how everyone else — humans and AI models — edited the same shot.

## Docs

- [`PRD.md`](PRD.md) — product + architecture, including the frozen render pipeline v1 spec (§6.2.1)
- [`design_handoff_color_gradle/`](design_handoff_color_gradle/README.md) — UI/UX handoff and HTML prototypes
- [`scripts/prepare-master/`](scripts/prepare-master/README.md) — deterministic daily-photo preprocessing CLI
- [`CLAUDE.md`](CLAUDE.md) — agent workflow and load-bearing invariants

## Status

**Phases 0–1 built, running in local mode.** The full daily loop — land → edit under a 5-minute timer → submit → commit-reveal gallery → inspect the exact recipe → like → share receipt — works end-to-end with no backend (`localStorage` + a seeded gallery). Run `npm run dev`. The Supabase path (schema, RLS, adapter) is fully coded but **inert** until real keys land in `.env.local`.

**Phase 2's server-authority half is not built yet** — no live Supabase project, no submit-validator Edge Function (invariant #3 is enforced client-side only today), no Turnstile / rate limits, and the leaderboard shows an honest `#rank of total` placement rather than the eventual percentile. So the MVP is a local prototype, not yet publicly shippable. Next: provision Supabase + the submit Edge Function (PRD §11).
