import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { KullaniciBilgi } from '../types/request.js';

/**
 * @CurrentKullanici() — request'teki authenticated kullaniciyi enjekte eder.
 * JwtGuard calistiktan sonra kullanilmali.
 */
export const CurrentKullanici = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): KullaniciBilgi => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.kullanici) {
      throw new UnauthorizedException({
        kod: 'YETKISIZ',
        mesaj: 'Oturum bulunamadi',
      });
    }
    return req.kullanici;
  },
);
