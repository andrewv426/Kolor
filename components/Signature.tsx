/** Color-signature swatch row for the share receipt. Ported from
 *  hifi/ui.jsx → Signature. */
import type { ToneSettings } from '@/lib/types';
import { colorSignature } from './colorSignature';
import styles from './Signature.module.css';

export function Signature({
  tone,
  n = 6,
  style,
}: {
  tone: ToneSettings;
  n?: number;
  style?: React.CSSProperties;
}) {
  const swatches = colorSignature(tone, n);
  return (
    <div className={styles.swrow} style={style}>
      {swatches.map((bg, i) => (
        <span key={i} className={styles.sw} style={{ background: bg }} />
      ))}
    </div>
  );
}
