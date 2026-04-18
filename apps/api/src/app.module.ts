import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app.config.js';
import { TenantModule } from './tenant/tenant.module.js';
// TenantResolver artik Fastify hook olarak main.ts'de calisir
import { TenantInterceptor } from './common/interceptors/tenant.interceptor.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { JwtGuard } from './common/guards/jwt.guard.js';
import { YetkiGuard } from './common/guards/yetki.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { KullaniciModule } from './modules/kullanici/kullanici.module.js';
import { CariModule } from './modules/cari/cari.module.js';
import { RolModule } from './modules/rol/rol.module.js';
import { SaglikModule } from './modules/saglik/saglik.module.js';
import { SistemAyarModule } from './modules/sistem-ayar/sistem-ayar.module.js';
import { MagazaModule } from './modules/magaza/magaza.module.js';
import { YetkiModule } from './modules/yetki/yetki.module.js';
import { PersonelModule } from './modules/personel/personel.module.js';
import { UploadModule } from './modules/upload/upload.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { CariGrupModule } from './modules/cari-grup/cari-grup.module.js';
import { HesapGrupModule } from './modules/hesap-grup/hesap-grup.module.js';
import { HesapModule } from './modules/hesap/hesap.module.js';
import { MarkaModule } from './modules/marka/marka.module.js';
import { MarkaModelModule } from './modules/marka-model/marka-model.module.js';
import { KategoriModule } from './modules/kategori/kategori.module.js';
import { UrunModule } from './modules/urun/urun.module.js';
import { LookupModule } from './modules/lookup/lookup.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req: any) => req.id,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req(req: any) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              host: req.headers?.host,
            };
          },
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
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
    RolModule,
    SaglikModule,
    SistemAyarModule,
    MagazaModule,
    YetkiModule,
    PersonelModule,
    UploadModule,
    DashboardModule,
    CariGrupModule,
    HesapGrupModule,
    HesapModule,
    MarkaModule,
    MarkaModelModule,
    KategoriModule,
    UrunModule,
    LookupModule,
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
export class AppModule {}
