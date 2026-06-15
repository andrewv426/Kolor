# prepare-master — color-gradle pipeline v1 canonical master prep

Phase-0 CLI that turns one delivered stock **JPEG** — or a camera-**RAW** file
(Level-1, see below) — into the **frozen pipeline-v1 variant set** plus a
byte-deterministic manifest. This is the *only* path that mints a day's canonical
source, so its output is part of the `pipeline: "v1"` freeze (see `PRD.md`
§6.2.1).

> **"Raw" / "unedited" now means this canonical preprocessed master** — not
> camera RAW, not the delivered stock JPEG. JPEGs lack the tonal headroom the
> sliders need (clipped highlights, 8-bit banding, block artifacts that
> exposure/contrast amplify); this tool manufactures that headroom.

## What it produces

For each input it writes an output directory containing exactly six files:

| File | Variant | Resolution (long edge) | Bit depth | Format | Consumed by |
|---|---|---|---|---|---|
| `master16.png` | **master16** | 2048 px | 16-bit/channel, sRGB-encoded | PNG (libpng/zlib-ng via sharp) | **Canonical/archival** artifact; CI determinism; delivery fallback |
| `master16-hi.webp` | **delivery hi plane** | 2048 px | 8-bit (top byte of each 16-bit sample) | WebP, lossless | Editor web delivery (recombined client-side) |
| `master16-lo.webp` | **delivery lo plane** | 2048 px | 8-bit (top nibble of low byte, replicated) | WebP, lossless | Editor web delivery (recombined client-side) |
| `preview8.webp` | **preview8** | 1024 px | 8-bit/channel | WebP, lossy (libwebp via sharp) | Gallery tiles; landing hero |
| `ai768.jpg` | **ai768** | 768 px | 8-bit/channel | JPEG, progressive (mozjpeg via sharp) | Image bytes sent to AI players |
| `manifest.json` | — | — | — | JSON | `daily_photos` row mirror; CI determinism check |

The determinism contract is **per-variant identical bytes** (same input ⇒ same
output file) and **perceptual equivalence across variants** at their display
sizes — variants are *not* pixel-identical to each other.

### Two-plane WebP delivery (PRD §6.2.1 amendment 2026-06-12)

`master16.png` stays the **canonical/archival** artifact, but it's 18MB — too big
to ship to every editor session. For web delivery we split each 16-bit RGB sample
into two 8-bit **lossless-WebP planes**, derived as a **pure function of the
master16 PNG bytes** (so they're identical whether emitted by the full pipeline
or by `--derive-planes`). **SHIPPED encoding = 12-bit:**

```
hi plane[i] = (v >> 8) & 0xFF                       # top byte
nib         = (v >> 4) & 0x0F                        # top nibble of the low byte
lo plane[i] = (nib << 4) | nib                       # replicated to a full byte (0..255)

# client recombination (decode):
nib = loByte >> 4 ;  v = (hi << 8) | (nib << 4) | nib
```

The bottom 4 bits are dropped, so the recombined samples equal the **defined
12-bit quantization** of the master — *not* the raw PNG. The manifest's
`delivery.recombinesTo` is the sha256 of the 12-bit-quantized RGB16 buffer;
`node verify-planes.mjs [dir]` decodes both WebPs, recombines, and asserts the
result hashes to it bit-exactly (the load-bearing equivalence proof — run it in CI).

**Why 12-bit, not full 16-bit two-plane (measured on dev-001):** the 16-bit lo
plane is the incompressible low byte → `hi+lo` = 66.6% of the PNG (over budget).
12-bit drops the lo plane to the top nibble → **41.7%** total (`hi 2.93MB +
lo 4.64MB = 7.57MB` vs the **18.1MB** PNG), with quantization error ≤ 0.058 of an
8-bit display code (sub-perceptual). The plane WebP params are pinned in
`constants.mjs` (`PLANE_WEBP = { lossless: true, effort: 6 }`) and are part of the
v1 freeze. The packing math lives in `planes.mjs` (the single definition shared by
`index.mjs` and `verify-planes.mjs`).

## Camera-RAW input (Level 1, PRD §6.2.1 amendment 2026-06-15)

The CLI also accepts a camera-**RAW** file as the input. When the input extension
is one of `.dng .cr2 .cr3 .nef .arw .raf .rw2 .orf .pef .srw .raw`
(case-insensitive, `RAW_EXTENSIONS` in `constants.mjs`), a **deterministic
demosaic step** runs *first* (`demosaic.py` via rawpy/LibRaw) and produces the
**same 16-bit sRGB-encoded RGB** the JPEG decode produces. That output then feeds
the **identical** downstream pipeline — curation gate → ffmpeg deband/denoise →
the three frozen variants → the two-plane delivery encoding → manifest. The JPEG
path is **byte-unchanged**; the demosaic branch only runs for RAW inputs.

```bash
node index.mjs <file.dng> [--out <dir>] [--threshold <pct>] [--force]
```

**Prerequisite (RAW only): Python 3.10 with pinned deps.** Install once:

