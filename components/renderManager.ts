'use client';

/**
 * renderManager — shared client-side render orchestration for the gallery.
 *
 * Invariant #1: an edit IS settings JSON; the gallery re-renders each tile
 * CLIENT-SIDE from `settings + the one cached daily photo`. We must NOT create
 * 50 live canvases. Instead this module owns ONE offscreen WebGL2 renderer plus
 * the single decoded master, and renders each submission's tone ONCE to a cached
 * data-URL (per photoId + tone hash). Tiles are plain <img>/background that point
 * at the cached URL, lazily realized via IntersectionObserver in the gallery.
 *
 * If WebGL2 is unavailable (tier C), `renderToneToUrl` returns null and callers
 * fall back to the CSS-filter approximation on a live element.
 */
import type { ToneSettings } from '@/lib/types';
import {
  createV1Renderer,
  decodeMaster16,
  type DecodedMaster,
  type V1Renderer,
} from '@/lib/render';

const THUMB_SIZE = 512; // offscreen square render size for tiles

interface SharedRenderer {
  photoId: string;
  canvas: HTMLCanvasElement;
  renderer: V1Renderer;
  master: DecodedMaster;
}

let shared: SharedRenderer | null = null;
let initPromise: Promise<SharedRenderer | null> | null = null;
const urlCache = new Map<string, string>();

function toneHash(tone: ToneSettings): string {
  // Deterministic key from the integer-quantized tone values.
  return (
    `${tone.temp},${tone.tint},${tone.exposure},${tone.contrast},` +
    `${tone.highlights},${tone.shadows},${tone.whites},${tone.blacks},` +
    `${tone.vibrance},${tone.saturation}`
  );
}

/** Has a shared renderer been successfully created (tier A/B)? */
export function isSharedAvailable(): boolean {
  return shared !== null;
}

/**
 * Initialize the one shared offscreen renderer for a photo. Resolves to the
 * shared instance, or null if WebGL2 is unavailable (tier C) or decode failed.
 * Safe to call repeatedly; the in-flight promise is shared.
 */
export async function initSharedRenderer(
  photoId: string,
  master16Url: string,
): Promise<SharedRenderer | null> {
  if (shared && shared.photoId === photoId) return shared;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const canvas = document.createElement('canvas');
      const renderer = createV1Renderer(canvas);
      if (!renderer) return null; // tier C

      const res = await fetch(master16Url);
      if (!res.ok) throw new Error(`master fetch ${res.status}`);
      const buf = await res.arrayBuffer();
      const master = await decodeMaster16(buf);
      renderer.setSource(master);

      shared = { photoId, canvas, renderer, master };
      urlCache.clear();
      return shared;
    } catch {
      return null; // fall back to CSS tier
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Render a tone to a cached data-URL (square thumbnail). Returns null when no
 * shared renderer is available (caller uses the CSS-filter tier instead).
 */
export async function renderToneToUrl(
  tone: ToneSettings,
): Promise<string | null> {
  if (!shared) return null;
  const key = `${shared.photoId}|${toneHash(tone)}`;
  const cached = urlCache.get(key);
  if (cached) return cached;

  const { canvas, renderer, master } = shared;
  // Square crop from the center for uniform 1:1 tiles.
  const side = Math.min(master.width, master.height);
  // The renderer renders at native master resolution; we draw to a square
  // export canvas. We keep the source canvas at master resolution per §6.2.1.
  canvas.width = master.width;
  canvas.height = master.height;
  renderer.render(tone);

  const out = document.createElement('canvas');
  out.width = THUMB_SIZE;
  out.height = THUMB_SIZE;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  const sx = (master.width - side) / 2;
  const sy = (master.height - side) / 2;
  ctx.drawImage(canvas, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);

  const url = out.toDataURL('image/webp', 0.85);
  urlCache.set(key, url);
  return url;
}

/** Tear down the shared renderer (e.g. on leaving the gallery). */
export function disposeSharedRenderer(): void {
  if (shared) {
    shared.renderer.destroy();
    shared = null;
  }
  urlCache.clear();
}
