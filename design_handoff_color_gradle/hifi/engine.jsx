/* ===================== color-gradle · edit engine ===================== */
/* Pure helpers + data. No React. Exposed on window. */

const SLIDERS = [
  { key: "temp", label: "Temperature", lo: "Cool", hi: "Warm" },
  { key: "tint", label: "Tint", lo: "Green", hi: "Magenta" },
  { key: "exposure", label: "Exposure", lo: "Dark", hi: "Bright" },
  { key: "contrast", label: "Contrast", lo: "Flat", hi: "Punch" },
  { key: "highlights", label: "Highlights", lo: "−", hi: "+" },
  { key: "shadows", label: "Shadows", lo: "−", hi: "+" },
  { key: "whites", label: "Whites", lo: "−", hi: "+" },
  { key: "blacks", label: "Blacks", lo: "−", hi: "+" },
  { key: "vibrance", label: "Vibrance", lo: "−", hi: "+" },
  { key: "saturation", label: "Saturation", lo: "B&W", hi: "Vivid" },
];

const ZERO = SLIDERS.reduce((o, s) => (o[s.key] = 0, o), {});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* 10 sliders -> CSS filter + two blend overlays (temp / tint) */
function toFilter(t) {
  const brightness = clamp(1 + t.exposure / 170 + (t.highlights + t.whites) / 700 + t.shadows / 1100, 0.4, 1.8);
  const contrast = clamp(1 + t.contrast / 165 + (t.whites - t.blacks) / 620, 0.5, 1.9);
  const saturate = clamp(1 + t.saturation / 120 + t.vibrance / 280, 0, 2.2);
  const filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
  const tempA = Math.min(0.46, Math.abs(t.temp) / 100 * 0.34);
  const temp = t.temp >= 0 ? `rgba(255,160,66,${tempA.toFixed(3)})` : `rgba(70,150,255,${tempA.toFixed(3)})`;
  const tintA = Math.min(0.42, Math.abs(t.tint) / 100 * 0.30);
  const tint = t.tint >= 0 ? `rgba(255,72,200,${tintA.toFixed(3)})` : `rgba(120,240,120,${tintA.toFixed(3)})`;
  return { filter, temp, tint };
}

/* derive a small generative "color signature" from a tone */
function colorSignature(t, n = 6) {
  const baseHue = (38 - t.temp * 0.32 + t.tint * 0.22 + 360) % 360;
  const sat = clamp(46 + t.saturation * 0.4 + t.vibrance * 0.22, 6, 92);
  const lig = clamp(56 + t.exposure * 0.16, 22, 82);
  return Array.from({ length: n }, (_, i) =>
    `hsl(${(baseHue + i * 13) % 360} ${(sat - i * 3).toFixed(0)}% ${clamp(lig - 14 + i * 8, 14, 88).toFixed(0)}%)`);
}

const mk = (o) => ({ ...ZERO, ...o });

/* preset "edits" — humans + AI — used to populate the gallery */
const PRESETS = [
  { id: "p1", name: "amberlight", handle: "AmberFox31", likes: 84, tone: mk({ temp: 30, contrast: 24, shadows: 28, vibrance: 26, blacks: -12, exposure: 6 }) },
  { id: "p2", name: "claude-opus-4.8", ai: true, likes: 71, tone: mk({ temp: 18, contrast: 30, highlights: -36, shadows: 40, vibrance: 30, blacks: -18 }) },
  { id: "p3", name: "TealHour19", handle: "TealHour19", likes: 63, tone: mk({ temp: -28, tint: -10, shadows: 34, vibrance: 24, contrast: 18 }) },
  { id: "p4", name: "gemini-3-pro", ai: true, likes: 52, tone: mk({ exposure: 22, highlights: 30, contrast: -14, whites: 24, saturation: -8 }) },
  { id: "p5", name: "noir", handle: "QuietRaven07", likes: 49, tone: mk({ saturation: -100, contrast: 34, blacks: -26, exposure: -6 }) },
  { id: "p6", name: "fadedfilm", handle: "DustPlum44", likes: 41, tone: mk({ blacks: 30, contrast: -20, saturation: -22, temp: 12, exposure: 8 }) },
  { id: "p7", name: "gpt-5.4", ai: true, likes: 38, tone: mk({ temp: 26, vibrance: 38, saturation: 14, exposure: 10, contrast: 20 }) },
  { id: "p8", name: "softpastel", handle: "MintShore12", likes: 29, tone: mk({ saturation: -16, exposure: 16, vibrance: 22, temp: 10, highlights: 14 }) },
  { id: "p9", name: "crushednoir", handle: "InkTide88", likes: 23, tone: mk({ exposure: -10, contrast: 30, blacks: -30, saturation: -10, temp: -8 }) },
];

/* a starting look so the editor isn't a flat zero on first paint */
const SEED_TONE = mk({ temp: 16, contrast: 18, shadows: 22, vibrance: 20, exposure: 4, blacks: -8 });

Object.assign(window, { SLIDERS, ZERO, SEED_TONE, PRESETS, toFilter, colorSignature, clamp });
