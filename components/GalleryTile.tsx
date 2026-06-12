'use client';

/**
 * GalleryTile — one 1:1 gallery cell. Re-renders the submission CLIENT-SIDE from
 * `settings + the cached daily photo` (invariant #1). Uses the SHARED offscreen
 * renderer (renderManager) to produce ONE cached dataURL per submission rather
 * than spinning up a live canvas per tile. Realized lazily via Intersection
 * Observer. When no shared renderer exists (tier C), falls back to a live
 * CSS-filter <Photo> for this tile.
 */
import { useEffect, useRef, useState } from 'react';
import type { DailyPhoto, Submission } from '@/lib/types';
import { Photo } from '@/components/Photo';
import { Avatar } from '@/components/Avatar';
import {
  isSharedAvailable,
  renderToneToUrl,
} from '@/components/renderManager';
import styles from './GalleryTile.module.css';

interface GalleryTileProps {
  photo: DailyPhoto;
  submission: Submission;
  /** True once the shared renderer init has resolved (avail or not). */
  rendererReady: boolean;
  onOpen: () => void;
  onToggleLike: (e: React.MouseEvent) => void;
}

export function GalleryTile({
  photo,
  submission,
  rendererReady,
  onOpen,
  onToggleLike,
}: GalleryTileProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // Lazy realize on viewport entry.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Render the tone to a cached dataURL via the shared renderer when ready.
  useEffect(() => {
    if (!visible || !rendererReady || !isSharedAvailable()) return;
    let alive = true;
    renderToneToUrl(submission.settings.tone).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [visible, rendererReady, submission.settings.tone]);

  const useCssFallback = rendererReady && !isSharedAvailable();
  const who = submission.aiModel ?? submission.displayName;

  const meta = (
    <>
      {submission.aiModel ? (
        <span className={styles.corner}>
          <span className="badge ai">AI</span>
        </span>
      ) : null}
      <div className={styles.scrim} />
      <div className={styles.tmeta}>
        <span className="row" style={{ gap: 6, minWidth: 0 }}>
          <Avatar />
          <span className={`mono ${styles.who}`}>{who}</span>
        </span>
        <span
          onClick={onToggleLike}
          className="heart"
          style={{
            color: submission.likedByMe ? 'var(--accent)' : '#fff',
          }}
        >
          {submission.likedByMe ? '♥' : '♡'} {submission.likeCount}
        </span>
      </div>
    </>
  );

  return (
    <div
      ref={ref}
      className={`tile onphoto ${styles.tile}`}
      onClick={onOpen}
    >
      {useCssFallback ? (
        <Photo
          photo={photo}
          tone={submission.settings.tone}
          style={{ aspectRatio: '1 / 1' }}
        >
          {meta}
        </Photo>
      ) : (
        <div className={styles.canvasCell}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={styles.thumb} aria-hidden />
          ) : (
            <div className={styles.placeholder} aria-hidden />
          )}
          {meta}
        </div>
      )}
    </div>
  );
}
