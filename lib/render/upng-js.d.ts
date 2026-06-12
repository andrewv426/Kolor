/**
 * Minimal ambient types for `upng-js` (2.1.0) — the package ships no types.
 * Only the surface the v1 decode path uses (PRD §6.2.1) is declared.
 *
 * `UPNG.decode(buf)` returns an image whose `.data` is the RAW PNG sample bytes
 * (UPNG does NOT byte-swap; 16-bit PNG samples are big-endian). For a 16-bit
 * RGBA PNG, `depth === 16`, `ctype === 6`, and `data` holds big-endian byte
 * pairs in R,G,B,A order. We must NOT use `toRGBA8` (8-bit only).
 */
declare module 'upng-js' {
  /** A decoded PNG image as returned by UPNG.decode. */
  export interface UPNGImage {
    width: number;
    height: number;
    /** Color type per the PNG spec: 2 = RGB, 6 = RGBA, 0 = grayscale, etc. */
    ctype: number;
    /** Bit depth per channel: 8 or 16 (also 1/2/4 for indexed/gray). */
    depth: number;
    /** Raw sample bytes (big-endian for 16-bit), NOT byte-swapped by UPNG. */
    data: Uint8Array;
    /** Frame/animation tabs — unused here. */
    tabs?: Record<string, unknown>;
    frames?: unknown[];
  }

  export function decode(buffer: ArrayBuffer | Uint8Array): UPNGImage;
  /** 8-bit only — deliberately NOT used in the v1 16-bit path. */
  export function toRGBA8(img: UPNGImage): ArrayBuffer[];

  const UPNG: {
    decode: typeof decode;
    toRGBA8: typeof toRGBA8;
  };
  export default UPNG;
}