```bash
pip install -r requirements.txt   # rawpy==0.27.0, tifffile==2025.5.10, numpy==2.2.6
```

The CLI launches `python3` by default. If the rawpy-equipped interpreter is not
the first `python3` on `PATH` (e.g. it lives in a venv or a versioned Homebrew
path), point at it explicitly:

```bash
PREPARE_MASTER_PYTHON=/path/to/python3.10 node index.mjs <file.dng>
```

**Frozen demosaic recipe** (`demosaic.py`, mirrored in `constants.mjs`
`DEMOSAIC` — all part of the v1 freeze):

| Param | Value | Why |
|---|---|---|
| `demosaic_algorithm` | `VNG` | single-threaded → no OpenMP nondeterminism |
| `use_camera_wb` / `use_auto_wb` | `True` / `False` | as-shot WB, no data-driven scaling |
| `no_auto_bright` | `True` | no auto exposure |
| `output_bps` | `16` | 16-bit headroom |
| `output_color` | `sRGB` | same space the rest of the pipeline/shader use |
| `gamma` | `(2.4, 12.92)` | sRGB transfer curve (sRGB-**encoded** output) |
| `highlight_mode` | `Clip` | deterministic, no reconstruction |

Output is a 16-bit RGB TIFF (`tifffile`, `photometric='rgb'`, no datetime tag).
The manifest records a `demosaic` block (the provenance above; `null` for non-RAW
inputs) and adds `python` / `rawpy` / `libraw` versions to the `tools` block (RAW
only).

**Determinism + per-architecture caveat.** Repeated runs on the **same machine**
are byte-identical across all six outputs + manifest. But **LibRaw, like libvips,
is not cross-arch bit-identical** — a master demosaiced on arm64 macOS may not
hash-match a re-run on x86_64 Linux. As with the rest of the pipeline, **mint the
canonical master on one pinned architecture** (the CI runner) so re-run hashes
are comparable.

This is **Level 1** — it yields a display-referred sRGB master in the existing
`[0,1]` gamma domain, with no shader/EOTF/texture change. Level-2 HDR
(scene-referred >1.0, new shader/transfer function/texture) remains a future
pipeline **v2**.

## Usage

```bash
npm install            # installs pinned sharp + ffmpeg-static (vendored ffmpeg binary)

# full pipeline (candidate JPEG OR camera RAW → all six outputs incl. delivery planes):
node index.mjs <input.jpg|input.dng> [--out <dir>] [--threshold <pct>] [--force]

# standalone: derive ONLY the delivery planes + a manifest fragment from an
# EXISTING canonical master16.png (for already-minted photos whose candidate
# JPEG is gone — the planes are a pure function of the PNG):
node index.mjs --derive-planes <master16.png> [--out <dir>]

# standalone + merge the derived fragment INTO an existing full manifest
# (preserves the historical blocks --derive-planes cannot know):
node index.mjs --derive-planes <master16.png> --merge-into <manifest.json> [--out <dir>]
```

- `--out <dir>` — output directory (default `./out-<input-basename>`, or
  `./out-planes-<png-basename>` in `--derive-planes` mode).
- `--threshold <pct>` — curation-gate clipping threshold percent (default `2`).
- `--force` — emit variants even if the curation or resolution gate fails
  (records the override in the manifest).
- `--derive-planes <png>` — standalone mode: writes `master16-hi.webp`,
  `master16-lo.webp`, and `manifest-delivery.json` (the `delivery` fragment with
  the source PNG's `master16Sha256`, **plus `encoders.planeWebp`** so the fragment
  shape matches what the full pipeline records). Does **not** run ffmpeg/the
  curation gate.
- `--merge-into <manifest.json>` — only valid with `--derive-planes`. Reads an
  existing full manifest, overwrites **only** the fields this path is
  authoritative for (`delivery` + `encoders.planeWebp`), preserves every
  historical block, and writes the merged `manifest.json` (sorted keys,
  deterministic). Aborts if the manifest's `variants.master16.sha256` does not
  match the derived PNG's sha.

Exit codes: `0` success, `2` curation or resolution gate failed (without
`--force`), `1` any other error.

After either mode, prove plane equivalence with `node verify-planes.mjs [dir]`
(defaults to `../../public/photo/dev-001`).

### Manifest provenance — which fields come from which path

The two paths produce **one canonical manifest shape**. Both record the same
`delivery` block and `encoders.planeWebp`. They differ only in which blocks each
can author from first principles:

