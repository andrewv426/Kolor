/**
 * Leaderboard placement, computed from the day's gallery like counts.
 *
 * Replaces the previously-hardcoded "Top 8%" placeholder that shipped across the
 * Landing, Gallery, and Share screens (PRD §6.4). This is the honest placement
 * derived from real data; the supabase path will compute the same ranking
 * server-side (a percentile view/RPC) when the real leaderboard lands. A short
 * "#rank of total" label is used rather than a percentile because it stays
 * truthful at any gallery size — including the sparse, just-submitted state
 * where a percentile ("Top 100%") would be absurd.
 */
import type { Submission } from '@/lib/types';

export interface Placement {
  /** 1-based competition rank by likeCount (ties share a rank). */
  rank: number;
  /** Total submissions in the gallery. */
  total: number;
}

/**
 * A submission's placement within a gallery, or null if the gallery is empty or
 * the submission isn't present (e.g. gallery not yet loaded).
 */
export function computePlacement(
  gallery: Submission[],
  submissionId: string,
): Placement | null {
  const total = gallery.length;
  if (total === 0) return null;
  const me = gallery.find((s) => s.id === submissionId);
  if (!me) return null;
  // Competition ranking: 1 + everyone with strictly more likes (ties share rank).
  const ahead = gallery.reduce(
    (n, s) => (s.likeCount > me.likeCount ? n + 1 : n),
    0,
  );
  return { rank: ahead + 1, total };
}

/** Honest short label, e.g. "#3 of 9". Returns "—" when placement is unknown. */
export function formatRank(p: Placement | null): string {
  return p ? `#${p.rank} of ${p.total}` : '—';
}
