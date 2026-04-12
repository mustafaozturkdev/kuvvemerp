import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { TenantService } from './tenant.service.js';

/**
 * TenantResolverMiddleware — Host header'dan tenant'i cozer,
 * req.tenant + req.prisma set eder. Saglik endpoint'leri bypass.
 *
 * NestJS Fastify'da middleware raw/reply uzerinde calisir.
 * req.raw (IncomingMessage) yerine Fastify request objesine yazariz
 * ki controller'da @Req() ile erisilebilsin.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(private readonly tenantService: TenantService) {}

  async use(req: any, _res: any, next: (err?: unknown) => void): Promise<void> {
    try {
      const url = req.url ?? req.raw?.url ?? '';
      // Saglik + metrics + favicon bypass
      if (url.startsWith('/saglik') || url === '/' || url.startsWith('/metrics') || url === '/favicon.ico') {
        return next();
      }

      const host = (req.hostname ?? req.headers?.host ?? req.raw?.headers?.host ?? '') as string;
      if (!host) {
        return next();
      }

      const tenant = await this.tenantService.resolveTenant(host);
      const client = await this.tenantService.getClient(tenant.dbAdi);

      // Fastify request'e dogrudan set et
      req.tenant = tenant;
      req.prisma = client;

      // Raw request'e de koy (NestJS bazen raw'a bakar)
      if (req.raw) {
        (req.raw as any).tenant = tenant;
        (req.raw as any).prisma = client;
      }

      return next();
    } catch (err) {
      this.logger.warn(`Tenant cozumleme hatasi: ${(err as Error).message}`);
      return next(err);
    }
  }
}
