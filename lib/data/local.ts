/**
 * LocalAdapter — fully offline data layer backed by localStorage.
 *
 * The default when Supabase env vars are missing or placeholder (see
 * lib/data/index.ts). Lets the entire app run with zero backend:
 *   - Identity  → generated UUID + deterministic adjective-noun handle,
 *                 persisted in localStorage.
 *   - getToday  → static dev-001 photo served from /photo/dev-001/*.
 *   - Gallery   → user's own submission + 8 seeded edits (varied looks,
 *                 2 flagged as AI players).
 *   - Likes     → toggled and persisted in localStorage.
 *
 * All tone values flow through clampToneSettings (PRD invariant #3).
 */

import type { DataAdapter } from './types';
import type { DailyPhoto, EditSettings, Submission, ToneSettings } from '@/lib/types';
import { clampToneSettings, DEFAULT_TONE, TONE_KEYS } from '@/lib/types';

// ---------------------------------------------------------------------------
// localStorage key namespace — prefix `cg2_` matches prototype convention.
// ---------------------------------------------------------------------------
const LS_IDENTITY_ID   = 'cg2_identity_id';
const LS_IDENTITY_NAME = 'cg2_identity_name';
const LS_SUBMISSIONS   = 'cg2_submissions'; // Map<photoId, Submission>
const LS_LIKES         = 'cg2_likes';       // Set<submissionId>

// ---------------------------------------------------------------------------
// Handle generator
// ---------------------------------------------------------------------------
// Deterministic adjective-noun-number handle from a UUID.
// The wordlists are short but yield millions of collisions-resistant combos
// when combined with the 3-digit suffix derived from the uuid.
// ---------------------------------------------------------------------------
const ADJECTIVES = [
  'Amber', 'Arctic', 'Azure', 'Blaze', 'Cobalt', 'Coral', 'Crimson',
  'Crystal', 'Dawn', 'Dusk', 'Ember', 'Forest', 'Gilded', 'Glacial',
  'Golden', 'Jade', 'Lunar', 'Midnight', 'Misty', 'Obsidian', 'Ocean',
  'Onyx', 'Opal', 'Prism', 'Radiant', 'Russet', 'Sapphire', 'Shadow',
  'Silver', 'Solar', 'Starlit', 'Storm', 'Tidal', 'Twilight', 'Velvet',
  'Violet', 'Vivid', 'Wandering', 'Whisper', 'Zephyr',
];
const NOUNS = [
  'Albatross', 'Aurora', 'Birch', 'Canyon', 'Cedar', 'Cliff', 'Cloud',
  'Condor', 'Crane', 'Drifter', 'Falcon', 'Fern', 'Fjord', 'Fox',
  'Glacier', 'Harbor', 'Heron', 'Kestrel', 'Lark', 'Lynx', 'Maple',
  'Mesa', 'Otter', 'Pebble', 'Pine', 'Prism', 'Raven', 'Ridge',
  'Sparrow', 'Stone', 'Summit', 'Swallow', 'Swift', 'Tide', 'Vale',
  'Vapor', 'Viper', 'Wave', 'Willow', 'Wolf',
];

/** Simple hash of a string → unsigned 32-bit integer. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned
  }
  return h;
}

/**
 * Generate a deterministic adjective-noun-number handle from a uuid.
 * Same uuid always returns the same handle.
 */
function handleFromId(id: string): string {
  const h = djb2(id);
  const adj  = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  const num  = h % 100; // 0–99
  return `${adj}${noun}${num}`;
}

// ---------------------------------------------------------------------------
// UUID v4 (browser-safe — Next.js runs in a browser context here)
// ---------------------------------------------------------------------------
function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (very old browsers — shouldn't be needed in any Next.js env).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Persistent identity helpers
// ---------------------------------------------------------------------------
function loadIdentity(): { id: string; displayName: string } | null {
  if (typeof localStorage === 'undefined') return null;
  const id   = localStorage.getItem(LS_IDENTITY_ID);
  const name = localStorage.getItem(LS_IDENTITY_NAME);
  if (id && name) return { id, displayName: name };
  return null;
}

function saveIdentity(id: string, displayName: string): void {
  localStorage.setItem(LS_IDENTITY_ID, id);
  localStorage.setItem(LS_IDENTITY_NAME, displayName);
}

// ---------------------------------------------------------------------------
// Submissions persistence
// ---------------------------------------------------------------------------
type StoredSubmissions = Record<string, Submission>; // keyed by photoId

function loadSubmissions(): StoredSubmissions {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_SUBMISSIONS);
    return raw ? (JSON.parse(raw) as StoredSubmissions) : {};
  } catch {
    return {};
  }
}

