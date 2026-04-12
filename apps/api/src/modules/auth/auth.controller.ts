import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import {
  GirisGirdi,
  GirisGirdiSemasi,
  TokenCevap,
  YenilemeGirdi,
  YenilemeGirdiSemasi,
} from '@kuvvem/contracts';
import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { Public } from '../../common/guards/jwt.guard.js';
import type { KullaniciBilgi, TenantBilgi } from '../../common/types/request.js';

/**
 * AuthController — giris/yenile/cikis endpoint'leri.
 * Global APP_GUARD (JwtGuard + YetkiGuard) aktif; giris/yenile @Public() ile bypass.
 * Auth endpoint'lerine siki rate limit: 5 istek/dakika per IP.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('giris')
  @HttpCode(HttpStatus.OK)
  async giris(
    @Tenant() tenant: TenantBilgi,
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(GirisGirdiSemasi)) girdi: GirisGirdi,
  ): Promise<TokenCevap> {
    if (!req.prisma) {
      throw new Error('req.prisma yok — TenantInterceptor calismadi');
    }
    return this.authService.giris(req.prisma, tenant, girdi, {
      ip: (req.ip as string | undefined) ?? null,
      cihazBilgisi: (req.headers['user-agent'] as string) ?? null,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('yenile')
  @HttpCode(HttpStatus.OK)
  async yenile(
    @Tenant() tenant: TenantBilgi,
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(YenilemeGirdiSemasi)) girdi: YenilemeGirdi,
  ): Promise<TokenCevap> {
    if (!req.prisma) {
      throw new Error('req.prisma yok');
    }
    return this.authService.yenile(req.prisma, tenant, girdi, {
      ip: (req.ip as string | undefined) ?? null,
      cihazBilgisi: (req.headers['user-agent'] as string) ?? null,
    });
  }

  @Get('me')
  async me(
    @Tenant() tenant: TenantBilgi,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Req() req: FastifyRequest,
  ) {
    let email = kullanici.email || '';
    let ad = '';
    let soyad = '';
    let yetkiKodlari: string[] = [];
    let magazalar: Array<{ id: bigint; kod: string; ad: string; varsayilanMi: boolean }> = [];

    if (req.prisma) {
      const dbKullanici = await req.prisma.kullanici.findUnique({
        where: { publicId: kullanici.publicId },
        select: {
          id: true,
          email: true,
          ad: true,
          soyad: true,
          roller: {
            select: {
              rol: {
                select: {
                  kod: true,
                  yetkiler: { select: { yetki: { select: { kod: true } } } },
                },
              },
            },
          },
          magazalar: {
            select: {
              varsayilanMi: true,
              magaza: { select: { id: true, kod: true, ad: true } },
            },
          },
        },
      });
      if (dbKullanici) {
        email = dbKullanici.email;
        ad = dbKullanici.ad;
        soyad = dbKullanici.soyad;
        // Tum roller uzerinden benzersiz yetki kodlarini topla
        const yetkiSet = new Set<string>();
        for (const kr of dbKullanici.roller) {
          for (const ry of kr.rol.yetkiler) {
            yetkiSet.add(ry.yetki.kod);
          }
        }
        yetkiKodlari = Array.from(yetkiSet).sort();
        magazalar = dbKullanici.magazalar.map((m) => ({
          id: m.magaza.id,
          kod: m.magaza.kod,
          ad: m.magaza.ad,
          varsayilanMi: m.varsayilanMi,
        }));
      }
    }

    return {
      kullanici: {
        id: kullanici.publicId,
        email,
        ad,
        soyad,
        adSoyad: `${ad} ${soyad}`.trim(),
        roller: kullanici.roller,
        yetkiler: yetkiKodlari,
        magazalar,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        dil: tenant.varsayilanDil,
        zamanDilimi: tenant.zamanDilimi,
      },
    };
  }

  @Post('cikis')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cikis(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
  ): Promise<void> {
    if (!req.prisma) {
      throw new Error('req.prisma yok');
    }
    await this.authService.cikis(req.prisma, kullanici.oturumId, {
      ip: (req.ip as string | undefined) ?? null,
      cihazBilgisi: (req.headers['user-agent'] as string) ?? null,
    });
  }
}
