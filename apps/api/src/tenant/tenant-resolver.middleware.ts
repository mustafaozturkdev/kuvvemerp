import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'http';
import { TenantService } from './tenant.service.js';

/**
 * TenantResolverMiddleware — Host header'dan tenant'i cozer,
 * req.tenant + req.prisma set eder. Saglik endpoint'leri bypass.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(private readonly tenantService: TenantService) {}

  async use(
    req: IncomingMessage & FastifyRequest,
    _res: ServerResponse,
    next: (err?: unknown) => void,
  ): Promise<void> {
    try {
      const url = req.url ?? '';
      // Saglik + metrics + favicon bypass
      if (url.startsWith('/saglik') || url === '/' || url.startsWith('/metrics') || url === '/favicon.ico') {
        return next();
      }

      const host = (req.headers.host ?? req.headers['x-forwarded-host'] ?? '') as string;
      if (!host) {
        return next();
      }

      const tenant = await this.tenantService.resolveTenant(host);
      const client = await this.tenantService.getClient(tenant.dbAdi);

      req.tenant = tenant;
      req.prisma = client;

      return next();
    } catch (err) {
      this.logger.warn(`Tenant cozumleme hatasi: ${(err as Error).message}`);
      return next(err);
    }
  }
}
