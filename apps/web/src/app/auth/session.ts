/**
 * Supabase login for the studio (only when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set).
 * supabase-js is loaded on demand, so the dev build never downloads it. The session is kept by
 * supabase-js in localStorage and refreshed by it; every change is copied to src/api/auth.ts, which
 * puts the access token on API calls.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { setAccessToken, supabaseEnv } from '../../api/auth';

/** The part of a Supabase client this file uses (so tests can hand in a fake). */
export type AuthClient = Pick<SupabaseClient, 'auth'>;

let client: Promise<AuthClient> | null = null;

/** The app's Supabase client, created on first use. Throws in dev mode (no Supabase vars). */
export function supabaseClient(): Promise<AuthClient> {
  const env = supabaseEnv();
  if (!env) return Promise.reject(new Error('Supabase is not configured (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.url, env.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  );
  return client;
}

export interface SignedIn {
  userId: string;
  email: string | null;
}

const toUser = (s: Session | null): SignedIn | null => (s ? { userId: s.user.id, email: s.user.email ?? null } : null);

/**
 * Follow the session: the stored one first, then every sign-in, token refresh and sign-out.
 * Each change sets the API token and calls `onChange`. Returns the unsubscribe.
 */
export function watchSession(c: AuthClient, onChange: (user: SignedIn | null) => void): () => void {
  let live = true;
  const apply = (s: Session | null) => {
    if (!live) return;
    setAccessToken(s?.access_token ?? null);
    onChange(toUser(s));
  };
  const { data } = c.auth.onAuthStateChange((_event, s) => apply(s));
  c.auth
    .getSession()
    .then(({ data: d }) => apply(d.session))
    .catch(() => apply(null));
  return () => {
    live = false;
    data.subscription.unsubscribe();
  };
}

/** Where Supabase sends the user back after the email link or Google: this page, without a hash. */
export const returnUrl = () => window.location.href.split('#')[0];

/** Email a magic sign-in link. */
export async function signInWithEmail(c: AuthClient, email: string, redirectTo = returnUrl()) {
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

/** Go to Google's sign-in (the page navigates away). */
export async function signInWithGoogle(c: AuthClient, redirectTo = returnUrl()) {
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut(c: AuthClient) {
  try {
    const { error } = await c.auth.signOut();
    if (error) throw error;
  } finally {
    setAccessToken(null);
  }
}
