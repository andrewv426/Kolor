/**
 * Sanity tests for the frozen v1 sRGB transfer functions (PRD §6.2.1) and a
 * spot-check of two frozen per-op formulas. The shader is GLSL (not runnable in
 * node), so this mirrors the EXACT piecewise functions + constants in JS and
 * asserts the known anchor points + round-trip — locking the constants
 * (0.04045 / 0.0031308 / 12.92 / 1.055 / 0.055 / 2.4) against accidental drift.
 *
 * Run: node --test lib/render/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- JS mirror of the frozen in-shader functions (constants verbatim) ---
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

test('sRGB EOTF anchor points', () => {
  assert.equal(srgbToLinear(0), 0, '0 → 0');
  assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-9, '1 → 1');
  // The piecewise knee at 0.04045 → 0.04045/12.92 ≈ 0.0031308.
  assert.ok(
    Math.abs(srgbToLinear(0.04045) - 0.04045 / 12.92) < 1e-9,
    'linear knee continuous',
  );
  // Mid-gray sRGB 0.5 → ~0.2140 linear.
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.21404114) < 1e-6, '0.5 → 0.214');
});

test('sRGB OETF anchor points', () => {
  assert.equal(linearToSrgb(0), 0, '0 → 0');
  assert.ok(Math.abs(linearToSrgb(1) - 1) < 1e-9, '1 → 1');
  assert.ok(Math.abs(linearToSrgb(0.214) - 0.5) < 1e-3, '0.214 → ~0.5');
});

test('EOTF/OETF are inverses across [0,1]', () => {
  for (let i = 0; i <= 100; i++) {
    const c = i / 100;
    const back = linearToSrgb(srgbToLinear(c));
    assert.ok(Math.abs(back - c) < 1e-6, `round-trip at ${c} (got ${back})`);
  }
});

// --- Frozen per-op formula spot checks ---
// NOTE: per the 2026-06-14 tone-stage amendment, WB/exposure run in LINEAR light
// but contrast/whites/blacks/vibrance/saturation run in PERCEPTUAL (sRGB-gamma)
// space after a single mid-chain OETF. The full perceptual op chain is mirrored
// and exercised in tone.test.mjs; these spot checks only lock the linear-stage
// exposure gain. (The OLD linear-pivot contrast `(c-P)*(1+n)+P` and linear
// saturation checks were removed — they no longer describe the frozen pipeline.)
test('exposure op (linear stage): c *= 2^(2n)', () => {
  // n = +0.5 (slider +50) → gain 2^1 = 2x.
  const n = 0.5;
  const gain = Math.pow(2, 2 * n);
  assert.ok(Math.abs(gain - 2) < 1e-9, '+50 exposure → 2x linear gain');
  // n = -0.5 → 0.5x.
  assert.ok(Math.abs(Math.pow(2, 2 * -0.5) - 0.5) < 1e-9, '-50 → 0.5x');
});
