/**
 * Regression tests for the frozen v1 negative-lobe pinning + clamped vibrance
 * `sat` (PRD §6.2.1, amendment 2026-06-12). The shader is GLSL (not runnable in
 * node), so this mirrors the EXACT op chain in JS (constants verbatim) and locks
 * the fix: contrast (op 4) and blacks (op 8) each pin `c = max(c, 0)`, and
 * vibrance (op 9) clamps `sat` to [0,1].
 *
 * The bug (pre-fix): contrast/blacks could drive dark linear channels < 0; with
 * a negative `mx` the vibrance saturation denominator `max(mx, 1e-5)` collapses
 * to 1e-5 while `(mx - mn)` stays positive, exploding `sat` to ~1e2–1e5, making
 * the mix factor hugely negative, inverting dark pixels into saturated pure
 * primaries (the red/green/blue speckle). These tests assert the fix bounds the
 * factor, keeps output finite, and prevents the color inversion.
 *
 * Run: node --test lib/render/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- JS mirror of the frozen in-shader functions (constants verbatim) ---
const LUMA = [0.2126, 0.7152, 0.0722];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function hueFromLinearRGB(c) {
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  const d = mx - mn;
  if (d < 1e-7) return 0;
  let h;
  if (mx === c[0]) h = (((c[1] - c[2]) / d) % 6 + 6) % 6;
  else if (mx === c[1]) h = (c[2] - c[0]) / d + 2;
  else h = (c[0] - c[1]) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/**
 * Full frozen v1 op chain mirror. `pin` toggles the negative-lobe pins (op 4 +
 * op 8) and the clamped `sat`; with `pin:false` it reproduces the pre-fix bug.
 * `trace` (optional object) captures the vibrance intermediates for assertions.
 */
function runChain(enc8, s, { pin = true, trace = null } = {}) {
  let c = enc8.map((v) => srgbToLinear(v / 255));
  const n = (k) => (s[k] ?? 0) / 100;
  // 1 temp
  c[0] *= 1 + 0.2 * n('temp');
  c[2] *= 1 - 0.2 * n('temp');
  // 2 tint
  c[1] *= 1 - 0.1 * n('tint');
  c[0] *= 1 + 0.05 * n('tint');
  c[2] *= 1 + 0.05 * n('tint');
  // 3 exposure
  {
    const g = Math.pow(2, 2 * n('exposure'));
    c = c.map((x) => x * g);
  }
  // 4 contrast
  {
    const P = 0.18;
    const m = 1 + n('contrast');
    c = c.map((x) => (x - P) * m + P);
  }
  if (pin) c = c.map((x) => Math.max(x, 0)); // frozen pin after op 4
  // 5 highlights
  {
    const Y = dot3(c, LUMA);
    const wH = smoothstep(0.5, 1.0, Y);
    c = c.map((x) => x * (1 + 0.5 * n('highlights') * wH));
  }
  // 6 shadows
  {
    const Y = dot3(c, LUMA);
    const wS = smoothstep(0.5, 0.0, Y);
    c = c.map((x) => x * (1 + 0.5 * n('shadows') * wS));
  }
  // 7 whites
  c = c.map((x) => x * (1 + 0.25 * n('whites')));
  // 8 blacks
  {
    const Y = dot3(c, LUMA);
    const wB = clamp(1 - Y / 0.25, 0, 1);
    c = c.map((x) => x + 0.1 * n('blacks') * wB);
  }
  if (pin) c = c.map((x) => Math.max(x, 0)); // frozen pin after op 8
  // 9 vibrance
  {
    const Y = dot3(c, LUMA);
    const mx = Math.max(...c);
    const mn = Math.min(...c);
    let sat = (mx - mn) / Math.max(mx, 1e-5);
    if (pin) sat = clamp(sat, 0, 1); // frozen clamp
    const w = 1 - sat;
    const hue = hueFromLinearRGB(c);
    const gSkin = 1 - 0.5 * Math.exp(-Math.pow((hue - 25) / 20, 2));
    const factor = 1 + 0.5 * n('vibrance') * w * gSkin;
    const preVib = [...c];
    if (trace) Object.assign(trace, { Y, mx, mn, sat, w, gSkin, factor, preVib });
    c = c.map((x) => Y + (x - Y) * factor);
  }
  // 10 saturation
  {
    const Y = dot3(c, LUMA);
    const f = 1 + n('saturation');
    c = c.map((x) => Y + (x - Y) * f);
  }
  // output stage (no dither — determinism for the test)
  return c
    .map((x) => clamp(x, 0, 1))
    .map(linearToSrgb)
    .map((x) => Math.round(clamp(x, 0, 1) * 255));
}

