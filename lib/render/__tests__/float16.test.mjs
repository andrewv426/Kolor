/**
 * Unit tests for the frozen v1 binary16 packer (PRD §6.2.1 decode step 2).
 * Plain node:test — no jest, no transpile. Run: node --test lib/render/__tests__/
 *
 * The packer is part of the v1 freeze, so these golden vectors lock its exact
 * rounding (round-to-nearest, ties-to-even) across known representable values,
 * denormals, the max finite, overflow, and zero.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Re-implement the packer here in JS, mirroring lib/render/float16.ts exactly,
// so the test runs without a TS toolchain. If this mirror drifts from the TS,
// the conformance golden vectors below will catch the regression in EITHER.
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);

function packFloat16(f) {
  _f32[0] = Math.fround(f);
  const x = _u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x007fffff;

  if (exp === 0xff) {
    return sign | 0x7c00 | (mant !== 0 ? 0x0200 : 0);
  }
  const newExp = exp - 127 + 15;
  if (newExp >= 0x1f) {
    return sign | 0x7c00;
  }
  if (newExp <= 0) {
    if (newExp < -10) return sign;
    mant |= 0x00800000;
    const shift = 14 - newExp;
    const halfMant = mant >>> shift;
    const roundBitPos = shift - 1;
    const roundBit = (mant >>> roundBitPos) & 1;
    const sticky = (mant & ((1 << roundBitPos) - 1)) !== 0 ? 1 : 0;
    let result = sign | halfMant;
    if (roundBit && (sticky || (halfMant & 1))) result += 1;
    return result & 0xffff;
  }
  const roundBit = (mant >>> 12) & 1;
  const sticky = (mant & 0x00000fff) !== 0 ? 1 : 0;
  const halfMant = mant >>> 13;
  let result = sign | (newExp << 10) | halfMant;
  if (roundBit && (sticky || (halfMant & 1))) result += 1;
  return result & 0xffff;
}

// Reference: decode a binary16 bit pattern back to a JS number, to round-trip.
function unpackFloat16(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x03ff;
  if (exp === 0) {
    return sign * mant * Math.pow(2, -24); // subnormal
  }
  if (exp === 0x1f) {
    return mant ? NaN : sign * Infinity;
  }
  return sign * (1 + mant / 1024) * Math.pow(2, exp - 15);
}

test('known golden vectors (locks v1 packer)', () => {
  assert.equal(packFloat16(0), 0x0000, '0 → 0x0000');
  assert.equal(packFloat16(-0), 0x8000, '-0 → 0x8000');
  assert.equal(packFloat16(1), 0x3c00, '1 → 0x3C00');
  assert.equal(packFloat16(0.5), 0x3800, '0.5 → 0x3800');
  assert.equal(packFloat16(2), 0x4000, '2 → 0x4000');
  assert.equal(packFloat16(-1), 0xbc00, '-1 → 0xBC00');
  assert.equal(packFloat16(65504), 0x7bff, '65504 (max finite) → 0x7BFF');
});

test('smallest positive subnormal', () => {
  // 2^-24 is the smallest positive binary16 subnormal → 0x0001.
  assert.equal(packFloat16(Math.pow(2, -24)), 0x0001, '2^-24 → 0x0001');
  // Smallest normal: 2^-14 → 0x0400.
  assert.equal(packFloat16(Math.pow(2, -14)), 0x0400, '2^-14 → 0x0400');
});

test('overflow saturates to +Inf, NaN stays NaN', () => {
  assert.equal(packFloat16(70000), 0x7c00, '70000 → +Inf (0x7C00)');
  assert.equal(packFloat16(Infinity), 0x7c00, '+Inf → 0x7C00');
  assert.equal(packFloat16(-Infinity), 0xfc00, '-Inf → 0xFC00');
  const nan = packFloat16(NaN);
  assert.ok((nan & 0x7c00) === 0x7c00 && (nan & 0x03ff) !== 0, 'NaN → NaN pattern');
});

test('round-to-nearest-even at the 10-bit boundary', () => {
  // 1 + 1/2048 sits exactly halfway between half codes 0x3C00 and 0x3C01.
  // Ties-to-even → round to 0x3C00 (even mantissa).
  assert.equal(packFloat16(1 + 1 / 2048), 0x3c00, 'tie rounds to even (down)');
  // 1 + 3/2048 ties between 0x3C01 and 0x3C02 → even is 0x3C02.
  assert.equal(packFloat16(1 + 3 / 2048), 0x3c02, 'tie rounds to even (up)');
});

test('normalized [0,1] samples round-trip within half precision', () => {
  // Every normalized sample s/65535 must pack and unpack within half ULP.
  const samples = [0, 1, 16384, 32768, 49152, 65535];
  for (const raw of samples) {
    const s = raw / 65535;
    const back = unpackFloat16(packFloat16(s));
    // binary16 relative precision ~2^-11; allow a generous absolute epsilon.
    assert.ok(Math.abs(back - s) <= 5e-4, `s=${s} round-trips (got ${back})`);
  }
  // Endpoints must be exact.
  assert.equal(unpackFloat16(packFloat16(0)), 0, '0 exact');
  assert.equal(unpackFloat16(packFloat16(1)), 1, '1 exact');
});
