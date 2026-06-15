'use client';

/**
 * Photo — the daily photo rendered with a given tone.
 *
 * Live mode: owns a WebGL2 renderer (createV1Renderer + decodeMaster16) bound to
 * a <canvas> sized to the master's native resolution and CSS-scaled to fit
 * (PRD §6.2.1 canonical-resolution rule). On every `tone` change it re-issues the
 * single draw (uniforms-only update).
 *
 * Tier-C fallback: when no renderer can be created (or decode failed), renders an
 * <img> of preview8 with the CSS-filter approximation + two blend overlays, and
 * surfaces `onTier('C')` so the caller can show a "compatibility mode" note.
 * This fallback is explicitly NOT part of the determinism contract.
 */
import { useEffect, useRef, useState } from 'react';
import type { ToneSettings } from '@/lib/types';
import type { DailyPhoto } from '@/lib/types';
import {
  createV1Renderer,
  getDecodedMaster,
  type V1Renderer,
} from '@/lib/render';
import { toCssFilter } from './cssFilter';
import styles from './Photo.module.css';

export type RenderTier = 'A' | 'B' | 'C';

// The decoded-master fetch/decode + cache lives in lib/render/masterCache so the
// editor (<Photo>), the gallery's shared offscreen renderer, and the inspect
// view all coalesce onto ONE fetch+decode per photo. It prefers the two-plane
// WebP delivery (PRD §6.2.1 amendment 2026-06-12), falling back to master16.png.

interface PhotoProps {
  photo: DailyPhoto;
  tone: ToneSettings;
  /** Visual radius (CSS length). */
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Scrim gradient over the image (landing/tiles). */
  scrim?: 'soft' | 'full';
  /**
   * How the rendered canvas / fallback img fills the box. `cover` (default)
   * center-crops — used by the square gallery tiles, inspect, landing hero and
   * share frames. `contain` shows the whole photo with no crop or distortion —
   * used by the editor stage, whose frame adopts the photo's aspect ratio.
   */
  fit?: 'cover' | 'contain';
  /** Notified once the effective tier is known. */
  onTier?: (tier: RenderTier) => void;
  /** Fired when the photo genuinely can't load (tier-C preview also failed). */
  onError?: () => void;
  /**
   * Show the streaming/decoding progress overlay (thin accent bar + mono % over
   * the recessed letterbox) while the master loads. Opt-in — the editor photo
   * stage sets this; small gallery/preview tiles reuse the cached decode and
   * leave it off. Gated by prefers-reduced-motion (no transition when reduced).
   */
  showProgress?: boolean;
  /**
   * Optional capture handle. Photo sets `.current` to a function that snapshots
   * the live WebGL canvas to a PNG data-URL (or null on tier C / before load).
   * Lets a caller reuse an already-rendered frame instead of mounting another
   * WebGL context (e.g. the ConfirmReveal preview).
   */
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
  children?: React.ReactNode;
}

export function Photo({
  photo,
  tone,
  radius,
  className = '',
  style,
  scrim,
  onTier,
  onError,
  captureRef,
  children,
  showProgress = false,
  fit = 'cover',
}: PhotoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<V1Renderer | null>(null);
  const [tier, setTier] = useState<RenderTier | null>(null);
  // Master streaming/decode progress while loading; null once rendered.
  //   number  → byte-accurate fraction 0..1 (Content-Length present)
  //   'pulse' → total unknown; show an indeterminate (pulsing) bar, no percent
  const [progress, setProgress] = useState<number | 'pulse' | null>(
    showProgress ? 0 : null,
  );

  // Create + load the renderer once per photo.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createV1Renderer(canvas);
    if (!renderer) {
      if (!cancelled) {
        // Sync the external WebGL capability (tier C) into React state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTier('C');
        onTier?.('C');
      }
      return;
    }
    rendererRef.current = renderer;

    if (showProgress) setProgress(0);
    (async () => {
      try {
        const master = await getDecodedMaster(
          photo,
          showProgress
            ? (p) => {
                if (!cancelled) setProgress(p.indeterminate ? 'pulse' : p.fraction);
              }
            : undefined,
        );
        if (cancelled) return;
        canvas.width = master.width;
        canvas.height = master.height;
        renderer.setSource(master);
        renderer.render(tone);
        const t = renderer.tier;
        setTier(t);
        onTier?.(t);
        setProgress(null);
      } catch {
        if (cancelled) return;
        renderer.destroy();
        rendererRef.current = null;
        setTier('C');
        onTier?.('C');
        setProgress(null);
      }
    })();

    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // photo identity drives re-init; tone re-renders happen in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id, photo.master16Url]);

  // Re-render on tone change (uniforms-only).
  useEffect(() => {
    const r = rendererRef.current;
    if (r && tier !== 'C') r.render(tone);
  }, [tone, tier]);

  // Expose a snapshot fn to the optional captureRef. We re-issue the draw right
  // before reading the pixels so the drawing buffer is guaranteed populated even
  // without preserveDrawingBuffer (render + toDataURL run in the same task).
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const r = rendererRef.current;
      const canvas = canvasRef.current;
      if (!r || !canvas || tier === 'C') return null;
      try {
        r.render(tone);
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    };
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [captureRef, tone, tier]);

  const css = tier === 'C' ? toCssFilter(tone) : null;

  return (
    <div
      className={`${styles.photo} ${fit === 'contain' ? styles.fitContain : ''} ${className}`}
      style={{ borderRadius: radius, ...style }}
    >
      {/* WebGL canvas — hidden until a non-C tier is confirmed */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ display: tier === 'C' ? 'none' : 'block' }}
        aria-hidden
      />

      {/* Tier-C CSS-filter fallback */}
      {tier === 'C' && css ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.preview8Url}
            alt=""
            className={styles.img}
            style={{ filter: css.filter }}
            onError={() => onError?.()}
            aria-hidden
          />
          <div className={styles.ov} style={{ background: css.temp }} />
          <div
            className={styles.ov}
            style={{ background: css.tint, mixBlendMode: 'soft-light' }}
          />
        </>
      ) : null}

      {/* Loading progress — thin accent bar + mono percentage over the
          recessed letterbox while the master streams/decodes. Shown only when
          the caller opts in (editor photo stage) and a tier isn't resolved yet.
          Sentence-case label per the Darkroom token system. */}
      {showProgress && progress !== null && tier === null ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <div className={styles.loadingLabel}>
            {progress === 'pulse'
              ? 'Loading master…'
              : `Loading master — ${Math.round(progress * 100)}%`}
          </div>
          <div className={styles.loadingTrack}>
            {progress === 'pulse' ? (
              // Total unknown — indeterminate pulse (reduced-motion: static
              // half-fill, handled in CSS).
              <div className={`${styles.loadingBar} ${styles.loadingBarPulse}`} />
            ) : (
              <div
                className={styles.loadingBar}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            )}
          </div>
        </div>
      ) : null}

      {scrim ? (
        <div className={scrim === 'soft' ? styles.scrimSoft : styles.scrim} />
      ) : null}
      {children}
    </div>
  );
}
