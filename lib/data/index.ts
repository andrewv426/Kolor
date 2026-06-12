/**
 * Public entry point for the data layer.
 *
 * `getAdapter()` returns:
 *   - LocalAdapter  — when Supabase env vars are absent or still placeholder.
 *                     Fully offline; zero backend required (default in local dev).
 *   - SupabaseAdapter — when both NEXT_PUBLIC_SUPABASE_URL and
 *                     NEXT_PUBLIC_SUPABASE_ANON_KEY are real (non-placeholder).
 *
 * The UI imports `getAdapter()` and `DataAdapter`; it never branches on the
 * mode itself (the adapter abstracts both paths).
 */
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { LocalAdapter } from './local';
import { SupabaseAdapter } from './supabase';

export type { DataAdapter } from './types';

// Module-level singleton — adapter is created once per process lifetime.
let _adapter: LocalAdapter | SupabaseAdapter | null = null;

/**
 * Returns the active DataAdapter.
 *
 * Calling this function is cheap after the first call (singleton).
 * The adapter selection is fixed at module-load time based on the env vars
 * present at that point — it does NOT re-evaluate on each call.
 */
export function getAdapter(): LocalAdapter | SupabaseAdapter {
  if (_adapter) return _adapter;

  if (isSupabaseConfigured()) {
    _adapter = new SupabaseAdapter();
  } else {
    console.info(
      '[color-gradle] Supabase env vars missing or placeholder — running in LOCAL mode. ' +
      'Data is stored in localStorage; no backend required. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to switch to Supabase.',
    );
    _adapter = new LocalAdapter();
  }

  return _adapter;
}
