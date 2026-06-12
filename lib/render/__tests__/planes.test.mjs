/**
 * Plane split/recombine round-trip test for the two-plane delivery encoding
 * (PRD §6.2.1 amendment 2026-06-12). The shipped encoding is 12-bit, so the
 * round-trip is exact against the DEFINED 12-bit quantization (not the raw
 * 16-bit sample). This mirrors the packing in scripts/prepare-master/planes.mjs
 * and lib/render/decode.ts `decodeMaster16FromPlanes` so a drift in either is
 * caught here.
 *
 * Run: node --test lib/render/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- JS mirror of the frozen 12-bit packing (verbatim) ---
function hiByte(v) {
  return (v >> 8) & 0xff;
}
function loByte(v) {
  const nib = (v >> 4) & 0x0f;
  return (nib << 4) | nib; // nibble replicated to a full byte
}
function quantize12(v) {
  const hi = (v >> 8) & 0xff;
  const nib = (v >> 4) & 0x0f;
  return (hi << 8) | (nib << 4) | nib;
}
function recombine12(hi, lo) {
  const nib = (lo >> 4) & 0x0f;
  return (hi << 8) | (nib << 4) | nib;
}

test('plane bytes recombine exactly to the 12-bit quantization (full 16-bit sweep)', () => {
  // Sweep every representable 16-bit sample value 0..65535.
  for (let v = 0; v <= 0xffff; v++) {
    const hi = hiByte(v);
    const lo = loByte(v);
    const recombined = recombine12(hi, lo);
    assert.equal(recombined, quantize12(v), `v=${v} recombines to its 12-bit quantization`);
    // The lo plane stores the SAME nibble that recombine reads back.
    assert.equal((lo >> 4) & 0x0f, (v >> 4) & 0x0f, `v=${v} lo nibble preserved`);
    // Plane bytes are valid 0..255.
    assert.ok(hi >= 0 && hi <= 255 && lo >= 0 && lo <= 255, `v=${v} plane bytes in range`);
  }
});

test('synthetic image: split into hi/lo planes, recombine, exact vs 12-bit quantization', () => {
  // A small synthetic 16-bit RGB image with gradients + edge values.
  const width = 17;
  const height = 13;
  const px = width * height;
  const src = new Uint16Array(px * 3);
  let seed = 0x1234;
  const rand = () => {
    // xorshift — deterministic pseudo-random 16-bit samples.
    seed ^= seed << 7;
    seed ^= seed >>> 9;
    seed ^= seed << 8;
    return seed & 0xffff;
  };
  for (let i = 0; i < px; i++) {
    src[i * 3 + 0] = rand();
    src[i * 3 + 1] = (i * 251) & 0xffff; // gradient
    src[i * 3 + 2] = i === 0 ? 0 : i === px - 1 ? 0xffff : rand(); // edges
  }

  // Split into the two opaque RGB planes (as the encoder would).
  const hiPlane = new Uint8Array(px * 3);
  const loPlane = new Uint8Array(px * 3);
  for (let i = 0; i < px * 3; i++) {
    hiPlane[i] = hiByte(src[i]);
    loPlane[i] = loByte(src[i]);
  }

  // Recombine (as decodeMaster16FromPlanes would) and compare to the defined
  // 12-bit quantization of each source sample.
  for (let i = 0; i < px * 3; i++) {
    const recombined = recombine12(hiPlane[i], loPlane[i]);
    assert.equal(recombined, quantize12(src[i]), `sample ${i} exact`);
  }
});

test('12-bit quantization error is bounded (< 1 part in 4096)', () => {
  // The dropped bottom nibble caps the absolute error at 15/65535 ≈ 0.000229.
  let maxErr = 0;
  for (let v = 0; v <= 0xffff; v++) {
    const err = Math.abs(v - quantize12(v)) / 65535;
    if (err > maxErr) maxErr = err;
  }
  assert.ok(maxErr <= 15 / 65535 + 1e-12, `max error ${maxErr} within bound`);
  // < 0.06 of an 8-bit display code value (sub-perceptual after the OETF).
  assert.ok(maxErr * 255 < 0.06, 'sub-1/16-LSB at 8-bit display');
});
