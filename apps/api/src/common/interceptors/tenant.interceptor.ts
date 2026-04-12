import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { FastifyRequest } from 'fastify';
import { TenantService } from '../../tenant/tenant.service.js';

/**
 * TenantInterceptor — req.tenant zaten middleware'de set edilmis olmali.
 * Burada Prisma client'i req'e ekleriz. Saglik endpoint'i icin tenant yoksa bypass.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantService: TenantService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (req.tenant && !req.prisma) {
      req.prisma = await this.tenantService.getClient(req.tenant.dbAdi);
    }
    // Passport req.user'a yazar — biz req.kullanici'ya kopyaliyoruz
    if ((req as any).user && !req.kullanici) {
      req.kullanici = (req as any).user;
    }
    return next.handle();
  }
}
