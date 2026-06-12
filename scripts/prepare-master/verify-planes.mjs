#!/usr/bin/env node
// verify-planes.mjs — the load-bearing equivalence proof for the two-plane
// delivery encoding (PRD §6.2.1 amendment 2026-06-12).
//
// Decodes master16-hi.webp + master16-lo.webp with sharp, recombines them per
// the SHIPPED 12-bit packing (planes.mjs `recombine12`), and asserts the result
// is bit-exactly the 12-bit quantization of the canonical master16.png samples
// (`delivery.recombinesTo`). Because 12-bit ships, the check is against the
// DEFINED quantization, not the raw PNG.
//
// Usage:
//   node verify-planes.mjs <dir-with-master16.png+planes>
//   (defaults to ../../public/photo/dev-001 relative to this file)

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import {
  decodeMaster16Samples,
  recombine12,
  rgb16BigEndian,
  sha256,
} from './planes.mjs';

sharp.cache(false);
sharp.concurrency(1);

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(process.argv[2] || join(here, '../../public/photo/dev-001'));

const pngPath = join(dir, 'master16.png');
const hiPath = join(dir, 'master16-hi.webp');
const loPath = join(dir, 'master16-lo.webp');

for (const p of [pngPath, hiPath, loPath]) {
  if (!existsSync(p)) {
    console.error(`verify-planes: missing ${p}`);
    process.exit(1);
  }
}

// 1. Canonical reference: 12-bit-quantized RGB16 big-endian samples of the PNG.
const pngBuf = readFileSync(pngPath);
const decoded = await decodeMaster16Samples(pngBuf);
const { width, height, channels, samples } = decoded;
const refSha = sha256(rgb16BigEndian(width, height, channels, samples, /* quantize */ true));

// 2. Decode both planes to raw RGB bytes (opaque, 3-channel).
async function rawRGB(path) {
  const { data, info } = await sharp(readFileSync(path))
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

const hi = await rawRGB(hiPath);
const lo = await rawRGB(loPath);

if (hi.width !== width || hi.height !== height || lo.width !== width || lo.height !== height) {
  console.error(
    `verify-planes: dimension mismatch — png ${width}x${height}, ` +
      `hi ${hi.width}x${hi.height}, lo ${lo.width}x${lo.height}`,
  );
  process.exit(1);
}

// 3. Recombine and build the big-endian RGB16 buffer.
const px = width * height;
const out = Buffer.alloc(px * 3 * 2);
let o = 0;
for (let i = 0; i < px * 3; i++) {
  const v = recombine12(hi.data[i], lo.data[i]);
  out[o++] = (v >> 8) & 0xff;
  out[o++] = v & 0xff;
}
const gotSha = sha256(out);

if (gotSha !== refSha) {
  console.error('verify-planes: FAIL — recombined planes do NOT match the 12-bit-quantized master.');
  console.error(`  expected (recombinesTo): ${refSha}`);
  console.error(`  got (from planes):       ${gotSha}`);
  process.exit(1);
}

console.log('verify-planes: PASS — planes recombine BIT-EXACTLY to the 12-bit-quantized master16 samples.');
console.log(`  recombinesTo = ${refSha}`);
console.log(`  hi=${readFileSync(hiPath).length}B  lo=${readFileSync(loPath).length}B  png=${pngBuf.length}B`);
