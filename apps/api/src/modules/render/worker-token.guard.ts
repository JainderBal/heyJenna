import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AppConfig } from '../../common/config/app-config.service';

/** Render workers prove who they are with the shared WORKER_TOKEN (x-worker-token header). */
@Injectable()
export class WorkerTokenGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get('WORKER_TOKEN');
    if (!expected) throw new ServiceUnavailableException('Render queue is off (WORKER_TOKEN not set)');
    const got = String(ctx.switchToHttp().getRequest().headers['x-worker-token'] ?? '');
    const a = Buffer.from(got), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Bad worker token');
    return true;
  }
}
