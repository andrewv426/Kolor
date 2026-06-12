#!/usr/bin/env node
// index.mjs — color-gradle Phase-0 canonical master-prep CLI (pipeline v1).
//
// Usage:
//   node index.mjs <input.jpg> [--out <dir>] [--threshold <pct>] [--force]
//
// Produces the three frozen pipeline-v1 variants (master16 / preview8 / ai768)
// plus a byte-deterministic manifest.json. See README.md and constants.mjs.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

import {
  PIPELINE_VERSION,
  VARIANTS,
  RESAMPLE_KERNEL,
  ENCODER,
  FFMPEG_PIX_FMT,
  FFMPEG_FILTER_PARAMS,
  FFMPEG_DETERMINISM_FLAGS,
  buildFilterGraph,
  DEFAULT_CLIP_THRESHOLD_PCT,
  PLANES,
  PLANE_WEBP,
} from './constants.mjs';
import { decodeMaster16Samples, derivePlanes } from './planes.mjs';

// sharp must be deterministic and single-threaded for repeatable concurrency.
sharp.cache(false);
sharp.concurrency(1);
sharp.simd(true);

const SELF_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;

// --------------------------------------------------------------------------
// arg parsing
// --------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    threshold: DEFAULT_CLIP_THRESHOLD_PCT,
    force: false,
    derivePlanes: null, // path to an existing master16.png (standalone mode)
    mergeInto: null, // path to an existing full manifest to merge the delivery fragment into
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--out') args.out = rest[++i];
    else if (a === '--threshold') args.threshold = Number(rest[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '--derive-planes') args.derivePlanes = rest[++i];
    else if (a === '--merge-into') args.mergeInto = rest[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('--')) fail(`Unknown flag: ${a}`);
    else if (args.input === null) args.input = a;
    else fail(`Unexpected extra argument: ${a}`);
  }
  return args;
}

function usage() {
  return [
    'prepare-master — color-gradle pipeline v1 canonical master prep',
    '',
    'Usage:',
    '  node index.mjs <input.jpg> [--out <dir>] [--threshold <pct>] [--force]',
    '  node index.mjs --derive-planes <master16.png> [--out <dir>]',
    '',
    'Options:',
    '  --out <dir>             Output directory (default: ./out-<input-basename>)',
    `  --threshold <pct>       Clipping-gate threshold percent (default: ${DEFAULT_CLIP_THRESHOLD_PCT})`,
    '  --force                 Emit variants even if the clipping gate fails',
    '  --derive-planes <png>   Standalone: derive the two delivery planes',
    '                          (master16-hi.webp + master16-lo.webp) and a',
    '                          manifest fragment from an EXISTING canonical',
    '                          master16.png — for already-minted photos. Does',
    '                          NOT re-run the full pipeline. Also emits the',
    '                          encoders.planeWebp fragment so the shape matches',
    '                          the full pipeline.',
    '  --merge-into <manifest> With --derive-planes: deterministically merge the',
    '                          derived delivery + encoders.planeWebp fragment',
    '                          INTO an existing full manifest.json (preserving its',
    '                          historical source/curationGate/tools/preprocessing',
    '                          blocks that --derive-planes cannot know) and write',
    '                          the merged manifest (sorted keys) to <out>/manifest.json.',
    '  -h, --help              Show this help',
  ].join('\n');
}

