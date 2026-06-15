/**
 * Frozen v1 GLSL (PRD §6.2.1). The fragment shader is the spec of record made
 * executable: exact piecewise sRGB EOTF/OETF (frozen constants — NEVER pow(2.2),
 * NEVER hardware sRGB sampling), all ten core ops in the frozen non-commuting
 * order, then interleaved-gradient-noise dither (pure function of integer
 * gl_FragCoord) → clamp → explicit round-half-up quantize8.
 *
 * Working-space split (frozen, §6.2.1; tone-stage amendment 2026-06-14
 * pre-launch). The chain runs in TWO working spaces:
 *   - LINEAR light: EOTF decode (entry) → white balance (temp, tint) →
 *     exposure. These three ops are physically multiplicative gains and stay in
 *     linear light (exposure may push values > 1.0; the OETF below is monotonic
 *     and valid for inputs > 1).
 *   - PERCEPTUAL (sRGB-gamma): immediately after exposure the signal is
 *     OETF-encoded ONCE (`linearToSrgb3`) and every subsequent tone/color op
 *     (contrast, highlights, shadows, whites, blacks, vibrance, saturation,
 *     clarity) operates on that gamma-encoded signal — matching how
 *     Lightroom/Capture One/RawTherapee/darktable shape tone. There is NO
 *     second OETF at output: the single OETF lives here, mid-chain.
 *
 * Tone-operator shapes (frozen, §6.2.1; 2026-06-14):
 *   - Contrast is a pivot-anchored normalized sigmoid (ImageMagick
 *     `-sigmoidal-contrast` form) about the perceptual mid-gray pivot
 *     `A = linearToSrgb(0.18) ≈ 0.46136` — n>0 applies the S-curve (steepens),
 *     n<0 applies its algebraic inverse (flattens). Both are endpoint-preserving
 *     (0→0, 1→1) and exact identity at n=0 (b→0 handled as identity).
 *   - Whites/Blacks are soft white-point / black-point tone-curve feet with a
 *     smooth toe/shoulder (darktable-filmic-style 3-segment soft foot), NOT an
 *     additive lift and NOT a hard clamp. Each is exact identity at n=0 and
 *     keeps mid-gray roughly anchored.
 *
 * No hard `max(c, 0)` pins remain: the sigmoid is bounded in [0,1] and the soft
 * toe/shoulder feet never undershoot 0 or overshoot 1, so the negative-lobe
 * speckle the old linear pins guarded against cannot arise (no channel feeding
 * vibrance is ever negative). Vibrance still clamps its `sat` estimate to [0,1]
 * belt-and-braces. Clarity (op 11) is inert in v1 (UI passes 0); v1 ships
 * without the blur pass so `blur(c) == c` and the op is exact identity at any n.
 *
 * Every per-op constant, mask curve, pivot, and weight below is transcribed
 * verbatim from §6.2.1's "Frozen per-op formulas" subsection. Changing ANY of
 * them forces pipeline v2 (freeze rule, §6.2.1) — post-launch.
 */

