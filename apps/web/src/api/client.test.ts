import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiBlob, apiBytes, apiUrl } from './client';
import { authHeaders, authQuery, setAccessToken } from './auth';
import { moodSrc } from './hooks';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

const ok = (body = '{}') => vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));

describe('apiUrl and VITE_API_URL', () => {
  it('defaults to /api (the Vite dev proxy), exactly as before', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(apiUrl('/rooms/1')).toBe('/api/rooms/1');
    expect(apiUrl('rooms/1', { a: 1, b: undefined, c: null })).toBe('/api/rooms/1?a=1');
    expect(apiUrl('/api/rooms/1')).toBe('/api/rooms/1');
  });

  it('uses VITE_API_URL (trailing slash dropped) for every path', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
    expect(apiUrl('/rooms/1')).toBe('https://api.example.test/rooms/1');
    expect(apiUrl('/rooms/1/events', { dev_user: 'x' })).toBe('https://api.example.test/rooms/1/events?dev_user=x');
    expect(apiUrl('https://api.example.test/models?url=a', { b: 1 })).toBe('https://api.example.test/models?url=a&b=1');
  });

  it('fetches, blobs and model bytes go to the configured API', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const f = ok();
    vi.stubGlobal('fetch', f);
    await api('/projects');
    await apiBlob('/rooms/1/renders/j/image');
    await apiBytes('/rooms/1/listings/l/model');
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'https://api.example.test/projects',
      'https://api.example.test/rooms/1/renders/j/image',
      'https://api.example.test/rooms/1/listings/l/model',
    ]);
  });

  it('moodboard upload urls go under the API base; pin urls are left alone', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(moodSrc('/rooms/1/moodboard/images/i', null)).toBe('https://api.example.test/rooms/1/moodboard/images/i');
    expect(moodSrc('https://i.pinimg.com/a.jpg', 'tok')).toBe('https://i.pinimg.com/a.jpg');
  });
});

describe('login headers', () => {
  it('dev mode (Supabase vars unset): x-dev-user on every call, ?dev_user= for SSE, no token anywhere', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    store.set('hj-dev-user', 'sam');
    setAccessToken('ignored');
    expect(authHeaders()).toEqual({ 'x-dev-user': 'sam' });
    expect(authQuery()).toEqual({ dev_user: 'sam' });
    expect(moodSrc('/rooms/1/moodboard/images/i', 'ignored')).toBe('/api/rooms/1/moodboard/images/i');
    const f = ok();
    vi.stubGlobal('fetch', f);
    await api('/projects', { method: 'POST', body: { name: 'A' } });
    const init = (f.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.headers).toEqual({ accept: 'application/json', 'x-dev-user': 'sam', 'content-type': 'application/json' });
  });

  it('dev mode with only one Supabase var set stays dev mode', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(authHeaders()).toEqual({ 'x-dev-user': 'dev-user' });
  });

  it('Supabase mode: Bearer token on every call, ?access_token= for SSE and moodboard images, never x-dev-user', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    expect(authHeaders()).toEqual({}); // not signed in yet
    setAccessToken('tok-1');
    expect(authHeaders()).toEqual({ authorization: 'Bearer tok-1' });
    expect(authQuery()).toEqual({ access_token: 'tok-1' });
    expect(apiUrl('/rooms/1/events', authQuery())).toBe('/api/rooms/1/events?access_token=tok-1');
    expect(moodSrc('/rooms/1/moodboard/images/i', 'tok-1')).toBe('/api/rooms/1/moodboard/images/i?access_token=tok-1');
    const f = ok();
    vi.stubGlobal('fetch', f);
    await api('/projects');
    await apiBlob('/x');
    await apiBytes('/y');
    for (const c of f.mock.calls) {
      const h = ((c as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(h.authorization).toBe('Bearer tok-1');
      expect(h['x-dev-user']).toBeUndefined();
    }
  });
});
