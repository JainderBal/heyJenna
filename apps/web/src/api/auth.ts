/**
 * Who the API calls are made as. Two modes, picked at build time:
 *  - dev (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY unset): the API runs AUTH_MODE=dev and trusts
 *    the `x-dev-user` header (or `?dev_user=` where headers can't be sent). No login screen.
 *  - supabase (both set): the user signs in with supabase-js (src/app/auth), and every call sends
 *    `Authorization: Bearer <access token>` (or `?access_token=` where headers can't be sent).
 * The session code keeps the current token here with setAccessToken; this module never imports
 * supabase-js, so the dev build doesn't load it.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** The Supabase project the web app signs in with, or null in dev mode. */
export function supabaseEnv(): SupabaseEnv | null {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return url && anonKey ? { url, anonKey } : null;
}

export const authEnabled = (): boolean => supabaseEnv() !== null;

/** AUTH_MODE=dev on the API: who we are. Override with localStorage `hj-dev-user` to test as someone else. */
export function devUser(): string {
  try {
    return localStorage.getItem('hj-dev-user') || 'dev-user';
  } catch {
    return 'dev-user';
  }
}

let accessToken: string | null = null;
const listeners = new Set<() => void>();

/** Called by the session code whenever Supabase signs in, refreshes the token or signs out. */
export function setAccessToken(token: string | null) {
  if (token === accessToken) return;
  accessToken = token;
  listeners.forEach((l) => l());
}
export const getAccessToken = () => accessToken;

/** Be told when the token changes (useAccessToken). Returns the unsubscribe. */
export function onAccessToken(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Login headers for a fetch: the Bearer token when signed in with Supabase, else `x-dev-user`. */
export function authHeaders(): Record<string, string> {
  if (!authEnabled()) return { 'x-dev-user': devUser() };
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

/**
 * Login as query parameters, for the two places that can't send headers (EventSource and
 * `<img src>` of a stored moodboard image). The API only reads them on those routes.
 */
export function authQuery(): Record<string, string> {
  if (!authEnabled()) return { dev_user: devUser() };
  return accessToken ? { access_token: accessToken } : {};
}
