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

// --- Frozen per-op formula spot checks (linear light) ---
const LUMA = [0.2126, 0.7152, 0.0722];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('exposure op: c *= 2^(2n)', () => {
  // n = +0.5 (slider +50) → gain 2^1 = 2x.
  const n = 0.5;
  const gain = Math.pow(2, 2 * n);
  assert.ok(Math.abs(gain - 2) < 1e-9, '+50 exposure → 2x linear gain');
  // n = -0.5 → 0.5x.
  assert.ok(Math.abs(Math.pow(2, 2 * -0.5) - 0.5) < 1e-9, '-50 → 0.5x');
});

test('contrast op: pivot P=0.18, c=(c-P)*(1+n)+P', () => {
  const P = 0.18;
  const n = 1.0; // +100 → slope 2
  // A value AT the pivot is unchanged at any contrast.
  assert.ok(Math.abs((P - P) * (1 + n) + P - P) < 1e-12, 'pivot fixed');
  // 0.5 at +100 → (0.5-0.18)*2 + 0.18 = 0.82.
  assert.ok(Math.abs((0.5 - P) * (1 + n) + P - 0.82) < 1e-9, '0.5 → 0.82');
});

test('saturation op: n=-1 → grayscale (mix to luma)', () => {
  const c = [0.6, 0.3, 0.1];
  const Y = dot3(c, LUMA);
  const n = -1; // -100 → fully desaturated
  const out = c.map((ch) => Y + (ch - Y) * (1 + n));
  assert.ok(
    out.every((v) => Math.abs(v - Y) < 1e-9),
    'every channel collapses to luma Y',
  );
});
