/**
 * SupabaseAdapter — real data layer backed by Supabase Postgres + Auth.
 *
 * Implements DataAdapter against the schema in supabase/migrations/0001_init.sql.
 * This file COMPILES and is plausibly correct but is inert until real
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars exist.
 *
 * Auth model (PRD §7.4):
 *   First visit → signInAnonymously() creates a real auth.users row + JWT.
 *   Session persists in localStorage. Google upgrade (Phase 4) uses
 *   linkIdentity and preserves the user id.
 *
 * RLS (PRD §7.4 + §6.3 / invariant #5):
 *   Submissions for *today* are only visible once the viewer has their own
 *   submission row (commit-reveal, enforced server-side via RLS EXISTS policy).
 *   Past days are always public.
 */

import type { DataAdapter } from './types';
import type { DailyPhoto, EditSettings, Submission, ToneSettings } from '@/lib/types';
import { clampToneSettings } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// DB row shapes (minimal — only the fields we SELECT)
// ---------------------------------------------------------------------------
interface DailyPhotoRow {
  id: string;
  play_date: string;
  day_number: number;
  theme: string;
  master16_path: string;
  preview8_path: string;
  ai768_path: string;
  // Two-plane WebP delivery encoding (PRD §6.2.1 amendment 2026-06-12).
  // Nullable: pre-amendment rows / photos not yet re-derived have no planes.
  master16_hi_path: string | null;
  master16_lo_path: string | null;
  master16_width: number;
  master16_height: number;
  pipeline: string;
  status: string;
}

interface SubmissionRow {
  id: string;
  daily_photo_id: string;
  player_id: string | null;
  ai_model: string | null;
  settings: EditSettings;
  schema_version: number;
  time_taken_ms: number | null;
  like_count: number;
  // Supabase returns the joined table as an array (even for single FK joins).
  profiles?: { display_name: string }[] | null;
}

interface VoteRow {
  submission_id: string;
  voter_id: string;
}

// ---------------------------------------------------------------------------
// CDN URL helper
// ---------------------------------------------------------------------------
// In production, variants are served from Supabase Storage behind a CDN.
// Single point of coupling for the Storage bucket name — keep this the one place
// the literal lives so it can be repointed without hunting through the adapter.
export const PHOTOS_BUCKET = 'photos';

