'use client';

/**
 * Slider — one labelled tone slider (−100..+100, integer steps). Ported from
 * design_handoff/hifi/ui.jsx → Slider. `read` renders the recipe view (knob +
 * fill, no input). Double-click resets to 0 (editor only).
 */
import type { ToneKey } from '@/lib/types';
import { SLIDER_META } from '@/lib/types';
import styles from './Slider.module.css';

interface SliderProps {
  toneKey: ToneKey;
  value: number;
  onChange?: (value: number) => void;
  /** Read-only recipe rendering (no input element). */
  read?: boolean;
}

export function Slider({ toneKey, value, onChange, read }: SliderProps) {
  const meta = SLIDER_META[toneKey];
  const pct = (value + 100) / 2;
  const fillLeft = Math.min(50, pct);
  const fillW = Math.abs(pct - 50);
  const display = value > 0 ? `+${value}` : `${value}`;

  return (
    <div className={`${styles.slider} ${read ? styles.read : ''}`}>
      <div className={styles.lab}>
        <span className={styles.nm}>{meta.label}</span>
        {read ? (
          // Recipe view: bare value readout — DOM identical to pre-reset layout.
          <span className={`${styles.vl} mono ${value !== 0 ? styles.act : ''}`}>
            {display}
          </span>
        ) : (
          // Editor: value + a per-slider reset (zeros just this slider).
          <span className={styles.labRight}>
            <span className={`${styles.vl} mono ${value !== 0 ? styles.act : ''}`}>
              {display}
            </span>
            <button
              type="button"
              className={styles.reset}
              onClick={() => onChange?.(0)}
              disabled={value === 0}
              aria-label={`Reset ${meta.label} to 0`}
              title="Reset to 0"
            >
              <ResetIcon />
            </button>
          </span>
        )}
      </div>
      <div
        className={styles.track}
        onDoubleClick={read ? undefined : () => onChange?.(0)}
      >
        <span className={styles.rail} />
        <span className={styles.tick} />
        <span
          className={styles.fill}
          style={{ left: `${fillLeft}%`, width: `${fillW}%` }}
        />
        {read ? null : (
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={value}
            aria-label={meta.label}
            onChange={(e) => onChange?.(parseInt(e.target.value, 10))}
          />
        )}
        <span className={styles.knob} style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Circular-arrow "reset to default" glyph (Feather `rotate-ccw`). */
function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}
