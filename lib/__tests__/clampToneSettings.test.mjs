/**
 * Unit tests for the shared submit validator `clampToneSettings` (PRD invariant
 * #3): the ONE place human submits and AI players are validated. Structured
 * outputs do not enforce numeric min/max, so this clamp is the authoritative
 * defense — it must validate keys, clamp to [-100, 100], round to int, drop
 * unknown keys, and neutralize non-finite / non-object input.
 *
 * Unlike the render tests (which mirror the GLSL in JS), this imports the REAL
 * function from lib/types.ts via Node's native TypeScript type-stripping
 * (Node ≥ 23.6, default-on; CI runs Node 24 LTS) so the actual validator is
 * exercised, not a copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToneSettings, TONE_KEYS, DEFAULT_TONE } from '../types.ts';

/** Every output must have exactly the 10 tone keys, each an integer in range. */
function assertWellFormed(out) {
  assert.deepEqual(Object.keys(out).sort(), [...TONE_KEYS].sort());
  for (const k of TONE_KEYS) {
    assert.ok(Number.isInteger(out[k]), `${k} must be an integer, got ${out[k]}`);
    assert.ok(out[k] >= -100 && out[k] <= 100, `${k} out of range: ${out[k]}`);
  }
}

test('passes through valid in-range integers unchanged', () => {
  const input = { temp: -35, tint: 10, exposure: 0, contrast: 100, highlights: -100, shadows: 5, whites: -5, blacks: 20, vibrance: -20, saturation: 50 };
  const out = clampToneSettings(input);
  assertWellFormed(out);
  assert.deepEqual(out, input);
});

test('clamps values above +100 and below -100', () => {
  const out = clampToneSettings({ exposure: 9999, blacks: -9999, temp: 101, tint: -101 });
  assertWellFormed(out);
  assert.equal(out.exposure, 100);
  assert.equal(out.blacks, -100);
  assert.equal(out.temp, 100);
  assert.equal(out.tint, -100);
});

test('rounds non-integers to the nearest integer', () => {
  const out = clampToneSettings({ contrast: 12.4, shadows: 12.6, whites: -3.5, vibrance: 2.5 });
  assert.equal(out.contrast, 12);
  assert.equal(out.shadows, 13);
  // Math.round is half-up: -3.5 -> -3, 2.5 -> 3.
  assert.equal(out.whites, -3);
  assert.equal(out.vibrance, 3);
  assertWellFormed(out);
});

test('clamps THEN rounds so out-of-range floats land on the boundary', () => {
  const out = clampToneSettings({ exposure: 100.9, blacks: -100.9 });
  assert.equal(out.exposure, 100);
  assert.equal(out.blacks, -100);
});

test('missing keys default to 0', () => {
  const out = clampToneSettings({ temp: 40 });
  assert.equal(out.temp, 40);
  for (const k of TONE_KEYS) {
    if (k !== 'temp') assert.equal(out[k], 0, `${k} should default to 0`);
  }
  assertWellFormed(out);
});

test('drops unknown / extra keys', () => {
  const out = clampToneSettings({ temp: 5, clarity: 80, hue: 10, __proto__: 999, evil: 'x' });
  assert.equal(out.temp, 5);
  assert.ok(!('clarity' in out), 'clarity must be dropped (not a v1 UI key)');
  assert.ok(!('hue' in out));
  assert.ok(!('evil' in out));
  assertWellFormed(out);
});

test('non-finite values (NaN, ±Infinity) neutralize to 0', () => {
  const out = clampToneSettings({ temp: NaN, tint: Infinity, exposure: -Infinity });
  assert.equal(out.temp, 0);
  assert.equal(out.tint, 0);
  assert.equal(out.exposure, 0);
});

test('numeric strings coerce; non-numeric strings neutralize', () => {
  const out = clampToneSettings({ temp: '50', tint: '-30', exposure: 'abc', contrast: '' });
  assert.equal(out.temp, 50);
  assert.equal(out.tint, -30);
  assert.equal(out.exposure, 0);
  // Number('') === 0 (finite), so an empty string clamps/rounds to 0.
  assert.equal(out.contrast, 0);
  assertWellFormed(out);
});

test('non-object inputs return the neutral default', () => {
  for (const bad of [null, undefined, 42, 'nope', true, NaN]) {
    const out = clampToneSettings(bad);
    assert.deepEqual(out, DEFAULT_TONE, `input ${String(bad)} should be neutral`);
    assertWellFormed(out);
  }
});

test('arrays are treated as objects with no tone keys → all neutral', () => {
  const out = clampToneSettings([1, 2, 3]);
  assert.deepEqual(out, DEFAULT_TONE);
});

test('output is a fresh object (does not mutate DEFAULT_TONE)', () => {
  const out = clampToneSettings({ temp: 77 });
  assert.equal(DEFAULT_TONE.temp, 0, 'DEFAULT_TONE must not be mutated');
  assert.notEqual(out, DEFAULT_TONE);
});
