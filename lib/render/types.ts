/**
 * SHARED CONTRACT — render-engine interface (PRD §6.2.1 pipeline v1).
 *
 * Owned by the scaffold agent. The render-engine agent implements these in
 * lib/render/index.ts (and helpers); other agents import the types/functions.
 */

import type { ToneSettings } from '@/lib/types';

/**
 * A decoded canonical master, ready to upload to the GPU.
 *
 * Tier A: `halfData` holds RGBA IEEE-754 half-float BIT PATTERNS (not raw
 * 16-bit samples), each channel normalized from the sRGB-encoded master16
 * (sample / 65535 → [0,1]) then packed to binary16 per the frozen v1 packer —
 * uploaded as `RGBA16F` / `HALF_FLOAT`.
 *
 * Tier B: the same `Uint16Array` carries half-float bit patterns derived from
 * the 8-bit `preview8` fallback source; `tier` records which source produced it.
 */
export interface DecodedMaster {
  width: number;
  height: number;
  /** RGBA float16 bit patterns, normalized sRGB-encoded values in [0,1]. */
  halfData: Uint16Array;
  tier: 'A' | 'B';
}

/**
 * The frozen v1 renderer. One full-screen-quad fragment shader; per-drag updates
 * touch uniforms only (the source texture is uploaded once). `tier` is a
 * property of the viewer's device at render time, not of any submission.
 */
export interface V1Renderer {
  /** Upload the decoded master to the GPU (once per day). */
  setSource(m: DecodedMaster): void;
  /** Re-issue the single draw with the given integer-quantized tone values. */
  render(tone: ToneSettings): void;
  readonly tier: 'A' | 'B' | 'C';
  destroy(): void;
}

/**
 * Create a v1 renderer bound to a canvas. Returns null when the device cannot
 * sustain any WebGL2 tier (tier C) — the caller then handles the CSS-filter
 * fallback (which is explicitly NOT part of the determinism contract).
 */
export declare function createV1Renderer(
  canvas: HTMLCanvasElement,
): V1Renderer | null;

/**
 * Decode a `master16.png` buffer via the frozen UPNG → float16 pack path
 * (PRD §6.2.1 decode steps). Resolves to a `DecodedMaster` ready for `setSource`.
 */
export declare function decodeMaster16(buf: ArrayBuffer): Promise<DecodedMaster>;
