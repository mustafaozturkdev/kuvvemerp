import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface StandartHata {
  kod: string;
  mesaj: string;
  alan?: string | null;
  detay?: Record<string, unknown>;
}

/**
 * Global hata formati — tum cevaplar bu zarfta doner.
 *
 * { veri: null, hata: { kod, mesaj, alan? }, meta: null }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let hata: StandartHata = {
      kod: 'SUNUCU_HATASI',
      mesaj: 'Beklenmeyen bir hata olustu',
      alan: null,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        hata = { kod: this.statusKod(status), mesaj: resp, alan: null };
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        hata = {
          kod: (r.kod as string) ?? this.statusKod(status),
          mesaj:
            (r.mesaj as string) ??
            (r.message as string) ??
            exception.message,
          alan: (r.alan as string | null | undefined) ?? null,
          detay: (r.detay as Record<string, unknown>) ?? (r.alanlar as Record<string, unknown>),
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Yakalanmamis hata: ${exception.message}`,
        exception.stack,
      );
      hata = {
        kod: 'SUNUCU_HATASI',
        mesaj:
          process.env.NODE_ENV === 'production'
            ? 'Beklenmeyen bir hata olustu'
            : exception.message,
        alan: null,
      };
    }

    // Log
    this.logger.warn(
      `[${request.method}] ${request.url} -> ${status} ${hata.kod}`,
    );

    response.status(status).send({
      veri: null,
      hata,
      meta: {
        istekId: (request as any).istekId ?? (request as any).id ?? null,
      },
    });
  }

  private statusKod(status: number): string {
    const map: Record<number, string> = {
      400: 'GECERSIZ_ISTEK',
      401: 'YETKISIZ',
      403: 'YASAK',
      404: 'BULUNAMADI',
      409: 'CAKISMA',
      422: 'ISLENEMEZ',
      429: 'HIZ_SINIRI',
      500: 'SUNUCU_HATASI',
    };
    return map[status] ?? 'HATA';
  }
}
