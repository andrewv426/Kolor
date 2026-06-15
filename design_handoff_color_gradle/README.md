# Handoff: color-gradle — a daily photo-editing game

> **Product + architecture:** [`../PRD.md`](../PRD.md) — daily loop, commit-reveal, settings-only edits, data model, build phases. **This file** is the UI/UX source of truth (screens, tokens, copy, interactions). **Figma:** [color-gradle design file](https://www.figma.com/design/vh89uJSaSFIVQ28NETwoD8/Untitled?node-id=0-1) (key `vh89uJSaSFIVQ28NETwoD8`). When they disagree, PRD wins on behavior; this doc wins on look and layout (keep Figma aligned with both).

## Overview
**color-gradle** is a "Wordle for photo editing." Every day there is one unedited photo. The player gets **5 minutes** and **10 Lightroom-style sliders** to make their version, then submits to unlock a gallery of how everyone else — humans and AI models — edited the exact same shot. The package contains two surfaces:

1. **The game** (`color-gradle Hi-fi.html`) — the player-facing daily loop: Landing → Editor → Submit/Reveal → Gallery → Inspect → Result/Share.
2. **The curator console** (`color-gradle Admin.html`) — the operator dashboard: manage today's photo, schedule/queue, game rules, AI players, moderation, analytics.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes that demonstrate the intended look, layout, copy, and behavior. **They are not production code to copy directly.** The task is to **recreate these designs in the target codebase's environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, component library, and state tooling. If no environment exists yet, choose an appropriate stack (a React + Vite SPA is a natural fit) and implement there.

Notably, the photo-editing engine in the prototype is a **CSS-filter approximation** (see "The edit engine" below). A production build should replace it with a real GPU tonal pipeline. Treat the prototype's engine as a spec for *intent and ranges*, not the final image math.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions are all intentional. Recreate the UI faithfully. The one explicit exception is the daily photo itself: the prototype renders a **synthetic CSS-gradient "scene"** as a stand-in. In production this is a real uploaded photograph.

---

## Design Tokens

### Color — "Darkroom" theme (default, dark)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#141210` | App background |
| `--bg-2` | `#0e0d0b` | Recessed areas (editor letterbox) |
| `--panel` | `#1D1A15` | Cards, sheets, sidebars |
| `--panel-2` | `#252118` | Inputs, chips, secondary buttons |
| `--raise` | `#2c281e` | Hover/active raised surfaces |
| `--line` | `rgba(245,238,225,.11)` | Hairline dividers/borders |
| `--line-2` | `rgba(245,238,225,.18)` | Stronger borders |
| `--ink` | `#F2EEE5` | Primary text |
| `--ink-2` | `#A8A192` | Secondary text |
| `--ink-3` | `#736C5E` | Tertiary / metadata |
| `--accent` | `#E0A75C` | Single accent (amber). Primary buttons, active states, fills |
| `--accent-ink` | `#1b140a` | Text/icons on accent |

### Color — "Paper" theme (light, optional Tweak)
`--bg #E9E5DD` · `--bg-2 #DED9CF` · `--panel #FBF9F5` · `--panel-2 #F2EEE6` · `--raise #fff` · `--line rgba(28,24,18,.12)` · `--line-2 rgba(28,24,18,.20)` · `--ink #1B1814` · `--ink-2 #6E685C` · `--ink-3 #9A9384`. Accent unchanged.

### Accent alternatives (offered as a Tweak)
`#E0A75C` (amber, default) · `#D98A86` (rose) · `#9DB089` (sage) · `#7FA8C9` (slate blue) · `#B79BD0` (lilac).

### Typography
- **Display** — `"Instrument Serif", serif`, weight 400. Used for headings (theme name, screen titles, modal titles). Sizes: `h-xl` clamp(36–60px)/line-height 1.0/ls -.01em; `h-lg` clamp(29–40px); `h-md` 24px.
- **UI / body** — `"Hanken Grotesk", system-ui, sans-serif`. Weights 400/500/600/700/800. Base 16px/1.5.
- **Numeric / mono** — `"DM Mono", monospace` (`--mono`), letter-spacing -.01em, `font-feature-settings:"tnum"`. Used for: timer, slider values, day number, badges, likes counts, metadata lines. **Never** used as tracked-uppercase kicker labels.
- **Eyebrow label** — sentence case, body font, 13px, weight 500, `--ink-2`, **no** letter-spacing or uppercase. (This was a deliberate de-"AI-template" decision: avoid uppercase + wide-tracked mono kickers stacked over headings.)

### Radius
`--r: 14px` (cards/sheets) · `--r-sm: 10px` (buttons, inputs, tiles) · `--r-xs: 6px`. Gallery tiles use `8px`. Pills/toggles fully round (`99px`).

### Shadow
`--shadow: 0 24px 60px -28px rgba(0,0,0,.7)` (dark) / `0 22px 50px -30px rgba(40,32,18,.4)` (paper).

### Spacing
Informal 4px-ish rhythm. Common gaps: 8/10/12/14/16/22px. Screen padding: phone 16–20px, desktop 30–48px. Max content width `--maxw: 1180px`.

### Motion
Keep it minimal — no decorative loops. Button press `transform: scale(.975)`. Live dot: 2.4s pulse ring. Modal: 0.16s fade + 0.2s 8px rise. Tile hover: `translateY(-2px)`, .14s. All gated behind `prefers-reduced-motion`.

---

## The edit engine (core concept — read carefully)

Ten sliders, each integer **−100…+100**, default 0. Labels and poles:

| key | label | − pole | + pole |
|---|---|---|---|
| temp | Temperature | Cool | Warm |
| tint | Tint | Green | Magenta |
| exposure | Exposure | Dark | Bright |
| contrast | Contrast | Flat | Punch |
| highlights | Highlights | − | + |
| shadows | Shadows | − | + |
| whites | Whites | − | + |
| blacks | Blacks | − | + |
| vibrance | Vibrance | − | + |
| saturation | Saturation | B&W | Vivid |

**Prototype approximation** (in `hifi/engine.jsx → toFilter`): maps the 10 values to a CSS `filter` string (`brightness`/`contrast`/`saturate`) plus two blend overlays — a warm/cool color wash for `temp` and a magenta/green wash for `tint`. `highlights/shadows/whites/blacks` are loosely folded into brightness/contrast. This is **only** to make sliders feel alive in a prototype.

**Production:** implement a real tonal pipeline (WebGL/WebGPU shader or a canvas LUT) where each slider maps to its true photographic operation, so an "edit" is a faithful, reproducible recipe. The slider→value contract (keys, range, defaults) should stay identical so recipes are portable.

**Color signature** (`colorSignature`): a small generative swatch row derived from the tone (hue from temp/tint, saturation from sat/vibrance, lightness from exposure). Used on the share receipt. Purely decorative; keep or redo as desired.

---

## Screens / Views (game)

> Two frames everywhere: **phone** (max 430px, true full-bleed photo) and **desktop** (contained, max 1180px). The device toggle in the prototype is scaffolding.

### 1. Landing ("Today")
- **Purpose:** Enter the day's puzzle. No login wall.
- **Phone layout:** Full-bleed photo with a top-to-bottom scrim. Top row: smiley logo + "color-gradle". Bottom: solid `Day {n}` badge, eyebrow "Today's theme", serif theme title, primary CTA "Play today's photo", a muted "5:00 · no login" line and an underlined "How to play" link.
- **Desktop layout:** Two columns. Left: logo, dateline eyebrow ("Day 128 · Thursday, June 11"), large serif title, one-line description ("One unedited photo. Five minutes. Ten sliders. Submit your look to see how everyone, human and AI, edited the same shot."), CTA + "How to play" ghost button. Right: **contained hero stage** — the photo in a fixed **4:5** frame (never stretched/cropped to fill), `Day {n}` + "Unedited" badges floating top corners.
- **Returning/already-played state:** CTA area is replaced by: your edit thumbnail (4:5), a `✓ Played` accent badge, "Top 8%", "23 ♥", "next photo in 06:14:22" countdown, and a primary "See today's gallery" button (+ "Share result" on desktop).

### 2. Editor (the 5-minute game) — layout **E2 "full slider list"**
- **Purpose:** Make your edit before the clock runs out.
- **Phone:** Photo pinned top (~46vh band) with a live preview, shown in full (`contain`) so landscape photos letterbox within the band rather than cropping. Top bar: "‹ Exit", `Day {n}` badge, **timer** (mono; turns accent/`.warn` at ≤60s). A "Tap to compare" ghost button (press-and-hold reveals the unedited original) bottom-left over the photo. Below: scrollable list of all 10 labelled sliders; "Adjust" eyebrow + "10 sliders". Sticky bottom bar: "Reset" (ghost) + "Submit" (primary, fills width).
- **Desktop:** Photo left on a recessed `--bg-2` letterbox. The stage now **adapts to the daily photo's aspect ratio** (set from its width/height) so portrait AND landscape photos display in full — no crop, no distortion — replacing the previous fixed 4:5 frame. Capped at max-width 640px and max-height 80dvh, centered in the letterbox. Right: a 360px panel — header "Adjust" + "10 sliders", scrollable slider list, footer "Reset" + "Submit edit".
- **Compare button label:** "Tap to compare" on phone, "Hold to compare" on desktop; shows "Before" while held.
- **Photo-loading state:** while the master streams + decodes, the recessed `--bg-2` letterbox shows a centered loading indicator: a sentence-case mono label "Loading master — 43%" (`--ink-2`, DM Mono, tnum) above a thin amber (`--accent`) progress bar on a hairline (`--line`) track, ~220px wide. The percentage is driven by real download bytes; the bar clears the moment the photo renders. Minimal, no spinner; the bar's width transition is gated by `prefers-reduced-motion`. (The master is delivered as two lossless-WebP planes ≈42% the size of the source PNG — see PRD §6.2.1 delivery amendment.)
- **Photo-error state:** overlay with a warning glyph, "Couldn't load today's photo", "Your edits are saved. Check your connection and retry.", and a "Retry" button. Sliders stay usable.

### 3. Submit → Reveal — treatment **R1 "confirm sheet"**
- **Purpose:** Commit. One submission per day; no re-edits after.
- The blurred, darkened edit fills the screen. **Phone:** a bottom sheet. **Desktop:** a centered modal card. Contents: your edit thumb (4:5), serif "Lock it in?", body "You can't re-edit today's photo once you submit. Your look joins the gallery.", buttons "Keep editing" (secondary) + "Lock & reveal" (primary → Gallery, marks played).

### 4. Reveal Gallery — layout **G1 "uniform grid"**
- **Purpose:** See every edit of the same photo.
- **Header:** serif "Today's gallery", subtext "{count} edits · by likes", "Your result" ghost link. **Sort tabs:** segmented control **Top / New** (Top = by likes; "Surprising" was removed). 
- **"You" strip:** a subtle accent-tinted row pinned under the header — your edit thumb, `YOU` badge, handle (or "Anonymous"), "Top 8% · 23 likes", "Share" button.
- **Grid:** uniform tiles (phone 2-col, desktop 4-col), each 1:1. Tile shows the edit (same photo re-rendered with that recipe), a dashed amber `AI` badge top-left for model edits, and a bottom overlay with avatar + name + a heart/likes count. Hearts are tappable (optimistic like toggle). Tap a tile → Inspect.
- **Early/sparse state:** a quiet bordered banner "You're early. Only a few edits so far — more roll in through the day." and fewer tiles.

### 5. Edit Detail / Inspect — layout **D1 "photo + recipe"**
- **Purpose:** See the exact slider values behind any edit; copy them.
- **Phone:** the edit (1:1) on top with a "Hold for original" press button and "‹ Gallery" back. Below: creator row (avatar + handle, or dashed `AI` badge with model name — **no "AI ·" prefix**, just the model name) + like button; eyebrow "The recipe"; all 10 sliders rendered **read-only** (knob, no input); primary "Load these onto my photo".
- **Desktop:** two columns — left the edit (4:5) + hold-for-original; right creator row, divider, "The recipe" + "v1", a 2-col read-only slider grid, "Load these onto my photo" + helper "re-renders your raw photo with their exact values".
- **"Load onto mine"** copies that recipe into your tone and returns to the Editor.

### 6. Result / Share — treatment **S3 "receipt stub"**
- **Purpose:** A distinctive, spoiler-safe shareable.
- A narrow **receipt** card, all mono, dashed rules between sections: "COLOR·GRADLE" / "DAY {n} — {THEME}" header; the edit (1:1); rows PLAYER (handle or ANONYMOUS) / RANK (TOP 8%) / LIKES (23 ♥) / TIME (3:42); "COLOR SIGNATURE" swatch row; footer "✦ NEXT PHOTO IN 06:14:22 ✦". Buttons below: "‹ Gallery", "Copy card", "Share". (Actual share-image rendering — e.g. canvas → PNG — is not built; wire it up in production.)

### First-run "How to play" modal
3 numbered steps: "One photo a day" / "5 minutes, 10 sliders" / "Submit to unlock". Shows once (persisted), re-openable from the "How to play" link. Contained within the device frame; dismiss via ✕ or "Let's play".

### Login modal (optional; anonymous by default)
Players are anonymous unless they log in. The dialog frames an account as a way to "keep your streak, claim a handle, find your edits later," with an email field, optional handle, "Continue", and a "Keep playing anonymously" escape. Identity, when set, flows into the gallery "You" strip and the share receipt PLAYER row.

---

## Screens / Views (curator console)

Left sidebar (smiley + "color-gradle" / "CURATOR CONSOLE"), nav items: **Today, Schedule (5), Game rules, AI players, Moderation (2), Analytics**, plus a "View live game" link. Top bar per page: serif title + subtitle, "Publish changes" primary button, a transient "✓ saved" indicator.

- **Today** *(primary):* manage the live photo. Left panel: the photo (4:5) with `Day {n}` + "Unedited master" badges, "Change photo" (file picker) + "Reset to sample", a drop zone ("Drop a RAW or JPEG… Best at 4:5, 2000px or larger"). Right: **Details** (theme name, day #, category select), **Publishing** (daily reset time, "Show live player count" toggle, "Allow late entries" toggle), and two stat cards (players, completed %). *Behavioral note (not UI copy):* an admin-uploaded photo is **not** served as-is — it passes through the **same deterministic preprocessing pipeline** as Pexels photos (`scripts/prepare-master`: deband/denoise → 16-bit master → variants → clipping check) before going live. Skipping this for admin-fallback days would break the determinism contract (PRD §6.2.1).
- **Schedule:** "Upcoming queue" (draft/scheduled/live rows, each with a distinct scene thumbnail, theme, day + date) + "+ Schedule a day"; an "Archive" list of past days with players/edits. Status pills: `live` (accent), `scheduled` (blue), `draft` (muted), `archived` (dashed).
- **Game rules:** "The round" — time limit select (2/3/4/5/7/10 min), "Allow reset", "Hold to compare", "One submission per day" toggles. "Available adjustments" — a toggle per slider to enable/disable any of the 10.
- **AI players:** toggle which models compete (claude-opus-4.8, gemini-3-pro, gpt-5.4, llama-4-vision); "Behavior" — "Reveal AI before humans", "Let AI edits be liked".
- **Moderation:** flagged-edits queue (thumbnail, handle, reason, Keep/Remove).
- **Analytics:** stat cards (players, completion %, median time, likes, returning %) + a 7-day completion bar chart.

---

## Interactions & Behavior (locked product decisions)
- **Ranking = likes.** Gallery "Top" sorts by like count; the "You" strip rank, how-to copy, and share all reflect likes-based ranking.
- **Timer expiry = auto-submit as-is.** When the 5:00 clock reaches 0, the current edit is locked in exactly as it stands and the player proceeds straight to the gallery (no confirm dialog).
- **Identity = anonymous by default.** No login required to play; edits and likes attribute to "Anonymous". Login is **optional** and only adds streak/handle/history. (A real auth system is expected in production.)
- **One submission per day**, no re-edits after lock (enforced via the `played` flag).
- **Compare:** press-and-hold to view the unedited original; release to return to the edit.
- **Like:** optimistic toggle on gallery tiles and the inspect view.
- **AI edits** are always clearly badged (dashed amber `AI`).

## State Management
Prototype keeps everything in React state + `localStorage` (keys prefixed `cg2_`). The meaningful app state to model in production:
- `tone` — the 10 slider values (the player's working edit).
- `played` (bool), `user` (handle | null), `liked` (set of edit ids).
- `screen` / current route; `device` is prototype-only.
- Curator config (`cg2_cfg`): theme name, day #, category, reset time, toggles, time limit, disabled sliders. The console writes `cg2_theme`/`cg2_day`/`cg2_src` which the **game reads** — i.e. changing the photo/theme/day in admin updates the live game. In production this is a shared backend record for "today's puzzle," not localStorage.
- Data the prototype fakes that needs real services: today's photo + master, the edits gallery (with creator + likes), AI model submissions, analytics, moderation queue, auth.

## Responsive behavior
Two discrete layouts (phone ≤ ~430px vs desktop). The contained hero/editor stages cap the photo at a fixed aspect ratio rather than stretching — preserve this; it's the answer to "won't the image stretch full-screen on desktop?" Admin grids collapse to single column under ~1040px; sidebar becomes a horizontal scroll under ~760px.

## Assets
- **No bitmap assets.** The daily photo is a synthetic CSS gradient ("scene") placeholder — replace with real uploaded photos. Distinct scene gradients are defined per scheduled day in `hifi/admin-data.jsx → SCENES`.
- **Logo:** an inline SVG smiley in `--accent` (also the favicon, as an inline data-URI). Not an emoji.
- **Icons:** small inline SVG stroke icons (admin nav). No icon library; swap for the codebase's preferred set.
- **Fonts:** Google Fonts — Instrument Serif, Hanken Grotesk, DM Mono.

## Prototype-only scaffolding to drop in production
The fixed bottom-left "States" menu, the bottom-center flow nav (01–06), the bottom-right "Admin / Phone / Desktop" toggle, and the Tweaks panel are all prototype affordances — not part of the product UI.

## Files
- `color-gradle Hi-fi.html` — game entry; loads the `hifi/` scripts below.
- `color-gradle Admin.html` — curator console entry.
- `hifi/hifi.css` — all game theme tokens + component styles (start here for tokens).
- `hifi/admin.css` — curator console styles.
- `hifi/engine.jsx` — sliders, `toFilter` (edit math), `colorSignature`, preset edits, seed tone.
- `hifi/ui.jsx` — Photo (filtered preview), Slider, Signature, Heart, Avatar.
- `hifi/states.jsx` — How-to, Login, PhotoError, Account components.
- `hifi/screens1.jsx` — Landing + Editor.
- `hifi/screens2.jsx` — Reveal + Gallery.
- `hifi/screens3.jsx` — Detail + Share.
- `hifi/app.jsx` — game shell: routing, state, persistence, Tweaks.
- `hifi/admin-data.jsx` — SCENES, SCHEDULE, ANALYTICS, FLAGGED, AI_PLAYERS (all mock data).
- `hifi/admin.jsx` — curator console (all six panels + shell).
- `hifi/tweaks-panel.jsx` — Tweaks UI (prototype only).

A `wireframes/` reference is also included: the original low-fi exploration that shows the 3 alternative directions considered for each screen (the chosen ones are noted above as E2/R1/G1/D1/S3).
