/**
 * SHARED CONTRACT — the single source of truth for the slider parameter space,
 * the stored `settings` JSON, and the data-layer DTOs. Editor, stored settings,
 * and AI players all key off this file (PRD invariant #3).
 *
 * Owned by the scaffold agent. Other agents IMPORT from here, never edit it.
 */

/**
 * Frozen tone-slider keys, in the canonical PRD §6.1 order. NOTE: `clarity`
 * ships later — the pipeline supports it, the v1 UI does not — so it is
 * intentionally absent from this UI-facing key list. The render pipeline keys
 * its frozen op order off PRD §6.2.1, which appends clarity as the optional
 * 11th op.
 */
export const TONE_KEYS = [
  'temp',
  'tint',
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'vibrance',
  'saturation',
] as const;

export type ToneKey = (typeof TONE_KEYS)[number];

/** Integer slider values in [-100, +100], default 0. */
export type ToneSettings = Record<ToneKey, number>;

/**
 * The stored edit. An edit IS this small settings JSON — never a rendered image
 * (PRD invariant #1). `pipeline` selects the frozen renderer that replays it.
 */
export interface EditSettings {
  v: 1;
  pipeline: 'v1';
  engine: 'webgl2';
  colorSpace: 'srgb';
  photoId: string;
  tone: ToneSettings;
}

/** Today's puzzle photo + the URLs of its frozen variant set (PRD §6.2.1). */
export interface DailyPhoto {
  id: string;
  dayNumber: number;
  theme: string;
  /** Canonical/archival 16-bit PNG (UPNG decode path; delivery fallback). */
  master16Url: string;
  preview8Url: string;
  width: number;
  height: number;
  /**
   * Optional two-plane WebP delivery encoding (PRD §6.2.1 amendment 2026-06-12).
   * When present, the editor fetches hi+lo planes (≈42% of the PNG) and decodes
   * via `decodeMaster16FromPlanes`, falling back to `master16Url` (the PNG) when
   * absent or on decode failure. SHIPPED encoding = 12-bit two-plane WebP.
   */
  master16HiUrl?: string;
  master16LoUrl?: string;
}

/** One player's edit as surfaced to the gallery/inspect UI. */
export interface Submission {
  id: string;
  photoId: string;
  playerId: string;
  displayName: string;
  isYou: boolean;
  /** Model id (e.g. "claude-opus-4.8") for AI players; null for humans. */
  aiModel: string | null;
  settings: EditSettings;
  likeCount: number;
  likedByMe: boolean;
  timeTakenMs: number | null;
}

/** Per-key UI metadata (labels + poles) — design handoff "edit engine" table. */
export interface SliderMeta {
  label: string;
  /** Label for the −100 pole. */
  negPole: string;
  /** Label for the +100 pole. */
  posPole: string;
}

export const SLIDER_META: Record<ToneKey, SliderMeta> = {
  temp: { label: 'Temperature', negPole: 'Cool', posPole: 'Warm' },
  tint: { label: 'Tint', negPole: 'Green', posPole: 'Magenta' },
  exposure: { label: 'Exposure', negPole: 'Dark', posPole: 'Bright' },
  contrast: { label: 'Contrast', negPole: 'Flat', posPole: 'Punch' },
  highlights: { label: 'Highlights', negPole: '−', posPole: '+' },
  shadows: { label: 'Shadows', negPole: '−', posPole: '+' },
  whites: { label: 'Whites', negPole: '−', posPole: '+' },
  blacks: { label: 'Blacks', negPole: '−', posPole: '+' },
  vibrance: { label: 'Vibrance', negPole: '−', posPole: '+' },
  saturation: { label: 'Saturation', negPole: 'B&W', posPole: 'Vivid' },
};

/** Neutral edit — every slider at 0. */
export const DEFAULT_TONE: ToneSettings = {
  temp: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
};

const TONE_MIN = -100;
const TONE_MAX = 100;

/**
 * THE shared settings validator (PRD invariant #3). Validates keys, clamps every
 * value to [-100, 100], and rounds to an integer. Both the human submit path and
 * the AI players MUST funnel through this — structured-output schemas do not
 * enforce numeric min/max, so clamping here is mandatory. Unknown/extra keys are
 * dropped; missing or non-finite values fall back to the neutral default (0).
 */
export function clampToneSettings(t: unknown): ToneSettings {
  const input = (t ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_TONE };
  for (const key of TONE_KEYS) {
    const raw = input[key];
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      out[key] = 0;
      continue;
    }
    const clamped = Math.min(TONE_MAX, Math.max(TONE_MIN, num));
    out[key] = Math.round(clamped);
  }
  return out;
}
