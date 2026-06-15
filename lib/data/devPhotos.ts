/**
 * Dev photo registry — the local-mode catalogue of staged daily photos.
 *
 * Local mode has no Supabase `daily_photos` table, so this static registry
 * stands in for it: the `/admin` dev switcher (local-only) lists these entries
 * and lets you flip which one `LocalAdapter.getToday()` serves. Each entry maps
 * 1:1 to a `public/photo/<id>/` directory produced by `scripts/prepare-master`
 * (master16.png + preview8.webp + the two-plane master16-hi/lo.webp).
 *
 * Production (SupabaseAdapter) ignores this file entirely — the real daily photo
 * is pre-staged into the `daily_photos` table (PRD §6.8).
 */

import type { DailyPhoto } from '@/lib/types';

export type PhotoSourceType = 'raw' | 'jpeg';

export interface DevPhotoEntry {
  id: string;
  theme: string;
  dayNumber: number;
  width: number;
  height: number;
  sourceType: PhotoSourceType;
}

/** The photo LocalAdapter serves when no valid override is stored. */
export const DEFAULT_PHOTO_ID = 'dev-001';

// All entries are demosaiced from CC0 camera-RAW samples (raw.pixls.us) — a
// curated all-nature set (mountains, rivers, flowers, meadows, forests), one per
// camera make, for scene/tonal variety in dev testing. dev-001 ships the full
// canonical set (incl. master16.png); dev-002+ ship planes-only delivery
// (master16-hi/lo.webp + preview8) — the editor decodes the 12-bit planes
// (Tier-A2) and falls back to preview8 (Tier-B) if they fail.
export const DEV_PHOTOS: DevPhotoEntry[] = [
  { id: 'dev-001', theme: 'Alpine',         dayNumber: 1,  width: 2048, height: 1368, sourceType: 'raw' },
  { id: 'dev-002', theme: 'Highlands',      dayNumber: 2,  width: 2048, height: 1538, sourceType: 'raw' },
  { id: 'dev-003', theme: 'Mountain River', dayNumber: 3,  width: 2048, height: 1369, sourceType: 'raw' },
  { id: 'dev-004', theme: 'Flower Field',   dayNumber: 4,  width: 2048, height: 1367, sourceType: 'raw' },
  { id: 'dev-005', theme: 'Columbine',      dayNumber: 5,  width: 2048, height: 1367, sourceType: 'raw' },
  { id: 'dev-006', theme: 'Overlook',       dayNumber: 6,  width: 2048, height: 1532, sourceType: 'raw' },
  { id: 'dev-007', theme: 'Wild Grasses',   dayNumber: 7,  width: 2048, height: 1367, sourceType: 'raw' },
  { id: 'dev-008', theme: 'Dianthus',       dayNumber: 8,  width: 2048, height: 1368, sourceType: 'raw' },
  { id: 'dev-009', theme: 'Spring Meadow',  dayNumber: 9,  width: 2048, height: 1363, sourceType: 'raw' },
  { id: 'dev-010', theme: 'Snowfall',       dayNumber: 10, width: 2048, height: 1369, sourceType: 'raw' },
];

/** Look up a registry entry by id, or undefined if not registered. */
export function getDevPhoto(id: string): DevPhotoEntry | undefined {
  return DEV_PHOTOS.find((e) => e.id === id);
}

/**
 * Build the DailyPhoto DTO for a registry entry. URLs point at the staged
 * `public/photo/<id>/` variants (served from the Next.js public dir).
 */
export function buildPhoto(e: DevPhotoEntry): DailyPhoto {
  return {
    id: e.id,
    dayNumber: e.dayNumber,
    theme: e.theme,
    master16Url: `/photo/${e.id}/master16.png`,
    preview8Url: `/photo/${e.id}/preview8.webp`,
    // Two-plane WebP delivery (PRD §6.2.1 amendment 2026-06-12). Editor prefers
    // these (≈42% of the PNG), falling back to master16.png on failure.
    master16HiUrl: `/photo/${e.id}/master16-hi.webp`,
    master16LoUrl: `/photo/${e.id}/master16-lo.webp`,
    width: e.width,
    height: e.height,
  };
}
