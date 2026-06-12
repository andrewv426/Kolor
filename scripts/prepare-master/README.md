# prepare-master — color-gradle pipeline v1 canonical master prep

Phase-0 CLI that turns one delivered stock JPEG into the **frozen pipeline-v1
variant set** plus a byte-deterministic manifest. This is the *only* path that
mints a day's canonical source, so its output is part of the `pipeline: "v1"`
freeze (see `PRD.md` §6.2.1).

> **"Raw" / "unedited" now means this canonical preprocessed master** — not
> camera RAW, not the delivered stock JPEG. JPEGs lack the tonal headroom the
> sliders need (clipped highlights, 8-bit banding, block artifacts that
> exposure/contrast amplify); this tool manufactures that headroom.

## What it produces

For each input it writes an output directory containing exactly four files:

| File | Variant | Resolution (long edge) | Bit depth | Format | Consumed by |
|---|---|---|---|---|---|
| `master16.png` | **master16** | 2048 px | 16-bit/channel, sRGB-encoded | PNG (libpng/zlib-ng via sharp) | Editor render surface; inspect/detail view |
| `preview8.webp` | **preview8** | 1024 px | 8-bit/channel | WebP, lossy (libwebp via sharp) | Gallery tiles; landing hero |
| `ai768.jpg` | **ai768** | 768 px | 8-bit/channel | JPEG, progressive (mozjpeg via sharp) | Image bytes sent to AI players |
| `manifest.json` | — | — | — | JSON | `daily_photos` row mirror; CI determinism check |

The determinism contract is **per-variant identical bytes** (same input ⇒ same
output file) and **perceptual equivalence across variants** at their display
sizes — variants are *not* pixel-identical to each other.

## Usage

```bash
npm install            # installs pinned sharp + ffmpeg-static (vendored ffmpeg binary)

node index.mjs <input.jpg> [--out <dir>] [--threshold <pct>] [--force]
```

- `--out <dir>` — output directory (default `./out-<input-basename>`).
- `--threshold <pct>` — curation-gate clipping threshold percent (default `2`).
- `--force` — emit variants even if the curation or resolution gate fails
  (records the override in the manifest).

Exit codes: `0` success, `2` curation or resolution gate failed (without
`--force`), `1` any other error.

### Example

```bash
node index.mjs ./candidate.jpg --out ./2026-06-12
# prepare-master: clipping (combined floor+ceil) = 0.41% ...; threshold 2%
# prepare-master: wrote master16 (2048x1366, 16-bit), preview8 (1024x683), ai768 (768x512) + manifest.json
```

## Pipeline (Level 1+2, frozen)

All parameters live in `constants.mjs`. Changing **any** of them changes the
master bytes and therefore **must** ship as a new `pipeline` version — never
edited in place (the v2 rule, `PRD.md` §6.2.1).

