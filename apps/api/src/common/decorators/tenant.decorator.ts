import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { TenantBilgi } from '../types/request.js';

/**
 * @Tenant() — aktif tenant bilgisini controller method'una enjekte eder.
 * Tenant resolver middleware daha onceden calismis olmali.
 */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantBilgi => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.tenant) {
      throw new InternalServerErrorException({
        kod: 'TENANT_COZUMLENEMEDI',
        mesaj: 'Tenant bilgisi request uzerinde bulunamadi',
      });
    }
    return req.tenant;
  },
);
