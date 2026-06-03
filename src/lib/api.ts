import { getSupabase } from "../../lib/supabase/client";

/**
 * Auth-aware fetch wrapper.
 *
 * Reads the current Supabase session (if any) and attaches
 * `Authorization: Bearer <access_token>` so every protected `/api/...` route
 * can call `authenticateRequest` server-side.
 *
 * Falls back to a plain fetch when no session exists, which is what the
 * legacy /api/auth/* endpoints expect.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(input, { ...init, headers });
}

/** Convenience wrapper that throws on non-2xx and returns parsed JSON. */
export async function apiJson<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message = parsed?.message || parsed?.error || res.statusText || "Request failed";
    const err = new Error(message);
    (err as any).status = res.status;
    (err as any).body = parsed;
    throw err;
  }
  return parsed as T;
}
