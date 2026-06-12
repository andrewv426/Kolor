/**
 * colorSignature — generative swatch row derived from a tone.
 * Ported verbatim from the prototype (design_handoff/hifi/engine.jsx →
 * colorSignature). Purely decorative; used on the share receipt (S3).
 *
 * hue from temp/tint, saturation from sat/vibrance, lightness from exposure.
 */
import type { ToneSettings } from '@/lib/types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function colorSignature(t: ToneSettings, n = 6): string[] {
  const baseHue = (38 - t.temp * 0.32 + t.tint * 0.22 + 360) % 360;
  const sat = clamp(46 + t.saturation * 0.4 + t.vibrance * 0.22, 6, 92);
  const lig = clamp(56 + t.exposure * 0.16, 22, 82);
  return Array.from(
    { length: n },
    (_, i) =>
      `hsl(${(baseHue + i * 13) % 360} ${(sat - i * 3).toFixed(0)}% ${clamp(
        lig - 14 + i * 8,
        14,
        88,
      ).toFixed(0)}%)`,
  );
}
