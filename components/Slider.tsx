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
        <span className={`${styles.vl} mono ${value !== 0 ? styles.act : ''}`}>
          {display}
        </span>
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
