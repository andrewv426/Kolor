'use client';

/**
 * Shared client-side decoded-master cache (PRD §6.2.1 + §7.3). The canonical
 * master is fetched + decoded ONCE per session per photo and shared across every
 * surface that needs it — the editor (<Photo>), the gallery's shared offscreen
 * renderer, and the inspect view. Keying by the photo's `master16Url` means all
 * surfaces coalesce onto a single in-flight fetch+decode and reuse one result.
 *
 * Delivery (PRD §6.2.1 amendment 2026-06-12): when the photo carries the
 * two-plane WebP set, we fetch hi+lo (≈42% of the PNG) with byte-progress and
 * decode via `decodeMaster16FromPlanes`, falling back to the canonical
 * master16.png (UPNG path) on 404/decode failure → preview8 (Tier B) → CSS
 * (Tier C, handled by the caller). master16.png stays the archival artifact.
 */
import type { DailyPhoto } from '@/lib/types';
import { decodeMaster16, decodeMaster16FromPlanes } from './decode';
import type { DecodedMaster } from './types';

/**
 * Progress update. `fraction` is 0..1 over the streamed bytes (decode is the
 * last beat) when byte-accurate progress is known. When `indeterminate` is true
 * (a stream has no Content-Length so the total is unknown) `fraction` is null
 * and the UI should show a label without a percentage.
 */
export type Progress =
  | { fraction: number; indeterminate?: false }
  | { fraction: null; indeterminate: true };

/** Progress callback (see {@link Progress}). */
export type ProgressFn = (p: Progress) => void;

const masterCache = new Map<string, Promise<DecodedMaster>>();

/**
 * Fetch a URL with byte-level progress via the response body ReadableStream.
 * `onChunk` receives (cumulativeDownloaded, total) where total comes from
 * Content-Length (0 if unknown).
 */
async function fetchWithProgress(
  url: string,
  onChunk: (downloaded: number, total: number) => void,
): Promise<{ buffer: ArrayBuffer; ok: boolean; status: number }> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    const buffer = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0);
    return { buffer, ok: res.ok, status: res.status };
  }
  const total = Number(res.headers.get('Content-Length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      downloaded += value.byteLength;
      onChunk(downloaded, total);
    }
  }
  const buffer = new Uint8Array(downloaded);
  let off = 0;
  for (const c of chunks) {
    buffer.set(c, off);
    off += c.byteLength;
  }
  return { buffer: buffer.buffer, ok: true, status: res.status };
}

async function decodeForPhoto(
  photo: DailyPhoto,
  onProgress?: ProgressFn,
): Promise<DecodedMaster> {
  // Prefer the two-plane delivery encoding when both URLs are present.
  if (photo.master16HiUrl && photo.master16LoUrl) {
    try {
      const dl = [0, 0];
      const tot = [0, 0];
      const report = () => {
        // Byte-accurate only when BOTH streams expose a Content-Length. If
        // either total is unknown we can't compute a meaningful percent — report
        // an indeterminate state so the UI shows a pulse, not a fake number.
        const known = tot[0] > 0 && tot[1] > 0;
        if (!known) {
          onProgress?.({ fraction: null, indeterminate: true });
          return;
        }
        const frac = (dl[0] + dl[1]) / (tot[0] + tot[1]);
        // reserve last 8% for decode
        onProgress?.({ fraction: Math.min(0.92, frac * 0.92) });
      };
      const [hi, lo] = await Promise.all([
        fetchWithProgress(photo.master16HiUrl, (d, t) => {
          dl[0] = d;
          tot[0] = t;
          report();
        }),
        fetchWithProgress(photo.master16LoUrl, (d, t) => {
          dl[1] = d;
          tot[1] = t;
          report();
        }),
      ]);
      if (!hi.ok || !lo.ok) throw new Error(`planes ${hi.status}/${lo.status}`);
      const decoded = await decodeMaster16FromPlanes(hi.buffer, lo.buffer);
      onProgress?.({ fraction: 1 });
      return decoded;
    } catch {
      // Fall through to the canonical PNG path on any plane failure.
    }
  }

  const res = await fetchWithProgress(photo.master16Url, (d, t) => {
    if (t > 0) onProgress?.({ fraction: Math.min(0.92, (d / t) * 0.92) });
    else onProgress?.({ fraction: null, indeterminate: true });
  });
  if (!res.ok) throw new Error(`master ${res.status}`);
  const decoded = await decodeMaster16(res.buffer);
  onProgress?.({ fraction: 1 });
  return decoded;
}

/**
 * Get the decoded master for a photo, shared across all surfaces. The first
 * caller drives the fetch+decode (and receives progress); later callers coalesce
 * onto the same promise and get an immediate `onProgress(1)`. A rejected decode
 * is evicted so a later mount can retry.
 */
export function getDecodedMaster(
  photo: DailyPhoto,
  onProgress?: ProgressFn,
): Promise<DecodedMaster> {
  const cacheKey = photo.master16Url;
  let p = masterCache.get(cacheKey);
  if (!p) {
    p = decodeForPhoto(photo, onProgress);
    p.catch(() => masterCache.delete(cacheKey));
    masterCache.set(cacheKey, p);
  } else {
    onProgress?.({ fraction: 1 });
  }
  return p;
}
