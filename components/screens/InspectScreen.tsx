'use client';

/**
 * Edit Detail / Inspect — layout D1 "photo + recipe".
 *
 * - Big render of the edit, hold-for-original (tone → DEFAULT_TONE while held).
 * - Creator row (AI = model name only, no "AI ·" prefix; human = handle) + like.
 * - Read-only slider list (all 10).
 * - "Load these onto my photo" → /edit?from=<id> applying their tone. Allowed
 *   ONLY pre-submit; once the viewer has submitted (one edit/day) it becomes a
 *   comparison-only state per the handoff.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DailyPhoto, Submission } from '@/lib/types';
import { TONE_KEYS, DEFAULT_TONE } from '@/lib/types';
import { getAdapter } from '@/lib/data';
import { Photo } from '@/components/Photo';
import { Slider } from '@/components/Slider';
import { Avatar } from '@/components/Avatar';
import { useIsDesktop } from '@/components/useIsDesktop';
import { useHoldCompare } from '@/components/useHoldCompare';
import styles from './InspectScreen.module.css';

export function InspectScreen({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const [photo, setPhoto] = useState<DailyPhoto | null>(null);
  const [sub, setSub] = useState<Submission | null>(null);
  const [submittedToday, setSubmittedToday] = useState(false);
  const { held: compare, holdHandlers } = useHoldCompare();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    const adapter = getAdapter();
    (async () => {
      const today = await adapter.getToday();
      if (!alive) return;
      setPhoto(today);

      // The gallery is gated behind submission; deep-linking here still requires
      // the user to have revealed (getGallery returns 403/empty otherwise).
      const submitted = await adapter.hasSubmittedToday(today.id);
      if (!alive) return;
      setSubmittedToday(submitted);
      if (!submitted) {
        router.replace('/');
        return;
      }

      const gallery = await adapter.getGallery(today.id).catch(() => []);
      if (!alive) return;
      const found = gallery.find((s) => s.id === submissionId) ?? null;
      if (!found) setNotFound(true);
      setSub(found);
    })();
    return () => {
      alive = false;
    };
  }, [submissionId, router]);

  const toggleLike = async () => {
    if (!sub) return;
    setSub({
      ...sub,
      likedByMe: !sub.likedByMe,
      likeCount: sub.likeCount + (sub.likedByMe ? -1 : 1),
    });
    try {
      const res = await getAdapter().toggleLike(sub.id);
      setSub((prev) =>
        prev ? { ...prev, likedByMe: res.liked, likeCount: res.likeCount } : prev,
      );
    } catch {
      setSub((prev) =>
        prev
          ? {
              ...prev,
              likedByMe: !prev.likedByMe,
              likeCount: prev.likeCount + (prev.likedByMe ? -1 : 1),
            }
          : prev,
      );
    }
  };

  if (!photo || (!sub && !notFound)) {
    return <div className="screen" aria-busy />;
  }
  if (notFound || !sub) {
    return (
      <div className="screen center" style={{ gap: 14, padding: 24 }}>
        <span className="dim">That edit isn&apos;t in today&apos;s gallery.</span>
        <button className="btn" onClick={() => router.push('/gallery')}>
          ‹ Gallery
        </button>
      </div>
    );
  }

  const who = sub.aiModel ?? sub.displayName;
  const shownTone = compare ? DEFAULT_TONE : sub.settings.tone;

  const photoBlock = (
    <div className="onphoto" style={{ position: 'relative' }}>
      <Photo
        photo={photo}
        tone={shownTone}
        radius={isDesktop ? 'var(--r)' : undefined}
        style={{ width: '100%', aspectRatio: isDesktop ? '4 / 5' : '1 / 1' }}
      />
      <button
        type="button"
        className={`btn ghost sm ${styles.holdBtn}`}
        {...holdHandlers}
      >
        {compare ? 'Original' : 'Hold for original'}
      </button>
    </div>
  );

  const creatorRow = (
    <div className="row between">
      <div className="row" style={{ gap: 10 }}>
        <Avatar />
        {sub.aiModel ? (
          <span className="badge ai">{sub.aiModel}</span>
        ) : (
          <span style={{ fontWeight: 600 }}>{who}</span>
        )}
      </div>
      <button
        className="btn sm"
        onClick={toggleLike}
        style={
          sub.likedByMe
            ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
            : undefined
        }
      >
        {sub.likedByMe ? '♥' : '♡'} {sub.likeCount}
      </button>
    </div>
  );

  const recipe = (cols: number) => (
    <div
      className={styles.recipe}
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: cols > 1 ? '16px 28px' : '15px',
      }}
    >
      {TONE_KEYS.map((key) => (
        <Slider key={key} toneKey={key} value={sub.settings.tone[key]} read />
      ))}
    </div>
  );

  const loadAction = submittedToday ? (
    <div className={styles.comparisonOnly}>
      <span className="mono dim3" style={{ fontSize: 12, textAlign: 'center' }}>
        You&apos;ve locked today&apos;s edit. Hold for original to compare with
        the unedited photo.
      </span>
    </div>
  ) : (
    <>
      <button
        className="btn primary lg block"
        onClick={() => router.push(`/edit?from=${sub.id}`)}
      >
        Load these onto my photo
      </button>
      <span
        className="mono dim3"
        style={{ fontSize: 12, textAlign: 'center' }}
      >
        re-renders your raw photo with their exact values
      </span>
    </>
  );

  if (isDesktop) {
    return (
      <div className="screen">
        <div className={`row between ${styles.topNavDesk}`}>
          <button
            className="btn ghost sm"
            onClick={() => router.push('/gallery')}
          >
            ‹ Gallery
          </button>
          <span className="mono dim3" style={{ fontSize: 12 }}>
            edit · {sub.id.slice(0, 3)} · pipeline v1
          </span>
        </div>
        <div className={styles.deskGrid}>
          <div>{photoBlock}</div>
          <div className="col" style={{ gap: 22, paddingTop: 6 }}>
            {creatorRow}
            <div className="divider" />
            <div className="row between">
              <span className="eyebrow">The recipe</span>
              <span className="mono dim3" style={{ fontSize: 11 }}>
                v1
              </span>
            </div>
            {recipe(2)}
            {loadAction}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`screen ${styles.scroll}`}>
      <div style={{ position: 'relative' }}>
        {photoBlock}
        <div className={`row between ${styles.topNavPhone}`}>
          <button
            className={`btn ghost sm ${styles.backPhone}`}
            onClick={() => router.push('/gallery')}
          >
            ‹ Gallery
          </button>
        </div>
      </div>
      <div className={`col ${styles.phoneBody}`}>
        {creatorRow}
        <div className="divider" />
        <div className="row between">
          <span className="eyebrow">The recipe</span>
          <span className="mono dim3" style={{ fontSize: 11 }}>
            v1
          </span>
        </div>
        {recipe(1)}
        {loadAction}
      </div>
    </div>
  );
}
