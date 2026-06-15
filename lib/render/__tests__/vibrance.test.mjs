/**
 * Regression tests for the frozen v1 vibrance color-inversion speckle, now
 * guarded by the NEW tone-stage architecture (PRD §6.2.1, tone-stage amendment
 * 2026-06-14, pre-launch) rather than the old linear-space `max(c,0)` pins.
 *
 * The bug (original, pre-2026-06-12): contrast/blacks ran as point operators in
 * LINEAR light — contrast `(c-0.18)*(1+n)+0.18`, blacks an additive linear lift
 * — and could drive dark linear channels < 0. With a negative `mx` the vibrance
 * saturation denominator `max(mx, 1e-5)` collapsed to 1e-5 while `(mx-mn)`
 * stayed positive, exploding `sat` to ~1e2–1e5, flipping the mix factor hugely
 * negative, and inverting dark pixels into saturated pure primaries (red/green/
 * blue speckle in dark regions).
 *
 * The 2026-06-12 fix added linear-space `max(c,0)` pins. The 2026-06-14
 * tone-stage amendment SUPERSEDES those pins: tone shaping now runs in
 * PERCEPTUAL (sRGB-gamma) space, where contrast is a bounded pivot-anchored
 * sigmoid and blacks is a bounded soft toe — neither can produce a negative
 * channel, so no channel feeding vibrance is ever negative WITHOUT any explicit
 * pin. The `sat` clamp to [0,1] is retained belt-and-braces. These tests assert
 * the speckle stays fixed under the new chain.
 *
 * Run: node --test lib/render/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- JS mirror of the NEW frozen in-shader chain (constants verbatim) ---
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

const CONTRAST_PIVOT = 0.46135613;
const CONTRAST_BMAX = 8.0;
const rawSig = (u, a, b) => 1 / (1 + Math.exp(b * (a - u)));
const sigmoidContrast = (x, a, b) => {
  const s0 = rawSig(0, a, b);
  const s1 = rawSig(1, a, b);
  return (rawSig(x, a, b) - s0) / (s1 - s0);
};
const inverseSigmoidContrast = (y, a, b) => {
  const s0 = rawSig(0, a, b);
  const s1 = rawSig(1, a, b);
  let v = clamp(s0 + y * (s1 - s0), 1e-6, 1 - 1e-6);
  return a - Math.log(1 / v - 1) / b;
};
function hueFromRGB(c) {
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
function blacksFoot(x, n) {
  const TOE = 0.25, AMP = 0.18;
  const wB = smoothstep(TOE, 0.0, x);
  if (n <= 0) return x * (1 + AMP * n * wB);
  return x + AMP * n * wB * (TOE - x);
}
function whitesFoot(x, n) {
  const SHO = 0.6, AMP = 0.18;
  const wW = smoothstep(SHO, 1.0, x);
  if (n >= 0) return x + AMP * n * wW * (1 - x);
  return x * (1 + AMP * n * wW);
}

/**
 * Full NEW frozen v1 op chain mirror. `clampSat` toggles the belt-and-braces
 * sat clamp (default ON, the shipped state) so the test can show it is no longer
 * load-bearing under the perceptual architecture. `trace` captures the vibrance
 * intermediates.
 */
function runChain(enc8, s, { clampSat = true, trace = null } = {}) {
  let c = enc8.map((v) => srgbToLinear(v / 255));
  const n = (k) => (s[k] ?? 0) / 100;
  // linear stage
  c[0] *= 1 + 0.2 * n('temp');
  c[2] *= 1 - 0.2 * n('temp');
  c[1] *= 1 - 0.1 * n('tint');
  c[0] *= 1 + 0.05 * n('tint');
  c[2] *= 1 + 0.05 * n('tint');
  {
    const g = Math.pow(2, 2 * n('exposure'));
    c = c.map((x) => x * g);
  }
  // enter perceptual
  c = c.map((x) => Math.max(x, 0)).map(linearToSrgb);
  // contrast
  {
    const nn = n('contrast');
    const b = CONTRAST_BMAX * Math.abs(nn);
    if (b > 1e-4)
      c =
        nn > 0
          ? c.map((x) => sigmoidContrast(x, CONTRAST_PIVOT, b))
          : c.map((x) => inverseSigmoidContrast(x, CONTRAST_PIVOT, b));
  }
  // highlights
  {
    const Y = dot3(c, LUMA);
    const wH = smoothstep(0.5, 1.0, Y);
    c = c.map((x) => x * (1 + 0.5 * n('highlights') * wH));
  }
  // shadows
  {
    const Y = dot3(c, LUMA);
    const wS = smoothstep(0.5, 0.0, Y);
    c = c.map((x) => x * (1 + 0.5 * n('shadows') * wS));
  }
  // whites / blacks
  c = c.map((x) => whitesFoot(x, n('whites')));
  c = c.map((x) => blacksFoot(x, n('blacks')));
  // vibrance
  {
    const Y = dot3(c, LUMA);
    const mx = Math.max(...c);
    const mn = Math.min(...c);
    let sat = (mx - mn) / Math.max(mx, 1e-5);
    if (clampSat) sat = clamp(sat, 0, 1);
    const w = 1 - sat;
    const hue = hueFromRGB(c);
    const gSkin = 1 - 0.5 * Math.exp(-Math.pow((hue - 25) / 20, 2));
    const factor = 1 + 0.5 * n('vibrance') * w * gSkin;
    const preVib = [...c];
    if (trace) Object.assign(trace, { Y, mx, mn, sat, w, gSkin, factor, preVib });
    c = c.map((x) => Y + (x - Y) * factor);
  }
  // saturation
  {
    const Y = dot3(c, LUMA);
    const f = 1 + n('saturation');
    c = c.map((x) => Y + (x - Y) * f);
  }
  return c.map((x) => Math.round(clamp(x, 0, 1) * 255));
}

