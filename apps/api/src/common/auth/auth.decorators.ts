import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email?: string;
}

export const IS_PUBLIC = 'isPublic';
/** Skip the login check for this route (e.g. health check). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The logged-in user, put on the request by AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