function storageUrl(path: string): string {
  const supabase = getSupabaseClient();
  // getPublicUrl is synchronous and returns the full CDN URL.
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// SupabaseAdapter
// ---------------------------------------------------------------------------
export class SupabaseAdapter implements DataAdapter {
  readonly mode = 'supabase' as const;

  // Identity is resolved once and cached for the session.
  private _identity: { id: string; displayName: string } | null = null;

  // ---------------------------------------------------------------------------
  // getIdentity
  // ---------------------------------------------------------------------------
  // On first call: sign in anonymously if no session exists, then ensure the
  // profiles row has a display_name (the trigger creates a placeholder; the
  // application sets the real handle here if it's still the default).
  // ---------------------------------------------------------------------------
  async getIdentity(): Promise<{ id: string; displayName: string }> {
    if (this._identity) return this._identity;

    const supabase = getSupabaseClient();

    // Retrieve or create a session.
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) {
        throw new Error(`[SupabaseAdapter] signInAnonymously failed: ${error?.message}`);
      }
      session = data.session;
    }

    const userId = session.user.id;

    // Fetch the profile row (created by the trigger in 0001_init.sql).
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    if (profileErr && profileErr.code !== 'PGRST116') {
      // PGRST116 = "exactly one row expected, 0 returned" — trigger may not
      // have fired yet in a race; we'll create/upsert below.
      throw new Error(`[SupabaseAdapter] profile fetch failed: ${profileErr.message}`);
    }

    const displayName = profile?.display_name ?? generateHandle(userId);

    // If the profile row doesn't exist yet (or has the auto-generated
    // placeholder), upsert the real handle.
    if (!profile || profile.display_name.startsWith('player-')) {
      await supabase.from('profiles').upsert(
        { id: userId, display_name: displayName, is_anonymous: true },
        { onConflict: 'id' },
      );
    }

    this._identity = { id: userId, displayName };
    return this._identity;
  }

  // ---------------------------------------------------------------------------
  // getToday
  // ---------------------------------------------------------------------------
  // Fetches the daily_photos row whose play_date = today (UTC).
  // ---------------------------------------------------------------------------
  async getToday(): Promise<DailyPhoto> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

    const { data, error } = await supabase
      .from('daily_photos')
      .select('id, play_date, day_number, theme, master16_path, preview8_path, ai768_path, master16_hi_path, master16_lo_path, master16_width, master16_height, pipeline, status')
      .eq('play_date', today)
      .in('status', ['live', 'staged'])
      .single<DailyPhotoRow>();

    if (error || !data) {
      throw new Error(
        `[SupabaseAdapter] No daily photo found for ${today}: ${error?.message ?? 'no row'}`,
      );
    }

    return {
      id:           data.id,
      dayNumber:    data.day_number,
      theme:        data.theme,
      master16Url:  storageUrl(data.master16_path),
      preview8Url:  storageUrl(data.preview8_path),
      // Two-plane delivery URLs when present (PRD §6.2.1 amendment 2026-06-12).
      master16HiUrl: data.master16_hi_path ? storageUrl(data.master16_hi_path) : undefined,
      master16LoUrl: data.master16_lo_path ? storageUrl(data.master16_lo_path) : undefined,
      width:         data.master16_width,
      height:        data.master16_height,
    };
  }

  // ---------------------------------------------------------------------------
  // hasSubmittedToday
  // ---------------------------------------------------------------------------
  async hasSubmittedToday(photoId: string): Promise<boolean> {
    const { id: userId } = await this.getIdentity();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('submissions')
      .select('id')
      .eq('daily_photo_id', photoId)
      .eq('player_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`[SupabaseAdapter] hasSubmittedToday: ${error.message}`);
    }
    return data !== null;
  }

  // ---------------------------------------------------------------------------
  // getMySubmission
  // ---------------------------------------------------------------------------
  async getMySubmission(photoId: string): Promise<Submission | null> {
    const { id: userId, displayName } = await this.getIdentity();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('submissions')
      .select('id, daily_photo_id, player_id, ai_model, settings, schema_version, time_taken_ms, like_count')
      .eq('daily_photo_id', photoId)
      .eq('player_id', userId)
      .maybeSingle<SubmissionRow>();

    if (error) {
      throw new Error(`[SupabaseAdapter] getMySubmission: ${error.message}`);
    }
    if (!data) return null;

    // Check whether the user liked their own submission.
    const liked = await this._didLike(userId, data.id, supabase);

    return rowToSubmission(data, userId, displayName, liked);
  }

  // ---------------------------------------------------------------------------
  // submitEdit
  // ---------------------------------------------------------------------------
  // Inserts an edit into submissions. The UNIQUE(daily_photo_id, player_id)
  // constraint rejects duplicate submits (PRD §6.5).
  //
  // HONESTY (PRD invariant #3): the clampToneSettings call below is CLIENT-SIDE
  // convenience, NOT security — a hostile client can bypass it entirely. The only
  // current server-side defense is the partial submissions_tone_shape CHECK in
  // 0001_init.sql (keys exist, numeric, in [-100,100]); it does not round/drop/
  // normalize. The authoritative validator (clampToneSettings behind an Edge
  // Function) lands in Phase 2 and will wrap this insert. Until then we insert
  // directly under RLS with only that partial CHECK as a floor.
  // ---------------------------------------------------------------------------
  async submitEdit(
    photoId: string,
    tone: ToneSettings,
    timeTakenMs: number,
  ): Promise<Submission> {
    const { id: userId, displayName } = await this.getIdentity();
    const supabase = getSupabaseClient();

    // Client-side convenience clamp only (NOT security — see honesty note above).
    const clamped = clampToneSettings(tone);

    const settings: EditSettings = {
      v: 1,
      pipeline: 'v1',
      engine: 'webgl2',
      colorSpace: 'srgb',
      photoId,
      tone: clamped,
    };

    const { data, error } = await supabase
      .from('submissions')
      .insert({
        daily_photo_id: photoId,
        player_id:      userId,
        settings,
        schema_version: 1,
        time_taken_ms:  timeTakenMs,
      })
      .select('id, daily_photo_id, player_id, ai_model, settings, schema_version, time_taken_ms, like_count')
      .single<SubmissionRow>();

    if (error) {
      // Postgres unique violation code = 23505.
      if (error.code === '23505') {
        throw new Error(`Already submitted for photo ${photoId} today.`);
      }
      throw new Error(`[SupabaseAdapter] submitEdit: ${error.message}`);
    }

    return rowToSubmission(data, userId, displayName, false);
  }

  // ---------------------------------------------------------------------------
  // getGallery
  // ---------------------------------------------------------------------------
  // Returns all submissions for the photo. The RLS policy enforces commit-reveal:
  // Supabase returns an empty array (or 403) if the caller hasn't submitted yet.
  // We also join profiles for display_name and check the caller's votes.
  // ---------------------------------------------------------------------------
  async getGallery(photoId: string): Promise<Submission[]> {
    const { id: userId, displayName: myDisplayName } = await this.getIdentity();
    const supabase = getSupabaseClient();

    // Fetch all visible submissions + profile display names.
    const { data: rows, error } = await supabase
      .from('submissions')
      .select(`
        id,
        daily_photo_id,
        player_id,
        ai_model,
        settings,
        schema_version,
        time_taken_ms,
        like_count,
        profiles (display_name)
      `)
      .eq('daily_photo_id', photoId)
      .order('like_count', { ascending: false });

    if (error) {
      // RLS may return a permission error before the user submits.
      // Return empty gallery rather than throwing — the UI shows "submit first."
      if (error.code === 'PGRST301' || error.message?.includes('403')) {
        return [];
      }
      throw new Error(`[SupabaseAdapter] getGallery: ${error.message}`);
    }

    if (!rows || rows.length === 0) return [];

    // Fetch all votes the caller has cast for this photo's submissions.
    const typedRows = rows as unknown as SubmissionRow[];
    const submissionIds = typedRows.map((r) => r.id);
    const { data: voteRows } = await supabase
      .from('votes')
      .select('submission_id, voter_id')
      .eq('voter_id', userId)
      .in('submission_id', submissionIds);

    const likedSet = new Set<string>(
      ((voteRows as unknown as VoteRow[]) ?? []).map((v) => v.submission_id),
    );

    return typedRows.map((row) => {
      const isMe = row.player_id === userId;
      const name = isMe
        ? myDisplayName
        : (row.profiles?.[0]?.display_name ?? row.ai_model ?? 'Unknown');
      return rowToSubmission(row, userId, name, likedSet.has(row.id));
    });
  }

  // ---------------------------------------------------------------------------
  // toggleLike
  // ---------------------------------------------------------------------------
  // Insert a vote row (like) or delete it (unlike). The UNIQUE constraint
  // prevents double-likes; the trigger keeps like_count in sync.
  // ---------------------------------------------------------------------------
  async toggleLike(
    submissionId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const { id: userId } = await this.getIdentity();
    const supabase = getSupabaseClient();

    const alreadyLiked = await this._didLike(userId, submissionId, supabase);

    if (alreadyLiked) {
      // Unlike — delete the vote row.
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('submission_id', submissionId)
        .eq('voter_id', userId);
      if (error) throw new Error(`[SupabaseAdapter] toggleLike (unlike): ${error.message}`);
    } else {
      // Like — insert a vote row (UNIQUE constraint rejects duplicates).
      const { error } = await supabase
        .from('votes')
        .insert({ submission_id: submissionId, voter_id: userId });
      if (error && error.code !== '23505') {
        throw new Error(`[SupabaseAdapter] toggleLike (like): ${error.message}`);
      }
    }

    // Fetch the fresh like_count from submissions (updated by the trigger).
    const { data, error: fetchErr } = await supabase
      .from('submissions')
      .select('like_count')
      .eq('id', submissionId)
      .single<{ like_count: number }>();

    if (fetchErr || !data) {
      throw new Error(`[SupabaseAdapter] toggleLike: like_count fetch failed`);
    }

    return { liked: !alreadyLiked, likeCount: data.like_count };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  private async _didLike(
    userId: string,
    submissionId: string,
    supabase: ReturnType<typeof getSupabaseClient>,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('votes')
      .select('submission_id')
      .eq('submission_id', submissionId)
      .eq('voter_id', userId)
      .maybeSingle<VoteRow>();
    return data !== null;
  }
}