| Field / block | Full pipeline (`<input.jpg>`) | `--derive-planes [--merge-into]` |
|---|---|---|
| `pipeline`, `resampleKernel` | authored | from `--merge-into` (preserved) |
| `source`, `curationGate`, `resolutionGate` | authored (real candidate + gates) | **cannot know** → from `--merge-into` (preserved) |
| `tools`, `preprocessing` | authored (real ffmpeg/sharp run) | **cannot know** → from `--merge-into` (preserved) |
| `variants` (master16/preview8/ai768) | authored | from `--merge-into` (preserved) |
| `encoders.png/webp/jpeg` | authored | from `--merge-into` (preserved) |
| `encoders.planeWebp` | authored (`PLANE_WEBP`) | **authored** (`PLANE_WEBP`) |
| `delivery` (planes + `recombinesTo`) | authored (from master16 bytes) | **authored** (from master16 bytes) |
| `delivery.master16Sha256` | — (master16 sha is in `variants`) | **authored** (source PNG sha) |

`dev-001`'s committed manifest was regenerated with
`--derive-planes … --merge-into …` against its own `master16.png`: the delivery
+ `encoders.planeWebp` fragment is recomputed and merged, the historical blocks
are carried through verbatim. The planes are byte-identical, so `verify-planes`
still passes.

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

1. **Decode** the input JPEG to a lossless 16-bit RGB PNG (sharp → `rgb16`).
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
  "tools":         { "node": "...", "prepareMaster": "...", "sharp": "...", "libvips": "...", "libpng": "...", "libwebp": "...", "mozjpeg": "...", "zlibNg": "...", "ffmpeg": "6.0" /* RAW inputs ALSO add: "python", "rawpy", "libraw" */ },
  "demosaic":      null /* non-RAW. For RAW inputs: { "tool": "rawpy", "rawpyVersion": "0.27.0", "librawVersion": "(0, 22, 1)", "algorithm": "VNG", "whiteBalance": "camera", "gamma": [2.4, 12.92], "outputColor": "sRGB", "noAutoBright": true, "highlightMode": "clip", "outputBps": 16 } */,
  "preprocessing": { "intermediatePixFmt": "rgb48le", "filterGraph": "...", "filterParams": { ... }, "ffmpegDeterminismFlags": [ ... ], "mlDenoiseModel": null, "mlDenoiseWeightsSha256": null },
  "resampleKernel": "lanczos3",
  "encoders":      { "png": { ... }, "webp": { ... }, "jpeg": { ... }, "planeWebp": { "lossless": true, "effort": 6, "smartSubsample": false } },
  "variants":      { "master16": { "file": ..., "width": ..., "height": ..., "format": "png", "bitDepthPerChannel": 16, "sha256": ... }, "preview8": { ... }, "ai768": { ... } },
  "delivery":      {
    "encoding": "12bit-two-plane-webp",
    "planes":   { "hi": { "plane": "hi", "bits": "top byte (v>>8)" }, "lo": { "plane": "lo", "bits": "(((v>>4)&0xF)<<4)|((v>>4)&0xF)" } },
    "pixelDataSha": "<sha256 of the full-precision RGB16 big-endian master samples>",
    "recombinesTo": "<sha256 of the 12-bit-quantized RGB16 big-endian samples — what the planes recombine to>",
    "hi": { "file": "master16-hi.webp", "width": ..., "height": ..., "format": "webp", "sha256": ..., "bytes": ... },
    "lo": { "file": "master16-lo.webp", ... }
    // (--derive-planes mode also records "master16Sha256": the source PNG's sha)
  }
}
```

Mirror these fields into the `daily_photos` row when staging a day's photo
(including `master16_hi_path` / `master16_lo_path` for the delivery planes).

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
      - name: Fetch candidate
        run: curl -sSL "${{ inputs.input_url }}" -o candidate.jpg
      - name: Prepare canonical master (runs the curation gate)
        working-directory: scripts/prepare-master
        run: node index.mjs "$GITHUB_WORKSPACE/candidate.jpg" --out "$GITHUB_WORKSPACE/staged"
      # On exit 2 the gate rejected the photo (insufficient headroom) — the job
      # fails loudly and no photo is staged for that day.
      - name: Upload to Supabase Storage + write daily_photos row
        run: node scripts/stage-upload.mjs "$GITHUB_WORKSPACE/staged"  # Phase 3 glue, not in this dir
```

## Files

- `index.mjs` — the CLI (full pipeline + `--derive-planes` standalone mode;
  routes RAW inputs through `demosaic.py`).
- `demosaic.py` — the frozen Level-1 RAW demosaic step (rawpy/LibRaw → 16-bit
  sRGB RGB TIFF + provenance JSON). Run only for RAW inputs.
- `requirements.txt` — exact Python pins for `demosaic.py` (rawpy/tifffile/numpy).
- `constants.mjs` — all frozen v1 parameters (variant set, filter graph, encoder
  configs, resample kernel, default gate threshold, **plane WebP params + the
  `DELIVERY_ENCODING` descriptor**).
- `planes.mjs` — the single definition of the two-plane delivery packing
  (split / recombine / quantize12 / `derivePlanes`), shared by `index.mjs` and
  `verify-planes.mjs` so the encode path and the equivalence proof never diverge.
- `verify-planes.mjs` — decodes both plane WebPs, recombines, and asserts they
  hash to the manifest's `delivery.recombinesTo` (the load-bearing proof).
- `package.json` — exact pinned dependencies.
