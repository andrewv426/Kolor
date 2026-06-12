// planes.mjs — the SINGLE definition of the two-plane delivery encoding
// (PRD §6.2.1 amendment 2026-06-12). Imported by index.mjs (to emit planes)
// and by the dev-001 verify script (to prove recombination). Keeping the math
// here means the encode path and the equivalence proof can never diverge.
//
// SHIPPED: 12-bit. See constants.mjs DELIVERY_ENCODING for the rationale and the
// measured size numbers. The packing:
//   hi plane[i] = (v >> 8) & 0xFF
//   nib         = (v >> 4) & 0x0F                (top nibble of the low byte)
//   lo plane[i] = (nib << 4) | nib               (nibble replicated → 0..255)
// Recombination (decode):
//   nib = loPlane[i] >> 4 ;  v = (hi << 8) | (nib << 4) | nib
//
// `quantize12(v)` is the canonical 12-bit quantization of a PNG sample; the
// manifest's `delivery.recombinesTo` is the sha256 of the big-endian RGB16
// buffer AFTER applying it, so recombined planes match it bit-exactly.

import { createHash } from 'node:crypto';
import sharp from 'sharp';

import { PLANE_WEBP, DELIVERY_ENCODING } from './constants.mjs';

/** Canonical 12-bit quantization of one 16-bit sample (drops the bottom nibble). */
export function quantize12(v) {
  const hi = (v >> 8) & 0xff;
  const nib = (v >> 4) & 0x0f;
  return (hi << 8) | (nib << 4) | nib;
}

/** The 8-bit lo-plane byte for one 16-bit sample (nibble replicated). */
export function loByte(v) {
  const nib = (v >> 4) & 0x0f;
  return (nib << 4) | nib;
}

/** The 8-bit hi-plane byte for one 16-bit sample (top byte). */
export function hiByte(v) {
  return (v >> 8) & 0xff;
}

/** Recombine one (hi, lo) plane-byte pair back into a 16-bit sample (12-bit). */
export function recombine12(hi, lo) {
  const nib = (lo >> 4) & 0x0f;
  return (hi << 8) | (nib << 4) | nib;
}

/**
 * Decode the canonical master16 PNG buffer to its raw RGB16 samples.
 * Returns { width, height, channels, samples } where `samples` is a Uint16Array
 * of interleaved RGB(A) samples in host order. Pure function of the PNG bytes.
 */
export async function decodeMaster16Samples(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .toColourspace('rgb16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });
  const samples = new Uint16Array(data.buffer, data.byteOffset, data.length / 2);
  return { width: info.width, height: info.height, channels: info.channels, samples };
}

/**
 * Big-endian RGB16 sample buffer (canonical pixel-data form: 2 bytes/sample,
 * RGB order, alpha dropped). Its sha256 is the manifest `delivery.pixelDataSha`
 * (the raw master pixel data) and, after `quantize12`, the `recombinesTo` value.
 */
export function rgb16BigEndian(width, height, channels, samples, quantize = false) {
  const px = width * height;
  const out = Buffer.alloc(px * 3 * 2);
  let o = 0;
  for (let p = 0; p < px; p++) {
    for (let c = 0; c < 3; c++) {
      let v = samples[p * channels + c];
      if (quantize) v = quantize12(v);
      out[o++] = (v >> 8) & 0xff;
      out[o++] = v & 0xff;
    }
  }
  return out;
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Derive the two delivery planes (as lossless-WebP buffers) plus the manifest
 * `delivery` fragment, from a decoded master16. Pure function of the PNG bytes.
 *
 * Returns { hiWebp, loWebp, delivery } where `delivery` is the manifest block.
 */
export async function derivePlanes({ width, height, channels, samples }) {
  const px = width * height;
  const hiRaw = Buffer.alloc(px * 3);
  const loRaw = Buffer.alloc(px * 3);
  let k = 0;
  for (let p = 0; p < px; p++) {
    for (let c = 0; c < 3; c++) {
      const v = samples[p * channels + c];
      hiRaw[k] = hiByte(v);
      loRaw[k] = loByte(v);
      k++;
    }
  }

  const encode = (raw) =>
    sharp(raw, { raw: { width, height, channels: 3 } })
      .webp({
        lossless: PLANE_WEBP.lossless,
        effort: PLANE_WEBP.effort,
        smartSubsample: PLANE_WEBP.smartSubsample,
      })
      .toBuffer();

  const [hiWebp, loWebp] = await Promise.all([encode(hiRaw), encode(loRaw)]);

  // pixelDataSha = sha of the canonical (full-precision) RGB16 master samples.
  // recombinesTo = sha of the 12-bit-quantized RGB16 samples — what the planes
  // recombine to bit-exactly.
  const pixelDataSha = sha256(rgb16BigEndian(width, height, channels, samples, false));
  const recombinesTo = sha256(rgb16BigEndian(width, height, channels, samples, true));

  const delivery = {
    encoding: DELIVERY_ENCODING,
    note:
      'Web-delivery two-plane lossless WebP. hi = top byte of each 16-bit RGB ' +
      'sample; lo = top nibble of the low byte replicated to a full byte ' +
      '((nib<<4)|nib). Decode: nib=lo>>4; v=(hi<<8)|(nib<<4)|nib. NOT ' +
      'bit-identical to master16.png (bottom 4 bits dropped); recombines ' +
      'bit-exactly to the 12-bit-quantized master samples (recombinesTo).',
    planes: {
      hi: { plane: 'hi', bits: 'top byte (v>>8)' },
      lo: { plane: 'lo', bits: '(((v>>4)&0xF)<<4)|((v>>4)&0xF)' },
    },
    pixelDataSha,
    recombinesTo,
    hi: { file: 'master16-hi.webp', width, height, format: 'webp', sha256: sha256(hiWebp), bytes: hiWebp.length },
    lo: { file: 'master16-lo.webp', width, height, format: 'webp', sha256: sha256(loWebp), bytes: loWebp.length },
  };

  return { hiWebp, loWebp, delivery };
}