function fail(msg, code = 1) {
  process.stderr.write(`prepare-master: ${msg}\n`);
  process.exit(code);
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function ffmpegVersion() {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (r.status !== 0) fail(`ffmpeg -version failed: ${r.stderr || r.error}`);
  const m = r.stdout.match(/ffmpeg version (\S+)/);
  return m ? m[1] : 'unknown';
}

// Compute the long-edge resize geometry deterministically (integer dims).
function resizeOpts(longEdge) {
  // sharp computes the short edge; we pin the kernel. Upscaling is allowed at
  // the resize layer so a --force'd small input still reaches canonical
  // dimensions, but the resolution gate in main() rejects sub-2048px inputs
  // by default — upscaling manufactures no real detail.
  return {
    width: longEdge,
    height: longEdge,
    fit: 'inside',
    kernel: RESAMPLE_KERNEL,
    withoutEnlargement: false,
    fastShrinkOnLoad: false, // keep the resampling path identical regardless of input size
  };
}

// --------------------------------------------------------------------------
// clipping curation gate — measured on the ORIGINAL 8-bit decode.
// Fraction of pixels with ANY channel == 0 OR == 255.
// --------------------------------------------------------------------------
async function computeClipStats(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const px = info.width * info.height;
  let clippedLow = 0;
  let clippedHigh = 0;
  let clippedAny = 0;

  for (let i = 0; i < data.length; i += ch) {
    let low = false;
    let high = false;
    // Only inspect RGB channels (ignore alpha if present).
    const n = Math.min(ch, 3);
    for (let c = 0; c < n; c++) {
      const v = data[i + c];
      if (v === 0) low = true;
      else if (v === 255) high = true;
    }
    if (low) clippedLow++;
    if (high) clippedHigh++;
    if (low || high) clippedAny++;
  }

  return {
    width: info.width,
    height: info.height,
    channels: ch,
    totalPixels: px,
    clippedLowPixels: clippedLow,
    clippedHighPixels: clippedHigh,
    clippedAnyPixels: clippedAny,
    clippedFloorPct: round6((clippedLow / px) * 100),
    clippedCeilPct: round6((clippedHigh / px) * 100),
    clippedCombinedPct: round6((clippedAny / px) * 100),
  };
}

function round6(n) {
  // Deterministic fixed-precision rounding for manifest numbers.
  return Math.round(n * 1e6) / 1e6;
}

// --------------------------------------------------------------------------
// ffmpeg artifact-removal / deband / denoise at 16-bit, producing the
// canonical high-res 16-bit master PNG (pre-resize-to-variants).
// --------------------------------------------------------------------------
function runFfmpeg(inPngPath, outPngPath) {
  const filter = buildFilterGraph();
  const argv = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i', inPngPath,
    '-vf', filter,
    '-pix_fmt', FFMPEG_PIX_FMT,
    ...FFMPEG_DETERMINISM_FLAGS,
    '-frames:v', '1',
    '-update', '1',
    '-c:v', 'png',
    outPngPath,
  ];
  const r = spawnSync(ffmpegPath, argv, { encoding: 'utf8' });
  if (r.status !== 0) {
    fail(`ffmpeg failed (exit ${r.status}):\n${r.stderr || r.error}`);
  }
  return { argv, filter };
}

// --------------------------------------------------------------------------
// encode the three frozen variants from the processed 16-bit source.
// --------------------------------------------------------------------------
async function encodeMaster16(srcBuffer) {
  // Resize at full 16-bit precision, then force 16-bit PNG output.
  return sharp(srcBuffer)
    .resize(resizeOpts(VARIANTS.master16.longEdge))
    .toColourspace(ENCODER.png.colourspace)
    .png({
      compressionLevel: ENCODER.png.compressionLevel,
      effort: ENCODER.png.effort,
      adaptiveFiltering: ENCODER.png.adaptiveFiltering,
      palette: ENCODER.png.palette,
    })
    .toBuffer();
}

async function encodePreview8(srcBuffer) {
  return sharp(srcBuffer)
    .resize(resizeOpts(VARIANTS.preview8.longEdge))
    .toColourspace('srgb')
    .webp({
      quality: ENCODER.webp.quality,
      effort: ENCODER.webp.effort,
      smartSubsample: ENCODER.webp.smartSubsample,
      alphaQuality: ENCODER.webp.alphaQuality,
    })
    .toBuffer();
}

async function encodeAi768(srcBuffer) {
  return sharp(srcBuffer)
    .resize(resizeOpts(VARIANTS.ai768.longEdge))
    .toColourspace('srgb')
    .jpeg({
      quality: ENCODER.jpeg.quality,
      mozjpeg: ENCODER.jpeg.mozjpeg,
      chromaSubsampling: ENCODER.jpeg.chromaSubsampling,
      progressive: ENCODER.jpeg.progressive,
    })
    .toBuffer();
}

// Read back the JPEG Start-Of-Frame marker to learn whether the encoded bytes
// are baseline (SOF0 / 0xFFC2 absent) or progressive (SOF2 / 0xFFC2 present).
// Scans markers properly (skipping marker-segment payloads) so it can't be
// fooled by a 0xFFC2 byte pair occurring inside entropy-coded scan data.
function jpegIsProgressive(buffer) {
  if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    fail('ai768 self-check: output is not a JPEG (missing SOI marker).');
  }
  let i = 2;
  while (i + 1 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i++;
      continue;
    }
    let marker = buffer[i + 1];
    // 0xFF00 is a stuffed byte and 0xFFFF is padding; skip.
    if (marker === 0x00 || marker === 0xff) {
      i += 2;
      continue;
    }
    // SOF0 = baseline, SOF2 = progressive.
    if (marker === 0xc0 || marker === 0xc1) return false;
    if (marker === 0xc2) return true;
    // SOS (0xDA) begins entropy-coded data with no length we can trust here; if
    // we reach it without seeing an SOF, the file is malformed for our purposes.
    if (marker === 0xda) {
      fail('ai768 self-check: reached scan data without finding an SOF marker.');
    }
    // Standalone markers (RSTn, SOI, EOI, TEM) carry no length segment.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    // Everything else is a marker segment with a 2-byte big-endian length.
    const len = (buffer[i + 2] << 8) | buffer[i + 3];
    i += 2 + len;
  }
  fail('ai768 self-check: no SOF marker found in JPEG.');
}

