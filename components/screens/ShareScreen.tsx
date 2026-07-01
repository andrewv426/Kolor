'use client';

/**
 * Result / Share — treatment S3 "receipt stub". A narrow mono receipt: header,
 * the edit (1:1), PLAYER / RANK / LIKES / TIME rows, COLOR SIGNATURE swatch row,
 * NEXT PHOTO countdown. "Copy card" copies a text summary to the clipboard;
 * actual share-image (canvas → PNG) rendering is stubbed with a TODO.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DailyPhoto, Submission } from '@/lib/types';
import { getAdapter } from '@/lib/data';
import { computePlacement, formatRank, type Placement } from '@/lib/placement';
import { Photo } from '@/components/Photo';
import { Signature } from '@/components/Signature';
import { useUtcCountdown } from '@/components/useCountdown';
import { fmtClock, fmtCountdown } from '@/components/time';
import styles from './ShareScreen.module.css';

export function ShareScreen() {
  const router = useRouter();
  const ms = useUtcCountdown();

  const [photo, setPhoto] = useState<DailyPhoto | null>(null);
  const [mine, setMine] = useState<Submission | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const adapter = getAdapter();
    (async () => {
      const today = await adapter.getToday();
      if (!alive) return;
      setPhoto(today);
      const sub = await adapter.getMySubmission(today.id);
      if (!alive) return;
      if (!sub) {
        router.replace('/');
        return;
      }
      setMine(sub);
      // Compute the real placement from the day's gallery (replaces the old
      // hardcoded "TOP 8%"). Commit-reveal is already satisfied — we just
      // confirmed this user's own submission exists.
      const gallery = await adapter.getGallery(today.id);
      if (!alive) return;
      setPlacement(computePlacement(gallery, sub.id));
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  if (!photo || !mine) {
    return <div className="screen" aria-busy />;
  }

  const player = (mine.displayName || 'ANONYMOUS').toUpperCase();
  const rankStr = formatRank(placement).toUpperCase();
  const likes = mine.likeCount;
  const timeStr =
    mine.timeTakenMs != null ? fmtClock(mine.timeTakenMs / 1000) : '—';

  // TODO(share): render an actual share PNG (canvas → blob) of this receipt.
  // For now, "Copy card" copies a spoiler-safe text summary; "Share" uses the
  // Web Share API when available, else falls back to copying the same text.
  const cardText =
    `color-gradle · Day ${photo.dayNumber} — ${photo.theme}\n` +
    `Player: ${player}\nRank: ${rankStr}\nLikes: ${likes} ♥\nTime: ${timeStr}\n` +
    `Next photo in ${fmtCountdown(ms)}`;

  const copyCard = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cardText);
      } else {
        // Fallback for environments without the async clipboard API.
        const ta = document.createElement('textarea');
        ta.value = cardText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'color-gradle', text: cardText });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    void copyCard();
  };

  return (
    <div className={`screen center ${styles.root}`}>
      <div className={`card ${styles.receipt}`}>
        <div className="col center" style={{ gap: 3 }}>
          <span className={styles.brand}>COLOR·GRADLE</span>
          <span className={styles.sub}>
            Day {photo.dayNumber} — {photo.theme}
          </span>
        </div>
        <div className={styles.dashed} />
        <div className="onphoto">
          <Photo
            photo={photo}
            tone={mine.settings.tone}
            radius="var(--r-xs)"
            style={{ width: '100%', aspectRatio: '1 / 1' }}
          />
        </div>
        <div className={styles.dashed} />
        <Row k="PLAYER" v={player} />
        <Row k="RANK" v={rankStr} />
        <Row k="LIKES" v={`${likes} ♥`} />
        <Row k="TIME" v={timeStr} />
        <div className={styles.dashed} />
        <span className={styles.sigLabel}>COLOR SIGNATURE</span>
        <Signature tone={mine.settings.tone} n={6} />
        <div className={styles.dashed} />
        <span className={styles.footer}>
          ✦ NEXT PHOTO IN {fmtCountdown(ms)} ✦
        </span>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn" onClick={() => router.push('/gallery')}>
          ‹ Gallery
        </button>
        <button className="btn" onClick={copyCard}>
          {copied ? 'Copied' : 'Copy card'}
        </button>
        <button className="btn primary" onClick={share}>
          Share
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={`row between mono ${styles.row}`}>
      <span className="dim">{k}</span>
      <span>{v}</span>
    </div>
  );
}
