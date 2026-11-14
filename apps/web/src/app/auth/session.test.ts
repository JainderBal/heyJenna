/**
 * The Supabase path, with a fake client (there are no real Supabase keys in this repo's dev setup).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authHeaders, getAccessToken, setAccessToken } from '../../api/auth';
import { signInWithEmail, signInWithGoogle, signOut, supabaseClient, watchSession, type AuthClient } from './session';

type Cb = (event: string, s: unknown) => void;
const session = (token: string, id = 'u1', email = 'a@b.c') => ({ access_token: token, user: { id, email } });

function fakeClient(stored: unknown = null) {
  let cb: Cb = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: stored }, error: null })),
    onAuthStateChange: vi.fn((f: Cb) => ((cb = f), { data: { subscription: { unsubscribe } } })),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { client: { auth } as unknown as AuthClient, auth, emit: (e: string, s: unknown) => cb(e, s), unsubscribe };
}

afterEach(() => {
  vi.unstubAllEnvs();
  setAccessToken(null);
});

describe('Supabase session', () => {
  it('copies the stored session, refreshes and sign-out to the API token', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const f = fakeClient(session('stored'));
    const seen: unknown[] = [];
    const stop = watchSession(f.client, (u) => seen.push(u));
    await vi.waitFor(() => expect(getAccessToken()).toBe('stored'));
    expect(authHeaders()).toEqual({ authorization: 'Bearer stored' });
    f.emit('TOKEN_REFRESHED', session('fresh'));
    expect(authHeaders()).toEqual({ authorization: 'Bearer fresh' });
    f.emit('SIGNED_OUT', null);
    expect(getAccessToken()).toBeNull();
    expect(authHeaders()).toEqual({});
    expect(seen).toEqual([{ userId: 'u1', email: 'a@b.c' }, { userId: 'u1', email: 'a@b.c' }, null]);
    stop();
    expect(f.unsubscribe).toHaveBeenCalled();
    f.emit('SIGNED_IN', session('late'));
    expect(getAccessToken()).toBeNull(); // nothing after unsubscribe
  });

  it('no stored session = signed out', async () => {
    const f = fakeClient(null);
    const seen: unknown[] = [];
    watchSession(f.client, (u) => seen.push(u));
    await vi.waitFor(() => expect(seen).toEqual([null]));
  });

  it('magic link: emails the trimmed address with the return url', async () => {
    const f = fakeClient();
    await signInWithEmail(f.client, '  me@x.io ', 'https://studio.test/p/1');
    expect(f.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'me@x.io', options: { emailRedirectTo: 'https://studio.test/p/1' } });
  });

  it('Google: OAuth with the return url; errors are thrown', async () => {
    const f = fakeClient();
    await signInWithGoogle(f.client, 'https://studio.test/');
    expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://studio.test/' } });
    f.auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: new Error('provider is not enabled') } as never);
    await expect(signInWithGoogle(f.client, 'x')).rejects.toThrow('provider is not enabled');
  });

  it('sign-out drops the token even when Supabase errors', async () => {
    const f = fakeClient();
    setAccessToken('t');
    f.auth.signOut.mockResolvedValueOnce({ error: new Error('network') } as never);
    await expect(signOut(f.client)).rejects.toThrow('network');
    expect(getAccessToken()).toBeNull();
  });

  it('dev mode has no Supabase client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    await expect(supabaseClient()).rejects.toThrow(/not configured/);
  });

  it('with the vars set, creates one real supabase-js client (no network until used)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    const a = await supabaseClient();
    expect(typeof a.auth.signInWithOtp).toBe('function');
    expect(await supabaseClient()).toBe(a);
  });
});
