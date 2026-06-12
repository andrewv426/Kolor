'use client';

/**
 * Editor — layout E2 "full slider list". The 5-minute game.
 *
 * - Photo stage (live Photo / tier-C fallback with a "compatibility mode" note).
 * - 10 sliders (SLIDER_META), mono value readouts, double-click-to-reset/slider.
 * - 5:00 countdown (mono, .warn ≤60s, auto-submit at 0:00 with current sliders).
 * - Press-and-hold compare (shows the unedited original).
 * - Reset, Submit → R1 confirm sheet ("Lock it in?") → adapter.submitEdit →
 *   route to /gallery.
 * - Photo-error overlay with Retry.
 * - ?from=<id> preloads another player's tone (pre-submit only).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DailyPhoto } from '@/lib/types';
import { TONE_KEYS } from '@/lib/types';
import { getAdapter } from '@/lib/data';
import { Photo, type RenderTier } from '@/components/Photo';
import { Slider } from '@/components/Slider';
import { useAppState } from '@/components/AppState';
import { useIsDesktop } from '@/components/useIsDesktop';
import { fmtClock } from '@/components/time';
import { DEFAULT_TONE } from '@/lib/types';
import styles from './EditorScreen.module.css';

const ROUND_SECONDS = 5 * 60;
const ROUND_MS = ROUND_SECONDS * 1000;

export function EditorScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const isDesktop = useIsDesktop();
  const { tone, setToneVal, setTone, resetTone } = useAppState();

  const [photo, setPhoto] = useState<DailyPhoto | null>(null);
  const [left, setLeft] = useState(ROUND_SECONDS);
  const [compare, setCompare] = useState(false);
  const [tier, setTier] = useState<RenderTier | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const startedAt = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const loadedFrom = useRef<string | null>(null);
  // Capture handle into the live editor Photo: lets ConfirmReveal reuse the
  // already-rendered frame as a flat <img> instead of mounting two more WebGL
  // contexts (which would re-decode the master and triple the live contexts).
  const captureRef = useRef<(() => string | null) | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const openConfirm = useCallback(() => {
    setSnapshot(captureRef.current?.() ?? null);
    setConfirmOpen(true);
  }, []);

  // Stamp the round-start time once, on mount (client-side only).
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // Load today's photo + (optionally) a recipe from ?from=<id>.
  useEffect(() => {
    let alive = true;
    const adapter = getAdapter();
    (async () => {
      const today = await adapter.getToday();
      if (!alive) return;
      setPhoto(today);

      const fromId = params.get('from');
      if (fromId && loadedFrom.current !== fromId) {
        loadedFrom.current = fromId;
        // Pre-submit only: if the user already submitted, the gallery gate sends
        // them elsewhere; here we just apply the recipe to the working tone.
        const gallery = await adapter.getGallery(today.id).catch(() => []);
        const src = gallery.find((s) => s.id === fromId);
        if (alive && src) setTone(src.settings.tone);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current || !photo) return;
    submittedRef.current = true;
    setSubmitting(true);
    // Cap at the round length: clock drift / a late auto-submit tick must never
    // record a wall-clock time past the 5:00 cap. Floor at 0 defensively.
    const elapsed = Date.now() - (startedAt.current ?? Date.now());
    const timeTakenMs = Math.max(0, Math.min(ROUND_MS, elapsed));
    try {
      await getAdapter().submitEdit(photo.id, tone, timeTakenMs);
    } catch {
      // One-submission-per-day or transient failure — proceed to gallery, which
      // will show the existing submission. (Server UNIQUE is the real guard.)
    }
    router.push('/gallery');
  }, [photo, tone, router]);

  // Countdown — driven by absolute deadline math (startedAt + ROUND_MS), not by
  // accumulating setTimeout ticks, so drift can't push the wall clock past the
  // cap before auto-submit fires. We recompute remaining seconds every tick and
  // auto-submit as-is (no confirm) the moment the deadline passes.
  useEffect(() => {
    const tick = () => {
      const started = startedAt.current ?? Date.now();
      const remainingMs = started + ROUND_MS - Date.now();
      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      setLeft(secs);
      if (remainingMs <= 0) void doSubmit();
    };
    tick(); // sync immediately so first paint reflects real remaining time
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [doSubmit]);

  const retry = () => {
    setPhotoError(false);
    setTier(null);
    setPhotoKey((k) => k + 1);
  };

  if (!photo) {
    return <div className="screen" aria-busy />;
  }

  const shownTone = compare ? DEFAULT_TONE : tone;

  const topBar = (
    <div className={`row between ${styles.topBar}`}>
      <button
        className="btn ghost sm"
        style={{ color: '#f2eee5' }}
        onClick={() => router.push('/')}
      >
        ‹ Exit
      </button>
      <div className="row" style={{ gap: 9 }}>
        <span className="badge solid">Day {photo.dayNumber}</span>
        <span className={`timer ${left <= 60 ? 'warn' : ''}`}>
          {fmtClock(left)}
        </span>
      </div>
    </div>
  );

  const compareBtn = (
    <button
      className={`btn ghost sm ${styles.compareBtn}`}
      onMouseDown={() => setCompare(true)}
      onMouseUp={() => setCompare(false)}
      onMouseLeave={() => setCompare(false)}
      onTouchStart={(e) => {
        e.preventDefault();
        setCompare(true);
      }}
      onTouchEnd={() => setCompare(false)}
    >
      {compare ? 'Before' : isDesktop ? 'Hold to compare' : 'Tap to compare'}
    </button>
  );

  const tierNote =
    tier === 'C' ? (
      <div className={styles.compatNote}>
        <span className="mono">compatibility mode</span>
        <span className="dim" style={{ fontSize: 12 }}>
          your device can&apos;t run the full editor — showing an approximate
          preview
        </span>
      </div>
    ) : null;

  const sliderList = (
    <div className="col" style={{ gap: 20 }}>
      {TONE_KEYS.map((key) => (
        <Slider
          key={key}
          toneKey={key}
          value={tone[key]}
          onChange={(v) => setToneVal(key, v)}
        />
      ))}
    </div>
  );

  const photoStage = (
    <Photo
      key={photoKey}
      photo={photo}
      tone={shownTone}
      onTier={setTier}
      onError={() => setPhotoError(true)}
      captureRef={captureRef}
      style={{ position: 'absolute', inset: 0 }}
      radius={isDesktop ? 'var(--r)' : undefined}
    />
  );

  const errorOverlay = photoError ? (
    <div className={styles.errOverlay}>
      <div className={styles.errGlyph}>⚠</div>
      <div className="col center" style={{ gap: 5, textAlign: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 16, color: '#fff' }}>
          Couldn&apos;t load today&apos;s photo
        </span>
        <span className="dim" style={{ fontSize: 13.5 }}>
          Your edits are saved. Check your connection and retry.
        </span>
      </div>
      <button className="btn" onClick={retry}>
        Retry
      </button>
    </div>
  ) : null;

  return (
    <div className="screen">
      {isDesktop ? (
        <DesktopLayout
          topBar={topBar}
          photoStage={photoStage}
          errorOverlay={errorOverlay}
          compareBtn={photoError ? null : compareBtn}
          tierNote={tierNote}
          sliderList={sliderList}
          onReset={resetTone}
          onSubmit={openConfirm}
        />
      ) : (
        <PhoneLayout
          topBar={topBar}
          photoStage={photoStage}
          errorOverlay={errorOverlay}
          compareBtn={photoError ? null : compareBtn}
          tierNote={tierNote}
          sliderList={sliderList}
          onReset={resetTone}
          onSubmit={openConfirm}
        />
      )}

      {confirmOpen && (
        <ConfirmReveal
          photo={photo}
          tone={tone}
          snapshot={snapshot}
          submitting={submitting}
          desktop={isDesktop}
          onKeepEditing={() => setConfirmOpen(false)}
          onLock={doSubmit}
        />
      )}
    </div>
  );
}

/* ----------------------------- layouts -------------------------------- */

