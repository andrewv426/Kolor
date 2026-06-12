/**
 * Canonical master16 decode → half-float pack path (PRD §6.2.1, decode steps
 * 1–2 + freeze rule 2). Produces a `DecodedMaster` ready for `setSource`.
 *
 * Tier A (canonical):
 *   1. UPNG.decode(master16.png) → raw big-endian 16-bit RGBA sample bytes.
 *      Assert depth === 16, ctype === 6 (RGBA). If ctype === 2 (RGB) we expand
 *      to RGBA with a forced-opaque alpha (the master is always fully opaque).
 *   2. Reassemble each sample explicitly as `(hi << 8) | lo` (NEVER reinterpret
 *      the buffer — that swaps bytes on little-endian hosts). Normalize s/65535
 *      → [0,1], then pack each to its binary16 BIT PATTERN. Result: a
 *      Uint16Array of half bits in R,G,B,A order, uploaded as RGBA16F.
 *
 * Tier B fallback: when 16-bit decode is impossible (e.g. UPNG reports a
 * non-16-bit PNG), the caller decodes preview8 instead via `decodePreview8`,
 * which produces the same `halfData` shape (half bits) from an 8-bit source so
 * the SAME shader path runs unchanged.
 *
 * NOTE on tier semantics: this module only knows whether it produced an
 * A-source or a B-source decode. Whether the GPU can actually allocate a
 * half-float texture (the rest of the Tier-A gate) is decided in the renderer,
 * which may demote A→B at upload time.
 */

import UPNG from 'upng-js';
import type { DecodedMaster } from './types';
import { packFloat16 } from './float16';
import { assertLoPlaneNibbleReplication } from './readbackProbe.mjs';

/**
 * Decode a `master16.png` ArrayBuffer per the frozen v1 path. Resolves to a
 * Tier-A `DecodedMaster` (half-float bit patterns). Rejects only on a genuinely
 * undecodable buffer; a non-16-bit/non-RGB(A) PNG throws so the caller can fall
 * back to `decodePreview8` (Tier B).
 */
export async function decodeMaster16(buf: ArrayBuffer): Promise<DecodedMaster> {
  const img = UPNG.decode(buf);

  if (img.depth !== 16) {
    throw new Error(
      `master16: expected depth 16, got ${img.depth} — fall back to preview8 (Tier B)`,
    );
  }
  // ctype 6 = RGBA (canonical). ctype 2 = RGB — expand to RGBA, opaque alpha.
  const isRGBA = img.ctype === 6;
  const isRGB = img.ctype === 2;
  if (!isRGBA && !isRGB) {
    throw new Error(
      `master16: expected ctype 6 (RGBA) or 2 (RGB), got ${img.ctype}`,
    );
  }

  const { width, height } = img;
  const srcChannels = isRGBA ? 4 : 3;
  const pixels = width * height;
  const bytes = img.data; // big-endian 16-bit samples, srcChannels per pixel

  const expectedBytes = pixels * srcChannels * 2;
  if (bytes.length < expectedBytes) {
    throw new Error(
      `master16: truncated sample data (${bytes.length} < ${expectedBytes})`,
    );
  }

  // Always emit interleaved RGBA half bits (4 channels), forced-opaque alpha.
  const halfData = new Uint16Array(pixels * 4);
  const inv = 1 / 65535;
  let bi = 0; // byte index into source
  let oi = 0; // half index into output

  for (let p = 0; p < pixels; p++) {
    // R, G, B from the source (big-endian (hi<<8)|lo, explicit reassembly).
    for (let ch = 0; ch < 3; ch++) {
      const hi = bytes[bi];
      const lo = bytes[bi + 1];
      bi += 2;
      const sample = ((hi << 8) | lo) * inv; // [0,1]
      halfData[oi++] = packFloat16(sample);
    }
    if (isRGBA) {
      // Consume the source alpha sample but force opaque (master is opaque).
      bi += 2;
    }
    halfData[oi++] = packFloat16(1.0); // forced-opaque alpha = half(1.0)
  }

  return { width, height, halfData, tier: 'A' };
}

/**
 * Tier-A delivery decode from the two-plane WebP set (PRD §6.2.1 amendment
 * 2026-06-12). The canonical master16.png stays the archival artifact; for web
 * delivery the editor fetches two lossless-WebP planes instead (≈42% of the PNG
 * size). This produces the SAME Tier-A `DecodedMaster` as `decodeMaster16` —
 * recombine on CPU → s/65535 → packFloat16 → RGBA16F. No shader/math changes.
 *
 * SHIPPED packing = 12-bit:
 *   hi plane[i] = (v >> 8) & 0xFF                       (top byte)
 *   lo plane[i] = (nib << 4) | nib, nib = (v >> 4) & 0xF (top nibble of low byte)
 *   recombine:  nib = loByte >> 4 ;  v = (hi << 8) | (nib << 4) | nib
 *
 * Decode flow (pinned):
 *   1. createImageBitmap on each plane with { premultiplyAlpha: 'none',
 *      colorSpaceConversion: 'none' } so the bytes are read verbatim (no
 *      implicit color management, no premultiply).
 *   2. Draw each to a 2D canvas with { alpha: false, willReadFrequently: true }
 *      and getImageData — planes are opaque, so 8-bit readback is exact.
 *   3. Assert both planes share the master's dimensions, then recombine per the
 *      12-bit packing and pack each channel to half bits (forced-opaque alpha).
 *
 * Browser-only (needs createImageBitmap + a 2D canvas). Throws on a genuinely
 * undecodable plane so the caller can fall back to the master16.png path.
 *
 * The readback integrity probe is `assertLoPlaneNibbleReplication` (re-exported
 * below from ./readbackProbe.mjs — kept as a pure, DOM-free, node-testable
 * module).
 */
