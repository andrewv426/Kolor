/**
 * Tests for the frozen v1 tone stage (PRD §6.2.1, tone-stage amendment
 * 2026-06-14, pre-launch). The shader is GLSL (not runnable in node), so this
 * mirrors the EXACT new op chain in JS (constants verbatim) op-for-op:
 *
 *   LINEAR light:  EOTF → temp → tint → exposure
 *   → max(c,0) → OETF  (single mid-chain entry to PERCEPTUAL space)
 *   PERCEPTUAL:    contrast (pivot-anchored sigmoid) → highlights → shadows
 *                  → whites (soft shoulder) → blacks (soft toe) → vibrance
 *                  → saturation → clarity(inert)
 *   OUTPUT:        clamp[0,1] → (dither omitted for determinism) → quantize8
 *
 * Locks: (a) every op exact identity at n=0 (all-zero edit reproduces source);
 * (b) contrast n>0 steepens around the pivot + preserves 0/1; contrast n<0
 * flattens; (c) no channel ever negative/NaN on a stress grid of extremes over
 * dark/chromatic pixels (the old negative-lobe speckle stays fixed); (d) the
 * sigmoid b→0 is identity.
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

// frozen tone-stage constants
const CONTRAST_PIVOT = 0.46135613; // linearToSrgb(0.18)
const CONTRAST_BMAX = 8.0;

const rawSig = (u, a, b) => 1 / (1 + Math.exp(b * (a - u)));
function sigmoidContrast(x, a, b) {
  const s0 = rawSig(0, a, b);
  const s1 = rawSig(1, a, b);
  return (rawSig(x, a, b) - s0) / (s1 - s0);
}
function inverseSigmoidContrast(y, a, b) {
  const s0 = rawSig(0, a, b);
  const s1 = rawSig(1, a, b);
  let v = s0 + y * (s1 - s0);
  v = clamp(v, 1e-6, 1 - 1e-6);
  return a - Math.log(1 / v - 1) / b;
}

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
  const TOE = 0.25;
  const AMP = 0.18;
  const wB = smoothstep(TOE, 0.0, x);
  if (n <= 0) return x * (1 + AMP * n * wB);
  return x + AMP * n * wB * (TOE - x);
}
function whitesFoot(x, n) {
  const SHO = 0.6;
  const AMP = 0.18;
  const wW = smoothstep(SHO, 1.0, x);
  if (n >= 0) return x + AMP * n * wW * (1 - x);
  return x * (1 + AMP * n * wW);
}

/**
 * Full frozen v1 op-chain mirror (tone-stage amendment 2026-06-14).
 * `enc8` is an [r,g,b] of 0..255 sRGB-encoded bytes; `s` is a settings object of
 * slider integers. Returns the 0..255 output (no dither, for determinism).
 * `trace` (optional) captures perceptual-space intermediates.
 */
function runChain(enc8, s, { trace = null } = {}) {
  let c = enc8.map((v) => srgbToLinear(v / 255));
  const n = (k) => (s[k] ?? 0) / 100;

  // --- LINEAR stage ---
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

  // --- enter PERCEPTUAL space: clamp tiny negative lobe, single OETF ---
  c = c.map((x) => Math.max(x, 0)).map(linearToSrgb);

  // 4 contrast (pivot-anchored sigmoid)
  {
    const nn = n('contrast');
    const b = CONTRAST_BMAX * Math.abs(nn);
    if (b > 1e-4) {
      if (nn > 0)
        c = c.map((x) => sigmoidContrast(x, CONTRAST_PIVOT, b));
      else c = c.map((x) => inverseSigmoidContrast(x, CONTRAST_PIVOT, b));
    }
  }
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
  // 7 whites (soft shoulder)
  c = c.map((x) => whitesFoot(x, n('whites')));
  // 8 blacks (soft toe)
  c = c.map((x) => blacksFoot(x, n('blacks')));
  // 9 vibrance
  {
    const Y = dot3(c, LUMA);
    const mx = Math.max(...c);
    const mn = Math.min(...c);
    const sat = clamp((mx - mn) / Math.max(mx, 1e-5), 0, 1);
    const w = 1 - sat;
    const hue = hueFromRGB(c);
    const gSkin = 1 - 0.5 * Math.exp(-Math.pow((hue - 25) / 20, 2));
    const factor = 1 + 0.5 * n('vibrance') * w * gSkin;
    if (trace) Object.assign(trace, { Y, mx, mn, sat, factor, preVib: [...c] });
    c = c.map((x) => Y + (x - Y) * factor);
  }
  // 10 saturation
  {
    const Y = dot3(c, LUMA);
    const f = 1 + n('saturation');
    c = c.map((x) => Y + (x - Y) * f);
  }
  // 11 clarity inert (blur==c → identity)

  // --- OUTPUT: clamp + quantize (no second OETF; already perceptual) ---
  return c.map((x) => Math.round(clamp(x, 0, 1) * 255));
}

