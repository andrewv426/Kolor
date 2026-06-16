# PRD — Daily Photo-Editing Game (working title: *color-gradle*)

> A "Wordle for photo editing." Every day, one unedited photo. You get 5 minutes to edit it with ~10 Lightroom-style sliders. Submit to unlock a gallery of everyone else's edits of the *same* photo — humans **and** AI models — where you can inspect the exact settings each used and like your favorites. No login required; sign in with Google later to keep your history and add friends.

---

## 1. Context — why build this

There's no low-commitment, daily, social way for casual people to *play* with photo editing. Pro tools (Lightroom, Photopea) are intimidating and solitary; social photo apps (Instagram, BeReal) are about *capturing*, not *editing*. This product turns photo editing into a daily 5-minute game with a built-in social payoff: a shared constraint (everyone edits the same photo) makes results directly comparable, and a reveal-after-submit gallery makes "how did *you* edit it?" the hook. AI models playing alongside humans add novelty (and solve the empty-gallery cold-start problem).

**Intended outcome of this document:** a decision-ready product + technical blueprint, grounded in current (2025–2026) tooling, that a non-expert solo builder can execute incrementally — with a clearly marked MVP boundary and a phased path to the full vision.

**Related docs:** UI screens, design tokens, copy, and interaction specs live in [`design_handoff_color_gradle/README.md`](design_handoff_color_gradle/README.md) (HTML prototypes in that folder are design references, not production code). Visual designs: [Figma file](https://www.figma.com/design/vh89uJSaSFIVQ28NETwoD8/Untitled?node-id=0-1) (`vh89uJSaSFIVQ28NETwoD8`). Agent workflow and the end-of-run docs/Figma sync checklist are in [`CLAUDE.md`](CLAUDE.md). **PRD wins on product behavior and architecture; design handoff wins on look, layout, and copy.**

---

## 2. Confirmed decisions (from kickoff Q&A)

| Decision | Choice |
|---|---|
| Game mechanic | **Community voting + likes** → a daily leaderboard |
| First MVP scope | **Editor + shared gallery** (needs a backend/DB from day one) |
| Photo source | **Stock-photo API (Pexels) now**, admin-curated picks as fallback; **community-curated at scale** |
| Editing depth | **"Lightroom-lite" ~10 sliders** |
| Auth | **Anonymous-first**, Google OAuth as an upgrade (history + friends) — later phase |
| AI players | Models edit the photo by emitting settings in the app's own parameter space; **named by their model ID** — later phase, but architected for from day one |

---

## 3. Goals & non-goals

**Goals (MVP):**
- Anyone can land on the site and, with zero signup, play today's photo in <6 minutes end-to-end.
- A 5-minute timed editor with ~10 expressive, Lightroom-style controls that produces visibly different looks.
- On submit, a reveal gallery of everyone else's edits of the same photo, each with **inspectable exact settings** and a one-tap like.
- A daily leaderboard driven by likes.
- Cheap to run (target **$0/mo** at launch), low-ops, maintainable by one non-expert.

**Non-goals (MVP — explicitly deferred):**
- Google login, persistent cross-device history, friends (Phase 4–6).
- AI players in the live gallery (Phase 5 — but the data model and render pipeline must support them now).
- **Browser-side** camera-RAW editing, layers, masks, local adjustments, brushes. (Note: server-side RAW *ingest* into the canonical master **is** supported — Level-1 demosaic in `scripts/prepare-master`, §6.2.1/§6.8 — what's out of scope is decoding/editing RAW in the player's browser.)
- Native mobile apps (responsive web only), comments, DMs, monetization.
- Streaks / streak-freeze retention mechanics (deferred — revisit post-MVP as a retention layer).

---

## 4. Target users

- **The casual daily-game player** (Wordle/BeReal audience): wants a quick, satisfying daily ritual. Doesn't know photo-editing jargon.
- **The creative/photography hobbyist:** enjoys expressing a "look," comparing techniques, and copying others' settings to learn.
- **AI-curious onlookers:** drawn by "can the AI out-edit me?" — a differentiator and a sharing hook.

---

## 5. The daily core loop (the heart of the product)

A strict **commit → reveal** loop (BeReal's "post to view" + Wordle's once-a-day ritual). You cannot see anyone else's edit until you've submitted your own.

1. **"Today" landing.** Opens directly into today's puzzle — no login wall. Shows: today's unedited photo preview, **Day #NNN** badge, a one-line theme ("Golden Hour Street"), live count of today's players, and one CTA: **Play today's photo**. If you already played: shows *your* edit + a countdown to tomorrow + **View today's gallery**.
2. **Get ready** (first-time only, then skipped). Two sentences: "Edit this photo your way in 5 minutes. Submit to unlock everyone else's edits." Timer does **not** start until you tap **Start** (so a slow load never burns your time).
3. **Editor (5-min timed game).** Photo fills the screen; slider tray below/side; a calm `mm:ss` countdown top-right; press-and-hold **before/after** compare; **reset**; **Submit** is enabled the whole time (submit early if you like). At `0:00`, **auto-submit** fires with the current sliders — a play is never lost.
4. **Submit confirm.** "Lock it in? You can't re-edit today." → optimistic local render + write the **settings vector** to the backend. This is the *commit*.
5. **Reveal transition.** A 1–2s "Unlocking today's gallery…" beat that does real work (generates the share card, fires the gallery query) and supplies the emotional payoff.
6. **Reveal gallery.** Grid of everyone's edits of the same photo (humans + AI, AI clearly badged). Your edit is pinned top with a **You** marker. Sort tabs: **Top** (likes, default), **New** (recency), **Surprising** (most different from the median — rewards creativity). Tap a tile → **detail view**: large comparison, the **exact slider values** that produced it, a "load these settings to compare against mine" toggle, the creator's handle/AI model name, like count, like button.
7. **Result / share card.** Spoiler-safe: Day #, your edit thumbnail, a stat line ("Top 8% today • 23 likes"), and a small generative "color signature." One-tap share copies an image card + link. Countdown closes the loop.

**Design rule:** the *only* path to the dopamine (the gallery + social comparison) is to first produce your own edit.

---

## 6. Feature requirements

### 6.1 The editor & the ~10 sliders

Edits are **non-destructive and stored as a tiny parameter vector**, not a rendered image (see §7.3 — this is the single most important architectural decision; it makes "inspect exact settings," AI players, and near-zero storage all fall out for free).

**Core controls (v1 — order matches how a user naturally works):**

| # | Slider | Range (default) | What it does |
|---|---|---|---|
| 1 | Temperature | −100..+100 (0) | Cool ↔ warm white balance |
| 2 | Tint | −100..+100 (0) | Green ↔ magenta white balance |
| 3 | Exposure | −100..+100 (0) → ≈ ±2 stops | Overall brightness |
| 4 | Contrast | −100..+100 (0) | Spread/compress tones around mid-gray |
| 5 | Highlights | −100..+100 (0) | Recover/brighten bright (not white) areas |
| 6 | Shadows | −100..+100 (0) | Lift/deepen dark (not black) areas |
| 7 | Whites | −100..+100 (0) | Set the white point |
| 8 | Blacks | −100..+100 (0) | Set the black point |
| 9 | Vibrance | −100..+100 (0) | Smart saturation; protects skin tones |
| 10 | Saturation | −100..+100 (0) | Uniform color intensity (−100 = grayscale) |

**Optional / bonus (ship if time allows; keep engine simple if not):** Crop & Straighten (geometry, stored separately) and Clarity (local midtone contrast — needs an extra blur pass, so it's the first to cut).

**Rendering engine — recommendation: WebGL2 (single full-screen-quad fragment shader).**
- All ~10 adjustments are per-pixel point/tone ops → one shader pass over a texture, with the slider values passed as **uniforms**. ~60fps on mid-range phones at full resolution.
- **Do not** use Canvas2D pixel loops (too slow, 8-bit banding) or a filter framework (glfx.js is unmaintained and lacks the Lightroom tonal model). **Do not** make WebGPU the baseline yet (incomplete mobile coverage; no benefit for one point-ops pass — but keep the renderer behind a thin interface so a WebGPU backend can be added later).
- **Own a ~150-line GLSL shader**, optionally using **twgl.js** or **regl** (both MIT, maintained) just for boilerplate. Borrow tone-math snippets from MIT references (glfx.js source, LYGIA/SweetFX vibrance). Pair with **cropperjs** (MIT) if/when crop ships.
- Performance tactics: the **live editor preview** may render to a downscaled viewport-sized canvas for interactivity — but this is an **approximation, not the stored look**: the authoritative "exact settings" render (gallery/inspect re-render) is always done at the **canonical render resolution** (master16's native 2048px long edge), then downscaled for display only (see §6.2.1). Upload the source to **one texture once** and only update uniforms per drag; `precision highp float` with a `getShaderPrecisionFormat` fallback to `mediump`/CSS filters on old GPUs.

### 6.2 The settings model & the determinism contract (critical)

The product's defining feature — "see and re-apply the exact settings any player used" — requires that an edit be a small, serializable, **deterministically replayable** vector.

**Example stored settings object:**
```json
{
  "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
  "photoId": "2026-06-02",
  "crop": { "rect": [0.04, 0.0, 0.92, 1.0], "angle": -1.5, "flipH": false, "aspect": "original" },
  "tone": { "temp": 18, "tint": -6, "exposure": 12, "contrast": 22,
            "highlights": -40, "shadows": 35, "whites": 10, "blacks": -15,
            "vibrance": 28, "saturation": -5, "clarity": 15 }
}
```

**Determinism rules (the frontend↔backend contract — bit-identical GPU output across devices is *not* achievable, so target perceptual equivalence, which is fully sufficient for a like/vote game):**
1. **Versioned, frozen pipeline.** `pipeline: "v1"` freezes the slider→math mapping *forever*. Any math change ships as `v2`; the `v1` renderer is kept so old/shared edits never shift.
2. **Fixed color space + working spaces.** Tag the drawing buffer sRGB (context attributes pinned in §6.2.1); decode sRGB→linear at shader entry via the in-shader EOTF, do **white balance + exposure in linear light**, then OETF-encode **once mid-chain** into a **perceptual (sRGB-gamma) working space** where the remaining tone/color ops run (the tone-stage architecture, §6.2.1, amendment 2026-06-14). The single in-shader OETF is that linear→perceptual move; the output stage is already perceptual, so it dithers and quantizes with **no second OETF**. sRGB *encoding* happens **only** in-shader — the canvas colorspace is just the display tag, never a second conversion.
3. **Fixed op order** (does not commute): white balance → exposure → contrast → highlights → shadows → whites → blacks → vibrance → saturation → (clarity).
4. **`highp` + integer-quantized inputs.** Store every slider as an integer in its range so there's no float-formatting drift in the JSON.
5. **Geometry normalized** (crop rect 0..1, angle in degrees) → resolution-independent.
6. **One canonical preprocessed master per day + a frozen variant set.** Each day's photo is preprocessed once, server-side, into a canonical 16-bit sRGB-encoded master plus a frozen set of derived variants (master16 / preview8 / ai768), so every viewer and AI player feeds the renderer **identical per-variant source bytes**. The full source, variant, decode/texture, transfer-function, dither, preprocessing, and curation details — and the exhaustive list of what `v1` freezes — are specified in **§6.2.1**, which this rule defers to. (Without this, re-rendering isn't deterministic.)

#### 6.2.1 Pipeline v1 spec (frozen)

This subsection makes the §6.2 determinism contract concrete and **freezes `pipeline: "v1"` forever**. It supersedes the earlier "raw = high-quality unedited JPEG" framing (§6.8): **"raw" / "unedited" now means the canonical preprocessed master** described below — not the *player-facing* camera RAW and not the delivered stock JPEG (the master may, however, be *derived from* a JPEG **or** a camera-RAW file via the server-side Level-1 demosaic — see the 2026-06-15 amendment below) — because JPEGs lack the tonal headroom the sliders need (clipped highlights, 8-bit banding, block artifacts that exposure/contrast amplify). The driving constraint is **replay stability**: the same `settings` JSON + the same daily photo must yield a perceptually identical render on any device, today and years from now. Everything below is part of the v1 freeze (see the freeze rules at the end).

##### Canonical source + the frozen variant set

Each day's photo is preprocessed **once, server-side** (Phase 0: a manual script; Phase 3+: the same script in a GitHub Actions scheduled workflow) into exactly three deterministically-derived variants. The determinism contract is **per-variant identical bytes** (same input → same output file) and **perceptual equivalence across variants** at their respective display sizes — variants are *not* expected to be pixel-identical to each other.

| Variant | Resolution (long edge) | Bit depth | Format / encoder | Consumed by |
|---|---|---|---|---|
| **master16** | 2048 px | 16-bit/channel, sRGB-**encoded** | PNG (pinned `oxipng`, no ancillary time/text chunks) | Editor render surface; inspect/detail comparison view |
| **preview8** | 1024 px | 8-bit/channel | WebP, lossy (pinned `cwebp`, fixed quality) | Gallery tiles; landing hero |
| **ai768** | 768 px | 8-bit/channel | JPEG, baseline (pinned `mozjpeg`, fixed quality) | Image bytes sent to AI players (§6.7) |

`master16` is sRGB-**encoded** (gamma-domain) 16-bit, *not* linear-light 16-bit: the extra bits buy headroom and kill 8-bit banding while keeping the file in the same transfer function the shader already decodes. The `daily_photos` row records the storage paths for all three plus the preprocessing manifest. Storage is ~8–18 MB/day (trivial); egress is solved by serving the one immutable file/day through a free CDN layer (near-100% cache hit, §9); the gallery loads only the small preview8.

**Web delivery of master16 uses the two-plane WebP encoding** (amendment 2026-06-12, below): the editor fetches `master16-hi.webp` + `master16-lo.webp` (≈42% of the PNG; **7.57 MB** vs **18.1 MB** for dev-001) and recombines them client-side to the 12-bit-quantized master samples. `master16.png` remains the **canonical/archival** artifact (the planes are derived from it as a pure function); the editor falls back to the PNG if the planes are unavailable. See the delivery-encoding amendment for the exact packing, pinned flags, and equivalence proof.

##### Client decode + texture upload path (WebGL2)

**Pinned context attributes (frozen).** Request the WebGL2 context with exactly: `{ alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, antialias: false }`, and set `gl.drawingBufferColorSpace = 'srgb'` explicitly (do not rely on the default; `'display-p3'` would re-map output). `alpha: false` keeps the canvas opaque so displayed pixels never composite over the page background. sRGB *encoding* is the in-shader OETF's job — the colorspace attribute only tags the buffer for display.

1. **Decode `master16`.** Decode the 16-bit PNG with **UPNG.js (MIT, pinned to an exact version + integrity hash, recorded in the manifest)** via `UPNG.decode(buf)` → an image whose `img.data` is the raw PNG sample bytes (UPNG does **not** byte-swap; PNG 16-bit samples are **big-endian**). Do **not** use `UPNG.toRGBA8` (8-bit only). We decode in JS because the browser's native `Image`/`createImageBitmap` path silently truncates 16-bit PNGs to 8-bit (and may apply implicit color management), defeating the entire headroom design. Verify `depth === 16` and `ctype === 6` (RGBA) from UPNG's header before upload. **Reassemble each 16-bit sample explicitly as `(hi << 8) | lo`** from the big-endian byte pairs into a host-native `Uint16Array` of interleaved RGBA samples — never reinterpret the buffer directly (that swaps high/low bytes on little-endian hosts). Channel order is R,G,B,A.
2. **Pack to half-float and upload once per day to an `RGBA16F` texture.** `type = gl.HALF_FLOAT` does **NOT** normalize integers — it interprets each 16-bit element as an IEEE-754 half-float **bit pattern**, so handing it raw `0..65535` sample values yields garbage (`0xFFFF` → NaN, `0x7C00` → +Inf), *not* `1.0`. There is no GPU-side "normalize on upload" for a float type (that only exists for `*_UNORM` formats). Therefore, in JS, convert **every** sample to a normalized value `s / 65535.0` ∈ `[0,1]` and then to its **half-float bit pattern** (via a `Float16` packer — e.g. round-trip through `Math.fround` then the standard binary16-from-binary32 reduction, or a pinned `float16` helper), producing a `Uint16Array` of half **bits**. Upload that array with `internalformat = gl.RGBA16F`, `format = gl.RGBA`, `type = gl.HALF_FLOAT`, `LINEAR` min/mag filtering. The half-bit packer (its exact rounding) is part of the v1 freeze. **Linear filtering of half-float textures is core WebGL2** — no extension (`OES_texture_half_float_linear` is WebGL1-only). This is the property the whole decode path depends on.
   - **Pinned unpack/pixel-store state for the upload:** `UNPACK_FLIP_Y_WEBGL = false` (master16 is stored top-row-first; orientation is load-bearing because the dither and `gl_FragCoord` addressing are coordinate-pure), `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE`. (For `ArrayBufferView` uploads the spec ignores premultiply and colorspace conversion, but `FLIP_Y` **is** honored — so it must be pinned.) Preprocessing emits master16 with **fully-opaque alpha** (`A = 65535` everywhere); the shader forces output alpha opaque, so premultiply is moot.
   - **Texture orientation — V is flipped at the sample (frozen, 2026-06-15 pre-launch amendment).** Because `UNPACK_FLIP_Y_WEBGL` is pinned `false`, image **row 0 is texture coordinate `t = 0`** and the last image row is `t = 1`. The full-screen triangle maps **screen-top to `v_uv.y ≈ 1`**, so sampling at `v_uv` directly would display the image upside-down (screen-top = image-bottom). Therefore the shader samples with V flipped — `texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y))` — so that **image row 0 renders at display top** for every surface (editor, gallery tiles, inspect), consistently. This is purely a sampling-coordinate convention and does **not** affect determinism: the dither reads `gl_FragCoord` (the *destination* pixel) and is independent of the source-fetch coordinate, so output is unchanged at any given screen pixel. (Amended **in place under `v1`** — zero user edits minted yet, pre-launch; **post-launch this would ship as `v2`** per the freeze rule.)
   - **v1 conformance test:** a known PNG16 swatch (a handful of specific sRGB-encoded 16-bit values) must decode, byte-reorder, half-pack, upload, and sample to the **known linear values at shader entry** (after the EOTF) — a fixed golden vector checked in CI. This locks both the byte order (step 1) and the half-float packing (step 2).
3. **We render to the default 8-bit canvas**, so we sample a half-float texture but write 8-bit. Therefore **`EXT_color_buffer_half_float` is NOT required** — that extension governs *rendering into* float framebuffers, which we do not do. (It would only matter for a future offscreen half-float pass, e.g. a clarity blur; out of v1 scope.)
4. **Per-drag updates touch uniforms only.** The texture is uploaded once per day; slider drags set integer-derived uniforms and re-issue the single full-screen-quad draw. No re-upload, no re-decode — this keeps ~60fps and is also why the source bytes never change within a day.

**Why not hardware sRGB sampling.** We deliberately do **not** use an `SRGB8_ALPHA8` texture with hardware sRGB→linear on sample. Hardware sRGB decode is defined only for 8-bit UNORM formats (so it cannot carry the 16-bit headroom), and — critically — **the GPU's decode/linear-filter ordering and rounding is implementation-defined** (decode-then-filter vs. filter-then-decode differs across drivers), a direct source of cross-device replay drift. Instead we sample raw sRGB-encoded values with plain `LINEAR` filtering and apply the **exact piecewise sRGB EOTF in-shader** (below).

##### Fallback ladder (capability-gated, deterministic per tier)

The tier is a property of the **viewer's device at render time**, not of the submission. Checks run once at editor init:

| Tier | Capability check | Behavior |
|---|---|---|
| **A — half-float (target)** | WebGL2 context **and** `RGBA16F` + `HALF_FLOAT` texture allocates with no `getError`, `LINEAR`-filters, **and** UPNG reports `depth === 16` | Decode master16 → RGBA16F; full pipeline. Dither **on**. Canonical path. |
| **B — 8-bit UNORM** | WebGL2 present but Tier A allocation/decode fails (rare/old drivers) | Decode **preview8** → `RGBA8` UNORM texture; **same shader** (still sRGB-decode in-shader). Dither **stays on** (it matters most here). |
| **C — CSS filters** | No usable WebGL2, or `getShaderPrecisionFormat` reports no usable fragment `highp` | Approximate with CSS `filter`/`backdrop-filter` on preview8. **Explicitly not** part of the determinism contract; flagged as approximate; never used for the inspect "exact settings" comparison. |

##### Canonical render resolution + cross-viewer replay contract

The same `settings` JSON is rendered at three different sizes — the author's (possibly downscaled) editor viewport, a gallery tile, and the full-resolution inspect view. Because the output dither is a pure function of **destination** `gl_FragCoord.xy`, and because `LINEAR` source sampling and any neighborhood op (clarity blur) are resolution-dependent, these renders are **not** pixel-identical. v1 resolves this with two pins:

- **Authoritative render = canonical resolution.** Any "exact settings" render (the reveal-gallery tiles and the inspect/detail view) is computed at the **canonical render resolution = master16's native 2048px long edge**, then **downscaled for display only** as a post-step (CSS/`drawImage`). Gallery tiles MAY render at a smaller internal resolution as a perf optimization, accepting sub-perceptual dither/sampling differences from the 2048px canonical; the inspect "exact settings" comparison MUST use the canonical 2048px render. The **live editor preview is explicitly an approximation** (it may run downscaled for interactivity) and is *not* the authoritative stored look; the stored look is what the canonical-resolution re-render produces from the submitted `settings`.
- **All gallery/inspect re-renders use master16 on the viewer's device — regardless of the author's capture tier.** The gallery re-renders everyone's tiles **on the viewer's machine** from `settings + master16`, so a submission's appearance depends only on the settings vector and the canonical master, **not** on which tier the author captured with. **Tier B/C are capture-time approximations the author accepts** (they edit against preview8 / CSS because their device can't sustain Tier A), but their submission is **re-rendered "correctly" for every other viewer** on Tier A from master16 — and re-rendered on master16 for the author too on any later Tier-A view. This is what makes "see the exact edit any player made" hold across devices. The tier is therefore **not** stored as a replay key; it only governs *that one session's* live capture fidelity. (A Tier-B/C author is shown a one-time note that their on-device preview is approximate.)
- **Display-time downscaling is outside the frozen contract (advisory).** In most layouts the 2048px canonical render is CSS-downscaled to a much smaller display box, relying on the browser's default (bilinear) filtering. The sub-LSB output dither is sub-perceptual after that downscale (verified), so no display-stage filtering change is needed for v1. If measured speckle on real edits later proves objectionable on the gallery/inspect surfaces, a box/mip (averaging) downsample MAY be layered in at display time without a version bump — display scaling is not part of the frozen render contract, which governs only the canonical-resolution pixels, not how they are resampled for the screen. This changes no frozen rule.

##### Exact sRGB ↔ linear transfer functions (in-shader)

All tone math runs in **linear light**, per channel, at `precision highp float`. The shader applies these **exact piecewise** functions — **never** `pow(2.2)`, **never** hardware SRGB8 sampling. These two functions are the only places transfer-function math occurs.

```glsl
// EOTF — sRGB-encoded c ∈ [0,1] → linear (at shader entry):
float srgbToLinear(float c) {
  return (c <= 0.04045) ? (c / 12.92)
                        : pow((c + 0.055) / 1.055, 2.4);
}
// OETF — linear c → sRGB-encoded (at output, before dither + quantization):
float linearToSrgb(float c) {
  return (c <= 0.0031308) ? (c * 12.92)
                          : (1.055 * pow(c, 1.0 / 2.4) - 0.055);
}
```

Frozen constants: `0.04045`, `0.0031308`, `12.92`, `1.055`, `0.055`, `2.4`.

##### Frozen op order + two working spaces (highp)

All ten core ops (plus optional clarity) run at `highp`, in this fixed, **non-commuting** order (restating §6.2 rule 3):

> **white balance (temp → tint) → exposure → [enter perceptual space] → contrast → highlights → shadows → whites → blacks → vibrance → saturation → (clarity)**

**Two working spaces (frozen, tone-stage amendment 2026-06-14).** Tone shaping is split across two spaces rather than run wholly in linear light:

- **Linear-light stage** — EOTF decode (entry) → **white balance (temp, tint) → exposure**. These three are physically multiplicative gains and stay in linear light; exposure may drive values `> 1.0`.
- **Perceptual stage (sRGB-gamma)** — immediately after exposure the signal is **OETF-encoded ONCE** (`linearToSrgb`, the same monotonic function used at the old chain end, valid for inputs `> 1`) to enter perceptual space, and **every subsequent op** (contrast → … → clarity) operates on that gamma-encoded signal. This is how Lightroom/Capture One/RawTherapee/darktable shape tone (anchored curves with soft toe/shoulder in a perceptual domain), and it is what makes contrast/blacks "feel right." **The single OETF is the move from linear to perceptual — it now lives mid-chain, not at output. There is no second OETF at output.** A negative-lobe `c = max(c, 0)` clamp is applied **once, immediately before this OETF** (a negative linear value has no perceptual image); it is identity for the all-zero edit and replaces the two old per-op linear pins.

Slider inputs arrive as **integers in `[-100, +100]`** (§6.2 rule 4), passed as uniforms and mapped to physical amounts inside the shader/uniform-prep, so the JSON carries no float-formatting drift. Clarity is the optional 11th op; it needs an extra blur pass and, if it ships in v1, occupies exactly this last slot (cutting it does not change any earlier op's result).

##### Frozen per-op formulas + integer→amount mapping (v1)

These exact mappings make "v1 freezes the slider→math mapping" (§6.2 rule 1, freeze rule 5) concrete. Each slider value `s ∈ [-100, +100]` (integer) is normalized to `n = s / 100.0 ∈ [-1, 1]`. Ops 1–3 run on **linear-light** RGB `c = (r, g, b)` (post-EOTF); ops 4–11 run on the **perceptual** (sRGB-gamma) signal (post mid-chain OETF). All at `highp`, in the frozen op order above. **Luminance** uses Rec. 709 weights: `Y = dot(c, vec3(0.2126, 0.7152, 0.0722))` (computed on whichever signal the op operates on — linear for none of these, perceptual for ops 5/6/9/10/11). Every constant below is frozen; changing any one ships as v2 (post-launch).

1. **White balance — temperature (`temp`)** *(linear)*. Per-channel linear gain on a warm↔cool axis: `r *= 1 + 0.20*n; b *= 1 - 0.20*n` (`g` unchanged). `n = temp/100`.
2. **White balance — tint (`tint`)** *(linear)*. Green↔magenta axis: `g *= 1 - 0.10*n; r *= 1 + 0.05*n; b *= 1 + 0.05*n`. `n = tint/100`. (Applied with temp as the single "white balance" op, temp first.)
3. **Exposure** *(linear)*. Linear gain of `±2` stops: `c *= exp2(2.0 * n)`, i.e. `c *= 2^(2*exposure/100)`. `n = exposure/100`.
   - **→ enter perceptual space:** `c = max(c, 0); c = linearToSrgb(c)` (single OETF, frozen). All ops below operate on this perceptual signal.
4. **Contrast** *(perceptual)*. A **pivot-anchored normalized sigmoid** (ImageMagick `-sigmoidal-contrast` form) about the **perceptual mid-gray pivot `A = linearToSrgb(0.18) ≈ 0.46135613`** (frozen) with strength `b = B_MAX * |n|`, `B_MAX = 8.0` (frozen). Define `sig(u) = 1 / (1 + exp(b*(A - u)))` and the endpoint-normalized curve `S(x) = (sig(x) - sig(0)) / (sig(1) - sig(0))` (so `S(0)=0`, `S(1)=1`). For **`n > 0`** apply `c = S(c)` (steepens around `A`); for **`n < 0`** apply the **algebraic inverse** `S⁻¹(y) = A - ln(1/v - 1)/b` where `v = clamp(sig(0) + y*(sig(1) - sig(0)), 1e-6, 1-1e-6)` (flattens around `A`). **`b → 0` (n = 0) is exact identity** — gated by `b > 1e-4`, below which contrast is skipped. Both directions are endpoint-preserving (0→0, 1→1). `n = contrast/100`. (Replaces the old linear-pivot multiply `(c-0.18)*(1+n)+0.18`, which overran `[0,1]` and forced a hard `max(c,0)` pin; the sigmoid is bounded in `[0,1]`, soft-clips via toe/shoulder, and needs no pin.)
5. **Highlights** *(perceptual)*. Brighten/recover upper tones via a perceptual-luminance mask `wH = smoothstep(0.5, 1.0, Y)`: `c *= 1 + 0.5 * n * wH`. `n = highlights/100`.
6. **Shadows** *(perceptual)*. Lift/deepen lower tones via `wS = smoothstep(0.5, 0.0, Y)` (i.e. `1 - smoothstep(0.0, 0.5, Y)`): `c *= 1 + 0.5 * n * wS`. `n = shadows/100`.
7. **Whites** *(perceptual)*. A **soft white-point shoulder foot** (not the old `1 + 0.25n` global multiply). With shoulder start `SHO = 0.60` and travel `AMP = 0.18` (both frozen), `wW = smoothstep(SHO, 1.0, c)` (0 below `SHO`, 1 at `1`): for **`n ≥ 0`** lift highlights `c = c + AMP*n*wW*(1 - c)` (pulls toward 1, keeps `SHO` fixed); for **`n < 0`** compress `c = c * (1 + AMP*n*wW)`. Shadows/midtones (`c < SHO`) untouched. Identity at `n=0`. `n = whites/100`.
8. **Blacks** *(perceptual)*. A **soft black-point toe foot** (not the old additive `c += 0.10*n*wB` lift). With toe extent `TOE = 0.25` and travel `AMP = 0.18` (both frozen), `wB = smoothstep(TOE, 0.0, c)` (1 at black, 0 at `TOE`): for **`n ≤ 0`** deepen `c = c * (1 + AMP*n*wB)` (pulls the foot down, keeps `0` fixed, monotonic since `1 + AMP*n ≥ 0.82`); for **`n > 0`** lift `c = c + AMP*n*wB*(TOE - c)` (raises the foot toward the toe knee, keeps `TOE` fixed). Midtones/highlights (`c ≥ TOE`) untouched. Identity at `n=0`. **No hard clamp** — the toe is monotonic and bounded. `n = blacks/100`.
9. **Vibrance** *(perceptual; skin-protected, low-saturation-weighted)*. Let `mx = max(r,g,b)`, `mn = min(r,g,b)`, **`sat = clamp((mx - mn) / max(mx, 1e-5), 0, 1)`** (the **clamp to `[0,1]` is frozen** belt-and-braces). Weight `w = 1 - sat` **times a skin guard** `g_skin = 1 - 0.5 * exp(-pow((hue - 25°)/20°, 2))` from the pixel hue: `c = mix(vec3(Y), c, 1 + 0.5 * n * w * g_skin)`. `n = vibrance/100`. (Hue from the perceptual RGB → HSV; the `25°/20°` Gaussian and `0.5` depth are frozen.) **The color-inversion speckle is now structurally impossible:** contrast (op 4, bounded sigmoid) and blacks (op 8, bounded soft toe) cannot produce a negative channel, so `mx ≥ mn ≥ 0` always holds entering vibrance — without any explicit `max(c,0)` pin. The `clamp` here remains as a secondary guard.
10. **Saturation** *(perceptual; uniform)*. `c = mix(vec3(Y), c, 1 + n)`, so `n = -1` (saturation `-100`) → grayscale, `n = +1` → 2× saturation. `n = saturation/100`.
11. **Clarity** *(perceptual; optional, last)*. Local midtone contrast: `c = c + 0.30 * n * (c - blur(c)) * wM`, where `blur` is a fixed-radius Gaussian on the perceptual image and `wM = 1 - abs(2*Y - 1)` masks to midtones. `n = clarity/100`. The blur kernel radius/weights are frozen with v1; if clarity is cut (v1 ships without the blur pass), this op is identity.

After op 10 (or 11), `c` is **already in perceptual (sRGB-gamma) space**, so it is **clamped to `[0, 1]` for display safety only** (highlights/saturation can still over/undershoot the bounded feet), then dithered and quantized (below) — **no second OETF**. These formulas — pivots, sigmoid form + `B_MAX`, foot extents/amplitudes, mask curves, weights, and the working-space split — are **frozen**; a v1 conformance render of a known settings vector against a known master16 swatch is checked in CI alongside the decode swatch test.

##### Output dither (deterministic, coordinate-pure)

To prevent 8-bit banding on the final canvas write, sub-LSB dither is added **immediately before 8-bit quantization**, in `linearToSrgb`-encoded space (and at re-encode for any baked thumbnail, if one is ever added). The dither value is a **pure deterministic function of the integer destination pixel coordinates `(x, y)` only**:

```glsl
// interleaved gradient noise (Jimenez), frozen constants; p = floor(gl_FragCoord.xy)
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
// per channel: add dither, clamp, then quantize
float d = (ign(floor(gl_FragCoord.xy)) - 0.5) / 255.0;   // d ∈ [-0.5, +0.5]/255
float quantize8(float x) { return floor(clamp(x, 0.0, 1.0) * 255.0 + 0.5) / 255.0; }
srgb8 = quantize8(srgb + d);
```

- **Amplitude:** `±0.5/255` (one-half of an 8-bit code value), centered on zero.
- **Clamp + rounding (frozen):** the result is **clamped to `[0,1]` after adding `d`** (so near-white/near-black `srgb + d` can't wrap), then quantized with explicit **round-half-up**: `quantize8(x) = floor(clamp(x,0,1)*255 + 0.5) / 255`. If the shader instead writes the un-quantized float straight to the 8-bit canvas, GL mandates round-to-nearest float→UNORM — in that case drop the manual `quantize8` and keep only the `clamp(srgb + d, 0, 1)`; **do not do both** (double-quantization). v1 picks the explicit `quantize8` form above as canonical.
- **Hard rule:** the dither input domain is **integer pixel coordinates `(x, y)` only**. **No time, no `random`, no frame counter, no seed, no resolution-derived term** — any such input is a replay-drift bug. The same `(x, y)` always yields the same offset, so the dither does **not** break the replay guarantee even though it perturbs pixels.

##### Preprocessing determinism (Level 1+2, once/day server-side)

The master is produced by a **byte-deterministic** pipeline (Phase 0: manual script; Phase 3+: GitHub Actions). Steps, in order: **JPEG artifact removal + debanding + light denoise** (non-ML pinned `ffmpeg`-filter graph now; an **FBCNN-class ML model is a documented optional upgrade slot for Phase 3** — adopting it changes the master bytes and therefore ships as **v2**) → **bit-depth expansion to the 16-bit master** → **emit the three variants**.

- **Pinned versions, no timestamps.** Exact pinned versions of every tool/model/encoder (`ffmpeg` + filters, `oxipng`, `cwebp`, `mozjpeg`, UPNG.js, optional ML weights hash). Strip all timestamp/EXIF/XMP and tool-version metadata (`tEXt`/`tIME` PNG chunks, JFIF dates) so outputs carry no non-deterministic bytes.
- **Re-run rule:** the **same input bytes + same pinned versions+params ⇒ byte-identical** master16, preview8, and ai768. Anything else is a determinism bug, not acceptable variation; verified in CI by hashing.
- **Manifest fields** (mirrored into the `daily_photos` row): `pipeline` (`"v1"`), source photo hash, every tool+encoder version, the ordered filter graph + params, optional ML model id+weights-hash (or `null`), the curation-gate threshold + result, and per-variant `{width, height, format, encoder_version, quality, sha256}`.

##### Curation gate (editing-headroom test)

Replaces any generative highlight infill — **Level 3 is explicitly skipped**. A candidate photo is **rejected before staging** if too much of it is already clipped, since clipped pixels carry no editing headroom:

- Compute a per-channel histogram of the candidate and measure the **combined fraction of pixels clipped at the floor (value `0`) or ceiling (value `255`)** across channels.
- **Reject if combined clipped fraction > ~2%** (default; **configurable** per-run and recorded in the manifest).
- Rationale: insufficient latitude makes the sliders feel dead and breaks the "ample editing headroom" premise; the gate guarantees headroom instead of trying to synthesize it.

##### Freeze rules — what `v1` locks (and the v2 rule)

**Frozen under `pipeline: "v1"` (exhaustive — changing *any* item forces v2):**

1. The **canonical source** definition (2048px 16-bit sRGB-encoded PNG master), the **variant set** — members (master16/preview8/ai768), resolutions, bit depths, formats, pinned encoders/params, and which surface consumes each — **and the two-plane WebP delivery encoding** of master16 (the 12-bit `hi`/`lo` plane definitions, the nibble-replication packing, the pinned lossless-WebP params, and the bit-exact equivalence rule against the 12-bit-quantized master), per the delivery amendment.
2. The **client decode + texture path**: the pinned context attributes (`alpha:false`, `premultipliedAlpha:false`, `preserveDrawingBuffer:false`, `antialias:false`, `drawingBufferColorSpace:'srgb'`), UPNG.js pinned version, the big-endian `(hi<<8)|lo` sample reassembly + RGBA channel order, **the Tier-A2 plane decode** (pinned `createImageBitmap { premultiplyAlpha:'none', colorSpaceConversion:'none' }` + opaque `{ alpha:false, willReadFrequently:true }` canvas readback + 12-bit recombine), the `s/65535 →` half-float **bit-pattern packer** (and its rounding) → `RGBA16F`, the pinned unpack state (`UNPACK_FLIP_Y_WEBGL = false`, `PREMULTIPLY_ALPHA = false`, `COLORSPACE_CONVERSION = NONE`) and forced-opaque alpha, the **texture-orientation convention** (image row 0 = display top; V is flipped **at the sample**, `texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y))`, because `FLIP_Y` unpack is pinned false — see step 2; 2026-06-15 amendment), `LINEAR` filtering, sample-then-decode (no hardware sRGB sampling), the **canonical 2048px render resolution** for exact-settings renders; and the fallback ladder (planes/A2 → master16.png/A → preview8/B → CSS/C) + its capability checks.
3. The **exact sRGB EOTF/OETF** piecewise functions and all listed constants.
4. The **slider parameter space** (keys, integer `[-100,+100]` ranges) and the **frozen op order**, all in linear light at `highp`.
5. The **slider→math mapping** for every op (the per-op formulas).
6. The **output dither** — function family (interleaved gradient noise), its constants, `±0.5/255` amplitude, the `(x,y)`-only purity rule, and the final **`clamp(srgb + d, 0, 1)` + round-half-up `quantize8`** step.
7. The **preprocessing chain** (ordered filters/params, pinned tool/model/encoder versions, no-timestamp/byte-determinism rules) and the **curation-gate** test + default threshold.

**The v2 rule:** **ANY** change to **any** item above — a new encoder, a re-tuned slider curve, a different dither hash, a swapped denoise model, a single constant — ships as a **new `pipeline` version** (`"v2"`, `"v3"`, …). The previous renderer (shader + loader + decode path) is **kept forever** and selected by the `pipeline` field stored on each submission, so historical and shared edits never shift. New versions apply only to photos staged under them; there is **no in-place migration** of stored settings.

**Amendment (2026-06-15, pre-launch) — texture-orientation fix (V flipped at sample).** The shader sampled the master at `v_uv` directly, but with `UNPACK_FLIP_Y_WEBGL` pinned `false` the texture's `t = 1` is the image's **last** row while the full-screen triangle maps screen-top to `v_uv.y ≈ 1` — so every photo rendered **upside-down**. (It was masked by the near-vertically-symmetric grapes dev photo and surfaced by a sky/ground landscape.) Fix, frozen: sample with V flipped — `texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y))` — so image row 0 renders at display top for **all** surfaces (editor, gallery, inspect). Determinism is preserved: the dither is a pure function of `gl_FragCoord` (the destination pixel), independent of the source-fetch coordinate, so output is unchanged at any given screen pixel; the per-op math test mirrors are orientation-agnostic and stay green. See the texture-orientation rule under the decode/texture path (step 2) and the freeze-list client-decode entry. Amended **in place under `v1`** — zero user edits minted yet (pre-launch); **post-launch this would ship as `v2`** per the freeze rule above.

**Amendment (2026-06-14, pre-launch) — perceptual tone stage (sigmoid contrast + soft white/black feet).** The tone operators were re-architected to fix a "blacks/contrast feel off" problem and to make the renderer behave like Lightroom/Capture One/RawTherapee/darktable. Two coupled changes, both frozen: **(a) working space** — contrast, highlights, shadows, whites, blacks, vibrance, and saturation now run in a **perceptual (sRGB-gamma) working space** instead of linear light; the single in-shader OETF was **moved from the output stage to mid-chain** (right after exposure, which with WB stays linear), so there is no second OETF at output. **(b) operator shapes** — contrast became a **pivot-anchored normalized sigmoid** about `A = linearToSrgb(0.18) ≈ 0.46135613` (`b = 8·|n|`; `n>0` steepens via the S-curve, `n<0` flattens via its algebraic inverse; `n=0` exact identity), replacing the old linear-pivot multiply `(c-0.18)*(1+n)+0.18`; whites/blacks became **soft white-point/black-point feet** with smooth toe/shoulder (`TOE=0.25`, `SHO=0.60`, `AMP=0.18`), replacing the old additive-linear lift and global white multiply. **Both hard `max(c,0)` negative-lobe pins (op 4 + op 8, the 2026-06-12 amendment) were removed** — the bounded sigmoid and bounded feet cannot produce a negative channel, so the vibrance color-inversion speckle is structurally impossible without them; the only `max(c,0)` left is the one display-floor clamp immediately before the mid-chain OETF, and the vibrance `sat` clamp stays belt-and-braces. This was amended **in place under `v1`** — not minted as `v2` — **only because zero user edits have been minted yet** (pre-launch); **post-launch this exact change would ship as `v2`** per the freeze rule above. The CI/render test mirrors (`tone.test.mjs`, `vibrance.test.mjs`, `srgb.test.mjs`) are updated to the new chain.

**Amendment (2026-06-12, pre-launch) — negative-lobe pinning + clamped vibrance `sat`.** *(Superseded by the 2026-06-14 tone-stage amendment above, which removes the two pins; the `sat` clamp is retained.)* The op-4 and op-8 `c = max(c, 0)` pins and the `clamp(…, 0, 1)` on vibrance `sat` were added to fix a numerical instability: contrast/blacks (then in linear light) could push dark channels negative, collapsing the vibrance saturation denominator and inverting dark pixels into saturated red/green/blue speckle (worst with vibrance, also visible under contrast/blacks/saturation). This was amended **in place under `v1`** — not minted as `v2` — **only because zero user edits had been minted yet** (pre-launch). **This in-place exception is pre-launch only:** once any real edit exists, any such change MUST ship as `v2` per the freeze rule above.

**Amendment (2026-06-12, pre-launch) — two-plane WebP delivery encoding (12-bit).** This amendment adds a **delivery encoding** for the canonical master so the web editor loads fast without giving up the "artificial-raw" headroom. It is amended **in place under `v1`** (pre-launch, zero minted edits — same exception as above; once any real edit exists this would be a `v2`). The game loop, slider math, op order, dither, and shader are **unchanged** — only how the master *bytes reach the browser* changes.

- **`master16.png` stays the canonical/archival artifact.** It remains the byte-deterministic output of `scripts/prepare-master` (CI determinism check + future re-derivations key off it). Storage keeps it.
- **Delivery = two 8-bit lossless-WebP planes** derived as a **pure function of `master16.png`'s samples** (`scripts/prepare-master/planes.mjs`, shared by the full pipeline and the `--derive-planes` standalone mode):
  - **`master16-hi.webp`** — the **top byte** of each 16-bit RGB sample (`hi = v >> 8`). This is, on its own, a viewable 8-bit version of the photo.
  - **`master16-lo.webp`** — the **top nibble of the low byte, replicated to a full byte**: `nib = (v >> 4) & 0xF; lo = (nib << 4) | nib`. (Deterministic 0..255; nibble replication makes the plane render as a normal grayscale image and survive an opaque 8-bit canvas round-trip.)
  - Both are RGB, fully opaque, lossless WebP with **pinned params `{ lossless: true, effort: 6, smartSubsample: false }`** (frozen).
- **Recombination (decode):** `nib = loByte >> 4; v = (hi << 8) | (nib << 4) | nib`. **This is the SHIPPED 12-bit encoding** — the bottom 4 bits of each sample are dropped. **Equivalence rule:** the recombined samples MUST equal the **defined 12-bit quantization** of the `master16.png` samples **bit-exactly** — *not* the raw PNG (16-bit) samples. The manifest records `delivery.recombinesTo` = sha256 of the big-endian RGB16 buffer after applying `quantize12(v) = (hi<<8)|(nib<<4)|nib`, and `delivery.pixelDataSha` = sha256 of the full-precision RGB16 buffer; `scripts/prepare-master/verify-planes.mjs` decodes both WebPs, recombines, and asserts the result hashes to `recombinesTo` (the load-bearing proof, run in the determinism check).
- **Why 12-bit, not 16-bit two-plane (measured).** The 16-bit two-plane lo plane is the high-entropy low byte; lossless WebP cannot compress it, so `hi + lo` measured **66.6%** of the PNG for dev-001 — above the ~60% delivery budget. Dropping to the top nibble of the low byte (12 effective bits) makes the lo plane compress to **41.7%** total (`hi 2.93 MB + lo 4.64 MB = 7.57 MB` vs. the **18.1 MB** PNG). The quantization error is **≤ 15/65535 ≈ 0.058 of an 8-bit display code** — sub-perceptual after the OETF, and far more headroom than the 8-bit JPEG the master replaced. 12 bits preserves the editing latitude the sliders need.
- **Client decode (pinned) — Tier A2.** `decodeMaster16FromPlanes(hi, lo)` (`lib/render/decode.ts`): `createImageBitmap` per plane with **pinned options `{ premultiplyAlpha: 'none', colorSpaceConversion: 'none' }`** (read bytes verbatim, no implicit color management); draw each to a 2D canvas / `OffscreenCanvas` with **`{ alpha: false, willReadFrequently: true }`** (planes are opaque → 8-bit readback is exact); **assert both planes share the master's dimensions**; recombine per the 12-bit rule above; then the **existing** `s/65535 → packFloat16 → RGBA16F` Tier-A path (no shader/upload changes). This is added to the frozen decode list as an explicit **Tier-A2 sub-path** (the §10 risk note anticipated exactly this: a two-plane trick is v1-legal *only if* it's proven bit-equivalent to a defined master and added to the frozen list — which `verify-planes` proves against the 12-bit quantization).
  - **Readback integrity probe.** The lo-plane's replicated-nibble packing (`(nib<<4)|nib`) doubles as a **client-side readback integrity check** requiring no server data: every clean lo byte satisfies `(b>>4) === (b&0xF)`. After the canvas readback, `decodeMaster16FromPlanes` samples a deterministic spread of lo bytes (≈2048 evenly-strided pixels plus the corners) and throws if any violates nibble replication — catching a color-managing browser (Safari risk) that silently corrupts the 8-bit readback. A violation triggers the fallback ladder (→ `master16.png` PNG path). The probe is the pure, node-tested `assertLoPlaneNibbleReplication` (`lib/render/readbackProbe.mjs`).
- **Updated fallback ladder:** **planes (Tier A2)** → on 404 / decode failure → **`master16.png` via the UPNG path (Tier A)** → **`preview8` (Tier B)** → **CSS filters (Tier C)**. The decoded master is cached once per photo (`lib/render/masterCache.ts`) and shared across the editor, the gallery's offscreen renderer, and inspect — so the whole loop downloads the planes **once**, never the PNG.
- **Freeze:** the delivery encoding (plane definitions, the 12-bit packing, the pinned WebP params, the pinned `createImageBitmap`/readback flags, and the equivalence rule) is **part of the v1 freeze** — any change ships as a new `pipeline` version under the same v2 rule. `master16.png` is unchanged and stays canonical.

**Amendment (2026-06-15, pre-launch) — Level-1 camera-RAW input + frozen demosaic recipe.** This amendment lets `scripts/prepare-master` accept a camera-**RAW** file (`.dng/.cr2/.cr3/.nef/.arw/.raf/.rw2/.orf/.pef/.srw/.raw`) as an alternative to a delivered JPEG, producing the **same** 2048px 16-bit sRGB master16 + variants + planes the JPEG path already produces. It is amended **in place under `v1`** (pre-launch, zero minted edits — same exception as the amendments above; once any real edit exists this would be a `v2`). It is **purely additive: the JPEG path is byte-unchanged**, and the renderer/shader/decode (`lib/render/**`) are untouched.

- **Where it sits.** When the input extension is RAW, a server-side, **once-per-day** demosaic step runs *before* the curation gate; its output replaces the JPEG decode for both the curation gate and the ffmpeg 16-bit handoff. Everything downstream (clipping/resolution gates, the ffmpeg deband/denoise graph, the three frozen variants, the two-plane delivery encoding, the manifest via `stableStringify`) is **identical** to the JPEG path. This is the **pre-stage** step (§6.8), not a browser feature — players never decode RAW; they still download only the small WebP planes/preview.
- **Frozen demosaic recipe** (`scripts/prepare-master/demosaic.py` via **rawpy `0.27.0` / LibRaw `0.22.1`**, mirrored in `constants.mjs` `DEMOSAIC`; pinned in `requirements.txt`): `demosaic_algorithm = VNG` (single-threaded → avoids OpenMP nondeterminism), `use_camera_wb = True` / `use_auto_wb = False` (as-shot WB, no data-driven scaling), `no_auto_bright = True` (no auto exposure), `output_bps = 16`, `output_color = sRGB`, `gamma = (2.4, 12.92)` (the sRGB transfer curve — output lands in the same space the rest of the pipeline/shader already use), `highlight_mode = Clip` (deterministic, no reconstruction). Output is a 16-bit RGB TIFF (`tifffile`, `photometric='rgb'`, no datetime tag). The manifest records a `demosaic` block (`null` for non-RAW) with this provenance, plus `python`/`rawpy`/`libraw` versions in `tools` (RAW only). **All of these params are part of the v1 freeze** — changing any one changes the master bytes and must ship as a new pipeline version.
- **Determinism.** Repeated runs on the **same CPU architecture** are **byte-identical** across all six outputs + manifest (verified). LibRaw — like libvips — is **not** guaranteed bit-identical *across* architectures, so the canonical mint must happen on one pinned arch (the CI runner), same caveat as the rest of the pipeline.
- **This is Level 1, not Level 2.** It produces a **display-referred sRGB** master in the existing `[0,1]` gamma domain — no shader/EOTF/texture change. **Level-2 HDR** (scene-referred values >1.0 with a new shader, transfer function, and texture format) remains a **future pipeline v2**, explicitly out of scope here.

##### What determinism does NOT promise

Determinism here is a **spec-level, perceptual** guarantee, not a bit-level one. **Bit-identical GPU output across devices is not achievable and not required** (consistent with §6.2 and §10): GPUs differ in `pow`/transcendental rounding, half-float intermediate precision, and rasterization. The target is **perceptual equivalence** — the same `settings + master16` look the same to a human on any conforming Tier-A device, which is fully sufficient for a like/vote game where players compare looks, not hex dumps. The **byte-identical** guarantee applies only to the **server-side preprocessing outputs**, not to on-device render results. v1 removes every *avoidable* source of drift (own-decoded source bytes, in-shader sRGB, frozen op order/constants, coordinate-only dither, byte-deterministic preprocessing) and accepts only the irreducible, sub-perceptual last-bit GPU variance.

### 6.3 Reveal gallery + inspect settings
- Server-enforced commit-reveal: the gallery API for *today* returns 403/empty until the user's own submission row exists (enforced server-side, not by hiding a client route).
- Reveal is **per-user on submit** (no global "wait till 9pm"), keeping the loop tight.
- Each tile re-renders client-side from `settings + the one cached daily photo` (one image fetch, then cached → rendering 50–200 tiles is sub-second GPU work). Lazy-render with `IntersectionObserver`.
- Detail view exposes the full slider vector and a "load their settings onto the unedited photo next to mine" comparison.

### 6.4 Voting & leaderboard
- **Likes only (no downvotes)** — positive-only structurally removes brigading/toxicity (GuruShots model) and protects late/new edits.
- **Blind voting:** don't surface creator identity or running like-counts *before* the user forms an opinion (prevents popularity contests and rich-get-richer cascades).
- **Exposure equalization:** give each edit roughly equal impressions relative to when it was submitted, so **likes-per-impression** (not luck of timing) drives rank — this is what makes a late-day submission still winnable.
- MVP ships simple like-counts; **architect the schema so a pairwise ("which edit do you prefer?") + Elo ranking can be layered on** for the official leaderboard without a rewrite.
- Sort tabs: Top / New / Surprising. A user's rank ("Top 8%") feeds the share card.

### 6.5 Anonymous identity
- On first visit: mint a stable identity (see §7.4 — a Supabase **anonymous auth** user; no hand-rolled device id needed). Render a **friendly handle** (adjective-noun-number, e.g. "CrimsonOtter47", from curated brand-safe wordlists → millions of combos) deterministically from the user id, plus a **seeded generated avatar** (identicon/gradient blob). No PII → GDPR-trivial.
- **One submission per day** enforced by a server-side `UNIQUE(daily_photo_id, player_id)` constraint — never trusted to the client. Honest dedupe; cookie/incognito bypass is acceptable for a low-stakes game (the fix for real fraud-proofing is the Google-account leaderboard in Phase 4).

### 6.6 Google OAuth + history + friends (Phase 4–6)
- **Google sign-in upgrades the existing anonymous account in place** (`linkIdentity`) — the user id is preserved, so all prior submissions/votes/history carry over with **zero migration**. Let users keep their generated handle. Surface the "sign in to save your history + add friends" nudge at peak investment (e.g. a top-ranked edit), not on first launch.
- **History:** "my edits" archive, re-rendered on demand from stored vectors + each day's photo.
- **Friends (Phase 6):** shareable friend link/code (mutual, BeReal-style). A **Friends** filter on the daily gallery ("see how your crew edited today"), friend profiles/archives, and a small **friends leaderboard** (lower-stakes, higher-motivation, sidesteps most global abuse).

### 6.7 AI players (Phase 5 — architect now)
- An AI player **outputs the same settings JSON a human submits** (not a generated image), so its edit renders identically and is equally inspectable — "just another player."
- **Named by their model ID.** Each model is **one** AI player, displayed in the gallery by its exact model name (e.g. `claude-opus-4.8`, `gemini-3-flash`, `gpt-5.4-mini`) with an AI badge — no aliases or personas. Edit variety comes from running **several distinct models**, not multiple personas of one model.
- **Per-day batch:** when the day's photo locks, a scheduled job sends each model the pre-derived `ai768` variant (768px JPEG, §6.2.1) — never a freshly re-downscaled image, so AI input bytes are the frozen, deterministic ones — and calls each model once. Candidate models (2026): **Gemini 3 Flash** (cheapest), **GPT-5.4-mini/nano**, **Claude Haiku 4.5**, plus a premium tier (**Gemini 3 Pro**, **GPT-5.4**, **Claude Opus 4.8 / Sonnet 4.6**) for stronger visual reasoning. A handful of calls/day → **pennies/day**, run synchronously (Batch APIs buy nothing at this volume).
- **Prompting:** a "produce a striking, opinionated edit" system prompt + the exact slider spec (keys, integer ranges, semantics) + 1–3 punchy few-shot exemplars + an explicit "no all-zeros/neutral edits" instruction + a one-sentence rationale, via each provider's structured-output mode.
- **Mandatory server-side validate + clamp + round:** structured-output schemas do **not** enforce numeric min/max (OpenAI ignores them; Gemini treats as advisory), so a model *will* occasionally emit out-of-range values. Reject missing keys; **re-roll or drop "bland" all-near-zero edits** (the biggest AI risk in a voting game — RLHF pushes models toward timid edits). Raise temperature moderately for more decisive looks.

### 6.8 Photo pipeline
- **"Raw" = the canonical preprocessed master (§6.2.1), not camera RAW.** The master is *derived from* a high-quality **unedited source** — either a delivered stock **JPEG** or a camera-**RAW** file (Level-1 input, see below) — then preprocessed into the 16-bit master16 + variant set so the sliders have real tonal headroom — JPEGs alone clip highlights and band under exposure/contrast (§6.2.1). **UI wording: call it "unedited"/"unstyled," not "RAW."**
- **RAW is supported as a server-side, once-per-day input — NOT a browser feature.** The old "RAW rejected" framing was specifically about **browser-side** RAW decode: LibRaw-WASM at ~15–20s/file plus 20–50MB downloads per player is fatal for a snappy daily game. That objection does not apply to the **pre-stage** step, which already runs server-side once per day. So `scripts/prepare-master` now also accepts camera RAW (`.dng/.cr2/.cr3/.nef/.arw/...`): a **deterministic Level-1 demosaic** (rawpy/LibRaw, frozen recipe in §6.2.1) turns the RAW into the **same 2048px 16-bit sRGB master format** the JPEG path produces, then feeds the identical curation gate → ffmpeg → variant/plane pipeline. Players still download only the small WebP planes/preview; they never touch RAW. (Stock APIs still don't serve RAW, so this is mainly for admin-curated / CC0 sources.)
- **Source = Pexels API (primary), admin-curated (fallback).** Pexels uniquely permits (1) **modifying** photos, (2) **self-hosting** (no mandatory hotlinking — essential, since edited derivatives are new pixels that can't be hotlinked), and (3) **no per-display attribution**. Its only restriction ("don't redistribute on other stock/wallpaper platforms") doesn't describe this game. **Avoid Unsplash** for MVP (mandatory hotlinking + per-display attribution + gated approval conflict with the gallery). Pixabay is a fine secondary; Openverse/Wikimedia only if filtered strictly to CC0/Public-Domain.
- **Pre-stage, never pick live:** a daily scheduled job runs the full preprocessing pipeline (§6.2.1) to stage tomorrow's photo, in order: **select** the next candidate from a **curated admin queue** → **download** it from Pexels → **curation clipping gate** (reject if combined clipped fraction > ~2%; on reject, pick the next candidate, and alert if the queue empties) → **artifact removal + debanding + light denoise** (pinned `ffmpeg`-filter path now; FBCNN-class ML as a documented Phase-3 upgrade slot) → **16-bit expansion to the master** → **emit the three frozen variants** (master16 / preview8 / ai768) → **upload to Supabase Storage** → **insert a `daily_photos` row** with `status=staged` and the preprocessing manifest. Always keep **N+1 days staged** so a failed job never causes an empty day. At play time you serve your own cached copy — independent of Pexels uptime/limits.
- **Compute home = a GitHub Actions scheduled workflow** wrapping `scripts/prepare-master` (the same script Phase 0 runs manually). `pg_cron`/Edge Functions **cannot** run this heavy `ffmpeg`/encoder pipeline; `pg_cron` is kept only for the keep-alive ping and AI-job triggers (§7.5).
- **One global puzzle/day keyed to UTC** (like early Wordle) so everyone edits the same photo and shares one gallery/leaderboard. Rollover at 00:00 UTC; show a countdown.
- **Content safety:** never serve unmoderated live API results — the admin queue *is* the human checkpoint. Prefer landscapes/objects/scenes over identifiable people (avoids both the "no offensive use of identifiable people" license clause and a moderation surface). Add report/flag + admin hide; because edits are just stored vectors, hiding/re-rendering any flagged edit is cheap.

---

## 7. Technical architecture

### 7.1 Stack (optimized for a non-expert solo builder, low-ops, low-cost)
- **Frontend:** Next.js (App Router) + React + TypeScript. WebGL2 editor (§6.1).
- **Backend + DB + Auth + Storage in one service: Supabase** (managed Postgres, Auth with anonymous + Google, S3-style Storage, Edge Functions, `pg_cron`). Chosen over Firebase (per-op billing is unpredictable for a read-heavy voting app) and Convex (less portable than Postgres+RLS). Real SQL + Row Level Security fits the relational data perfectly.
- **Hosting:** Vercel. ⚠️ **Vercel Hobby is non-commercial** — budget Vercel Pro ($20/mo) before public launch.

### 7.2 Data model (Postgres)

| Table | Purpose | Key fields |
|---|---|---|
| `profiles` | One row per auth user (anon or Google); survives the upgrade | `id` (=auth.users.id), `is_anonymous`, `display_name`, `avatar_url`, `upgraded_at` |
| `daily_photos` | The one photo per day (its **frozen variant set** + **two-plane delivery encoding** + preprocessing manifest, §6.2.1) | `id`, `play_date` UNIQUE, `master16_path`, `preview8_path`, `ai768_path`, `master16_hi_path`/`master16_lo_path` (nullable two-plane delivery WebPs), `manifest` jsonb (pinned tool/encoder versions, ordered filter graph + params, optional ML model id/weights-hash, curation-gate threshold + result, and per-variant `{width, height, format, encoder_version, quality, sha256}`), `pipeline` (e.g. `"v1"`), `source` (`pexels`\|`admin`), `source_attribution` jsonb, `status` |
| `submissions` | One player's edit (the **settings JSON is the edit**; AI = a submission with `ai_model` set) | `id`, `daily_photo_id` FK, `player_id` FK (nullable for AI), `ai_model`, `settings` jsonb, `schema_version`, `thumb_path` (nullable), `time_taken_ms`, `like_count` (denormalized), **UNIQUE(daily_photo_id, player_id)** |
| `votes` | One like per player per submission | `id`, `submission_id` FK, `voter_id` FK, **UNIQUE(submission_id, voter_id)** (trigger maintains `like_count`) |
| `friendships` | Friend graph (Phase 6; Google users only) | `requester_id`, `addressee_id`, `status`, UNIQUE pair |
| `ai_players` | Registry of AI players (one row per model) | `id`, `model_id` (e.g. `claude-opus-4.8`, `gemini-3-flash` — also the gallery display name), `provider`, `avatar_url`, `is_active`. Referenced by `submissions.ai_model` |

### 7.3 Storage strategy (the key cost/architecture insight — validated)
- **Store the canonical master + its variant set + the two delivery planes once/day** (§6.2.1): master16 (~8–18MB PNG16, canonical/archival) + its two-plane WebP delivery set (`master16-hi.webp` + `master16-lo.webp`, ~7–8MB combined, ~42% of the PNG) + preview8 (small WebP) + ai768 (small JPEG) in Supabase Storage, plus the preprocessing manifest. ~16–28MB/day total — still trivial. **Editors download the ~7.5MB planes, not the 18MB PNG** (the PNG is served only as a fallback).
- **Store only the settings JSON per submission** (~200–500 bytes; 10k/day ≈ a few MB of text). The gallery **re-renders each tile client-side** from its settings + the single CDN-cached daily photo.
- **No rendered images, no thumbnails for MVP.** Add a cached WebP thumbnail (`thumb_path`) *only* if measured low-end-mobile perf demands it (many simultaneous WebGL canvases). Lazy-render first.
- **Result:** storage ≈ one master + planes + variants/day + kilobytes of JSON — comfortably inside Supabase's free tier for a long time. Egress: the weightiest delivered asset is the **two-plane WebP set** (~7.5MB combined, vs the 18MB PNG it replaces), but it's **two immutable URLs/day** served through a free CDN layer (Cloudflare in front of Supabase Storage → near-100% cache hit, so origin egress stays near zero regardless of player count); the gallery and landing hero load only the small **preview8**, and the editor fetches the planes once per day (decoded once and shared across editor/gallery/inspect). Trade-off: requires the deterministic versioned pipeline (§6.2 / §6.2.1) — which we want anyway for "inspect exact settings" and AI players.

### 7.4 Auth strategy
- First visit → `supabase.auth.signInAnonymously()` creates a real `auth.users` row + JWT; session persists in the browser → the anon user *is* the stable device identity (no hand-rolled device id). All submissions/votes key to this id.
- Upgrade → `supabase.auth.linkIdentity({ provider: 'google' })` (requires "Enable Manual Linking" in Supabase). **Id preserved → all history transfers with no migration.** Handle edge cases: Google identity already on another user (catch → fall back / defer full merge); Google avatar/name may populate only on the *next* sign-in (refresh profile later); cleared-storage-before-link loses that anon identity (state plainly; the cure — "sign in to never lose your history" — is the conversion pitch).
- **RLS:** users write `submissions`/`votes` only as `auth.uid()`; gallery reads are public; `is_anonymous` is in the JWT to gate friends/verified-leaderboard.

### 7.5 API surface (thin — Supabase client does most CRUD via RLS; Edge Functions only where server authority matters)
- `GET today's photo` (+ whether the user already submitted, to lock the editor).
- `POST submit edit` → insert `submissions` (player = `auth.uid()`); **Edge Function validates/clamps settings, stamps `schema_version`**; UNIQUE blocks resubmits.
- `GET gallery` → submissions (+ profile/ai_player + like_count) for a photo, paginated; returns settings JSON; client re-renders. **Authorized only after the user's own submission exists.**
- `POST/DELETE vote` → UNIQUE + trigger maintains `like_count`.
- `GET my history`, `GET leaderboard` (Postgres view/RPC).
- Phase 5 AI: daily `pg_cron` Edge Function fetches the day's `ai768` variant (§6.2.1), calls each model with the **shared settings JSON schema** (single source of truth), validates through the **same submit validator as humans**, inserts with `ai_model` = the model id.

---

## 8. Security, abuse & privacy
- **Bot/sign-in abuse:** anonymous sign-in is the main vector (anyone can mint users). **Enable Cloudflare Turnstile** (free, invisible) on anon sign-in (Supabase-recommended) and rely on Supabase's IP rate-limit on anon sign-in (~30/hr, configurable).
- **Vote/submit abuse:** UNIQUE constraints are the primary defense; add per-IP/per-user rate limits in the submit/vote Edge Functions (Upstash Redis, ephemeral TTLs). **Anomaly de-weighting, not hard-blocking:** silently discount suspicious likes from the *leaderboard* (shadow-handle) rather than blocking honest users. Escalate to an invisible PoW/CAPTCHA only when thresholds trip.
- **Honest framing for the PRD:** like-counts on an anonymous app are inherently soft. Keep stakes low (status, not money); reserve a **verified/all-time leaderboard** for Google-linked accounts (Phase 4).
- **Moderation:** photos are curated → input is safe; the only UGC is display names (auto-generated; profanity-filter if custom names ship later) and edits (report/flag + admin hide). AI outputs are just numbers.
- **Privacy/GDPR:** anonymous users store no PII. For Google users: short privacy policy, "delete my data" path, EU region option, don't retain IPs beyond ephemeral rate-limiting, make clear the gallery is public.

---

## 9. Cost
- **$0/mo for MVP and early traction** (Supabase free: 500MB DB / 1GB storage / 5GB egress / 50k MAU / 500k edge fns. The settings-only design barely touches DB. Storage is ~16–28MB/day of masters+planes+variants — still trivial against the 1GB cap for a long time, and prunable. Egress is the one line to watch: the editor pulls the **two-plane WebP delivery set (~7.5MB/day, ≈42% of the 18MB PNG)**, so serving it from Supabase origin to every editor session *would* blow the 5GB/mo free egress quickly — which is exactly why the planes are **two immutable URLs/day fronted by a free CDN (Cloudflare)** with near-100% cache hit, keeping origin egress near zero; the gallery/landing only ever pull the small preview8, and the 18MB master16 PNG is canonical/archival (served only as a delivery fallback). Pexels free; Vercel Hobby $0 but non-commercial.) ⚠️ Keep the free Supabase project alive with a daily cron ping (it pauses after a week idle).
- **~$45/mo when public** (Vercel Pro $20 + Supabase Pro $25 — unlocks image transforms + no pausing). The CDN layer in front of Storage stays on a free tier at this scale.
- **Cost drivers at scale:** origin egress *if* the master16 CDN cache is ever bypassed or if you ever serve rendered images (the settings-only design + immutable-per-day CDN caching avoid both — biggest lever), MAU past 100k, and AI players (still only cents/month — a handful of calls/day; batch APIs halve it).

---

## 10. Key risks & mitigations
- **Cold-start empty galleries** (biggest launch risk — *per-user reveal means even the first human each day faces a thin gallery*). Mitigations, in order: **(a) AI players seed every day's gallery** (sequence this early — it's the best fix and a product pillar); **(b) admin/preset "look" seeds** (5–10 varied edits/photo) for the pre-AI window; **(c)** soft-launch to a small invited cohort for ~2 weeks; **(d)** exposure-equalization + a "come back to vote on New" nudge for early-bird players. → *See §12 open decision.*
- **Bland AI edits losing to humans in a voting game** → decisive system prompt, few-shot punchy exemplars, higher temperature, drop/re-roll near-zero outputs.
- **GPU non-determinism** → spec-level determinism + perceptual (not bit-exact) equivalence (§6.2 / §6.2.1).
- **UPNG.js + RGBA16F decode path on low-end Android** (the least-proven link in the §6.2.1 pipeline — JS 16-bit PNG decode + half-float texture upload + linear filtering on weak mobile GPUs/memory) → **mitigation:** a Phase-1 week-1 spike on a cheap real phone with an actual 2048px PNG16, measuring decode time, memory, and filter correctness; **escape hatch** = simply falling back to the preview8 / Tier-B path on devices that can't sustain Tier A (v1-legal — Tier B is already in the frozen ladder). A **two-plane 8-bit lossless trick** (split 16-bit into hi/lo 8-bit planes) is a *different delivery encoding + decode path*. It has now been **adopted as the frozen Tier-A2 delivery sub-path** (amendment 2026-06-12): the **12-bit** variant (hi byte + top nibble of the low byte) recombines **bit-exactly to the defined 12-bit quantization of the master16 samples** (proven by `scripts/prepare-master/verify-planes.mjs`), so it is added to the frozen decode list rather than minting a v2 — done in place pre-launch. `master16.png` stays canonical; the planes are a pure function of it. (The full-16-bit two-plane variant was measured and rejected: its lo plane is incompressible, ~67% of the PNG vs ~42% for 12-bit — see the delivery amendment.) Per freeze rule 2, this was **not** a silent swap: the encoding, packing, and equivalence rule are all frozen and documented.
- **Preprocessing non-determinism** (unpinned `ffmpeg`/encoder/ML versions silently shifting master bytes on a re-run, which would shift *historical* renders) → **mitigation:** pin every tool/model/encoder version, record them in the manifest **and** the `daily_photos` row, strip timestamps/metadata, and verify byte-identical re-runs in CI by hashing (§6.2.1); any byte change is a v2, never an in-place re-stage.
- **Low-effort "slam submit" edits** → don't surface all-default edits in "Top"; require ≥1 slider moved to count toward the leaderboard.
- **Building Lightroom tone math yourself** → borrow from MIT references; budget shader-tuning time; validate visually against Lightroom.

---

## 11. Build phases (MVP boundary marked)

| Phase | Deliverable |
|---|---|
| **0 — Foundations** (wk 1) | Next.js + Supabase project; schema (`profiles`, `daily_photos`, `submissions`, `votes`) + RLS; anonymous auth on first load; `scripts/prepare-master` run manually so the first test photo is already v1-canonical (master16 + variants + manifest, §6.2.1); upload that one test photo |
| **1 — Editor** (wk 1–2) | WebGL2 slider editor (~10 params) + versioned settings schema; **Level 0 shader hygiene + 16-bit source path** (PNG16 decode via UPNG.js → RGBA16F, in-shader sRGB, dither, §6.2.1) + the **mobile spike** on a cheap phone (§10); 5-min timer + auto-submit; submit inserts settings JSON; UNIQUE locks resubmits |
| **2 — Gallery + Voting → ✅ SHIPPABLE MVP** (wk 2–3) | Per-user commit-reveal gallery re-rendering all edits client-side; inspect-exact-settings; likes (one-per-user) + denormalized count + daily leaderboard; Turnstile on sign-in + basic rate limits |
| **3 — Photo automation** (wk 3–4) | Pexels integration + admin curation UI; **preprocessing pipeline in a GitHub Actions scheduled workflow** (wraps `scripts/prepare-master`, §6.2.1/§6.8) with the **clipping-rejection curation gate**; daily pre-stage (N+1 days ahead); `pg_cron` keep-alive ping |
| **4 — Google upgrade + history** | `linkIdentity` flow; "my history"; anon→Google id preservation + already-linked edge case |
| **5 — AI players** (fast-follow; pull earlier if needed for cold-start) | Daily Edge Function → each model emits settings via shared schema → validated through the same submit validator → inserted with `ai_model` = model id; `ai_players` registry |
| **6 — Friends + polish** | `friendships` + requests/accept (Google users); friends-only leaderboard; cached thumbnails *only if* perf needs; moderation/report tooling; cost review |

---

## 12. Open decisions to confirm before / during build
1. **Cold-start strategy & AI timing.** Recommended: ship Phase 2 MVP with lightweight **admin/preset seed edits**, then prioritize **AI players (Phase 5) earlier than Phase 4** specifically to keep galleries full. Alternative: pull AI players *into* the MVP (more upfront build, best cold-start fix). — *Worth your call, since you framed AI as a "next step."*
2. **Working product name** ("color-gradle" is the directory; real name TBD).
3. ~~**Visual identity / tone**~~ — **Decided** in [`design_handoff_color_gradle/README.md`](design_handoff_color_gradle/README.md): "Darkroom" dark theme, amber accent, Instrument Serif + Hanken Grotesk + DM Mono, crafted-photography aesthetic with Wordle-like daily ritual. Keep PRD and handoff aligned when either changes.

---

## 13. Verification (how to prove the MVP works end-to-end)
1. **Loop:** open the app in a fresh browser → land on "Today" with no login → tap Play → editor loads the daily photo → drag all sliders, confirm ~60fps live preview → Submit → reveal gallery appears (was 403 before submit). Confirm in DB: one `submissions` row with the settings JSON + your anon `player_id`.
2. **One-per-day:** attempt a second submit for the same day → server rejects (UNIQUE). Confirm the editor shows the locked "come back tomorrow" state on reload.
3. **Inspect + reproduce settings:** open another player's tile → its slider values display → "load their settings" re-renders the unedited photo and the result is **perceptually identical** to their tile (validate the determinism contract; test on a second device/GPU).
3a. **Headroom / no banding (§6.2.1):** on a photo with a smooth sky gradient, push **exposure −80 / shadows +80** (or the inverse) over that gradient region → confirm **no visible banding or posterization** (proves the 16-bit master + half-float path + dither are working, vs. an 8-bit JPEG source which would band).
3b. **Preprocessing byte-determinism (§6.2.1):** run `scripts/prepare-master` **twice on the same input** → confirm **byte-identical** master16, preview8, and ai768 (hash-compare); any difference is a determinism bug (unpinned version / stray timestamp).
3c. **Cross-variant perceptual equivalence:** render the **same settings** from **master16** (editor surface) and from **preview8** (at gallery-tile size) → confirm they are **perceptually identical at tile size** (variants need not be pixel-identical, only perceptually equivalent at their display sizes).
4. **Voting:** like a submission → `like_count` increments; like again → no double-count (UNIQUE); leaderboard reorders by likes.
5. **Photo rotation (Phase 3):** run the pre-stage cron → confirm tomorrow's `daily_photos` row is `staged` with a self-hosted CDN image; advance the date → the app serves the new photo and a fresh empty-then-filling gallery.
6. **Auth upgrade (Phase 4):** as an anon user with history, `linkIdentity` Google → same user id → all prior submissions/votes/history still present.
7. **AI players (Phase 5):** trigger the daily AI job on a test photo → each model's settings validate+clamp through the same submit validator → appear in the gallery badged with the model id and inspectable settings; confirm no all-zero/bland or out-of-range edits slip through.
8. **Abuse:** confirm Turnstile gates anon sign-in; hammer the vote endpoint → rate-limit trips; verify suspicious likes are de-weighted from the leaderboard, not hard-blocked.

---

*Grounded in 2025–2026 research across editing engines (WebGL2/twgl/cropperjs), stock-photo licensing (Pexels vs. Unsplash hotlinking conflict), vision-model structured output (Gemini/GPT/Claude), daily-game design (Wordle/BeReal/GuruShots), and a Supabase + Next.js + Vercel stack. Full source list retained in the research transcript.*
