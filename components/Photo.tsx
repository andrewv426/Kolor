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
  decodeMaster16,
  type V1Renderer,
} from '@/lib/render';
import { toCssFilter } from './cssFilter';
import styles from './Photo.module.css';

export type RenderTier = 'A' | 'B' | 'C';

interface PhotoProps {
  photo: DailyPhoto;
  tone: ToneSettings;
  /** Visual radius (CSS length). */
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Scrim gradient over the image (landing/tiles). */
  scrim?: 'soft' | 'full';
  /** Notified once the effective tier is known. */
  onTier?: (tier: RenderTier) => void;
  /** Fired when the photo genuinely can't load (tier-C preview also failed). */
  onError?: () => void;
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
  children,
}: PhotoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<V1Renderer | null>(null);
  const [tier, setTier] = useState<RenderTier | null>(null);

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

    (async () => {
      try {
        const res = await fetch(photo.master16Url);
        if (!res.ok) throw new Error(`master ${res.status}`);
        const buf = await res.arrayBuffer();
        const master = await decodeMaster16(buf);
        if (cancelled) return;
        canvas.width = master.width;
        canvas.height = master.height;
        renderer.setSource(master);
        renderer.render(tone);
        const t = renderer.tier;
        setTier(t);
        onTier?.(t);
      } catch {
        if (cancelled) return;
        renderer.destroy();
        rendererRef.current = null;
        setTier('C');
        onTier?.('C');
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

  const css = tier === 'C' ? toCssFilter(tone) : null;

  return (
    <div
      className={`${styles.photo} ${className}`}
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

      {scrim ? (
        <div className={scrim === 'soft' ? styles.scrimSoft : styles.scrim} />
      ) : null}
      {children}
    </div>
  );
}