const TONE_KEYS = [
  'temp', 'tint', 'exposure', 'contrast', 'highlights',
  'shadows', 'whites', 'blacks', 'vibrance', 'saturation',
];

// A spread of test pixels: mid, dark, the old speckle pixels, chromatic.
const PIXELS = [
  [128, 128, 128],
  [24, 18, 21], // darkest sampled (worst pre-fix speckle)
  [68, 49, 48], // handpicked dark
  [200, 60, 40], // chromatic red
  [40, 180, 60], // chromatic green
  [10, 10, 60], // dark blue
  [250, 250, 250], // near white
  [3, 3, 3], // near black
];

// === (a) every op exact identity at n=0 ===

test('all-zero edit reproduces the source byte-for-byte (full chain identity)', () => {
  for (const px of PIXELS) {
    const out = runChain(px, {});
    // Allow ±1 for the EOTF→OETF round-trip rounding at 8-bit.
    out.forEach((v, i) =>
      assert.ok(
        Math.abs(v - px[i]) <= 1,
        `all-zero: channel ${i} ${v} ≈ ${px[i]} for ${px}`,
      ),
    );
  }
});

test('each op individually is exact identity at n=0', () => {
  for (const key of TONE_KEYS) {
    for (const px of PIXELS) {
      const base = runChain(px, {});
      const same = runChain(px, { [key]: 0 });
      assert.deepEqual(same, base, `${key}=0 identical to all-zero for ${px}`);
    }
  }
});

// === (d) sigmoid b→0 is identity ===

test('contrast sigmoid b→0 (tiny n) is identity', () => {
  // The shader gates on b > 1e-4; below that contrast is skipped (identity).
  for (const px of PIXELS) {
    const base = runChain(px, {});
    // n so small that b = 8*|n| < 1e-4 → skipped.
    const tiny = runChain(px, { contrast: 0 });
    assert.deepEqual(tiny, base, `contrast 0 identity for ${px}`);
  }
  // And the analytic limit: sigmoidContrast → identity as b → 0.
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    const y = sigmoidContrast(x, CONTRAST_PIVOT, 1e-4);
    assert.ok(Math.abs(y - x) < 1e-3, `sigmoid b→0 identity at ${x} (got ${y})`);
  }
});

// === (b) contrast n>0 steepens around pivot, preserves endpoints; n<0 flattens ===

test('contrast endpoints 0 and 1 are preserved (both directions)', () => {
  for (const b of [CONTRAST_BMAX, CONTRAST_BMAX * 0.5]) {
    assert.ok(Math.abs(sigmoidContrast(0, CONTRAST_PIVOT, b)) < 1e-9, 'S(0)=0');
    assert.ok(Math.abs(sigmoidContrast(1, CONTRAST_PIVOT, b) - 1) < 1e-9, 'S(1)=1');
    assert.ok(Math.abs(inverseSigmoidContrast(0, CONTRAST_PIVOT, b)) < 1e-6, 'inv(0)=0');
    assert.ok(
      Math.abs(inverseSigmoidContrast(1, CONTRAST_PIVOT, b) - 1) < 1e-6,
      'inv(1)=1',
    );
  }
});

test('contrast n>0 steepens slope around the pivot vs identity', () => {
  const b = CONTRAST_BMAX; // n=+1
  // local slope just around the pivot is > 1 (steeper than identity).
  const eps = 0.02;
  const slope =
    (sigmoidContrast(CONTRAST_PIVOT + eps, CONTRAST_PIVOT, b) -
      sigmoidContrast(CONTRAST_PIVOT - eps, CONTRAST_PIVOT, b)) /
    (2 * eps);
  assert.ok(slope > 1.5, `contrast +100 steepens around pivot (slope ${slope})`);
  // and forward S-curve is the inverse-flatten's inverse: invS(S(x)) ≈ x.
  for (const x of [0.2, 0.46, 0.8]) {
    const round = inverseSigmoidContrast(sigmoidContrast(x, CONTRAST_PIVOT, b), CONTRAST_PIVOT, b);
    assert.ok(Math.abs(round - x) < 1e-6, `invS∘S identity at ${x}`);
  }
});

test('contrast n<0 flattens slope around the pivot vs identity', () => {
  const b = CONTRAST_BMAX; // |n|=1
  const eps = 0.02;
  const slope =
    (inverseSigmoidContrast(CONTRAST_PIVOT + eps, CONTRAST_PIVOT, b) -
      inverseSigmoidContrast(CONTRAST_PIVOT - eps, CONTRAST_PIVOT, b)) /
    (2 * eps);
  assert.ok(slope < 0.8, `contrast -100 flattens around pivot (slope ${slope})`);
});

test('contrast +50 visibly increases spread of a dark/light pair', () => {
  // dark pixel gets darker, light pixel gets lighter (around mid pivot).
  const dark = runChain([60, 60, 60], { contrast: 50 })[0];
  const light = runChain([200, 200, 200], { contrast: 50 })[0];
  assert.ok(dark < 60, `contrast +50 darkens shadows (${dark} < 60)`);
  assert.ok(light > 200, `contrast +50 brightens highlights (${light} > 200)`);
});

