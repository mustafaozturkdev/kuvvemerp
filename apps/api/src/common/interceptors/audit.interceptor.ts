import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { FastifyRequest } from 'fastify';

/**
 * AuditInterceptor — write endpoint'lerine (POST/PATCH/PUT/DELETE) audit log yazar.
 * Read (GET) trafigini dinlemez (performans). Hata durumlari HttpExceptionFilter'da
 * ayrica log'lanir.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const method = req.method.toUpperCase();
    const writeMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];

    return next.handle().pipe(
      tap(() => {
        if (!writeMethods.includes(method)) return;
        if (!req.prisma || !req.kullanici) return;

        // Fire-and-forget — response'u bloklamiyoruz
        req.prisma.auditLog
          .create({
            data: {
              kullaniciId: req.kullanici.id,
              oturumId: req.kullanici.oturumId,
              eylem: this.methodToEylem(method),
              tabloAdi: this.routeToTablo(req.url),
              aciklama: `${method} ${req.url}`,
              ipAdresi: (req.ip as string | undefined) ?? null,
              cihazBilgisi: (req.headers['user-agent'] as string) ?? null,
              basariliMi: true,
            },
          })
          .catch((err: unknown) => {
            this.logger.error('Audit log yazilamadi', err);
          });
      }),
    );
  }

  private methodToEylem(method: string): string {
    return (
      {
        POST: 'olustur',
        PATCH: 'guncelle',
        PUT: 'guncelle',
        DELETE: 'sil',
      }[method] ?? 'bilinmiyor'
    );
  }

  private routeToTablo(url: string): string {
    const segments = url.split('?')[0].split('/').filter(Boolean);
    // /api/v1/cari/123  -> cari
    return segments[2] ?? 'bilinmiyor';
  }
}
