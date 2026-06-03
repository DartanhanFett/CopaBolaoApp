import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// Vite injects env vars prefixed with VITE_ into import.meta.env at build time.
// Only the anon key is safe here — the service role key must NEVER be exposed in browser code.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let cached: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase browser client.
 * If env vars are missing the call returns null so callers can fall back to
 * legacy server-mediated auth without crashing the app.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (typeof window !== "undefined") {
      console.warn(
        "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing. Auth disabled until configured."
      );
    }
    return null;
  }
  cached = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

/** Backwards-compatible alias for the previous SSR-based helper. */
export function createClient(): SupabaseClient | null {
  return getSupabase();
}