export { assertLoPlaneNibbleReplication } from './readbackProbe.mjs';

export async function decodeMaster16FromPlanes(
  hiBuf: ArrayBuffer,
  loBuf: ArrayBuffer,
): Promise<DecodedMaster> {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('decodeMaster16FromPlanes: createImageBitmap unavailable');
  }
  // Pinned options — read the plane bytes verbatim (no color management).
  const opts: ImageBitmapOptions = {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  };
  const [hiBmp, loBmp] = await Promise.all([
    createImageBitmap(new Blob([hiBuf]), opts),
    createImageBitmap(new Blob([loBuf]), opts),
  ]);

  let hi: Uint8ClampedArray;
  let lo: Uint8ClampedArray;
  let width: number;
  let height: number;
  try {
    width = hiBmp.width;
    height = hiBmp.height;
    if (loBmp.width !== width || loBmp.height !== height) {
      throw new Error(
        `planes: dimension mismatch — hi ${width}x${height}, lo ${loBmp.width}x${loBmp.height}`,
      );
    }

    hi = readBitmapRGBA8(hiBmp, width, height);
    lo = readBitmapRGBA8(loBmp, width, height);
  } finally {
    // Deterministically release the decoded surfaces regardless of outcome.
    hiBmp.close();
    loBmp.close();
  }

  // Readback integrity probe (PRD §6.2.1 delivery-encoding amendment). The lo
  // plane has a built-in invariant requiring NO server data: the encoder writes
  // every lo byte as a replicated nibble `(nib<<4)|nib`, so for any valid byte
  // `(b>>4) === (b&0xF)`. A color-managing browser (Safari risk) silently
  // mangling the 8-bit readback would break this. Sample a deterministic spread
  // of bytes; any violation throws → the masterCache catch falls back to PNG.
  assertLoPlaneNibbleReplication(lo, width);

  const pixels = width * height;
  const halfData = new Uint16Array(pixels * 4);
  const inv = 1 / 65535;
  for (let p = 0; p < pixels; p++) {
    const s = p * 4;
    for (let ch = 0; ch < 3; ch++) {
      const hiByte = hi[s + ch];
      const nib = (lo[s + ch] >> 4) & 0x0f;
      const v = ((hiByte << 8) | (nib << 4) | nib) * inv; // [0,1]
      halfData[s + ch] = packFloat16(v);
    }
    halfData[s + 3] = packFloat16(1.0); // forced-opaque alpha
  }

  return { width, height, halfData, tier: 'A' };
}

/** Read an opaque ImageBitmap's RGBA8 pixels via a 2D canvas (browser-only). */
function readBitmapRGBA8(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Uint8ClampedArray {
  let ctx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  // Planes are opaque → { alpha: false } makes readback exact; willReadFrequently
  // hints the browser to keep a CPU-readable backing.
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height);
    ctx = oc.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
      colorSpace: 'srgb',
    }) as OffscreenCanvasRenderingContext2D | null;
  }
  if (!ctx && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    ctx = c.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
      colorSpace: 'srgb',
    });
  }
  if (!ctx) {
    throw new Error('decodeMaster16FromPlanes: no 2D canvas context available');
  }
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

/**
 * Tier-B source decode: build a `DecodedMaster` from the 8-bit `preview8`
 * variant. The same shader runs (still sRGB-decode in-shader), so we normalize
 * the 8-bit RGBA bytes to [0,1] and pack to half bits exactly as Tier A does —
 * keeping a single uniform `halfData` contract. The renderer may instead upload
 * preview8 as a plain RGBA8 UNORM texture (cheaper, also v1-legal); this helper
 * exists so a half-float upload path can consume preview8 identically when the
 * GPU supports RGBA16F but UPNG could not deliver a 16-bit master.
 *
 * Accepts an `ImageBitmap` (or any canvas-imageable source) and reads its RGBA8
 * pixels via a 2D canvas. Browser-only (needs OffscreenCanvas/2D context).
 */
export async function decodePreview8(bitmap: ImageBitmap): Promise<DecodedMaster> {
  const { width, height } = bitmap;
  const rgba = readImageBitmapRGBA8(bitmap, width, height);

  const pixels = width * height;
  const halfData = new Uint16Array(pixels * 4);
  const inv = 1 / 255;
  for (let i = 0; i < pixels; i++) {
    const s = i * 4;
    halfData[s + 0] = packFloat16(rgba[s + 0] * inv);
    halfData[s + 1] = packFloat16(rgba[s + 1] * inv);
    halfData[s + 2] = packFloat16(rgba[s + 2] * inv);
    halfData[s + 3] = packFloat16(1.0); // forced opaque
  }

  return { width, height, halfData, tier: 'B' };
}

/** Read an ImageBitmap's RGBA8 pixels via a 2D canvas (browser-only). */
function readImageBitmapRGBA8(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Uint8ClampedArray {
  // Prefer OffscreenCanvas where available; fall back to a DOM canvas.
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height);
    ctx = oc.getContext('2d', { colorSpace: 'srgb' }) as OffscreenCanvasRenderingContext2D | null;
  }
  if (!ctx && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    ctx = c.getContext('2d', { colorSpace: 'srgb' });
  }
  if (!ctx) {
    throw new Error('decodePreview8: no 2D canvas context available');
  }
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}