// A real near-black pixel from public/photo/dev-001/master16.png (the photo's
// darkest sampled region — the one that produced the worst speckle pre-fix).
const DARK = [24, 18, 21];
const HANDPICKED = [68, 49, 48];

test('vibrance factor stays bounded on dark pixel + contrast+40 + vibrance+80', () => {
  const t = {};
  runChain(HANDPICKED, { contrast: 40, vibrance: 80 }, { pin: true, trace: t });
  assert.ok(t.sat >= 0 && t.sat <= 1, `sat clamped to [0,1] (got ${t.sat})`);
  // mix factor = 1 + 0.5*n*w*gSkin; n=0.8, w∈[0,1], gSkin∈[0.5,1] → ∈ [0.6, 1.4].
  assert.ok(
    t.factor >= 0.5 && t.factor <= 1.5,
    `factor bounded in [0.5,1.5] (got ${t.factor})`,
  );
});

test('all-negative-channel case (darkest pixel + blacks-40 + vibrance+80) no longer explodes', () => {
  const t = {};
  const out = runChain(DARK, { blacks: -40, vibrance: 80 }, { pin: true, trace: t });
  // Pre-fix this case produced sat≈307, w≈-306, factor≈-121 → output [0,69,0]
  // (pure-green speckle from a near-black pixel). With the fix:
  assert.ok(t.sat <= 1, `sat no longer explodes (got ${t.sat})`);
  assert.ok(Number.isFinite(t.factor), 'factor finite');
  assert.ok(t.factor >= 0.5 && t.factor <= 1.5, `factor bounded (got ${t.factor})`);
  out.forEach((v) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 255, `channel ${v} valid`));
  // No inverted pure-primary: a near-black input must not produce a saturated
  // bright primary channel.
  const mx = Math.max(...out);
  const mn = Math.min(...out);
  assert.ok(
    !(mx >= 180 && mx - mn > 120),
    `no saturated bright primary (out=${out})`,
  );
});

test('pre-fix mirror DOES explode (locks that the fix is what bounds it)', () => {
  const t = {};
  const out = runChain(DARK, { blacks: -40, vibrance: 80 }, { pin: false, trace: t });
  // Demonstrate the bug the fix addresses: sat explodes, factor goes hugely
  // negative, output inverts to a saturated primary.
  assert.ok(t.sat > 50, `pre-fix sat explodes (got ${t.sat})`);
  assert.ok(t.factor < -10, `pre-fix factor hugely negative (got ${t.factor})`);
  // Inversion signature: a near-black input (all channels < ~25 in) emerges as a
  // pure single-primary spike — one channel dominant, the others crushed to 0.
  const sorted = [...out].sort((a, b) => b - a);
  assert.ok(
    sorted[0] > 40 && sorted[1] === 0 && sorted[2] === 0,
    `pre-fix produces inverted pure primary (out=${out})`,
  );
});

test('vibrance does not flip channel sign-direction vs pre-vibrance (no inversion)', () => {
  // With the fix, mix factor > 0, so each channel moves toward/away from Y but
  // never crosses to the opposite side of Y (which is what inversion does).
  for (const s of [
    { contrast: 40, vibrance: 80 },
    { blacks: -40, vibrance: 80 },
    { contrast: 100, vibrance: 100 },
    { vibrance: 100 },
  ]) {
    const t = {};
    runChain(DARK, s, { pin: true, trace: t });
    assert.ok(t.factor > 0, `factor positive for ${JSON.stringify(s)} (got ${t.factor})`);
    // factor > 0 ⇒ sign(out - Y) == sign(preVib - Y) per channel (no flip).
    t.preVib.forEach((ch) => {
      const before = ch - t.Y;
      const after = before * t.factor;
      assert.ok(
        Math.sign(after) === Math.sign(before) || before === 0,
        `channel does not invert across Y for ${JSON.stringify(s)}`,
      );
    });
  }
});

test('uniformly-negative channels (contrast+100 on near-black) produce no chroma', () => {
  // When all channels are equal-and-negative, mx-mn=0 so sat=0 either way; the
  // pin makes them 0 and output is black — never colored.
  const out = runChain([3, 3, 3], { contrast: 100, vibrance: 100 }, { pin: true });
  assert.deepEqual(out, [0, 0, 0], 'near-black + extreme contrast → black, no speckle');
});
