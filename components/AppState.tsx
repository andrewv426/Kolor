'use client';

/**
 * AppState — the client-side game state the prototype kept in React state +
 * localStorage (keys prefixed `cg2_`). In LOCAL mode this is the working store;
 * the DataAdapter is the source of truth for submissions/likes/gallery, while
 * this context owns the *ephemeral working edit* (the tone you're dragging
 * before you submit) plus a couple of first-run UI flags.
 *
 * The stored submission / played-state / likes all flow through getAdapter().
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ToneKey, ToneSettings } from '@/lib/types';
import { DEFAULT_TONE, clampToneSettings } from '@/lib/types';

const WORKING_TONE_KEY = 'cg2_tone';
const SEEN_HOWTO_KEY = 'cg2_seen_howto';

// The editor starts neutral (all sliders at 0 = DEFAULT_TONE). A non-neutral
// starting look was removed: it surfaced dark-edge speckle as the first
// impression and let an untouched submit dodge PRD §10's all-default guard.

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface AppStateValue {
  /** The working edit (what the editor is dragging; pre-submit). */
  tone: ToneSettings;
  setToneVal: (key: ToneKey, value: number) => void;
  setTone: (tone: ToneSettings) => void;
  resetTone: () => void;
  /** First-run "How to play" modal — shown once, persisted, re-openable. */
  howToSeen: boolean;
  markHowToSeen: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [tone, setToneState] = useState<ToneSettings>(DEFAULT_TONE);
  const [howToSeen, setHowToSeen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount. This intentionally syncs an external
  // store (localStorage) into React state once, post-hydration, to avoid an
  // SSR/client mismatch — exactly the "subscribe to an external system" case the
  // effect rule is meant for.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setToneState(clampToneSettings(load(WORKING_TONE_KEY, DEFAULT_TONE)));
    setHowToSeen(load(SEEN_HOWTO_KEY, false));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) save(WORKING_TONE_KEY, tone);
  }, [tone, hydrated]);

  const setToneVal = useCallback((key: ToneKey, value: number) => {
    setToneState((prev) => ({
      ...prev,
      [key]: Math.round(Math.max(-100, Math.min(100, value))),
    }));
  }, []);

  const setTone = useCallback((next: ToneSettings) => {
    setToneState(clampToneSettings(next));
  }, []);

  const resetTone = useCallback(() => setToneState({ ...DEFAULT_TONE }), []);

  const markHowToSeen = useCallback(() => {
    setHowToSeen(true);
    save(SEEN_HOWTO_KEY, true);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      tone,
      setToneVal,
      setTone,
      resetTone,
      howToSeen,
      markHowToSeen,
    }),
    [tone, setToneVal, setTone, resetTone, howToSeen, markHowToSeen],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within <AppStateProvider>');
  }
  return ctx;
}