async function variantMeta(buffer, format) {
  const m = await sharp(buffer).metadata();
  return {
    width: m.width,
    height: m.height,
    format,
    bitDepthPerChannel: m.depth === 'ushort' ? 16 : 8,
    channels: m.channels,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

// --------------------------------------------------------------------------
// stable JSON serialization (sorted keys) so the manifest bytes are
// deterministic regardless of insertion order.
// --------------------------------------------------------------------------
function stableStringify(value) {
  return JSON.stringify(value, sortKeys, 2) + '\n';
}
function sortKeys(_key, val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.keys(val)
      .sort()
      .reduce((acc, k) => {
        acc[k] = val[k];
        return acc;
      }, {});
  }
  return val;
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage() + '\n');
    return;
  }

  // --- standalone plane-derivation mode ---------------------------------
  // Derive the two delivery planes + a manifest fragment from an EXISTING
  // canonical master16.png. Pure function of the PNG bytes — no full pipeline,
  // no candidate JPEG needed (used for already-minted photos like dev-001).
  if (args.derivePlanes) {
    await derivePlanesMode(args);
    return;
  }

  if (!args.input) fail(`Missing <input.jpg>.\n\n${usage()}`);
  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) fail(`Input not found: ${inputPath}`);
  if (!(args.threshold >= 0)) fail(`--threshold must be a non-negative number`);

  const inputBuffer = readFileSync(inputPath);
  const inputSha = sha256(inputBuffer);

  // --- curation gate (on the original decode) ---------------------------
  const clip = await computeClipStats(inputBuffer);
  const gatePassed = clip.clippedCombinedPct <= args.threshold;

  process.stderr.write(
    `prepare-master: clipping (combined floor+ceil) = ${clip.clippedCombinedPct}% ` +
      `(floor ${clip.clippedFloorPct}%, ceil ${clip.clippedCeilPct}%); threshold ${args.threshold}%\n`,
  );

  if (!gatePassed && !args.force) {
    fail(
      `CURATION GATE FAILED: ${clip.clippedCombinedPct}% of pixels are clipped ` +
        `(> ${args.threshold}% threshold). This photo lacks editing headroom. ` +
        `Re-run with --force to override.`,
      2,
    );
  }
  if (!gatePassed && args.force) {
    process.stderr.write('prepare-master: gate failed but --force set; continuing.\n');
  }

  // --- resolution gate (on the original decode) --------------------------
  // The canonical master is 2048px long edge; an input below that would be
  // silently upscaled, manufacturing fake detail with zero added information.
  const inputLongEdge = Math.max(clip.width, clip.height);
  const resolutionPassed = inputLongEdge >= VARIANTS.master16.longEdge;
  if (!resolutionPassed && !args.force) {
    fail(
      `RESOLUTION GATE FAILED: input long edge is ${inputLongEdge}px, below the ` +
        `canonical master16 long edge of ${VARIANTS.master16.longEdge}px. Upscaling ` +
        `would manufacture fake detail. Pick a larger candidate, or re-run with ` +
        `--force to upscale anyway.`,
      2,
    );
  }
  if (!resolutionPassed && args.force) {
    process.stderr.write(
      `prepare-master: resolution gate failed (${inputLongEdge}px) but --force set; upscaling.\n`,
    );
  }

  const outDir = resolve(args.out || `out-${basename(inputPath).replace(/\.[^.]+$/, '')}`);
  mkdirSync(outDir, { recursive: true });

  // --- ffmpeg high-bit-depth preprocessing ------------------------------
  // Decode the input to a lossless 16-bit PNG that ffmpeg can read, run the
  // deband/denoise graph at 16-bit, then read it back into sharp.
  const work = mkdtempSync(join(tmpdir(), 'prepare-master-'));
  let processedBuffer;
  let ffInfo;
  try {
    const ffInPng = join(work, 'in16.png');
    const ffOutPng = join(work, 'out16.png');

    // Lossless 16-bit RGB PNG handoff into ffmpeg (no resize yet; full res in).
    const decoded16 = await sharp(inputBuffer)
      .toColourspace('rgb16')
      .png({ compressionLevel: 0, adaptiveFiltering: false, palette: false })
      .toBuffer();
    writeFileSync(ffInPng, decoded16);

    ffInfo = runFfmpeg(ffInPng, ffOutPng);
    processedBuffer = readFileSync(ffOutPng);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // --- emit the three frozen variants -----------------------------------
  const master16 = await encodeMaster16(processedBuffer);
  const preview8 = await encodePreview8(processedBuffer);
  const ai768 = await encodeAi768(processedBuffer);

  // Freeze-integrity self-check: the recorded encoder flag must match the actual
  // emitted bytes. sharp's mozjpeg path forces progressive on and ignores
  // `progressive: false`, so a mismatch here means the manifest would lie about
  // a pipeline-v1 frozen artifact. Fail loudly rather than mint a divergent v1.
  const ai768IsProgressive = jpegIsProgressive(ai768);
  if (ai768IsProgressive !== ENCODER.jpeg.progressive) {
    fail(
      `ai768 self-check: encoded JPEG is ${ai768IsProgressive ? 'progressive' : 'baseline'} ` +
        `but ENCODER.jpeg.progressive=${ENCODER.jpeg.progressive}. The manifest must ` +
        `faithfully describe the bytes (pipeline-v1 freeze). Reconcile constants.mjs.`,
    );
  }

  writeFileSync(join(outDir, VARIANTS.master16.file), master16);
  writeFileSync(join(outDir, VARIANTS.preview8.file), preview8);
  writeFileSync(join(outDir, VARIANTS.ai768.file), ai768);

  const variants = {
    master16: { file: VARIANTS.master16.file, ...(await variantMeta(master16, 'png')) },
    preview8: { file: VARIANTS.preview8.file, ...(await variantMeta(preview8, 'webp')) },
    ai768: { file: VARIANTS.ai768.file, ...(await variantMeta(ai768, 'jpeg')) },
  };

  // --- delivery planes (derived from the canonical master16 PNG bytes) ---
  // Pure function of master16 (NOT processedBuffer) so the planes are a function
  // of the canonical artifact itself — identical to what --derive-planes yields.
  const decoded = await decodeMaster16Samples(master16);
  const { hiWebp, loWebp, delivery } = await derivePlanes(decoded);
  writeFileSync(join(outDir, PLANES.hi.file), hiWebp);
  writeFileSync(join(outDir, PLANES.lo.file), loWebp);

  // --- manifest (no timestamps, no absolute paths) ----------------------
  const manifest = {
    pipeline: PIPELINE_VERSION,
    source: {
      // basename only — never the absolute path (byte-determinism).
      filename: basename(inputPath),
      sha256: inputSha,
      bytes: inputBuffer.length,
    },
    curationGate: {
      thresholdPct: args.threshold,
      passed: gatePassed,
      forced: !gatePassed && args.force,
      stats: clip,
    },
    resolutionGate: {
      minLongEdgePx: VARIANTS.master16.longEdge,
      inputLongEdgePx: inputLongEdge,
      passed: resolutionPassed,
      forced: !resolutionPassed && args.force,
    },
    tools: {
      node: process.version,
      prepareMaster: SELF_VERSION,
      sharp: sharp.versions.sharp,
      libvips: sharp.versions.vips,
      libpng: sharp.versions.png,
      libwebp: sharp.versions.webp,
      mozjpeg: sharp.versions.mozjpeg,
      zlibNg: sharp.versions['zlib-ng'],
      ffmpeg: ffmpegVersion(),
    },
    preprocessing: {
      intermediatePixFmt: FFMPEG_PIX_FMT,
      filterGraph: ffInfo.filter,
      filterParams: FFMPEG_FILTER_PARAMS,
      ffmpegDeterminismFlags: FFMPEG_DETERMINISM_FLAGS,
      // ML denoise upgrade slot (Phase 3, FBCNN-class). v1 = non-ML => null.
      mlDenoiseModel: null,
      mlDenoiseWeightsSha256: null,
    },
    resampleKernel: RESAMPLE_KERNEL,
    encoders: { ...ENCODER, planeWebp: PLANE_WEBP },
    variants,
    delivery,
  };

  writeFileSync(join(outDir, 'manifest.json'), Buffer.from(stableStringify(manifest), 'utf8'));

  process.stderr.write(
    `prepare-master: wrote master16 (${variants.master16.width}x${variants.master16.height}, ` +
      `${variants.master16.bitDepthPerChannel}-bit), preview8 (${variants.preview8.width}x${variants.preview8.height}), ` +
      `ai768 (${variants.ai768.width}x${variants.ai768.height}), ` +
      `planes hi=${delivery.hi.bytes}B lo=${delivery.lo.bytes}B (${delivery.encoding}) ` +
      `+ manifest.json to ${outDir}\n`,
  );
}

