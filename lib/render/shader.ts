/**
 * Frozen v1 GLSL (PRD §6.2.1). The fragment shader is the spec of record made
 * executable: exact piecewise sRGB EOTF/OETF (frozen constants — NEVER pow(2.2),
 * NEVER hardware sRGB sampling), all ten core ops in the frozen non-commuting
 * order, in linear light at `highp`, then OETF → interleaved-gradient-noise
 * dither (pure function of integer gl_FragCoord) → clamp → explicit round-half-up
 * quantize8. Clarity (op 11) exists as an inert uniform (UI passes 0); its v1
 * formula is `c + 0.30*n*(c - blur(c))*wM`, but v1 ships without the blur pass,
 * so `blur(c) == c` and the op is exact identity at any n (no neighborhood read).
 *
 * Every per-op constant, mask curve, pivot, and weight below is transcribed
 * verbatim from §6.2.1's "Frozen per-op formulas" subsection. Changing ANY of
 * them forces pipeline v2 (freeze rule, §6.2.1).
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

// Rec. 709 linear luminance weights (frozen).
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// ---- Exact piecewise sRGB transfer functions (frozen constants) ----
// EOTF: sRGB-encoded c ∈ [0,1] → linear (shader entry).
float srgbToLinear(float c) {
  return (c <= 0.04045) ? (c / 12.92)
                        : pow((c + 0.055) / 1.055, 2.4);
}
// OETF: linear c → sRGB-encoded (output, before dither + quantization).
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

// ---- Output dither (interleaved gradient noise, Jimenez; frozen) ----
// Pure function of integer destination pixel (x,y) ONLY. No time/random/seed.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
// clamp-after-add then explicit round-half-up to 8-bit (canonical v1 form).
float quantize8(float x) {
  return floor(clamp(x, 0.0, 1.0) * 255.0 + 0.5) / 255.0;
}

// Hue (degrees, 0..360) from linear RGB → HSV hue (for the vibrance skin guard).
float hueFromLinearRGB(vec3 c) {
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

void main() {
  // Sample raw sRGB-encoded values with LINEAR filtering (no hardware sRGB),
  // then decode to linear light in-shader.
  vec3 enc = texture(u_tex, v_uv).rgb;
  vec3 c = srgbToLinear3(enc);

  // === Frozen op order (linear light, highp) ===

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
  // 3. Exposure. c *= 2^(2n).
  {
    float n = u_exposure;
    c *= exp2(2.0 * n);
  }
  // 4. Contrast around linear pivot P = 0.18. c = (c - P)*(1+n) + P.
  {
    float n = u_contrast;
    const float P = 0.18;
    c = (c - P) * (1.0 + n) + P;
  }
  // 5. Highlights. wH = smoothstep(0.5,1.0,Y); c *= 1 + 0.5*n*wH.
  {
    float n = u_highlights;
    float Y = dot(c, LUMA);
    float wH = smoothstep(0.5, 1.0, Y);
    c *= 1.0 + 0.5 * n * wH;
  }
  // 6. Shadows. wS = smoothstep(0.5,0.0,Y); c *= 1 + 0.5*n*wS.
  {
    float n = u_shadows;
    float Y = dot(c, LUMA);
    float wS = smoothstep(0.5, 0.0, Y);
    c *= 1.0 + 0.5 * n * wS;
  }
  // 7. Whites. c *= 1 + 0.25*n.
  {
    float n = u_whites;
    c *= 1.0 + 0.25 * n;
  }
  // 8. Blacks. wB = clamp(1 - Y/0.25, 0, 1); c += 0.10*n*wB.
  {
    float n = u_blacks;
    float Y = dot(c, LUMA);
    float wB = clamp(1.0 - Y / 0.25, 0.0, 1.0);
    c += 0.10 * n * wB;
  }
  // 9. Vibrance (skin-protected, low-saturation-weighted).
  {
    float n = u_vibrance;
    float Y = dot(c, LUMA);
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-5);
    float w = 1.0 - sat;
    float hue = hueFromLinearRGB(c);
    float gSkin = 1.0 - 0.5 * exp(-pow((hue - 25.0) / 20.0, 2.0));
    c = mix(vec3(Y), c, 1.0 + 0.5 * n * w * gSkin);
  }
  // 10. Saturation (uniform). c = mix(vec3(Y), c, 1+n).
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

  // Clamp to [0,1], OETF-encode, dither, quantize (frozen output stage).
  c = clamp(c, 0.0, 1.0);
  vec3 srgb = linearToSrgb3(c);

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
