import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfig } from '../config/app-config.service';
import { AuthGuard, streamParam } from './auth.guard';

const SECRET = 'test-secret-for-hs256-tokens-0123456789';

/**
 * jose is ESM-only and jest runs CommonJS, so it is replaced by a fake verifier: a "token" here is
 * JSON of the claims plus the secret it was "signed" with. The guard's own logic (where the token is
 * read from, audience, subject, errors) is what's under test.
 */
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(async (t: string, key: Uint8Array | string, opts: { audience: string }) => {
    const c = JSON.parse(Buffer.from(t, 'base64url').toString());
    const secret = typeof key === 'string' ? key : new TextDecoder().decode(key);
    if (c.secret !== secret) throw new Error('bad signature');
    if (c.exp < Date.now() / 1000) throw new Error('expired');
    if (c.aud !== opts.audience) throw new Error('bad audience');
    return { payload: { sub: c.sub, email: c.email, aud: c.aud } };
  }),
}));

type Req = { method: string; path: string; headers: Record<string, string>; query: Record<string, unknown>; user?: unknown };
const ctxOf = (req: Req) =>
  ({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
const req = (path: string, extra: Partial<Req> = {}): Req => ({ method: 'GET', path, headers: {}, query: {}, ...extra });

function guard(env: Record<string, string>, isPublic = false) {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const config = { get: (k: string) => env[k] } as unknown as AppConfig;
  return new AuthGuard(reflector, config);
}

const token = async (sub = 'user-1', opts: { aud?: string; exp?: number; secret?: string } = {}) =>
  Buffer.from(
    JSON.stringify({ sub, email: 'a@b.c', aud: opts.aud ?? 'authenticated', exp: Date.now() / 1000 + (opts.exp ?? 3600), secret: opts.secret ?? SECRET }),
  ).toString('base64url');

describe('AuthGuard', () => {
  describe('AUTH_MODE=dev', () => {
    const g = guard({ AUTH_MODE: 'dev' });
    it('uses x-dev-user, then dev-user', async () => {
      const r = req('/rooms', { headers: { 'x-dev-user': 'sam' } });
      await g.canActivate(ctxOf(r));
      expect(r.user).toEqual({ id: 'sam' });
      const d = req('/rooms');
      await g.canActivate(ctxOf(d));
      expect(d.user).toEqual({ id: 'dev-user' });
    });
    it('takes ?dev_user= only on the events stream and moodboard image files', async () => {
      const e = req('/rooms/r1/events', { query: { dev_user: 'sam' } });
      await g.canActivate(ctxOf(e));
      expect(e.user).toEqual({ id: 'sam' });
      const other = req('/rooms/r1', { query: { dev_user: 'sam' } });
      await g.canActivate(ctxOf(other));
      expect(other.user).toEqual({ id: 'dev-user' });
    });
  });

  describe('AUTH_MODE=supabase', () => {
    const g = guard({ AUTH_MODE: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_JWT_SECRET: SECRET });

    it('accepts a valid Bearer token and puts the user on the request', async () => {
      const r = req('/rooms', { headers: { authorization: `Bearer ${await token()}` } });
      expect(await g.canActivate(ctxOf(r))).toBe(true);
      expect(r.user).toEqual({ id: 'user-1', email: 'a@b.c' });
    });

    it('rejects a missing, wrongly signed, expired or wrong-audience token', async () => {
      await expect(g.canActivate(ctxOf(req('/rooms')))).rejects.toBeInstanceOf(UnauthorizedException);
      for (const t of [await token('u', { secret: 'another-secret-another-secret-123' }), await token('u', { exp: -60 }), await token('u', { aud: 'anon' })]) {
        await expect(g.canActivate(ctxOf(req('/rooms', { headers: { authorization: `Bearer ${t}` } })))).rejects.toBeInstanceOf(UnauthorizedException);
      }
    });

    it('accepts ?access_token= on the SSE stream (EventSource cannot send headers)', async () => {
      const r = req('/rooms/r1/events', { query: { access_token: await token('user-2') } });
      expect(await g.canActivate(ctxOf(r))).toBe(true);
      expect(r.user).toMatchObject({ id: 'user-2' });
    });

    it('accepts ?access_token= on a moodboard image file (<img src> cannot send headers)', async () => {
      const r = req('/rooms/r1/moodboard/images/i1', { query: { access_token: await token('user-3') } });
      expect(await g.canActivate(ctxOf(r))).toBe(true);
      expect(r.user).toMatchObject({ id: 'user-3' });
    });

    it('refuses ?access_token= anywhere else', async () => {
      const t = await token();
      await expect(g.canActivate(ctxOf(req('/rooms/r1', { query: { access_token: t } })))).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(g.canActivate(ctxOf(req('/rooms/r1/events', { method: 'POST', query: { access_token: t } })))).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(g.canActivate(ctxOf(req('/rooms/r1/moodboard', { query: { access_token: t } })))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('without SUPABASE_JWT_SECRET, checks against the project JWKS', async () => {
      const jose = jest.requireMock('jose') as { createRemoteJWKSet: jest.Mock };
      const g2 = guard({ AUTH_MODE: 'supabase', SUPABASE_URL: 'https://x.supabase.co' });
      await expect(g2.canActivate(ctxOf(req('/rooms', { headers: { authorization: `Bearer ${await token()}` } })))).rejects.toBeInstanceOf(UnauthorizedException);
      expect(String(jose.createRemoteJWKSet.mock.calls[0][0])).toBe('https://x.supabase.co/auth/v1/.well-known/jwks.json');
    });

    it('lets @Public() routes through without a token', async () => {
      const pub = guard({ AUTH_MODE: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_JWT_SECRET: SECRET }, true);
      expect(await pub.canActivate(ctxOf(req('/health')))).toBe(true);
    });
  });

  it('streamParam ignores empty and non-string values', () => {
    expect(streamParam(req('/rooms/r1/events', { query: { access_token: '' } }), 'access_token')).toBeUndefined();
    expect(streamParam(req('/rooms/r1/events', { query: { access_token: ['a'] } }), 'access_token')).toBeUndefined();
    expect(streamParam(req('/rooms/r1/events', { query: { access_token: 'a' } }), 'access_token')).toBe('a');
  });
});
