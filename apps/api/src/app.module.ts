import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app.config.js';
import { TenantModule } from './tenant/tenant.module.js';
import { TenantResolverMiddleware } from './tenant/tenant-resolver.middleware.js';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { JwtGuard } from './common/guards/jwt.guard.js';
import { YetkiGuard } from './common/guards/yetki.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { KullaniciModule } from './modules/kullanici/kullanici.module.js';
import { CariModule } from './modules/cari/cari.module.js';
import { SaglikModule } from './modules/saglik/saglik.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),

    // Global rate limiting: 100 istek/dakika per IP (varsayilan)
    // Auth endpoint'leri @Throttle() ile override: 5/dakika
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),

    TenantModule,
    AuthModule,
    KullaniciModule,
    CariModule,
    SaglikModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },

    // Global guard'lar — sirasi onemli: once auth, sonra yetki, sonra throttle
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: YetkiGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
