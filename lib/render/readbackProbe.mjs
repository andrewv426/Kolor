/**
 * Client-side readback integrity probe for the two-plane delivery encoding
 * (PRD §6.2.1 delivery-encoding amendment). Pure, DOM-free, and node-testable —
 * imported by decode.ts (`decodeMaster16FromPlanes`) and exercised directly by
 * lib/render/__tests__/planes.test.mjs.
 *
 * The lo plane carries a built-in invariant that requires NO server-side data:
 * the encoder writes every lo byte as a replicated nibble `(nib<<4)|nib`, so a
 * clean readback satisfies `(b>>4) === (b&0xF)` for every RGB byte. A
 * color-managing browser (Safari risk) silently mangling the 8-bit canvas
 * readback would break this invariant with high probability. We sample a
 * deterministic spread of pixels and throw on the first violation so the caller
 * (masterCache) falls back to the canonical PNG path.
 */

/**
 * Throw if any sampled lo-plane RGB byte violates the replicated-nibble
 * invariant. `lo` is interleaved RGBA8 (4 bytes/pixel); alpha is forced opaque
 * (not a replicated nibble) and is never sampled.
 *
 * @param {Uint8ClampedArray|Uint8Array} lo interleaved RGBA8 lo-plane readback
 * @param {number} [width] master width; when known, the two remaining true
 *   corners (top-right, bottom-left) are also probed
 * @param {number} [samples] approximate number of evenly-strided pixels to probe
 */
export function assertLoPlaneNibbleReplication(lo, width = 0, samples = 2048) {
  const pixels = (lo.length / 4) | 0;
  if (pixels === 0) {
    throw new Error('planes readback probe: empty lo plane');
  }

  const checkPixel = (p) => {
    const s = p * 4;
    for (let ch = 0; ch < 3; ch++) {
      const b = lo[s + ch];
      if (((b >> 4) & 0x0f) !== (b & 0x0f)) {
        throw new Error(
          `planes readback probe: lo byte violates nibble replication at ` +
            `pixel ${p} ch ${ch} (got 0x${b.toString(16).padStart(2, '0')}) — ` +
            `readback corrupted (color management?); falling back to PNG`,
        );
      }
    }
  };

  // The four corners. Without a known width we can address only the first and
  // last pixels (top-left, bottom-right); with width we add top-right and
  // bottom-left too.
  checkPixel(0);
  checkPixel(pixels - 1);
  if (width > 0 && pixels % width === 0) {
    checkPixel(width - 1); // top-right
    checkPixel(pixels - width); // bottom-left
  }

  // Evenly strided spread across the whole buffer.
  const n = Math.min(samples, pixels);
  const stride = Math.max(1, Math.floor(pixels / n));
  for (let p = 0; p < pixels; p += stride) {
    checkPixel(p);
  }
}