// --------------------------------------------------------------------------
// standalone --derive-planes mode: planes + manifest fragment from an existing
// canonical master16.png. Writes master16-hi.webp, master16-lo.webp, and
// manifest-delivery.json (the `delivery` fragment) into the output dir.
// --------------------------------------------------------------------------
async function derivePlanesMode(args) {
  const pngPath = resolve(args.derivePlanes);
  if (!existsSync(pngPath)) fail(`master16 PNG not found: ${pngPath}`);

  const pngBuffer = readFileSync(pngPath);
  const masterSha = sha256(pngBuffer);

  const outDir = resolve(args.out || `out-planes-${basename(pngPath).replace(/\.[^.]+$/, '')}`);
  mkdirSync(outDir, { recursive: true });

  const decoded = await decodeMaster16Samples(pngBuffer);
  const { hiWebp, loWebp, delivery } = await derivePlanes(decoded);

  writeFileSync(join(outDir, PLANES.hi.file), hiWebp);
  writeFileSync(join(outDir, PLANES.lo.file), loWebp);

  // The fragment this path CAN know: the delivery block (with the source
  // master's own sha so it can be matched back) plus the plane-WebP encoder
  // params — emitted under `encoders.planeWebp`, the SAME shape the full
  // pipeline records (index.mjs main() writes `encoders: { ...ENCODER, planeWebp }`).
  const fragment = {
    encoders: { planeWebp: PLANE_WEBP },
    delivery: { ...delivery, master16Sha256: masterSha },
  };

  if (args.mergeInto) {
    // Deterministic merge into an existing FULL manifest. We overwrite only the
    // fields this path is authoritative for (delivery + encoders.planeWebp) and
    // preserve every historical block --derive-planes cannot know (source,
    // curationGate, resolutionGate, tools, preprocessing, resampleKernel,
    // variants, the non-plane encoders, pipeline).
    const intoPath = resolve(args.mergeInto);
    if (!existsSync(intoPath)) fail(`--merge-into manifest not found: ${intoPath}`);
    const existing = JSON.parse(readFileSync(intoPath, 'utf8'));

    // Sanity: the existing manifest's master16 must be the PNG we derived from.
    const existingMasterSha = existing?.variants?.master16?.sha256;
    if (existingMasterSha && existingMasterSha !== masterSha) {
      fail(
        `--merge-into: master16 sha mismatch — manifest records ${existingMasterSha} ` +
          `but --derive-planes hashed ${masterSha}. The planes would not describe ` +
          `this manifest's master. Aborting.`,
      );
    }

    const merged = {
      ...existing,
      encoders: { ...(existing.encoders || {}), planeWebp: PLANE_WEBP },
      delivery: fragment.delivery,
    };
    writeFileSync(
      join(outDir, 'manifest.json'),
      Buffer.from(stableStringify(merged), 'utf8'),
    );
    process.stderr.write(
      `prepare-master: derived planes from ${basename(pngPath)} ` +
        `(${decoded.width}x${decoded.height}): hi=${delivery.hi.bytes}B lo=${delivery.lo.bytes}B ` +
        `(${delivery.encoding}); recombinesTo=${delivery.recombinesTo.slice(0, 12)}…; ` +
        `merged delivery + encoders.planeWebp into manifest.json (from ${basename(intoPath)}); ` +
        `wrote ${PLANES.hi.file}, ${PLANES.lo.file}, manifest.json to ${outDir}\n`,
    );
    return;
  }

  writeFileSync(
    join(outDir, 'manifest-delivery.json'),
    Buffer.from(stableStringify(fragment), 'utf8'),
  );

  process.stderr.write(
    `prepare-master: derived planes from ${basename(pngPath)} ` +
      `(${decoded.width}x${decoded.height}): hi=${delivery.hi.bytes}B lo=${delivery.lo.bytes}B ` +
      `(${delivery.encoding}); recombinesTo=${delivery.recombinesTo.slice(0, 12)}…; ` +
      `wrote ${PLANES.hi.file}, ${PLANES.lo.file}, manifest-delivery.json to ${outDir}\n`,
  );
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
