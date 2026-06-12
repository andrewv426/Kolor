/**
 * IEEE-754 binary16 (half-float) bit-pattern packer — PART OF THE v1 FREEZE
 * (PRD §6.2.1, decode step 2 + freeze rule 2).
 *
 * `type = gl.HALF_FLOAT` does NOT normalize integers: it interprets each 16-bit
 * element as an IEEE-754 half-float BIT PATTERN. So we must convert each
 * normalized sample s ∈ [0,1] to its binary16 bit pattern in JS before upload.
 *
 * This implementation is the canonical, deterministic binary32→binary16
 * reduction with **round-to-nearest, ties-to-even** (the IEEE default and the
 * pinned v1 rounding). It handles 0, denormals, the exact representable values
 * (0.5 → 0x3800, 1.0 → 0x3C00), the max finite (65504 → 0x7BFF), overflow to
 * ±Inf, and NaN. The input is first passed through `Math.fround` to collapse to
 * a true binary32 value, matching the §6.2.1 "round-trip through Math.fround
 * then the standard binary16-from-binary32 reduction" prescription exactly.
 *
 * Pure + unit-testable; no GPU, no DOM.
 */

// Scratch views: reinterpret a float32 as its raw 32-bit integer pattern.
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);

/**
 * Pack a JS number into its IEEE-754 binary16 bit pattern (0..0xFFFF).
 * Round-to-nearest, ties-to-even. Pure function.
 */
export function packFloat16(f: number): number {
  // Collapse to a real binary32 value first (frozen step).
  _f32[0] = Math.fround(f);
  const x = _u32[0];

  // Decompose the binary32.
  const sign = (x >>> 16) & 0x8000; // half sign bit in place
  const exp = (x >>> 23) & 0xff; // 8-bit biased exponent
  let mant = x & 0x007fffff; // 23-bit mantissa

  // NaN / Inf (exp all ones).
  if (exp === 0xff) {
    // NaN → a canonical quiet NaN; Inf → half Inf.
    return sign | 0x7c00 | (mant !== 0 ? 0x0200 : 0);
  }

  // Unbias float32 exponent, rebias to half (bias 15 vs 127).
  // newExp is the half biased exponent before normalization handling.
  const newExp = exp - 127 + 15;

  if (newExp >= 0x1f) {
    // Overflow → ±Inf.
    return sign | 0x7c00;
  }

  if (newExp <= 0) {
    // Subnormal half (or underflow to zero).
    if (newExp < -10) {
      // Too small even for the smallest subnormal → signed zero.
      return sign;
    }
    // Restore the implicit leading 1 of the normalized float32 mantissa, then
    // shift it into the subnormal half range, applying round-to-nearest-even.
    mant |= 0x00800000; // 24-bit significand with implicit 1
    const shift = 14 - newExp; // 1..24
    const halfMant = mant >>> shift;
    // Rounding: inspect the bits shifted out.
    const roundBitPos = shift - 1;
    const roundBit = (mant >>> roundBitPos) & 1;
    const sticky = (mant & ((1 << roundBitPos) - 1)) !== 0 ? 1 : 0;
    let result = sign | halfMant;
    if (roundBit && (sticky || (halfMant & 1))) {
      result += 1; // may carry into exponent — that is correct IEEE behavior
    }
    return result & 0xffff;
  }

  // Normalized half. Round the 23-bit mantissa down to 10 bits, ties-to-even.
  const roundBit = (mant >>> 12) & 1; // bit just below the 10 kept bits
  const sticky = (mant & 0x00000fff) !== 0 ? 1 : 0;
  const halfMant = mant >>> 13; // top 10 mantissa bits
  let result = sign | (newExp << 10) | halfMant;
  if (roundBit && (sticky || (halfMant & 1))) {
    // Carry propagates naturally through mantissa into exponent.
    result += 1;
    // If mantissa overflowed into exponent and exponent hit 0x1F, result is
    // now an Inf pattern, which is the correct rounding outcome.
  }
  return result & 0xffff;
}

/**
 * Pack an array of normalized samples ([0,1] sRGB-encoded) into a Uint16Array of
 * half-float bit patterns, ready for an `RGBA16F` / `HALF_FLOAT` upload.
 * `out` may be supplied to avoid allocation; otherwise one is allocated.
 */
export function packArray(samples: ArrayLike<number>, out?: Uint16Array): Uint16Array {
  const n = samples.length;
  const dst = out && out.length >= n ? out : new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    dst[i] = packFloat16(samples[i]);
  }
  return dst;
}