// ---------------------------------------------------------------------------
// Row → Submission DTO mapper
// ---------------------------------------------------------------------------
function rowToSubmission(
  row: SubmissionRow,
  currentUserId: string,
  resolvedDisplayName: string,
  likedByMe: boolean,
): Submission {
  // Validate the stored settings through clampToneSettings to guard against
  // malformed rows (AI submissions might have slipped past the validator).
  const tone = clampToneSettings(
    (row.settings as EditSettings)?.tone ?? {},
  );

  const settings: EditSettings = {
    v: 1,
    pipeline: 'v1',
    engine: 'webgl2',
    colorSpace: 'srgb',
    photoId: row.daily_photo_id,
    tone,
  };

  return {
    id:           row.id,
    photoId:      row.daily_photo_id,
    playerId:     row.player_id ?? row.ai_model ?? 'unknown',
    displayName:  resolvedDisplayName,
    isYou:        row.player_id === currentUserId,
    aiModel:      row.ai_model,
    settings,
    likeCount:    row.like_count,
    likedByMe,
    timeTakenMs:  row.time_taken_ms,
  };
}

// ---------------------------------------------------------------------------
// Handle generator (same wordlists as LocalAdapter — shared determinism)
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

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function generateHandle(id: string): string {
  const h   = djb2(id);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun= NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  const num = h % 100;
  return `${adj}${noun}${num}`;
}
