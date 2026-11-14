import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AppConfig } from '../config/app-config.service';
import { IS_PUBLIC } from './auth.decorators';

/**
 * Checks the Supabase login token on every request: `Authorization: Bearer <jwt>`.
 * The frontend logs in with supabase-js; this API never sees passwords.
 * AUTH_MODE=dev skips the check and uses the `x-dev-user` header (local development only).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly reflector: Reflector, private readonly config: AppConfig) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();

    if (this.config.get('AUTH_MODE') === 'dev') {
      req.user = { id: String(req.headers['x-dev-user'] ?? 'dev-user') };
      return true;
    }

    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing login token');
    try {
      const payload = await this.verify(token);
      if (!payload.sub) throw new Error('no subject');
      req.user = { id: payload.sub, email: payload.email as string | undefined };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired login token');
    }
  }

  private async verify(token: string): Promise<JWTPayload> {
    const secret = this.config.get('SUPABASE_JWT_SECRET');
    const audience = 'authenticated';
    if (secret) {
      // Older Supabase projects: shared secret (HS256)
      return (await jwtVerify(token, new TextEncoder().encode(secret), { audience })).payload;
    }
    // Newer projects: asymmetric keys, public keys published by Supabase
    this.jwks ??= createRemoteJWKSet(new URL(`${this.config.get('SUPABASE_URL')}/auth/v1/.well-known/jwks.json`));
    return (await jwtVerify(token, this.jwks, { audience })).payload;
  }
}
