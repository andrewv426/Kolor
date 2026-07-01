'use client';

/**
 * Reveal Gallery — layout G1 "uniform grid".
 *
 * - Commit-reveal gate: if !hasSubmittedToday → redirect to "/". (Client gate is
 *   fine in local mode; the server gate is the RLS policy / 403 from getGallery.)
 * - Uniform tiles (phone 2-col / desktop 4-col, 1:1), "You" strip pinned, Top/New
 *   tabs, dashed amber AI badge, optimistic like hearts, early-sparse banner.
 * - ONE shared offscreen renderer (renderManager) renders each tile once; tiles
 *   are cached dataURLs realized lazily.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DailyPhoto, Submission } from '@/lib/types';
import { getAdapter } from '@/lib/data';
import { computePlacement, formatRank } from '@/lib/placement';
import { GalleryTile } from '@/components/GalleryTile';
import { Photo } from '@/components/Photo';
import { useIsDesktop } from '@/components/useIsDesktop';
import {
  disposeSharedRenderer,
  initSharedRenderer,
} from '@/components/renderManager';
import styles from './GalleryScreen.module.css';

type SortMode = 'Top' | 'New';

export function GalleryScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  // DEV/testing only: a "Play again" reset, shown in local mode. Clears the
  // stored submission (reopening the one-per-day lock) and returns to the editor
  // so multiple edits can be submitted while testing. Null in production.
  const devRetry = useMemo(() => {
    const adapter = getAdapter();
    if (adapter.mode !== 'local' || !adapter.resetSubmissions) return null;
    return async () => {
      await adapter.resetSubmissions!();
      router.push('/edit');
    };
  }, [router]);

  const [photo, setPhoto] = useState<DailyPhoto | null>(null);
  const [mine, setMine] = useState<Submission | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [sort, setSort] = useState<SortMode>('Top');
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const adapter = getAdapter();
    (async () => {
      const today = await adapter.getToday();
      if (!alive) return;
      setPhoto(today);

      // Commit-reveal gate.
      const submitted = await adapter.hasSubmittedToday(today.id);
      if (!alive) return;
      if (!submitted) {
        setGated(true);
        router.replace('/');
        return;
      }

      const [me, gallery] = await Promise.all([
        adapter.getMySubmission(today.id),
        adapter.getGallery(today.id),
      ]);
      if (!alive) return;
      setMine(me);
      setSubs(gallery);
      setLoading(false);

      // Spin up the single shared offscreen renderer for tiles.
      await initSharedRenderer(today);
      if (alive) setRendererReady(true);
    })();
    return () => {
      alive = false;
      disposeSharedRenderer();
    };
  }, [router]);

  const sorted = useMemo(() => {
    const a = [...subs];
    if (sort === 'Top') return a.sort((x, y) => y.likeCount - x.likeCount);
    // "New" — most recent first by real submission time (your own edit, minted
    // just now, sorts to the top). Legacy rows without a timestamp sort last.
    return a.sort((x, y) => (y.submittedAt ?? 0) - (x.submittedAt ?? 0));
  }, [subs, sort]);

  // Real leaderboard placement for the "You" strip (replaces hardcoded "Top 8%").
  const myPlacement = useMemo(
    () => (mine ? computePlacement(subs, mine.id) : null),
    [subs, mine],
  );

  // Early/sparse heuristic: very few edits so far.
  const early = !loading && subs.length > 0 && subs.length <= 4;
  const list = sorted;

  const toggleLike = async (id: string) => {
    // Optimistic flip.
    setSubs((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              likedByMe: !s.likedByMe,
              likeCount: s.likeCount + (s.likedByMe ? -1 : 1),
            }
          : s,
      ),
    );
    try {
      const res = await getAdapter().toggleLike(id);
      setSubs((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, likedByMe: res.liked, likeCount: res.likeCount }
            : s,
        ),
      );
    } catch {
      // Roll back on failure.
      setSubs((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                likedByMe: !s.likedByMe,
                likeCount: s.likeCount + (s.likedByMe ? -1 : 1),
              }
            : s,
        ),
      );
    }
  };

  if (gated || !photo) {
    return <div className="screen" aria-busy />;
  }

  const count = subs.length;

  return (
    <div className={`screen ${styles.scroll}`}>
      <div className={`col ${isDesktop ? styles.headerDesk : styles.header}`}>
        <div className="row between">
          <div className="col" style={{ gap: 3 }}>
            <span className="h-md">Today&apos;s gallery</span>
            <span className="dim" style={{ fontSize: 13 }}>
              {count.toLocaleString()} edits
              {sort === 'Top' ? ' · by likes' : ' · newest first'}
            </span>
          </div>
          <button
            className="btn ghost sm"
            onClick={() => router.push('/result')}
          >
            Your result
          </button>
        </div>
        <div className="tabset" style={{ alignSelf: 'flex-start' }}>
          {(['Top', 'New'] as SortMode[]).map((s) => (
            <button
              key={s}
              className={`t ${s === sort ? 'on' : ''}`}
              onClick={() => setSort(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {early ? (
          <div className={styles.earlyBanner}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              You&apos;re early. Only a few edits so far — more roll in through
              the day.
            </span>
          </div>
        ) : null}
      </div>

      {/* "You" strip */}
      {mine ? (
        <div className={`row between ${isDesktop ? styles.youDesk : styles.you}`}>
          <div className="row" style={{ gap: 12 }}>
            <div className="onphoto" style={{ flex: '0 0 auto' }}>
              <Photo
                photo={photo}
                tone={mine.settings.tone}
                radius="8px"
                style={{ width: 46, height: 46 }}
              />
            </div>
            <div className="col" style={{ gap: 3 }}>
              <span className="row" style={{ gap: 8 }}>
                <span className="badge accent">YOU</span>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {mine.displayName || 'Anonymous'}
                </span>
              </span>
              <span className="dim" style={{ fontSize: 13 }}>
                {formatRank(myPlacement)} · {mine.likeCount} likes
              </span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {devRetry ? (
              <button
                className="btn ghost sm"
                title="Dev only: clears your submission so you can edit and submit again"
                onClick={devRetry}
              >
                ↺ Play again
              </button>
            ) : null}
            <button className="btn sm" onClick={() => router.push('/result')}>
              Share
            </button>
          </div>
        </div>
      ) : null}

      {/* Grid */}
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${isDesktop ? 4 : 2}, 1fr)`,
          padding: isDesktop ? '0 32px 110px' : '0 18px 110px',
        }}
      >
        {list.map((s) => (
          <GalleryTile
            key={s.id}
            photo={photo}
            submission={s}
            rendererReady={rendererReady}
            onOpen={() => router.push(`/gallery/${s.id}`)}
            onToggleLike={(e) => {
              e.stopPropagation();
              void toggleLike(s.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
