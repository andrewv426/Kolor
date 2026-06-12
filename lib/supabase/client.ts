/**
 * Browser-safe Supabase client — reads the NEXT_PUBLIC_ env vars and exposes
 * a singleton. Pinned to @supabase/supabase-js@2.49.4.
 *
 * `isSupabaseConfigured()` returns false when the vars are absent OR contain
 * the placeholder text from .env.example ('YOUR-' prefix). The rest of the
 * data layer calls this to decide which adapter to activate.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// These are NEXT_PUBLIC_ so they are embedded at build time and safe to read
// in the browser. They are never secret (the anon key is a public JWT).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Returns true only when both Supabase env vars are present **and** are not
 * the placeholder strings from .env.example.
 *
 * Placeholder detection: either var starting with 'YOUR-' or equalling
 * the exact placeholder values signals that no real project is configured.
 */
export function isSupabaseConfigured(): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (
    SUPABASE_URL.includes('YOUR-') ||
    SUPABASE_ANON_KEY.includes('YOUR-')
  ) {
    return false;
  }
  return true;
}

// Module-level singleton — created at most once per process/module lifecycle.
let _client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase browser client.
 *
 * ⚠️ Call `isSupabaseConfigured()` before this function. If Supabase is not
 * configured, this will create a client with placeholder/empty strings, which
 * will fail on every network call — the LocalAdapter is the correct path then.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Persist the session in localStorage (default).
      persistSession: true,
      // Detect the session from the URL hash (used for OAuth callback
      // and magic-link flows — keeps options open for Phase 4 Google OAuth).
      detectSessionInUrl: true,
      // Auto-refresh JWT before it expires.
      autoRefreshToken: true,
    },
  });
  return _client;
}
