import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import * as crypto from 'node:crypto';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';

// ── BigInt JSON serialization patch ──
// JSON.stringify() BigInt'i desteklemez; global patch ile string'e cevirir.
// Bu, Fastify'nin response serializer'indan once calisir.
(BigInt.prototype as any).toJSON = function (this: bigint): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      bodyLimit: 10 * 1024 * 1024, // 10 MB
      logger: false, // nestjs-pino yonetsin
      genReqId: () => crypto.randomUUID(), // her istege benzersiz ID
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  // ── Helmet — HTTP guvenlik header'lari ──
  // @fastify/helmet: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security vb.
  try {
    const helmet = await import('@fastify/helmet');
    await app.register(helmet.default, {
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
    });
  } catch {
    // @fastify/helmet yuklenmemisse development'ta devam et
    // eslint-disable-next-line no-console
    console.warn('[api] @fastify/helmet bulunamadi, HTTP guvenlik header\'lari devre disi');
  }

  // ── Multipart (dosya yukleme) ──
  const multipart = await import('@fastify/multipart');
  await app.register(multipart.default, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // ── Static file serving (uploads/) ──
  const fastifyStatic = await import('@fastify/static');
  const pathModule = await import('node:path');
  await app.register(fastifyStatic.default, {
    root: pathModule.resolve(process.cwd(), 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ── Request ID + Tenant Resolver (Fastify hook) ──
  const fastifyInstance = app.getHttpAdapter().getInstance();

  // TenantService'i NestJS DI'den al
  const { TenantService } = await import('./tenant/tenant.service.js');
  const tenantService = app.get(TenantService);

  fastifyInstance.addHook('onRequest', async (req: any, reply: any) => {
    req.istekId = req.id;

    // Saglik + root bypass
    const url = req.url ?? '';
    if (url.startsWith('/saglik') || url === '/' || url.startsWith('/metrics') || url === '/favicon.ico' || url.startsWith('/uploads/')) {
      return;
    }

    // Tenant resolve
    const host = req.hostname ?? '';
    if (!host) return;

    try {
      const tenant = await tenantService.resolveTenant(host);
      const client = await tenantService.getClient(tenant.dbAdi);
      req.tenant = tenant;
      req.prisma = client;
    } catch (err: any) {
      req.raw.statusCode = 404;
      return reply.status(404).send({
        veri: null,
        hata: { kod: 'TENANT_BULUNAMADI', mesaj: err.message ?? 'Tenant bulunamadi' },
        meta: { istekId: req.id },
      });
    }
  });

  // ── CORS — production'da bilinen origin listesi ──
  const izinliOriginler =
    nodeEnv === 'production'
      ? [
          /\.kuvvem\.com$/,
          /\.kuvvem\.local$/,
        ]
      : true; // development'ta herkes

  app.enableCors({
    origin: izinliOriginler,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[api] http://localhost:${port} uzerinde dinleniyor (${nodeEnv})`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[api] Bootstrap hatasi', err);
  process.exit(1);
});