export const VERTEX_SRC = `#version 300 es
// Full-screen triangle generated from gl_VertexID — no attribute buffers.
// Covers the viewport with 3 vertices; UVs map [0,1]x[0,1] across the clip quad.
out vec2 v_uv;
void main() {
  // (0,0),(2,0),(0,2) in UV → (-1,-1),(3,-1),(-1,3) in clip space.
  vec2 uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = uv;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_tex;

// All ten core slider amounts arrive as normalized n = slider/100 ∈ [-1, 1].
// One vec4 + array keeps the uniform set tight; order matches TONE_KEYS.
uniform float u_temp;        // n = temp/100
uniform float u_tint;        // n = tint/100
uniform float u_exposure;    // n = exposure/100
uniform float u_contrast;    // n = contrast/100
uniform float u_highlights;  // n = highlights/100
uniform float u_shadows;     // n = shadows/100
uniform float u_whites;      // n = whites/100
uniform float u_blacks;      // n = blacks/100
uniform float u_vibrance;    // n = vibrance/100
uniform float u_saturation;  // n = saturation/100
uniform float u_clarity;     // n = clarity/100 (UI passes 0; inert in v1)

// Rec. 709 luminance weights (frozen). Used on the PERCEPTUAL signal post-OETF
// (tone-stage amendment 2026-06-14): masks/desaturation operate in gamma space.
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Perceptual contrast pivot (frozen, §6.2.1): sRGB-encoded mid-gray.
// A = linearToSrgb(0.18) ≈ 0.46135613 — the gamma-space image of linear 0.18.
const float CONTRAST_PIVOT = 0.46135613;
// Max sigmoid strength at |n| = 1 (frozen). b = CONTRAST_BMAX * |n|; b→0 = identity.
const float CONTRAST_BMAX = 8.0;

// ---- Exact piecewise sRGB transfer functions (frozen constants) ----
// EOTF: sRGB-encoded c ∈ [0,1] → linear (shader entry).
float srgbToLinear(float c) {
  return (c <= 0.04045) ? (c / 12.92)
                        : pow((c + 0.055) / 1.055, 2.4);
}
// OETF: linear c → sRGB-encoded. Applied ONCE, mid-chain (after exposure), to
// enter perceptual space. Monotonic + valid for c > 1 (exposure can exceed 1).
float linearToSrgb(float c) {
  return (c <= 0.0031308) ? (c * 12.92)
                          : (1.055 * pow(c, 1.0 / 2.4) - 0.055);
}
vec3 srgbToLinear3(vec3 c) {
  return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
}
vec3 linearToSrgb3(vec3 c) {
  return vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
}

// ---- Pivot-anchored normalized sigmoid (frozen, §6.2.1) ----
// Raw logistic about pivot a with steepness b.
float rawSig(float u, float a, float b) {
  return 1.0 / (1.0 + exp(b * (a - u)));
}
// Forward normalized S-curve: endpoint-preserving (0→0, 1→1), fixed point at a.
// S(x) = (sig(x) - sig(0)) / (sig(1) - sig(0)). Used for contrast n>0.
float sigmoidContrast(float x, float a, float b) {
  float s0 = rawSig(0.0, a, b);
  float s1 = rawSig(1.0, a, b);
  return (rawSig(x, a, b) - s0) / (s1 - s0);
}
// Algebraic inverse of sigmoidContrast (ImageMagick +sigmoidal-contrast).
// Given y ∈ [0,1], recover x. Used for contrast n<0 (flattens), same a, |n|·BMAX.
float inverseSigmoidContrast(float y, float a, float b) {
  float s0 = rawSig(0.0, a, b);
  float s1 = rawSig(1.0, a, b);
  // invert v = s0 + y*(s1-s0) = 1/(1+exp(b*(a-x)))  ⇒  x = a - ln(1/v - 1)/b
  float v = s0 + y * (s1 - s0);
  // v ∈ (s0, s1) ⊂ (0,1); clamp away from the asymptotes for log safety.
  v = clamp(v, 1e-6, 1.0 - 1e-6);
  return a - log(1.0 / v - 1.0) / b;
}

// ---- Output dither (interleaved gradient noise, Jimenez; frozen) ----
// Pure function of integer destination pixel (x,y) ONLY. No time/random/seed.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
// clamp-after-add then explicit round-half-up to 8-bit (canonical v1 form).
float quantize8(float x) {
  return floor(clamp(x, 0.0, 1.0) * 255.0 + 0.5) / 255.0;
}

// Hue (degrees, 0..360) from RGB → HSV hue (for the vibrance skin guard).
// Operates on the PERCEPTUAL signal (post-OETF) — hue is scale-stable so the
// gamma encoding does not meaningfully shift the skin-protect Gaussian.
float hueFromRGB(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-7) return 0.0;
  float h;
  if (mx == c.r)      h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else                h = (c.r - c.g) / d + 4.0;
  h *= 60.0;
  if (h < 0.0) h += 360.0;
  return h;
}

// ---- Soft white-point / black-point feet (frozen, §6.2.1) ----
// Blacks: move the black point with a smooth toe. n<0 deepens (pulls the foot
// down toward 0 over the shadow region), n>0 lifts (raises the foot). The toe
// region is [0, TOE] in perceptual space; above TOE the curve is identity, so
// mid-gray and highlights are untouched. Identity at n=0.
// Construction: a normalized shadow weight wB = smoothstep(TOE,0,x) (1 at black,
// 0 at TOE) scales a black-point shift; the shift is applied as a smooth pull so
// the foot stays monotonic and never crosses 0/identity (no hard floor).
float blacksFoot(float x, float n) {
  const float TOE = 0.25;          // perceptual extent of the shadow foot (frozen)
  const float AMP = 0.18;          // max black-point travel at |n|=1 (frozen)
  float wB = smoothstep(TOE, 0.0, x); // 1 at x=0, 0 at x>=TOE, smooth between
  // shift toward 0 (deepen, n<0) or toward TOE (lift, n>0), weighted by wB.
  // For n<0: x' = x * (1 + AMP*n*wB) keeps 0 fixed and monotonic (1+AMP*n ≥ 0.82).
  // For n>0: lift adds AMP*n*wB*(TOE - x), pulling the foot up toward the toe
  //          knee without moving x=TOE (wB=0 there) — endpoint TOE preserved.
  if (n <= 0.0) {
    return x * (1.0 + AMP * n * wB);
  }
  return x + AMP * n * wB * (TOE - x);
}
// Whites: move the white point with a smooth shoulder, mirror of blacks. n>0
// lifts the white point (brightens highlights toward 1), n<0 pulls it down. The
// shoulder region is [SHO, 1]; below SHO identity. Endpoint 1 stays fixed for
// n≤0 (shoulder pull) and saturates at 1 for n>0 (clamped at output). Identity
// at n=0.
float whitesFoot(float x, float n) {
  const float SHO = 0.60;          // perceptual start of the highlight shoulder (frozen)
  const float AMP = 0.18;          // max white-point travel at |n|=1 (frozen)
  float wW = smoothstep(SHO, 1.0, x); // 0 below SHO, 1 at x=1, smooth between
  if (n >= 0.0) {
    // lift highlights toward 1: pull (1 - x) up, keeping SHO fixed (wW=0 there).
    return x + AMP * n * wW * (1.0 - x);
  }
  // pull the white point down (compress highlights), keeping SHO fixed.
  return x * (1.0 + AMP * n * wW);
}

void main() {
  // Sample raw sRGB-encoded values with LINEAR filtering (no hardware sRGB),
  // then decode to linear light in-shader.
  vec3 enc = texture(u_tex, v_uv).rgb;
  vec3 c = srgbToLinear3(enc);

  // === LINEAR-LIGHT stage (frozen): WB + exposure only ===

  // 1. White balance — temperature. r *= 1+0.20n; b *= 1-0.20n (g unchanged).
  {
    float n = u_temp;
    c.r *= 1.0 + 0.20 * n;
    c.b *= 1.0 - 0.20 * n;
  }
  // 2. White balance — tint. g *= 1-0.10n; r *= 1+0.05n; b *= 1+0.05n.
  {
    float n = u_tint;
    c.g *= 1.0 - 0.10 * n;
    c.r *= 1.0 + 0.05 * n;
    c.b *= 1.0 + 0.05 * n;
  }
  // 3. Exposure. c *= 2^(2n). May push values > 1.0 (handled by the OETF below).
  {
    float n = u_exposure;
    c *= exp2(2.0 * n);
  }

  // === ENTER PERCEPTUAL SPACE (frozen, 2026-06-14): single OETF, mid-chain ===
  // From here on c is sRGB-gamma-encoded; tone/color ops shape it perceptually.
  // WB/exposure may have driven c slightly negative via channel gains; the OETF's
  // linear segment (c <= 0.0031308 → c*12.92) carries the sign through, so guard
  // the pow branch only. Clamp the tiny negative lobe to 0 BEFORE encoding (a
  // negative linear value has no perceptual image); this is display-floor
  // hygiene, not a tone op, and is identity for the all-zero edit.
  c = max(c, vec3(0.0));
  c = linearToSrgb3(c);

  // 4. Contrast — pivot-anchored normalized sigmoid about CONTRAST_PIVOT.
  //    n>0 steepens (forward S-curve); n<0 flattens (inverse). b = BMAX*|n|.
  //    b→0 (n=0) is exact identity. Endpoint-preserving (0→0, 1→1).
  {
    float n = u_contrast;
    float b = CONTRAST_BMAX * abs(n);
    if (b > 1e-4) {
      if (n > 0.0) {
        c = vec3(
          sigmoidContrast(c.r, CONTRAST_PIVOT, b),
          sigmoidContrast(c.g, CONTRAST_PIVOT, b),
          sigmoidContrast(c.b, CONTRAST_PIVOT, b)
        );
      } else {
        c = vec3(
          inverseSigmoidContrast(c.r, CONTRAST_PIVOT, b),
          inverseSigmoidContrast(c.g, CONTRAST_PIVOT, b),
          inverseSigmoidContrast(c.b, CONTRAST_PIVOT, b)
        );
      }
    }
  }
  // 5. Highlights (perceptual). wH = smoothstep(0.5,1.0,Y); c *= 1 + 0.5*n*wH.
  {
    float n = u_highlights;
    float Y = dot(c, LUMA);
    float wH = smoothstep(0.5, 1.0, Y);
    c *= 1.0 + 0.5 * n * wH;
  }
  // 6. Shadows (perceptual). wS = smoothstep(0.5,0.0,Y); c *= 1 + 0.5*n*wS.
  {
    float n = u_shadows;
    float Y = dot(c, LUMA);
    float wS = smoothstep(0.5, 0.0, Y);
    c *= 1.0 + 0.5 * n * wS;
  }
  // 7. Whites — soft shoulder white-point foot (perceptual). Identity at n=0.
  {
    float n = u_whites;
    c = vec3(whitesFoot(c.r, n), whitesFoot(c.g, n), whitesFoot(c.b, n));
  }
  // 8. Blacks — soft toe black-point foot (perceptual). n<0 deepens, n>0 lifts.
  //    Identity at n=0. No hard clamp: the toe is monotonic and bounded.
  {
    float n = u_blacks;
    c = vec3(blacksFoot(c.r, n), blacksFoot(c.g, n), blacksFoot(c.b, n));
  }
  // 9. Vibrance (perceptual; skin-protected, low-saturation-weighted).
  {
    float n = u_vibrance;
    float Y = dot(c, LUMA);
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    // sat clamped to [0,1] (frozen, §6.2.1) belt-and-braces. In perceptual space
    // with the bounded feet above, channels feeding vibrance are non-negative.
    float sat = clamp((mx - mn) / max(mx, 1e-5), 0.0, 1.0);
    float w = 1.0 - sat;
    float hue = hueFromRGB(c);
    float gSkin = 1.0 - 0.5 * exp(-pow((hue - 25.0) / 20.0, 2.0));
    c = mix(vec3(Y), c, 1.0 + 0.5 * n * w * gSkin);
  }
  // 10. Saturation (uniform, perceptual). c = mix(vec3(Y), c, 1+n).
  {
    float n = u_saturation;
    float Y = dot(c, LUMA);
    c = mix(vec3(Y), c, 1.0 + n);
  }
  // 11. Clarity (optional, last). v1 ships without the blur pass → blur(c) == c,
  //     so this op is exact identity for any n. Formula retained for v1-legality:
  //     c = c + 0.30*n*(c - blur(c))*wM, wM = 1 - abs(2Y - 1).
  {
    float n = u_clarity;
    float Y = dot(c, LUMA);
    float wM = 1.0 - abs(2.0 * Y - 1.0);
    vec3 blur = c; // no neighborhood pass in v1
    c = c + 0.30 * n * (c - blur) * wM;
  }

  // === OUTPUT stage (frozen) — already in perceptual space; NO second OETF ===
  // Clamp to [0,1] for DISPLAY SAFETY only (the sigmoid + soft feet are bounded;
  // highlights/saturation can still over/undershoot). Then dither + quantize.
  vec3 srgb = clamp(c, 0.0, 1.0);

  // Single dither offset per pixel (same for all channels), from integer (x,y).
  float d = (ign(floor(gl_FragCoord.xy)) - 0.5) / 255.0;
  vec3 outc = vec3(
    quantize8(srgb.r + d),
    quantize8(srgb.g + d),
    quantize8(srgb.b + d)
  );

  fragColor = vec4(outc, 1.0); // forced-opaque alpha
}
`;
