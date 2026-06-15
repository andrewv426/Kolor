'use client';

/**
 * Admin (dev) console — local-only daily-photo switcher.
 *
 * A no-auth developer affordance available ONLY in local mode. It lists the
 * staged dev photos (lib/data/devPhotos.ts → public/photo/<id>/) and lets you
 * flip which one LocalAdapter.getToday() serves, so the editor/gallery can be
 * exercised against different masters without editing code.
 *
 * Production uses Supabase RLS and the daily_photos table (PRD §7.4, §6.8); the
 * mode!=='local' guard renders a notice instead. NOT the production curator
 * console (that's a separate, authenticated, server-backed admin surface).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAdapter } from '@/lib/data';
import type { LocalAdapter } from '@/lib/data/local';
import { getDevPhoto } from '@/lib/data/devPhotos';
import styles from './page.module.css';

export default function AdminPage() {
  const adapter = getAdapter();

  if (adapter.mode !== 'local') {
    return (
      <div className="screen center" style={{ padding: 20 }}>
        <div className="card" style={{ maxWidth: 380, padding: 22 }}>
          <div className="col" style={{ gap: 12 }}>
            <p className="dim">
              Admin is available only in local dev mode. Production uses Supabase
              RLS (PRD §7.4).
            </p>
            <Link href="/" className="btn ghost sm" style={{ alignSelf: 'flex-start' }}>
              ← Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminDashboard adapter={adapter} />;
}

function AdminDashboard({ adapter }: { adapter: LocalAdapter }) {
  const router = useRouter();
  const [activeId] = useState(adapter.getActivePhotoId());
  const photos = adapter.listPhotos();

  const select = (id: string) => {
    adapter.setActivePhotoId(id);
    router.push('/');
  };

  return (
    <div className="screen">
      <div className={styles.wrap}>
        <div className="row between wrap" style={{ gap: 14 }}>
          <div className="col" style={{ gap: 4 }}>
            <span className="eyebrow">Dev console</span>
            <h1 className="h-md">Daily photo switcher</h1>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={() => void adapter.resetSubmissions?.()}>
              Reset submissions (dev)
            </button>
            <Link href="/" className="btn">
              ← Today
            </Link>
          </div>
        </div>

        <div className={styles.grid}>
          {photos.map((photo) => {
            const isActive = photo.id === activeId;
            const isRaw = getDevPhoto(photo.id)?.sourceType === 'raw';
            return (
              <button
                key={photo.id}
                type="button"
                className={`card ${styles.card} ${isActive ? styles.active : ''}`}
                onClick={() => select(photo.id)}
                aria-pressed={isActive}
              >
                {/* Plain <img>, not next/image or <Photo>: a static preview8
                    thumb avoids spinning up one WebGL2 context per tile. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.thumb}
                  src={photo.preview8Url}
                  alt=""
                  loading="lazy"
                />
                <div className={styles.meta}>
                  <span style={{ fontWeight: 600 }}>{photo.theme}</span>
                  <span className="mono dim" style={{ fontSize: 12 }}>
                    {photo.id} · {photo.width}×{photo.height}
                  </span>
                  <div className={styles.badges}>
                    {isRaw && <span className="badge">RAW</span>}
                    {isActive && <span className="badge accent">● Live</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
