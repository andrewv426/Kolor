/** Inline SVG smiley logo in the accent color (design handoff "Assets"). */
export function Smiley({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      style={{ display: 'block', flex: '0 0 auto' }}
      aria-hidden
    >
      <circle cx="11" cy="11" r="10" fill="var(--accent)" />
      <circle cx="7.6" cy="8.8" r="1.35" fill="var(--accent-ink)" />
      <circle cx="14.4" cy="8.8" r="1.35" fill="var(--accent-ink)" />
      <path
        d="M6.6 12.6 Q11 16.4 15.4 12.6"
        stroke="var(--accent-ink)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
