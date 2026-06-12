// constants.mjs — frozen pipeline v1 parameters for the canonical master-prep CLI.
//
// EVERYTHING in this file is part of the `pipeline: "v1"` freeze (see PRD §6.2.1,
// "Freeze rules"). Changing ANY value here changes the master bytes and therefore
// MUST ship as a new pipeline version (v2, v3, ...) — never edited in place.

export const PIPELINE_VERSION = 'v1';

// ---------------------------------------------------------------------------
// EXIF Orientation handling (frozen). The very first decode op applies the EXIF
// Orientation tag (via sharp's argless `.rotate()`) and clears it, so an
// orientation-tagged JPEG mints a correctly-oriented master instead of a
// sideways one. This baked rotation feeds EVERY downstream path (clip stats,
// resolution gate, recorded width/height, and all three variants), so it
// affects output bytes and is part of the v1 freeze + recorded in the manifest.
// ---------------------------------------------------------------------------
export const EXIF_AUTO_ROTATE = true;

// ---------------------------------------------------------------------------
// Frozen variant set (PRD §6.2.1 "Canonical source + the frozen variant set").
// Resolutions are long-edge in pixels; the short edge scales proportionally.
// ---------------------------------------------------------------------------
export const VARIANTS = {
  // Editor render surface + inspect/detail comparison view.
  master16: {
    file: 'master16.png',
    longEdge: 2048,
    bitDepth: 16,
    format: 'png',
  },
  // Gallery tiles + landing hero.
  preview8: {
    file: 'preview8.webp',
    longEdge: 1024,
    bitDepth: 8,
    format: 'webp',
  },
  // Image bytes sent to AI players (PRD §6.7).
  ai768: {
    file: 'ai768.jpg',
    longEdge: 768,
    bitDepth: 8,
    format: 'jpeg',
  },
};

// ---------------------------------------------------------------------------
// Deterministic resampling kernel used for every resize. Frozen so that the
// same input always produces the same downscaled pixels.
// ---------------------------------------------------------------------------
export const RESAMPLE_KERNEL = 'lanczos3';

// ---------------------------------------------------------------------------
// Encoder parameters (frozen). sharp bundles mozjpeg + libwebp + libpng/zlib-ng
// and strips all metadata (EXIF/XMP/timestamps) by default — we never call
// withMetadata(), so outputs carry no non-deterministic bytes.
// ---------------------------------------------------------------------------
export const ENCODER = {
  // master16: genuine 16-bit/channel sRGB-encoded PNG. `.toColourspace('rgb16')`
  // forces sharp to emit 16-bit samples (the default png() path truncates to 8-bit).
  png: {
    colourspace: 'rgb16',
    compressionLevel: 9,
    effort: 10,
    // adaptiveFiltering off keeps the filter choice fully deterministic.
    adaptiveFiltering: false,
    palette: false,
  },
  // preview8: lossy WebP.
  webp: {
    quality: 82,
    effort: 6,
    smartSubsample: false,
    alphaQuality: 100,
  },
  // ai768: progressive mozjpeg. NOTE: with sharp's mozjpeg encoder, progressive
  // is forced on and `progressive: false` is silently ignored (verified: sharp
  // 0.35.1 emits an SOF2 progressive frame whenever `mozjpeg: true`). This value
  // must therefore read `true` so the manifest faithfully describes the actual
  // bytes — index.mjs asserts the emitted SOF marker matches this flag. AI-player
  // consumers decode progressive JPEG fine; progressive is also smaller/better.
  jpeg: {
    quality: 90,
    mozjpeg: true,
    chromaSubsampling: '4:2:0',
    progressive: true,
  },
};

// ---------------------------------------------------------------------------
// ffmpeg artifact-removal / debanding / light-denoise filter graph (Level 1+2,
// PRD §6.2.1 "Preprocessing determinism"). Non-ML path. Operates on a 16-bit
// rgb48le intermediate so debanding has real headroom to work in.
//
// Ordered chain:
//   1. format=rgb48le        — promote to 16-bit/channel sRGB-encoded RGB samples
//                              (gamma domain, matching the master's transfer
//                              function; format= does not linearize the data).
//   2. deband                — kill JPEG block/banding artifacts in flat regions.
//   3. hqdn3d                — light spatial denoise (we feed a single still frame,
//                              so only the spatial luma/chroma terms apply).
//   4. format=rgb48le        — guarantee the output stays 16-bit before PNG mux.
// ---------------------------------------------------------------------------
export const FFMPEG_PIX_FMT = 'rgb48le';

export const FFMPEG_FILTER_PARAMS = {
  deband: {
    // Reference threshold per plane (1.5/255 ≈ 0.0059) and a moderate range.
    '1thr': 0.0059,
    '2thr': 0.0059,
    '3thr': 0.0059,
    '4thr': 0.0059,
    range: 16,
    blur: true,
    coupling: false,
  },
  hqdn3d: {
    luma_spatial: 2,
    chroma_spatial: 1,
    luma_tmp: 2,
    chroma_tmp: 3,
  },
};

// Build the exact -vf string from the params above (kept as one function so the
// recorded manifest string and the executed string can never diverge).
export function buildFilterGraph() {
  const d = FFMPEG_FILTER_PARAMS.deband;
  const h = FFMPEG_FILTER_PARAMS.hqdn3d;
  const deband =
    `deband=1thr=${d['1thr']}:2thr=${d['2thr']}:3thr=${d['3thr']}:4thr=${d['4thr']}` +
    `:range=${d.range}:blur=${d.blur ? 1 : 0}:coupling=${d.coupling ? 1 : 0}`;
  const hqdn3d =
    `hqdn3d=${h.luma_spatial}:${h.chroma_spatial}:${h.luma_tmp}:${h.chroma_tmp}`;
  return [`format=${FFMPEG_PIX_FMT}`, deband, hqdn3d, `format=${FFMPEG_PIX_FMT}`].join(',');
}

// Flags forcing bit-exact, metadata-free ffmpeg output.
export const FFMPEG_DETERMINISM_FLAGS = [
  '-fflags', '+bitexact',
  '-flags:v', '+bitexact',
  '-map_metadata', '-1',
];

// ---------------------------------------------------------------------------
// Curation gate (PRD §6.2.1 "Curation gate"). Combined fraction of pixels with
// ANY channel clipped at the floor (0) or ceiling (255), measured on the
// ORIGINAL 8-bit decode (before any processing). Default threshold 2%.
// ---------------------------------------------------------------------------
export const DEFAULT_CLIP_THRESHOLD_PCT = 2.0;
