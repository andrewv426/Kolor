/**
 * SHARED CONTRACT — the data layer. Two implementations sit behind this one
 * interface: LocalAdapter (localStorage + seeded gallery; the default when
 * Supabase env vars are missing/placeholder) and SupabaseAdapter (real code
 * paths, inert until keys exist). UI imports `getAdapter()` and never branches
 * on the mode itself.
 *
 * Owned by the scaffold agent. The backend agent implements these in
 * lib/data/index.ts (+ adapters); other agents import the interface.
 */

import type { DailyPhoto, Submission, ToneSettings } from '@/lib/types';

export interface DataAdapter {
  mode: 'local' | 'supabase';

  /** Today's puzzle photo + its variant URLs (one global puzzle/day, UTC). */
  getToday(): Promise<DailyPhoto>;

  /** The stable anon-first identity (Supabase anon user id in supabase mode). */
  getIdentity(): Promise<{ id: string; displayName: string }>;

  /** Commit-reveal gate input: has this user already submitted today? */
  hasSubmittedToday(photoId: string): Promise<boolean>;

  /** This user's own submission for the photo, or null if not yet submitted. */
  getMySubmission(photoId: string): Promise<Submission | null>;

  /**
   * Insert this user's edit. Settings are validated/clamped server-side via the
   * shared clampToneSettings validator. One submission/day (UNIQUE) — a second
   * call for the same photo rejects.
   */
  submitEdit(
    photoId: string,
    tone: ToneSettings,
    timeTakenMs: number,
  ): Promise<Submission>;

  /**
   * The reveal gallery for a photo. Server-enforced commit-reveal: returns
   * 403/empty until this user's own submission row exists (PRD invariant #5).
   */
  getGallery(photoId: string): Promise<Submission[]>;

  /** Toggle this user's like on a submission (one like/edit, UNIQUE). */
  toggleLike(submissionId: string): Promise<{ liked: boolean; likeCount: number }>;

  /**
   * DEV/testing only — clear this user's stored submission(s) so the editor can
   * be replayed and re-submitted (the one-per-day lock is reset). Implemented
   * only by LocalAdapter; undefined in production (SupabaseAdapter), where the
   * server-side UNIQUE(daily_photo_id, player_id) constraint is authoritative.
   * UI must gate any retry affordance on `adapter.mode === 'local'`.
   */
  resetSubmissions?(): Promise<void>;

  /**
   * DEV-only dev-photo switcher (backs the local-only `/admin` console).
   * Implemented only by LocalAdapter; SupabaseAdapter omits them (production
   * resolves the daily photo from the `daily_photos` table, PRD §6.8). UI must
   * gate any use on `adapter.mode === 'local'`.
   */
  listPhotos?(): DailyPhoto[];
  getActivePhotoId?(): string;
  setActivePhotoId?(id: string): void;
}

/**
 * Returns the active adapter. Resolves to LocalAdapter when Supabase env vars
 * are missing or still placeholders; SupabaseAdapter otherwise.
 */
export declare function getAdapter(): DataAdapter;