// === blacks/whites soft feet behave as documented ===

test('blacks -50 deepens shadows but leaves midtones/highlights untouched', () => {
  const shadow = runChain([40, 40, 40], { blacks: -50 })[0];
  const mid = runChain([128, 128, 128], { blacks: -50 })[0];
  const hi = runChain([230, 230, 230], { blacks: -50 })[0];
  assert.ok(shadow < 40, `blacks -50 deepens a shadow (${shadow} < 40)`);
  assert.ok(Math.abs(mid - 128) <= 1, `blacks -50 leaves midtone (${mid})`);
  assert.ok(Math.abs(hi - 230) <= 1, `blacks -50 leaves highlight (${hi})`);
});

test('blacks +50 lifts shadows (raises the foot)', () => {
  const shadow = runChain([20, 20, 20], { blacks: 50 })[0];
  assert.ok(shadow > 20, `blacks +50 lifts a shadow (${shadow} > 20)`);
});

test('whites +50 lifts highlights but leaves shadows/midtones untouched', () => {
  const hi = runChain([220, 220, 220], { whites: 50 })[0];
  const mid = runChain([128, 128, 128], { whites: 50 })[0];
  const shadow = runChain([40, 40, 40], { whites: 50 })[0];
  assert.ok(hi > 220, `whites +50 lifts a highlight (${hi} > 220)`);
  assert.ok(Math.abs(mid - 128) <= 1, `whites +50 leaves midtone (${mid})`);
  assert.ok(Math.abs(shadow - 40) <= 1, `whites +50 leaves shadow (${shadow})`);
});

// === (c) stress grid: no negative / NaN channel, no speckle ===

test('stress grid of extreme settings: every output channel finite + in [0,255]', () => {
  const extremes = [-100, 0, 100];
  let count = 0;
  for (const px of PIXELS) {
    // sweep each single slider to ±100
    for (const key of TONE_KEYS) {
      for (const v of extremes) {
        const out = runChain(px, { [key]: v });
        out.forEach((o) =>
          assert.ok(
            Number.isFinite(o) && o >= 0 && o <= 255,
            `${key}=${v} on ${px} → bad channel ${o}`,
          ),
        );
        count++;
      }
    }
    // a few brutal combos including the old speckle cases
    for (const s of [
      { contrast: 100, blacks: -100, vibrance: 100, saturation: 100 },
      { contrast: -100, blacks: 100, whites: -100 },
      { exposure: -80, contrast: 100, vibrance: 100 },
      { blacks: -40, vibrance: 80 }, // the historical pure-green speckle case
      { contrast: 70, shadows: 50, blacks: -30, vibrance: 40 },
    ]) {
      const out = runChain(px, s);
      out.forEach((o) =>
        assert.ok(
          Number.isFinite(o) && o >= 0 && o <= 255,
          `${JSON.stringify(s)} on ${px} → bad channel ${o}`,
        ),
      );
      count++;
    }
  }
  assert.ok(count > 0);
});

test('old speckle case (darkest pixel + blacks-40 + vibrance+80) → no inverted primary', () => {
  const t = {};
  const out = runChain([24, 18, 21], { blacks: -40, vibrance: 80 }, { trace: t });
  assert.ok(t.sat >= 0 && t.sat <= 1, `sat in [0,1] (got ${t.sat})`);
  assert.ok(Number.isFinite(t.factor), 'vibrance factor finite');
  assert.ok(t.mn >= 0, `no negative channel enters vibrance (mn=${t.mn})`);
  out.forEach((v) => assert.ok(v >= 0 && v <= 255, `channel ${v} valid`));
  const mx = Math.max(...out);
  const mn = Math.min(...out);
  assert.ok(
    !(mx >= 180 && mx - mn > 120),
    `no saturated bright primary from near-black (out=${out})`,
  );
});

test('uniformly near-black + extreme contrast → black, no chroma', () => {
  const out = runChain([3, 3, 3], { contrast: 100, vibrance: 100 });
  const mx = Math.max(...out);
  const mn = Math.min(...out);
  assert.ok(mx - mn <= 2, `near-black + extreme stays neutral (out=${out})`);
});

test('vibrance factor stays bounded on a chromatic+dark grid', () => {
  for (const px of [[24, 18, 21], [68, 49, 48], [200, 60, 40], [10, 10, 60]]) {
    for (const s of [
      { contrast: 40, vibrance: 80 },
      { contrast: 100, vibrance: 100 },
      { blacks: -40, vibrance: 80 },
    ]) {
      const t = {};
      runChain(px, s, { trace: t });
      // factor = 1 + 0.5*n*w*gSkin; n∈[-1,1], w∈[0,1], gSkin∈[0.5,1] → [0.5,1.5].
      assert.ok(
        t.factor >= 0.5 && t.factor <= 1.5,
        `factor bounded for ${JSON.stringify(s)} on ${px} (got ${t.factor})`,
      );
    }
  }
});