1. **Decode + apply/clear EXIF orientation.** As the *first* decode op, apply the
   EXIF Orientation tag (sharp's argless `.rotate()`) and clear it, baking one
   canonically-oriented buffer that every downstream path consumes — so clip
   stats, the resolution gate, recorded width/height, and all three variants are
   consistently oriented (an orientation-tagged JPEG never mints a sideways
   master). Then decode to a lossless 16-bit RGB PNG (sharp → `rgb16`). Recorded
   as `preprocessing.exifAutoRotate: true` in the manifest (a frozen v1 param).
2. **ffmpeg artifact removal / deband / light denoise** at 16-bit (`rgb48le`
   intermediate). Ordered filter graph:
   `format=rgb48le, deband(1thr=2thr=3thr=4thr=0.0059, range=16, blur=1, coupling=0), hqdn3d(2:1:2:3), format=rgb48le`.
   Run with `-fflags +bitexact -flags:v +bitexact -map_metadata -1` so no
   timestamps or tool-version bytes leak into the output.
3. **Emit the three variants** from the processed 16-bit buffer, each resized
   with a pinned `lanczos3` kernel and a fixed encoder config; `master16` is
   forced to genuine 16-bit via `.toColourspace('rgb16')`.

> **ML denoise upgrade slot (Phase 3).** An FBCNN-class ML denoise model is a
> documented optional upgrade. Adopting it changes the master bytes and ships as
> **v2**; the manifest reserves `preprocessing.mlDenoiseModel` /
> `mlDenoiseWeightsSha256` (both `null` in v1).

## Curation gate (editing-headroom test)

Computed on the **original 8-bit decode**, before any processing: the fraction
of pixels with **any** RGB channel clipped at the floor (`0`) or ceiling (`255`).
If the combined fraction exceeds the threshold (default **2%**), the photo lacks
editing headroom and the CLI exits non-zero with a clear message unless
`--force` is passed. This **replaces** any generative highlight infill (Level 3
is explicitly skipped) — we reject low-headroom candidates rather than
synthesize headroom.

## Resolution gate

Inputs whose long edge is below the canonical master16 long edge (**2048px**)
are rejected (exit `2`): upscaling a small stock photo manufactures fake detail
and zero added information while tripling file size. `--force` overrides (the
input is then upscaled to canonical dimensions, and the override is recorded in
the manifest's `resolutionGate` field).

## Determinism contract

- **No timestamps, no absolute paths, no tool-version metadata** in any output.
  sharp strips EXIF/XMP by default (we never call `withMetadata()`); the PNG
  carries no `tIME`/`tEXt`/`zTXt`/`iTXt` chunks; ffmpeg runs in bitexact,
  metadata-stripped mode.
- The manifest is serialized with **sorted keys** and records only the input
  **basename** (never its path).
- **Re-run rule:** same input bytes + same pinned tool/library versions+params ⇒
  **byte-identical** `master16.png`, `preview8.webp`, `ai768.jpg`, and
  `manifest.json`. Anything else is a determinism bug. This is the property a CI
  job should assert by hashing.
- **⚠️ Byte-determinism is per CPU architecture.** libvips SIMD paths (enabled
  via `sharp.simd(true)`) can round differently across microarchitectures, so a
  master minted on arm64 macOS may not hash-match a re-run on x86_64 Linux.
  Local runs on any machine are fine for development and Phase-0 testing, but
  the **production mint must happen on the same runner/arch the CI determinism
  check uses** (the Phase-3 workflow below: `ubuntu-latest` x86_64) so re-run
  hashes are comparable.

### Pinned versions (verifiable)

`package.json` pins exact versions (no `^`/`~`):

- **sharp `0.35.1`** — bundles libvips/libpng/zlib-ng/libwebp/mozjpeg; their
  versions are read at runtime from `sharp.versions` and recorded in the
  manifest, so the manifest is self-describing per machine.
- **ffmpeg-static `5.3.0`** — vendors a pinned ffmpeg binary (currently 6.0).
  The actual `ffmpeg -version` string is recorded in the manifest.

Determinism was verified by running the CLI twice (and from two different
working directories) and asserting all four outputs are byte-identical via
SHA-256.

## Manifest fields

```jsonc
{
  "pipeline": "v1",
  "source":        { "filename": "<basename>", "sha256": "...", "bytes": ... },
  "curationGate":  { "thresholdPct": 2, "passed": true, "forced": false, "stats": { ...clip counts/percents... } },
  "resolutionGate":{ "minLongEdgePx": 2048, "inputLongEdgePx": 4000, "passed": true, "forced": false },
  "tools":         { "node": "...", "prepareMaster": "...", "sharp": "...", "libvips": "...", "libpng": "...", "libwebp": "...", "mozjpeg": "...", "zlibNg": "...", "ffmpeg": "6.0" },
  "preprocessing": { "intermediatePixFmt": "rgb48le", "filterGraph": "...", "filterParams": { ... }, "ffmpegDeterminismFlags": [ ... ], "mlDenoiseModel": null, "mlDenoiseWeightsSha256": null },
  "resampleKernel": "lanczos3",
  "encoders":      { "png": { ... }, "webp": { ... }, "jpeg": { ... } },
  "variants":      { "master16": { "file": ..., "width": ..., "height": ..., "format": "png", "bitDepthPerChannel": 16, "sha256": ... }, "preview8": { ... }, "ai768": { ... } }
}
```

Mirror these fields into the `daily_photos` row when staging a day's photo.

## Phase 3: GitHub Actions wrapper

In Phase 3 the daily pre-stage automation runs this **same script** in a
scheduled GitHub Actions workflow (pg_cron / Supabase Edge Functions cannot run
ffmpeg/sharp). Pin Node and `npm ci` against the committed lockfile so the
bundled binaries match the versions recorded in the manifest, then upload the
four outputs and write the manifest into `daily_photos`.

```yaml
# .github/workflows/stage-daily-photo.yml  (Phase 3 — do not add until this is a git repo)
name: stage-daily-photo
on:
  schedule:
    - cron: '0 6 * * *'   # daily, N+1 days ahead of the UTC puzzle date
  workflow_dispatch:
    inputs:
      input_url: { description: 'Candidate photo URL', required: true }

jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scripts/prepare-master/package-lock.json
      - name: Install pinned deps
        working-directory: scripts/prepare-master
        run: npm ci
      - name: Resolve candidate URL
        id: candidate
        # `inputs.input_url` is ONLY populated on the workflow_dispatch trigger;
        # on the `schedule` trigger it is empty. Scheduled runs must resolve the
        # next candidate from the curated admin queue via the Phase-3 glue
        # resolver (PRD §6.8) — otherwise the fetch below would download nothing.
        run: |
          URL="${{ github.event.inputs.input_url }}"
          if [ -z "$URL" ]; then
            # Scheduled path: ask the curated-admin-queue resolver for the next
            # candidate to stage (selects + downloads URL from Pexels/admin).
            URL="$(node scripts/resolve-candidate.mjs)"   # Phase 3 glue, not in this dir
          fi
          echo "url=$URL" >> "$GITHUB_OUTPUT"
      - name: Fetch candidate
        # -f makes curl exit non-zero on HTTP errors so a 4xx/5xx error page is
        # never silently written into candidate.jpg.
        run: curl -fsSL "${{ steps.candidate.outputs.url }}" -o candidate.jpg
      - name: Prepare canonical master (runs the curation gate)
        working-directory: scripts/prepare-master
        run: node index.mjs "$GITHUB_WORKSPACE/candidate.jpg" --out "$GITHUB_WORKSPACE/staged"
      # On exit 2 the gate rejected the photo (insufficient headroom) — the job
      # fails loudly and no photo is staged for that day.
      - name: Upload to Supabase Storage + write daily_photos row
        run: node scripts/stage-upload.mjs "$GITHUB_WORKSPACE/staged"  # Phase 3 glue, not in this dir
```

## Files

- `index.mjs` — the CLI.
- `constants.mjs` — all frozen v1 parameters (variant set, filter graph, encoder
  configs, resample kernel, default gate threshold).
- `package.json` — exact pinned dependencies.
