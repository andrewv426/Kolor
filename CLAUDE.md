# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: Phase 0–1 built (local mode)

The Next.js app exists and the full daily loop works **in local mode** (no Supabase keys needed — `localStorage` adapter + seeded gallery). The Supabase path is fully coded but inert until real keys land in `.env.local`. Read the doc map below before doing anything substantive.

**Commands** (repo root): `npm run dev` (app at localhost:3000), `npm run build`, `npm run lint`, `npm run test:render` (node-based float16/sRGB/per-op tests for the frozen v1 engine). Copy `.env.example` → `.env.local` with real Supabase values to leave local mode; see `lib/data/README.md` for migrations + dashboard setup.

## Documentation map

| Doc | Role |
|---|---|
| [`PRD.md`](PRD.md) | **Product + architecture source of truth** — loop, features, data model, phases, invariants. |
| [`design_handoff_color_gradle/README.md`](design_handoff_color_gradle/README.md) | **UI/UX source of truth** — screens, copy, tokens, interactions, responsive layouts. HTML prototypes in that folder are design references, not production code. |
| [Figma — color-gradle](https://www.figma.com/design/vh89uJSaSFIVQ28NETwoD8/Untitled?node-id=0-1) | **Visual design file** (file key `vh89uJSaSFIVQ28NETwoD8`). Keep in sync with the handoff README; update via Figma MCP when UI/copy/tokens change. |
| `CLAUDE.md` (this file) | Agent workflow, load-bearing invariants, end-of-run sync checklist. |

When product rules and UI disagree, **PRD wins on behavior/architecture**; **design handoff wins on look, layout, and copy**. Reconcile conflicts explicitly in both docs.

The product (working title *color-gradle*) is a **daily photo-editing game**: each day one unedited photo is shown, the user edits it with ~10 Lightroom-style sliders under a 5-minute timer, then — only after submitting — sees a gallery of everyone else's edits (humans **and** AI models) of the same photo, with each player's exact settings inspectable and likeable.

Code layout: `lib/render/` is the frozen pipeline-v1 WebGL2 engine (float16 packing, UPNG 16-bit decode, the §6.2.1 shader — treat as frozen; changes follow the v2 rule); `lib/data/` is the `DataAdapter` interface with `LocalAdapter` (default without keys) and `SupabaseAdapter`; `lib/types.ts` holds the shared settings contract incl. `clampToneSettings` (the one validator, invariant #3); `supabase/migrations/` is the schema + RLS (commit-reveal enforced in SQL); `app/` + `components/` are the five game screens (E2/R1/G1/D1/S3 per the handoff); `public/photo/dev-001/` is the staged dev photo (already v1-canonical via prepare-master). Remaining phases: Supabase project wiring (needs user keys), Phase 3 photo automation, Phases 4–6 (see PRD §11).

One non-app script exists: **`scripts/prepare-master`** — the single deterministic preprocessing implementation that turns a candidate JPEG into the v1-canonical master + variants (`master16`/`preview8`/`ai768`) **plus the two-plane WebP delivery encoding** (`master16-hi.webp`/`master16-lo.webp`, the 12-bit web-delivery split of master16, ≈42% of the PNG), enforcing the curation-headroom and minimum-resolution gates and writing the manifest (incl. a `delivery` block with `recombinesTo`). Run the full pipeline with `npm install && node index.mjs <input.jpg> [--out <dir>] [--threshold <pct>] [--force]`, or derive only the planes from an existing canonical PNG with `node index.mjs --derive-planes <master16.png> [--out <dir>]`, from inside `scripts/prepare-master/` (see its README for the packing, pinned tool versions, params, and the per-architecture determinism caveat; `node verify-planes.mjs` proves plane equivalence). It is run **manually in Phase 0** (so the very first test photo is already v1-canonical) and **wrapped by the GitHub Actions pre-stage workflow in Phase 3** — same code in both paths. See PRD §6.2.1 for the spec it implements.

## Planned stack (PRD §7.1)

- **Frontend:** Next.js (App Router) + React + TypeScript. The editor uses a hand-rolled **WebGL2 fragment shader** (optionally `twgl.js`/`regl` for boilerplate; `cropperjs` if/when crop ships).
- **Backend/DB/Auth/Storage:** **Supabase** (managed Postgres + Row Level Security, Auth with anonymous + Google, Storage, Edge Functions, `pg_cron`). One vendor by design, to keep ops near zero.
- **Hosting:** Vercel (note: Hobby tier is non-commercial; Pro before public launch).
- **Photo source:** Pexels API (+ admin-curated fallback). **Not Unsplash** — its mandatory hotlinking conflicts with self-hosting user-edited images.

## Load-bearing invariants (do not violate without updating the PRD)

These are the decisions everything else depends on. They are non-obvious and easy to break:

1. **An edit IS a small settings JSON, never a rendered image** (PRD §6.2, §7.3). The whole product hinges on this: it makes "inspect/replay exact settings," AI players, the reveal gallery, and near-zero storage all fall out for free. The gallery **re-renders each tile client-side** from `settings + the one cached daily photo`. Do **not** store rendered images per submission (a cached thumbnail is allowed *only* if measured mobile perf later demands it).

2. **The render pipeline must be deterministic and versioned** — **`pipeline: "v1"` is frozen; PRD §6.2.1 is the spec of record** (which supersedes §6.2). The slider→math mapping is frozen under the `pipeline` version; any change to **any** frozen item ships as a **new version** while the old renderer is kept forever, so historical/shared edits never shift. The freeze now also locks: the **canonical 16-bit master source** and the **frozen three-variant set** (`master16` = 2048px 16-bit sRGB-encoded PNG for the editor + inspect view; `preview8` = 1024px 8-bit WebP for gallery/hero; `ai768` = 768px JPEG for AI input), the **exact piecewise sRGB EOTF/OETF in-shader** (constants `0.04045`/`0.0031308`/`12.92`/`1.055`/`0.055`/`2.4` — never `pow(2.2)`, never hardware SRGB8 sampling), and the **deterministic coordinate-hash output dither** (interleaved gradient noise, ±0.5/255, a pure function of integer pixel `(x,y)` only — no time/random/seed). Also enforce: **fixed op order** (white balance → exposure → contrast → highlights → shadows → whites → blacks → vibrance → saturation → clarity), `highp`, the **linear→perceptual tone-stage split** (white balance + exposure in linear light, then a single OETF into a perceptual working space where contrast/blacks/whites/shadows/highlights/vibrance/saturation run as anchored curves — per the 2026-06-14 §6.2.1 amendment), the **V-flipped texture sample** (image row 0 = display top, since FLIP_Y unpack is pinned false — per the 2026-06-15 §6.2.1 amendment), **integer-quantized** slider values, the UPNG.js/two-plane decode → `RGBA16F` texture path (with the 3-tier fallback ladder), and **one canonical pre-decoded source per day** so every viewer/AI feeds per-variant identical bytes. Target *perceptual* equivalence — bit-identical GPU output across devices is not achievable and not required (byte-identical applies only to the server-side preprocessing outputs). See PRD §6.2.1 for the exhaustive freeze list and the v2 rule.

3. **The slider parameter space is the single source of truth** shared by the editor, the stored `settings` JSON, and the AI players. AI players (PRD §6.7) emit the **same** JSON a human submits and must pass through the **same server-side submit validator** (validate keys, **clamp every value to range**, round to int) — structured-output schemas do *not* enforce numeric min/max, so clamping is mandatory. AI players are **named by their exact model ID** (e.g. `claude-opus-4.8`, `gemini-3-flash`), one player per model, no personas.

4. **Anonymous-first auth via Supabase anonymous sign-in** (PRD §6.5, §7.4). The anonymous `auth.users` row **is** the identity — do not hand-roll device IDs. Google sign-in **upgrades in place** via `linkIdentity` (preserves the user id → all history transfers with zero migration). Everything keys to that stable user id.

5. **Commit-reveal is enforced server-side** (PRD §6.3). The gallery API for *today* must return 403/empty until the user's own submission row exists — never gate this only by hiding a client route.

6. **One global puzzle per day keyed to UTC** (PRD §6.8); the daily photo is **pre-staged ahead** (N+1 days) and served from self-hosted storage/CDN behind a free CDN layer (e.g. Cloudflare, near-100% cache hit), never fetched live from Pexels at play time. **"Raw"/"unedited" now means the canonical preprocessed master** (the 16-bit PNG `master16` + its derived `preview8`/`ai768` variants), **not** camera RAW and **not** a plain unedited JPEG — JPEGs lack the tonal headroom the sliders need. The master is produced by the **deterministic `scripts/prepare-master` pipeline** (JPEG artifact removal + debanding + light denoise → 16-bit expansion → emit the three variants, with pinned tool versions, no timestamps, and a recorded manifest), gated by the **editing-headroom curation test** (reject if combined pixels clipped at 0/255 > ~2%, configurable). Pre-staging runs via a **GitHub Actions scheduled workflow wrapping `scripts/prepare-master`** (pg_cron/Edge Functions can't run this heavy script); `pg_cron` is reserved only for the keep-alive ping and AI-job triggers.

7. **Voting is likes-only** (no downvotes), blind, with exposure-equalization (PRD §6.4). Integrity rests on server-side **UNIQUE constraints** — `UNIQUE(daily_photo_id, player_id)` (one submission/day) and `UNIQUE(submission_id, voter_id)` (one like/edit) — plus Cloudflare Turnstile on anonymous sign-in and rate limits in Edge Functions (PRD §8).

## Data model & build phases

- **Core tables** (PRD §7.2): `profiles`, `daily_photos`, `submissions` (the `settings` jsonb is the edit; AI rows set `ai_model`), `votes`, `friendships` (later), `ai_players`. Most reads/writes go directly through the Supabase client under RLS; use **Edge Functions only where server authority matters** (photo pre-staging, submit validation/clamping, voting integrity, the daily AI job).
- **Phasing** (PRD §11): Phase 0 foundations → Phase 1 editor → **Phase 2 = shippable MVP** (gallery + voting) → Phase 3 photo automation → Phase 4 Google upgrade + history → Phase 5 AI players → Phase 6 friends + polish. Build the data model and render pipeline to support AI players from the start even though they ship in Phase 5.
- **Deferred for now:** streaks/streak-freeze (revisit post-MVP). Open product decisions still pending are tracked in PRD §12. End-to-end verification steps per phase are in PRD §13.

## End-of-run checklist (every session)

Before finishing, check whether your work changed product behavior, UI, tokens, copy, screens, data model, or tooling. If anything drifted, **update docs and Figma in the same session** — do not leave them stale.

### 1. Docs — do these need updating?

| If you changed… | Update… |
|---|---|
| Product rules, loop, backend, data model, phases, invariants | [`PRD.md`](PRD.md) |
| Screens, layout, tokens, typography, copy, interactions, admin console | [`design_handoff_color_gradle/README.md`](design_handoff_color_gradle/README.md) (and the HTML prototype files if the reference UI changed) |
| Commands, stack, doc map, agent workflow | `CLAUDE.md` (this file) |

Skim the affected doc(s) against your diff. Edit sections that are now wrong or missing; add cross-links when a decision spans PRD and design handoff.

### 2. Figma — does the design file need updating?

**Canonical file:** [color-gradle in Figma](https://www.figma.com/design/vh89uJSaSFIVQ28NETwoD8/Untitled?node-id=0-1) (key `vh89uJSaSFIVQ28NETwoD8`).

If UI/visual/copy changed, sync Figma via MCP in the same session:

1. Load the `figma-use` skill before any `use_figma` call.
2. Open the file above via Figma MCP (`plugin-figma-figma`) and push screen/token/copy changes to match the design handoff (or pull from Figma into the handoff if Figma was edited first).
3. For net-new screens or a design-system pass, use `figma-generate-design` / `figma-generate-library` skills against this file.

Skip Figma when the session was docs-only, backend-only, or made no visual/copy changes.

### 3. Done when

- [ ] Relevant markdown docs reflect the current truth.
- [ ] Figma ([`vh89uJSaSFIVQ28NETwoD8`](https://www.figma.com/design/vh89uJSaSFIVQ28NETwoD8/Untitled?node-id=0-1)) is in sync with the handoff, or explicitly unchanged this session.
- [ ] Any intentional PRD ↔ handoff tension is documented in both places.

## Git / PR workflow

- **Branch off `main`.** All work happens on a feature branch; never commit directly to `main`.
- **Authorship.** Commits are authored **solely by Andrew Vong `<andrewvong426@gmail.com>`**. **No `Co-Authored-By` lines and no AI / Claude attribution** in commit messages or PR bodies.
- **PR body = exactly three sections, concise:**
  - `## Summary` — what the PR does and why, in a few lines.
  - `## Changes Made` — the concrete edits (files / behavior).
  - `## Verification Test` — how it was verified (tests run, browser checks, build/tsc status).
- **Quality pass before handing off (every PR):** Opus agent review → root-cause investigation of any findings → Opus agent applies fixes → re-verify. Complete this internal cycle before the draft goes to the user.
- **Draft for the user to review and merge.** Open every PR as a **draft** (`gh pr create --draft`). The **user reviews and merges** — the agent/orchestrator does **NOT** auto-merge.
- **Screenshots on UI changes.** When a PR changes UI / visual output, attach **before/after screenshots** to the PR body (captured via the Playwright or Chrome DevTools MCP).
- **Figma on design changes.** When a PR changes design / UI / tokens / screens / copy, update the Figma file via the Figma MCP in the same cycle (per the end-of-run Figma checklist below).
- **Merge style (when the user merges):** **squash** via `gh pr merge --squash --delete-branch`.
- **Frozen pipeline v1 amendments:** in-place edits to the frozen `pipeline: "v1"` spec are allowed **only pre-launch while zero user edits exist**, and the PR **must update PRD §6.2.1 in the same PR**. **Post-launch, any such change ships as `v2`** (freeze rule, §6.2.1) — never an in-place edit.
