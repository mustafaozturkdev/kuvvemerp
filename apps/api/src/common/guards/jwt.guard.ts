import { Injectable, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

export const PUBLIC_META_KEY = 'is_public';

/**
 * @Public() — endpoint'i JWT kontrolunden haric tutar.
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(PUBLIC_META_KEY, true);

/**
 * JwtGuard — access token dogrular. @Public() ile bypass.
 * Global APP_GUARD olarak baglaninca method/class seviyesinde @Public'i sayar.
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): ReturnType<AuthGuard['canActivate']> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException({
        kod: 'YETKISIZ',
        mesaj: 'Gecersiz veya suresi dolmus token',
      });
    }
    return user;
  }
}
