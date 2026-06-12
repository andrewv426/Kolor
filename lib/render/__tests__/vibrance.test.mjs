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
 * Full frozen v1 op chain mirror. The three frozen-fix pieces are independently
 * toggleable so each can be isolated in a test:
 *   - `pinOp4`   — the `c = max(c, 0)` pin after op 4 (contrast).
 *   - `pinOp8`   — the `c = max(c, 0)` pin after op 8 (blacks).
 *   - `clampSat` — the `sat = clamp(sat, 0, 1)` in op 9 (vibrance).
 * All three default ON (the shipped frozen state). Turning all three OFF
 * reproduces the pre-fix bug; turning any single piece OFF isolates its effect.
 * `trace` (optional object) captures the vibrance intermediates for assertions.
 */
function runChain(
  enc8,
  s,
  { pinOp4 = true, pinOp8 = true, clampSat = true, trace = null } = {},
) {
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
  if (pinOp4) c = c.map((x) => Math.max(x, 0)); // frozen pin after op 4
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
    if (trace) trace.Yop8 = Y; // downstream blacks-mask luma (post-op-4 pin)
    c = c.map((x) => x + 0.1 * n('blacks') * wB);
  }
  if (pinOp8) c = c.map((x) => Math.max(x, 0)); // frozen pin after op 8
  // 9 vibrance
  {
    const Y = dot3(c, LUMA);
    const mx = Math.max(...c);
    const mn = Math.min(...c);
    let sat = (mx - mn) / Math.max(mx, 1e-5);
    if (clampSat) sat = clamp(sat, 0, 1); // frozen clamp
    const w = 1 - sat;
    const hue = hueFromLinearRGB(c);
    const gSkin = 1 - 0.5 * Math.exp(-Math.pow((hue - 25) / 20, 2));
    const factor = 1 + 0.5 * n('vibrance') * w * gSkin;
    const preVib = [...c];
    if (trace)
      Object.assign(trace, { Y, mx, mn, sat, w, gSkin, factor, preVib });
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
  runChain(HANDPICKED, { contrast: 40, vibrance: 80 }, { trace: t });
  assert.ok(t.sat >= 0 && t.sat <= 1, `sat clamped to [0,1] (got ${t.sat})`);
  // mix factor = 1 + 0.5*n*w*gSkin; n=0.8, w∈[0,1], gSkin∈[0.5,1] → ∈ [0.6, 1.4].
  assert.ok(
    t.factor >= 0.5 && t.factor <= 1.5,
    `factor bounded in [0.5,1.5] (got ${t.factor})`,
  );
});

test('all-negative-channel case (darkest pixel + blacks-40 + vibrance+80) no longer explodes', () => {
  const t = {};
  const out = runChain(DARK, { blacks: -40, vibrance: 80 }, { trace: t });
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
  const out = runChain(DARK, { blacks: -40, vibrance: 80 }, { pinOp4: false, pinOp8: false, clampSat: false, trace: t });
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
    runChain(DARK, s, { trace: t });
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
  const out = runChain([3, 3, 3], { contrast: 100, vibrance: 100 }, {});
  assert.deepEqual(out, [0, 0, 0], 'near-black + extreme contrast → black, no speckle');
});

// --- Per-piece isolation: each frozen fix toggles independently so that
// silently removing any ONE of them is caught. The all-on/all-off tests above
// could pass even if only the clamp were present (reviewer-verified: with the
// op-8 pin removed but the clamp retained, the blacks-heavy case still yields
// sat=1, factor=1.0, no explosion). These three lock each piece on its own. ---

test('op-8 pin is load-bearing: OFF → NEGATIVE channel enters vibrance; ON → none', () => {
  // The blacks-heavy near-black case is exactly the one the reviewer flagged:
  // with the op-8 pin removed the saturation clamp alone masks the explosion, so
  // the all-off/all-on combos can't tell whether the pin still exists. Assert the
  // pin's *direct* effect — the sign of the channel entering vibrance (trace.mn,
  // the per-channel minimum computed at the top of op 9, before the mix).
  const tOff = {};
  runChain(
    DARK,
    { blacks: -40, vibrance: 80 },
    { pinOp8: false, clampSat: true, trace: tOff },
  );
  assert.ok(
    tOff.mn < 0,
    `op-8 pin OFF → a negative channel reaches vibrance (mn=${tOff.mn})`,
  );

  const tOn = {};
  runChain(
    DARK,
    { blacks: -40, vibrance: 80 },
    { pinOp8: true, clampSat: true, trace: tOn },
  );
  assert.ok(
    tOn.mn >= 0,
    `op-8 pin ON → no negative channel reaches vibrance (mn=${tOn.mn})`,
  );
});

test('op-4 pin changes the downstream mask Y on a contrast-crushed pixel', () => {
  // Reviewer measured: on this contrast-crushed pixel the luma Y feeding the
  // op-8 blacks mask is 0 WITH the op-4 pin and −0.167 WITHOUT it. (By op 9 the
  // op-8 pin has re-clamped both to 0, so this difference is only observable at
  // op 8 — which is precisely the downstream mask the op-4 pin protects.) Isolate
  // pinOp4 (leave op-8 pin + clamp on) and assert the pin moves that mask Y and
  // keeps it non-negative — proving op-4 pinning is not redundant with op 8.
  const crush = { contrast: 100 };

  const tOn = {};
  runChain(DARK, crush, { pinOp4: true, trace: tOn });
  const tOff = {};
  runChain(DARK, crush, { pinOp4: false, trace: tOff });

  assert.notEqual(
    tOn.Yop8,
    tOff.Yop8,
    `op-4 pin changes downstream mask Y (on=${tOn.Yop8}, off=${tOff.Yop8})`,
  );
  assert.ok(tOn.Yop8 >= 0, `op-4 pin keeps mask Y non-negative (got ${tOn.Yop8})`);
  assert.ok(tOff.Yop8 < 0, `without op-4 pin mask Y goes negative (got ${tOff.Yop8})`);
});

test('clampSat alone OFF (pins ON) → sat still ≤ 1 by construction (belt-and-braces)', () => {
  // Documents the relationship the shader comment states: with both pins ON the
  // channels entering vibrance satisfy mx ≥ mn ≥ 0, so sat = (mx-mn)/max(mx,1e-5)
  // ≤ 1 ALREADY — the clamp is redundant given the pins. Turn only the clamp off
  // and assert sat is still in range, so the clamp is provably the secondary
  // guard, not the primary fix.
  for (const s of [
    { blacks: -40, vibrance: 80 },
    { contrast: 100, vibrance: 100 },
    { contrast: 40, vibrance: 80 },
  ]) {
    const t = {};
    runChain(DARK, s, { pinOp4: true, pinOp8: true, clampSat: false, trace: t });
    assert.ok(
      t.mn >= 0 && t.mx >= 0,
      `pins keep channels non-negative for ${JSON.stringify(s)} (mn=${t.mn})`,
    );
    assert.ok(
      t.sat >= 0 && t.sat <= 1,
      `sat ≤ 1 with pins even with clamp OFF for ${JSON.stringify(s)} (got ${t.sat})`,
    );
  }
});
