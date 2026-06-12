/**
 * cssFilter — the prototype's CSS-filter approximation of the tonal pipeline.
 *
 * This is the **tier-C fallback only** (PRD §6.2.1 fallback ladder): when no
 * WebGL2 renderer can be created, the editor/gallery show an <img> with these
 * approximate filters + two blend overlays. It is explicitly NOT part of the
 * determinism contract — it exists so the photo still feels alive on devices
 * with no WebGL2. Ported from design_handoff/hifi/engine.jsx → toFilter.
 */
import type { ToneSettings } from '@/lib/types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface CssFilterApprox {
  /** CSS `filter` string. */
  filter: string;
  /** Warm/cool temperature wash (mix-blend overlay). */
  temp: string;
  /** Magenta/green tint wash (soft-light overlay). */
  tint: string;
}

export function toCssFilter(t: ToneSettings): CssFilterApprox {
  const brightness = clamp(
    1 + t.exposure / 170 + (t.highlights + t.whites) / 700 + t.shadows / 1100,
    0.4,
    1.8,
  );
  const contrast = clamp(
    1 + t.contrast / 165 + (t.whites - t.blacks) / 620,
    0.5,
    1.9,
  );
  const saturate = clamp(1 + t.saturation / 120 + t.vibrance / 280, 0, 2.2);
  const filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(
    3,
  )}) saturate(${saturate.toFixed(3)})`;

  const tempA = Math.min(0.46, (Math.abs(t.temp) / 100) * 0.34);
  const temp =
    t.temp >= 0
      ? `rgba(255,160,66,${tempA.toFixed(3)})`
      : `rgba(70,150,255,${tempA.toFixed(3)})`;

  const tintA = Math.min(0.42, (Math.abs(t.tint) / 100) * 0.3);
  const tint =
    t.tint >= 0
      ? `rgba(255,72,200,${tintA.toFixed(3)})`
      : `rgba(120,240,120,${tintA.toFixed(3)})`;

  return { filter, temp, tint };
}
