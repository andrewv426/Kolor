'use client';

/**
 * Landing ("Today") — screen 1. Phone full-bleed + desktop two-column.
 * Day badge, theme title, "Play today's photo" CTA, "How to play" modal,
 * 4:5 contained hero (desktop) / full-bleed (phone), and the returning/played
 * state (your edit thumb, rank, likes, countdown to next UTC midnight,
 * "See today's gallery").
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DailyPhoto, Submission } from '@/lib/types';
import { getAdapter } from '@/lib/data';
import { computePlacement, formatRank, type Placement } from '@/lib/placement';
import { preloadMaster } from '@/lib/render';
import { DEFAULT_TONE } from '@/lib/types';
import { Photo } from '@/components/Photo';
import { Smiley } from '@/components/Smiley';
import { HowToModal } from '@/components/HowToModal';
import { useAppState } from '@/components/AppState';
import { useIsDesktop } from '@/components/useIsDesktop';
import { useUtcCountdown } from '@/components/useCountdown';
import { fmtCountdown } from '@/components/time';
import styles from './LandingScreen.module.css';

export function LandingScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { howToSeen, markHowToSeen } = useAppState();

  // DEV-only: link to the local-mode /admin photo switcher (gated like devRetry).
  const isLocal = getAdapter().mode === 'local';

  const [photo, setPhoto] = useState<DailyPhoto | null>(null);
  const [mine, setMine] = useState<Submission | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    let alive = true;
    const adapter = getAdapter();
    (async () => {
      const today = await adapter.getToday();
      if (!alive) return;
      // Warm the shared master cache the instant the photo is known so the
      // ~7.8 MB plane fetch + decode starts before the hero <Photo> mounts and
      // is ready when the user clicks into the editor / gallery.
      preloadMaster(today);
      setPhoto(today);
      const sub = await adapter.getMySubmission(today.id);
      if (!alive) return;
      setMine(sub);
      // If already played, compute the real placement from the day's gallery
      // for the "played" block (replaces the old hardcoded "Top 8%").
      if (sub) {
        const gallery = await adapter.getGallery(today.id);
        if (!alive) return;
        setPlacement(computePlacement(gallery, sub.id));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // First-run modal: open once the persisted "seen" flag hydrates to false.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!howToSeen) setShowHowTo(true);
  }, [howToSeen]);

  const closeHowTo = () => {
    setShowHowTo(false);
    if (!howToSeen) markHowToSeen();
  };

  if (!photo) {
    return <div className={`screen ${styles.loading}`} aria-busy />;
  }

  const played = mine !== null;
  const dateline = new Date().toLocaleDateString('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const modal = showHowTo ? <HowToModal onClose={closeHowTo} /> : null;

  if (isDesktop) {
    return (
      <div className={`screen ${styles.deskScreen}`}>
        <div className={styles.deskGrid}>
          <div className="col" style={{ gap: 22 }}>
            <div className="row" style={{ gap: 10 }}>
              <Smiley />
              <span className={styles.wordmark}>color-gradle</span>
              {isLocal && (
                <Link href="/admin" className="btn ghost sm">
                  Admin
                </Link>
              )}
            </div>
            <div style={{ height: 8 }} />
            <div className="eyebrow">
              Day {photo.dayNumber} &nbsp;·&nbsp; {dateline}
            </div>
            <h1 className="h-xl">{photo.theme}</h1>
            {!played && (
              <p className={`dim ${styles.lede}`}>
                One unedited photo. Five minutes. Ten sliders. Submit your look
                to see how everyone, human and AI, edited the same shot.
              </p>
            )}
            {played ? (
              <PlayedBlock
                photo={photo}
                mine={mine}
                placement={placement}
                router={router}
                desktop
              />
            ) : (
              <div className="row" style={{ gap: 14, marginTop: 6 }}>
                <button
                  className="btn primary lg"
                  onClick={() => router.push('/edit')}
                >
                  Play today&apos;s photo
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setShowHowTo(true)}
                >
                  How to play
                </button>
              </div>
            )}
          </div>

          <div className={`onphoto ${styles.heroWrap}`}>
            <Photo
              photo={photo}
              tone={DEFAULT_TONE}
              radius="var(--r)"
              scrim="soft"
              style={{ aspectRatio: '4 / 5', boxShadow: 'var(--shadow)' }}
            >
              <div className={styles.heroBadges}>
                <span className="badge solid">Day {photo.dayNumber}</span>
                <span className="badge">Unedited</span>
              </div>
            </Photo>
          </div>
        </div>
        {modal}
      </div>
    );
  }

  // Phone — true full-bleed.
  return (
    <div className={`screen onphoto`}>
      <Photo
        photo={photo}
        tone={DEFAULT_TONE}
        scrim="full"
        style={{ position: 'absolute', inset: 0 }}
      >
        <div className={styles.phoneInner}>
          <div className="row" style={{ gap: 9 }}>
            <Smiley size={20} />
            <span className={styles.wordmark}>color-gradle</span>
            {isLocal && (
              <Link href="/admin" className="badge solid">
                Admin
              </Link>
            )}
          </div>
          <div className="fill1" />
          <span
            className="badge solid"
            style={{ alignSelf: 'flex-start', marginBottom: 14 }}
          >
            Day {photo.dayNumber}
          </span>
          <div className="eyebrow" style={{ color: '#e9e2d3' }}>
            Today&apos;s theme
          </div>
          <h1 className="h-lg" style={{ marginTop: 8, color: '#fff' }}>
            {photo.theme}
          </h1>

          {played ? (
            <PlayedBlock
              photo={photo}
              mine={mine}
              placement={placement}
              router={router}
            />
          ) : (
            <>
              <button
                className="btn primary lg block"
                style={{ marginTop: 20 }}
                onClick={() => router.push('/edit')}
              >
                Play today&apos;s photo
              </button>
              <div className="row between" style={{ marginTop: 14 }}>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: '#d8d1c3' }}
                >
                  5:00 · no login
                </span>
                <span
                  onClick={() => setShowHowTo(true)}
                  className={styles.howToLink}
                >
                  How to play
                </span>
              </div>
            </>
          )}
        </div>
      </Photo>
      {modal}
    </div>
  );
}

function PlayedBlock({
  photo,
  mine,
  placement,
  router,
  desktop = false,
}: {
  photo: DailyPhoto;
  mine: Submission | null;
  placement: Placement | null;
  router: ReturnType<typeof useRouter>;
  desktop?: boolean;
}) {
  const ms = useUtcCountdown();
  const likes = mine?.likeCount ?? 0;

  // DEV/testing only (local mode): reset the one-per-day lock and re-enter the
  // editor so multiple edits can be submitted. Null in production.
  const adapter = getAdapter();
  const devRetry =
    adapter.mode === 'local' && adapter.resetSubmissions
      ? async () => {
          await adapter.resetSubmissions!();
          router.push('/edit');
        }
      : null;

  if (desktop) {
    return (
      <div className="col" style={{ gap: 16, marginTop: 2 }}>
        <div className="row" style={{ gap: 14, alignItems: 'center' }}>
          <div className="onphoto" style={{ flex: '0 0 auto' }}>
            <Photo
              photo={photo}
              tone={mine?.settings.tone ?? DEFAULT_TONE}
              radius="var(--r-sm)"
              style={{ width: 72, height: 90 }}
            />
          </div>
          <div className="col" style={{ gap: 5 }}>
            <span className="row" style={{ gap: 8 }}>
              <span className="badge accent">✓ Played</span>
              {placement ? (
                <span style={{ fontWeight: 600 }}>{formatRank(placement)}</span>
              ) : null}
            </span>
            <span className="mono dim" style={{ fontSize: 13 }}>
              {likes} ♥ · ranked by likes
            </span>
            <span className="mono dim3" style={{ fontSize: 12 }}>
              Next photo in {fmtCountdown(ms)}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button
            className="btn primary lg"
            onClick={() => router.push('/gallery')}
          >
            See today&apos;s gallery
          </button>
          <button className="btn lg" onClick={() => router.push('/result')}>
            Share result
          </button>
          {devRetry ? (
            <button
              className="btn ghost lg"
              title="Dev only: clears your submission so you can edit and submit again"
              onClick={devRetry}
            >
              ↺ Play again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 12, marginTop: 16 }}>
      <div className="row" style={{ gap: 11, alignItems: 'center' }}>
        <div className="onphoto" style={{ flex: '0 0 auto' }}>
          <Photo
            photo={photo}
            tone={mine?.settings.tone ?? DEFAULT_TONE}
            radius="8px"
            style={{ width: 46, height: 58 }}
          />
        </div>
        <div className="col" style={{ gap: 3 }}>
          <span className="row" style={{ gap: 7 }}>
            <span className="badge accent">✓ Played</span>
            {placement ? (
              <span
                style={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatRank(placement)}
              </span>
            ) : null}
          </span>
          <span
            className="mono"
            style={{ fontSize: 11.5, color: '#d8d1c3', whiteSpace: 'nowrap' }}
          >
            {likes} ♥ · next in {fmtCountdown(ms)}
          </span>
        </div>
      </div>
      <button
        className="btn primary lg block"
        onClick={() => router.push('/gallery')}
      >
        See today&apos;s gallery
      </button>
      {devRetry ? (
        <button
          className="btn ghost block"
          title="Dev only: clears your submission so you can edit and submit again"
          onClick={devRetry}
        >
          ↺ Play again
        </button>
      ) : null}
    </div>
  );
}