function saveSubmissions(map: StoredSubmissions): void {
  localStorage.setItem(LS_SUBMISSIONS, JSON.stringify(map));
}

// ---------------------------------------------------------------------------
// Likes persistence
// ---------------------------------------------------------------------------
function loadLikes(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LS_LIKES);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveLikes(set: Set<string>): void {
  localStorage.setItem(LS_LIKES, JSON.stringify([...set]));
}

// ---------------------------------------------------------------------------
// Dev-001 photo constants
// ---------------------------------------------------------------------------
const DEV_PHOTO_ID      = 'dev-001';
const DEV_PHOTO_DAY_NUM = 1;
const DEV_PHOTO_THEME   = 'Highland Pass';

// Dimensions from manifest.json (master16 variant)
const DEV_MASTER_WIDTH  = 2048;
const DEV_MASTER_HEIGHT = 1365;

function buildDevPhoto(): DailyPhoto {
  return {
    id:          DEV_PHOTO_ID,
    dayNumber:   DEV_PHOTO_DAY_NUM,
    theme:       DEV_PHOTO_THEME,
    master16Url: `/photo/${DEV_PHOTO_ID}/master16.png`,
    preview8Url: `/photo/${DEV_PHOTO_ID}/preview8.webp`,
    // Two-plane WebP delivery (PRD §6.2.1 amendment 2026-06-12). Editor prefers
    // these (≈42% of the PNG), falling back to master16.png on failure.
    master16HiUrl: `/photo/${DEV_PHOTO_ID}/master16-hi.webp`,
    master16LoUrl: `/photo/${DEV_PHOTO_ID}/master16-lo.webp`,
    width:        DEV_MASTER_WIDTH,
    height:       DEV_MASTER_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// Seed gallery edits
// ---------------------------------------------------------------------------
// Eight varied, opinionated tone presets that populate the gallery before any
// real human submissions arrive. Two are marked as AI players. Like counts are
// deterministic pseudo-random integers so the leaderboard looks realistic.
// All tone values are pre-validated integers in [-100, 100].
// ---------------------------------------------------------------------------
interface SeedEdit {
  id: string;
  playerId: string;
  displayName: string;
  aiModel: string | null;
  tone: ToneSettings;
  likeCount: number;
  timeTakenMs: number | null;
}

const SEED_EDITS: SeedEdit[] = [
  {
    id: 'seed-01', playerId: 'seed-player-01', displayName: 'CrimsonOtter47',
    aiModel: null,
    tone: clampToneSettings({ temp: -35, tint: -10, exposure: -22, contrast: 18, highlights: -30, shadows: 20, whites: -10, blacks: -8, vibrance: -15, saturation: -20 }),
    likeCount: 14, timeTakenMs: 187000,
  },
  {
    id: 'seed-02', playerId: 'seed-player-02', displayName: 'TwilightFalcon',
    aiModel: null,
    tone: clampToneSettings({ temp: 48, tint: 8, exposure: 15, contrast: 25, highlights: -40, shadows: 35, whites: 20, blacks: -5, vibrance: 40, saturation: 20 }),
    likeCount: 27, timeTakenMs: 243000,
  },
  {
    id: 'seed-03', playerId: 'seed-player-03', displayName: 'MidnightHeron22',
    aiModel: null,
    tone: clampToneSettings({ temp: 5, tint: -5, exposure: -10, contrast: 65, highlights: -60, shadows: -20, whites: 30, blacks: -40, vibrance: 20, saturation: 10 }),
    likeCount: 19, timeTakenMs: 132000,
  },
  {
    id: 'seed-04', playerId: 'seed-player-04', displayName: 'SilverMaple9',
    aiModel: null,
    tone: clampToneSettings({ temp: -8, tint: 6, exposure: 8, contrast: -35, highlights: -20, shadows: 50, whites: -15, blacks: 25, vibrance: -30, saturation: -15 }),
    likeCount: 9, timeTakenMs: 298000,
  },
  {
    id: 'seed-05', playerId: 'seed-player-05', displayName: 'CoralSparrow',
    aiModel: null,
    tone: clampToneSettings({ temp: 20, tint: 0, exposure: 18, contrast: 30, highlights: -15, shadows: 25, whites: 15, blacks: -10, vibrance: 70, saturation: 45 }),
    likeCount: 31, timeTakenMs: 178000,
  },
  {
    id: 'seed-06', playerId: 'seed-player-06', displayName: 'OceanDrifter88',
    aiModel: null,
    tone: clampToneSettings({ temp: -5, tint: 0, exposure: 5, contrast: 40, highlights: -25, shadows: 10, whites: 0, blacks: -20, vibrance: -50, saturation: -100 }),
    likeCount: 22, timeTakenMs: 95000,
  },
  {
    // AI player — claude-opus-4.8
    id: 'seed-07', playerId: 'ai-claude-opus-4.8', displayName: 'claude-opus-4.8',
    aiModel: 'claude-opus-4.8',
    tone: clampToneSettings({ temp: 32, tint: -4, exposure: 12, contrast: 45, highlights: -50, shadows: 40, whites: 22, blacks: -18, vibrance: 35, saturation: 8 }),
    likeCount: 38, timeTakenMs: null,
  },
  {
    // AI player — gemini-3-flash
    id: 'seed-08', playerId: 'ai-gemini-3-flash', displayName: 'gemini-3-flash',
    aiModel: 'gemini-3-flash',
    tone: clampToneSettings({ temp: -28, tint: 12, exposure: -5, contrast: 20, highlights: -35, shadows: 45, whites: -5, blacks: -12, vibrance: 15, saturation: -8 }),
    likeCount: 17, timeTakenMs: null,
  },
];

function seedToSubmission(
  seed: SeedEdit,
  photoId: string,
  likedByMe: boolean,
  currentLikeCount: number,
): Submission {
  const tone = seed.tone;
  const settings: EditSettings = {
    v: 1,
    pipeline: 'v1',
    engine: 'webgl2',
    colorSpace: 'srgb',
    photoId,
    tone,
  };
  return {
    id:           seed.id,
    photoId,
    playerId:     seed.playerId,
    displayName:  seed.displayName,
    isYou:        false,
    aiModel:      seed.aiModel,
    settings,
    likeCount:    currentLikeCount,
    likedByMe,
    timeTakenMs:  seed.timeTakenMs,
  };
}

// ---------------------------------------------------------------------------
// LocalAdapter implementation
// ---------------------------------------------------------------------------
export class LocalAdapter implements DataAdapter {
  readonly mode = 'local' as const;

  // Lazily-initialised identity — created on first call to getIdentity().
  private _identity: { id: string; displayName: string } | null = null;

  // ---------------------------------------------------------------------------
  // getIdentity
  // ---------------------------------------------------------------------------
  async getIdentity(): Promise<{ id: string; displayName: string }> {
    if (this._identity) return this._identity;

    // Try localStorage first.
    const saved = loadIdentity();
    if (saved) {
      this._identity = saved;
      return saved;
    }

    // Mint a new identity.
    const id = uuidv4();
    const displayName = handleFromId(id);
    saveIdentity(id, displayName);
    this._identity = { id, displayName };
    return this._identity;
  }

  // ---------------------------------------------------------------------------
  // getToday
  // ---------------------------------------------------------------------------
  async getToday(): Promise<DailyPhoto> {
    return buildDevPhoto();
  }

  // ---------------------------------------------------------------------------
  // hasSubmittedToday
  // ---------------------------------------------------------------------------
  async hasSubmittedToday(photoId: string): Promise<boolean> {
    const submissions = loadSubmissions();
    return photoId in submissions;
  }

  // ---------------------------------------------------------------------------
  // getMySubmission
  // ---------------------------------------------------------------------------
  async getMySubmission(photoId: string): Promise<Submission | null> {
    const submissions = loadSubmissions();
    return submissions[photoId] ?? null;
  }

  // ---------------------------------------------------------------------------
  // submitEdit
  // ---------------------------------------------------------------------------
  async submitEdit(
    photoId: string,
    tone: ToneSettings,
    timeTakenMs: number,
  ): Promise<Submission> {
    const submissions = loadSubmissions();
    if (photoId in submissions) {
      throw new Error(`Already submitted for photo ${photoId} today.`);
    }

    const identity = await this.getIdentity();
    const clamped  = clampToneSettings(tone);

    const settings: EditSettings = {
      v: 1,
      pipeline: 'v1',
      engine: 'webgl2',
      colorSpace: 'srgb',
      photoId,
      tone: clamped,
    };

    const submission: Submission = {
      id:          uuidv4(),
      photoId,
      playerId:    identity.id,
      displayName: identity.displayName,
      isYou:       true,
      aiModel:     null,
      settings,
      likeCount:   0,
      likedByMe:   false,
      timeTakenMs,
    };

    submissions[photoId] = submission;
    saveSubmissions(submissions);
    return submission;
  }

  // ---------------------------------------------------------------------------
  // resetSubmissions (DEV/testing only)
  // ---------------------------------------------------------------------------
  // Clears all stored submissions so the one-per-day lock reopens and the editor
  // can be replayed/re-submitted. Local mode only — no production equivalent
  // (the server UNIQUE constraint is authoritative). Likes are left intact.
  async resetSubmissions(): Promise<void> {
    saveSubmissions({});
  }

  // ---------------------------------------------------------------------------
  // getGallery
  // ---------------------------------------------------------------------------
  // Commit-reveal: returns empty array if user hasn't submitted yet.
  // When they have, returns their own submission (pinned first) plus the
  // 8 seeded edits with current like counts from localStorage.
  // ---------------------------------------------------------------------------
  async getGallery(photoId: string): Promise<Submission[]> {
    const submissions = loadSubmissions();
    const mySubmission = submissions[photoId] ?? null;

    // Enforce commit-reveal even in local mode.
    if (!mySubmission) return [];

    const likes = loadLikes();

    // Build seed submissions with up-to-date likeCount (toggles update the
    // seed's base count stored in SEED_EDITS).
    const seedSubmissions: Submission[] = SEED_EDITS.map((seed) => {
      const likedByMe = likes.has(seed.id);
      const likeCount = seed.likeCount + (likedByMe ? 1 : 0);
      return seedToSubmission(seed, photoId, likedByMe, likeCount);
    });

    // User's own submission — mark isYou and apply any self-likes.
    const myLiked = likes.has(mySubmission.id);
    const myFull: Submission = {
      ...mySubmission,
      isYou:     true,
      likedByMe: myLiked,
      likeCount: mySubmission.likeCount + (myLiked ? 1 : 0),
    };

    return [myFull, ...seedSubmissions];
  }

  // ---------------------------------------------------------------------------
  // toggleLike
  // ---------------------------------------------------------------------------
  async toggleLike(submissionId: string): Promise<{ liked: boolean; likeCount: number }> {
    const likes = loadLikes();
    const wasLiked = likes.has(submissionId);

    if (wasLiked) {
      likes.delete(submissionId);
    } else {
      likes.add(submissionId);
    }
    saveLikes(likes);

    // Determine the base like count: either from user's own submission or
    // from the seed edits.
    const submissions = loadSubmissions();
    let baseCount = 0;

    // Check all stored (user) submissions.
    for (const sub of Object.values(submissions)) {
      if (sub.id === submissionId) {
        baseCount = sub.likeCount;
        break;
      }
    }

    // Check seed edits.
    if (baseCount === 0) {
      const seed = SEED_EDITS.find((s) => s.id === submissionId);
      if (seed) baseCount = seed.likeCount;
    }

    const liked     = !wasLiked;
    const likeCount = baseCount + (liked ? 1 : 0);
    return { liked, likeCount };
  }
}

// Verify all TONE_KEYS are covered in each SEED_EDIT at module load time.
// This is a dev-time sanity check; TypeScript enforces it too, but this
// produces a clear runtime error if a key is accidentally missing.
if (process.env.NODE_ENV !== 'production') {
  for (const seed of SEED_EDITS) {
    for (const key of TONE_KEYS) {
      if (typeof seed.tone[key] !== 'number') {
        throw new Error(
          `LocalAdapter seed "${seed.id}" is missing tone key "${key}"`,
        );
      }
    }
  }
}

// Pre-export DEFAULT_TONE for convenience (consumers already have it from
// lib/types, but re-export here avoids a second import in test/story files).
export { DEFAULT_TONE };
