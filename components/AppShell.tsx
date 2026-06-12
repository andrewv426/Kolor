'use client';

/**
 * AppShell — wraps every game screen. Imports the shared UI primitives stylesheet
 * (components/ui.css) once, provides AppState, and renders the responsive device
 * frame: a true full-bleed phone column (≤430px) that widens to the desktop
 * layout above it. Replaces the prototype's device-toggle scaffolding with real
 * responsive breakpoints.
 */
import './ui.css';
import { AppStateProvider } from './AppState';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <div className={styles.stage}>
        <div className={styles.viewport}>{children}</div>
      </div>
    </AppStateProvider>
  );
}