interface LayoutProps {
  topBar: React.ReactNode;
  photoStage: React.ReactNode;
  errorOverlay: React.ReactNode;
  compareBtn: React.ReactNode;
  tierNote: React.ReactNode;
  sliderList: React.ReactNode;
  onReset: () => void;
  onSubmit: () => void;
}

function DesktopLayout(p: LayoutProps) {
  return (
    <div className={styles.deskGrid}>
      {p.topBar}
      <div className={`onphoto ${styles.deskStage}`}>
        <div className={styles.deskPhotoFrame}>
          {p.photoStage}
          {p.errorOverlay}
          {p.compareBtn ? (
            <div className={styles.compareSlot}>{p.compareBtn}</div>
          ) : null}
        </div>
      </div>
      <div className={`col ${styles.deskPanel}`}>
        <div className={`row between ${styles.panelHead}`}>
          <span className="h-md">Adjust</span>
          <span className="mono dim3" style={{ fontSize: 12 }}>
            10 sliders
          </span>
        </div>
        <div className={`fill1 ${styles.panelScroll}`}>
          {p.tierNote}
          {p.sliderList}
        </div>
        <div className={`row between ${styles.panelFoot}`}>
          <button className="btn ghost" onClick={p.onReset}>
            Reset
          </button>
          <button className="btn primary fill1" onClick={p.onSubmit}>
            Submit edit
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneLayout(p: LayoutProps) {
  return (
    <>
      <div className={`onphoto ${styles.phoneStage}`}>
        {p.photoStage}
        {p.errorOverlay}
        {p.topBar}
        {p.compareBtn ? (
          <div className={styles.compareSlotPhone}>{p.compareBtn}</div>
        ) : null}
      </div>
      <div className={`fill1 ${styles.phoneScroll}`}>
        <div className="row between" style={{ marginBottom: 18 }}>
          <span className="eyebrow">Adjust</span>
          <span className="mono dim3" style={{ fontSize: 12 }}>
            10 sliders
          </span>
        </div>
        {p.tierNote}
        {p.sliderList}
        <div style={{ height: 8 }} />
      </div>
      <div className={`row between ${styles.phoneFoot}`}>
        <button className="btn ghost" onClick={p.onReset}>
          Reset
        </button>
        <button className="btn primary fill1" onClick={p.onSubmit}>
          Submit
        </button>
      </div>
    </>
  );
}

/* -------------------------- R1 confirm sheet --------------------------- */

function ConfirmReveal({
  photo,
  tone,
  snapshot,
  submitting,
  desktop,
  onKeepEditing,
  onLock,
}: {
  photo: DailyPhoto;
  tone: typeof DEFAULT_TONE;
  /** PNG data-URL of the already-rendered editor frame, if capture succeeded. */
  snapshot: string | null;
  submitting: boolean;
  desktop: boolean;
  onKeepEditing: () => void;
  onLock: () => void;
}) {
  // Reuse the editor's rendered frame as a flat <img> so we don't spin up two
  // more WebGL contexts + master decodes. Fall back to a single live Photo only
  // if capture wasn't available (e.g. tier-C device).
  const backdrop = snapshot ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={snapshot}
      alt=""
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  ) : (
    <Photo photo={photo} tone={tone} style={{ position: 'absolute', inset: 0 }} />
  );

  const thumb = snapshot ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={snapshot}
      alt=""
      style={{
        width: 96,
        height: 120,
        objectFit: 'cover',
        borderRadius: 'var(--r-sm)',
      }}
    />
  ) : (
    <Photo
      photo={photo}
      tone={tone}
      radius="var(--r-sm)"
      style={{ width: 96, height: 120 }}
    />
  );

  return (
    <div className={styles.revealRoot}>
      <div className="onphoto" style={{ position: 'absolute', inset: 0 }}>
        {backdrop}
      </div>
      <div className={styles.revealScrim} />
      <div
        className={styles.revealCenter}
        style={{ justifyContent: desktop ? 'center' : 'flex-end' }}
      >
        <div
          className={`sheet onphoto ${styles.sheet} ${
            desktop ? styles.sheetDesk : ''
          }`}
        >
          {!desktop && <div className={styles.grabber} />}
          <div className="col center" style={{ gap: 16, textAlign: 'center' }}>
            {thumb}
            <div className="col" style={{ gap: 7 }}>
              <span className="h-md">Lock it in?</span>
              <span className="dim" style={{ fontSize: 14.5 }}>
                You can&apos;t re-edit today&apos;s photo once you submit. Your
                look joins the gallery.
              </span>
            </div>
            <div
              className="row"
              style={{ gap: 10, width: '100%', marginTop: 4 }}
            >
              <button
                className="btn fill1"
                onClick={onKeepEditing}
                disabled={submitting}
              >
                Keep editing
              </button>
              <button
                className="btn primary fill1"
                onClick={onLock}
                disabled={submitting}
              >
                {submitting ? 'Locking…' : 'Lock & reveal'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