// The real near-black pixels that produced the worst speckle pre-fix.
const DARK = [24, 18, 21];
const HANDPICKED = [68, 49, 48];

test('vibrance factor stays bounded on dark pixel + contrast+40 + vibrance+80', () => {
  const t = {};
  runChain(HANDPICKED, { contrast: 40, vibrance: 80 }, { trace: t });
  assert.ok(t.sat >= 0 && t.sat <= 1, `sat in [0,1] (got ${t.sat})`);
  assert.ok(
    t.factor >= 0.5 && t.factor <= 1.5,
    `factor bounded in [0.5,1.5] (got ${t.factor})`,
  );
});

test('all-negative-channel case (darkest pixel + blacks-40 + vibrance+80) no longer explodes', () => {
  const t = {};
  const out = runChain(DARK, { blacks: -40, vibrance: 80 }, { trace: t });
  assert.ok(t.sat <= 1, `sat no longer explodes (got ${t.sat})`);
  assert.ok(Number.isFinite(t.factor), 'factor finite');
  assert.ok(t.factor >= 0.5 && t.factor <= 1.5, `factor bounded (got ${t.factor})`);
  out.forEach((v) =>
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 255, `channel ${v} valid`),
  );
  const mx = Math.max(...out);
  const mn = Math.min(...out);
  assert.ok(
    !(mx >= 180 && mx - mn > 120),
    `no saturated bright primary (out=${out})`,
  );
});

test('perceptual chain never feeds a negative channel into vibrance (no pin needed)', () => {
  // The whole point of the tone-stage move: in perceptual space the sigmoid and
  // soft toe are bounded, so mn ≥ 0 entering vibrance for every stress case —
  // WITHOUT any explicit max(c,0) pin (none exists in the new chain).
  for (const px of [DARK, HANDPICKED, [10, 10, 60], [3, 3, 3]]) {
    for (const s of [
      { blacks: -40, vibrance: 80 },
      { contrast: 100, vibrance: 100 },
      { contrast: 100, blacks: -100, vibrance: 100 },
      { exposure: -50, contrast: 100, vibrance: 100 },
    ]) {
      const t = {};
      runChain(px, s, { trace: t });
      assert.ok(
        t.mn >= 0,
        `mn ≥ 0 entering vibrance for ${JSON.stringify(s)} on ${px} (mn=${t.mn})`,
      );
    }
  }
});

test('sat clamp is no longer load-bearing: sat ≤ 1 even with clamp OFF (perceptual bound)', () => {
  for (const s of [
    { blacks: -40, vibrance: 80 },
    { contrast: 100, vibrance: 100 },
    { contrast: 40, vibrance: 80 },
    { contrast: 100, blacks: -100, vibrance: 100 },
  ]) {
    const t = {};
    runChain(DARK, s, { clampSat: false, trace: t });
    assert.ok(t.mn >= 0 && t.mx >= 0, `channels non-negative for ${JSON.stringify(s)}`);
    assert.ok(
      t.sat >= 0 && t.sat <= 1,
      `sat ≤ 1 with clamp OFF for ${JSON.stringify(s)} (got ${t.sat})`,
    );
  }
});

test('vibrance does not flip channel sign-direction vs pre-vibrance (no inversion)', () => {
  for (const s of [
    { contrast: 40, vibrance: 80 },
    { blacks: -40, vibrance: 80 },
    { contrast: 100, vibrance: 100 },
    { vibrance: 100 },
  ]) {
    const t = {};
    runChain(DARK, s, { trace: t });
    assert.ok(t.factor > 0, `factor positive for ${JSON.stringify(s)} (got ${t.factor})`);
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

test('uniformly near-black + extreme contrast → neutral, no chroma speckle', () => {
  const out = runChain([3, 3, 3], { contrast: 100, vibrance: 100 });
  const mx = Math.max(...out);
  const mn = Math.min(...out);
  assert.ok(mx - mn <= 2, `near-black + extreme contrast → neutral (out=${out})`);
});
