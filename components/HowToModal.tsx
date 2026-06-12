'use client';

/**
 * HowToModal — first-run "How to play" (3 steps). Shows once (persisted via
 * AppState.howToSeen) and is re-openable from the landing link. Copy verbatim
 * from the design handoff / hifi/states.jsx.
 */
import styles from './HowToModal.module.css';

const STEPS: Array<[string, string, string]> = [
  [
    '1',
    'One photo a day',
    'Everyone edits the exact same unedited shot. A fresh one drops every day.',
  ],
  [
    '2',
    '5 minutes, 10 sliders',
    'Temperature, exposure, contrast… make the photo yours before the clock runs out.',
  ],
  [
    '3',
    'Submit to unlock',
    'See how everyone, including the AI players, edited it. Like your favorites; the most-liked edits top the board.',
  ],
];

export function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="ov-back" onClick={onClose}>
      <div className="ov-card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <span className="h-md" style={{ whiteSpace: 'nowrap' }}>
            How to play
          </span>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="col" style={{ gap: 16 }}>
          {STEPS.map(([n, title, desc]) => (
            <div
              className="row"
              key={n}
              style={{ gap: 13, alignItems: 'flex-start' }}
            >
              <span className={`${styles.num} mono`}>{n}</span>
              <div className="col" style={{ gap: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 15.5 }}>{title}</span>
                <span
                  className="dim"
                  style={{ fontSize: 13.5, lineHeight: 1.5 }}
                >
                  {desc}
                </span>
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn primary block lg"
          style={{ marginTop: 20 }}
          onClick={onClose}
        >
          Let&apos;s play
        </button>
      </div>
    </div>
  );
}
