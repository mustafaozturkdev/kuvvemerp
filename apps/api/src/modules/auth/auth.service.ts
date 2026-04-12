import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import type {
  GirisGirdi,
  JwtPayload,
  TokenCevap,
  YenilemeGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { sifreDogrula } from './argon2.helper.js';
import type { Env } from '../../config/env.validation.js';
import type { TenantBilgi } from '../../common/types/request.js';

interface OturumIstekBilgi {
  ip?: string | null;
  cihazBilgisi?: string | null;
}

/** Varsayilan sifre politikasi degerleri (sifre_politikasi tablosu yoksa) */
const VARSAYILAN_MAX_YANLIS_GIRIS = 5;
const VARSAYILAN_KILIT_DAKIKA = 15;

/**
 * AuthService — giris/cikis/refresh akislari.
 *
 * Guvenlik:
 *  - Argon2id ile sifre verify
 *  - Refresh token sha256 hash olarak oturum tablosunda saklanir
 *  - Her yanlis giris sayaci arttirir, politikadan max okunan sonra hesap kilitlenir
 *  - Basarili/basarisiz girislerde audit log
 *  - JWT payload'da BigInt degerler string olarak tasinir (precision kaybi onlemi)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async giris(
    prisma: TenantClient,
    tenant: TenantBilgi,
    girdi: GirisGirdi,
    istek: OturumIstekBilgi,
  ): Promise<TokenCevap> {
    const kullanici = await prisma.kullanici.findUnique({
      where: { email: girdi.email },
      include: {
        roller: {
          include: {
            rol: {
              include: {
                yetkiler: { include: { yetki: true } },
              },
            },
          },
        },
      },
    });

    if (!kullanici || kullanici.silindiMi || !kullanici.aktifMi) {
      await this.yanlisGirisLog(prisma, null, girdi.email, istek);
      throw new UnauthorizedException({
        kod: 'GECERSIZ_KIMLIK',
        mesaj: 'Email veya sifre hatali',
      });
    }

    // Kilit kontrolu
    if (kullanici.kilitliSonTarih && kullanici.kilitliSonTarih > new Date()) {
      const kalanMs = kullanici.kilitliSonTarih.getTime() - Date.now();
      const kalanDakika = Math.ceil(kalanMs / 60_000);
      throw new UnauthorizedException({
        kod: 'HESAP_KILITLI',
        mesaj: `Hesap gecici olarak kilitlendi, ${kalanDakika} dakika sonra deneyin`,
      });
    }

    const dogruMu = await sifreDogrula(kullanici.sifreHash, girdi.sifre);
    if (!dogruMu) {
      // Sifre politikasini oku
      const { maxYanlisGiris, kilitDakika } =
        await this.sifrePolitikasiniOku(prisma);

      const yeniSayac = (kullanici.yanlisGirisSayisi ?? 0) + 1;
      const kilitTarihi =
        yeniSayac >= maxYanlisGiris
          ? new Date(Date.now() + kilitDakika * 60_000)
          : null;

      await prisma.kullanici.update({
        where: { id: kullanici.id },
        data: {
          yanlisGirisSayisi: yeniSayac,
          ...(kilitTarihi ? { kilitliSonTarih: kilitTarihi } : {}),
        },
      });

      await this.yanlisGirisLog(prisma, kullanici.id, girdi.email, istek);

      if (kilitTarihi) {
        throw new UnauthorizedException({
          kod: 'HESAP_KILITLI',
          mesaj: `${maxYanlisGiris} basarisiz giris denemesi. Hesap ${kilitDakika} dakika kilitlendi`,
        });
      }

      throw new UnauthorizedException({
        kod: 'GECERSIZ_KIMLIK',
        mesaj: 'Email veya sifre hatali',
      });
    }

    // Basarili: yanlis sayaci sifirla, kilit kaldir
    await prisma.kullanici.update({
      where: { id: kullanici.id },
      data: {
        yanlisGirisSayisi: 0,
        kilitliSonTarih: null,
        sonGirisTarihi: new Date(),
        sonGirisIp: istek.ip ?? null,
      },
    });

    // Rol ve yetki listesi
    const roller: string[] = [];
    const yetkilerSet = new Set<string>();
    for (const kr of kullanici.roller) {
      roller.push(kr.rol.kod);
      for (const ry of kr.rol.yetkiler) {
        yetkilerSet.add(ry.yetki.kod);
      }
    }
    const yetkiler = [...yetkilerSet];

    // Refresh token
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const refreshHash = this.hashToken(refreshToken);
    const refreshExpiry = this.refreshExpiryMs();

    const oturum = await prisma.oturum.create({
      data: {
        kullaniciId: kullanici.id,
        refreshTokenHash: refreshHash,
        cihazBilgisi: istek.cihazBilgisi ?? null,
        olusturmaIp: istek.ip ?? null,
        sonKullanimIp: istek.ip ?? null,
        sonKullanimBitis: new Date(Date.now() + refreshExpiry),
      },
    });

    // Access token — BigInt degerleri string olarak JWT'ye koy
    const payload: JwtPayload = {
      sub: kullanici.publicId,
      kullanici_id: kullanici.id.toString(),
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      roller,
      yetkiler,
      oturum_id: oturum.id.toString(),
    };
    const accessToken = await this.jwt.signAsync(payload);
    const bitis = this.accessTokenBitis();

    // Basarili audit
    await prisma.auditLog
      .create({
        data: {
          kullaniciId: kullanici.id,
          oturumId: oturum.id,
          eylem: 'giris',
          aciklama: 'Basarili giris',
          ipAdresi: istek.ip ?? null,
          cihazBilgisi: istek.cihazBilgisi ?? null,
          basariliMi: true,
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Giris audit log yazilamadi', err),
      );

    return {
      accessToken,
      refreshToken,
      accessTokenBitis: bitis.toISOString(),
    };
  }

  async yenile(
    prisma: TenantClient,
    tenant: TenantBilgi,
    girdi: YenilemeGirdi,
    istek: OturumIstekBilgi,
  ): Promise<TokenCevap> {
    const hash = this.hashToken(girdi.refreshToken);
    const oturum = await prisma.oturum.findUnique({
      where: { refreshTokenHash: hash },
      include: {
        kullanici: {
          include: {
            roller: {
              include: {
                rol: {
                  include: {
                    yetkiler: { include: { yetki: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!oturum || oturum.iptalEdildiMi || oturum.sonKullanimBitis < new Date()) {
      throw new UnauthorizedException({
        kod: 'GECERSIZ_REFRESH',
        mesaj: 'Refresh token gecersiz veya suresi dolmus',
      });
    }

    const kullanici = oturum.kullanici;
    if (!kullanici.aktifMi || kullanici.silindiMi) {
      throw new UnauthorizedException({
        kod: 'HESAP_PASIF',
        mesaj: 'Kullanici hesabi aktif degil',
      });
    }

    // Yeni refresh token (rotation)
    const yeniRefresh = crypto.randomBytes(48).toString('base64url');
    const yeniHash = this.hashToken(yeniRefresh);
    const refreshExpiry = this.refreshExpiryMs();

    await prisma.oturum.update({
      where: { id: oturum.id },
      data: {
        refreshTokenHash: yeniHash,
        sonKullanimTarihi: new Date(),
        sonKullanimIp: istek.ip ?? null,
        sonKullanimBitis: new Date(Date.now() + refreshExpiry),
      },
    });

    const roller: string[] = [];
    const yetkilerSet = new Set<string>();
    for (const kr of kullanici.roller) {
      roller.push(kr.rol.kod);
      for (const ry of kr.rol.yetkiler) {
        yetkilerSet.add(ry.yetki.kod);
      }
    }

    const payload: JwtPayload = {
      sub: kullanici.publicId,
      kullanici_id: kullanici.id.toString(),
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      roller,
      yetkiler: [...yetkilerSet],
      oturum_id: oturum.id.toString(),
    };
    const accessToken = await this.jwt.signAsync(payload);
    const bitis = this.accessTokenBitis();

    return {
      accessToken,
      refreshToken: yeniRefresh,
      accessTokenBitis: bitis.toISOString(),
    };
  }

  async cikis(
    prisma: TenantClient,
    oturumId: bigint,
    istek: OturumIstekBilgi,
  ): Promise<void> {
    await prisma.oturum.update({
      where: { id: oturumId },
      data: {
        iptalEdildiMi: true,
        iptalTarihi: new Date(),
        iptalNedeni: 'kullanici',
      },
    });

    await prisma.auditLog
      .create({
        data: {
          oturumId,
          eylem: 'cikis',
          aciklama: 'Kullanici cikisi',
          ipAdresi: istek.ip ?? null,
          cihazBilgisi: istek.cihazBilgisi ?? null,
          basariliMi: true,
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Cikis audit log yazilamadi', err),
      );
  }

  // ──── Yardimci Metodlar ────

  /**
   * sifre_politikasi tablosundan max yanlis giris ve kilit suresi oku.
   * Tablo veya kayit yoksa varsayilan degerler doner.
   */
  private async sifrePolitikasiniOku(
    prisma: TenantClient,
  ): Promise<{ maxYanlisGiris: number; kilitDakika: number }> {
    try {
      const politika = await (prisma as any).sifrePolitikasi?.findFirst?.({
        where: { aktifMi: true },
        orderBy: { id: 'desc' as const },
      });
      if (politika) {
        return {
          maxYanlisGiris: politika.maxYanlisGiris ?? VARSAYILAN_MAX_YANLIS_GIRIS,
          kilitDakika: politika.kilitDakika ?? VARSAYILAN_KILIT_DAKIKA,
        };
      }
    } catch {
      // sifre_politikasi tablosu henuz yok — varsayilanlari kullan
    }
    return {
      maxYanlisGiris: VARSAYILAN_MAX_YANLIS_GIRIS,
      kilitDakika: VARSAYILAN_KILIT_DAKIKA,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private accessTokenBitis(): Date {
    const raw = this.config.get('JWT_ACCESS_EXPIRY', { infer: true });
    const ms = this.parseExpiry(raw);
    return new Date(Date.now() + ms);
  }

  private refreshExpiryMs(): number {
    const raw = this.config.get('JWT_REFRESH_EXPIRY', { infer: true });
    return this.parseExpiry(raw);
  }

  /** '15m', '30d', '12h', '3600s' -> ms */
  private parseExpiry(raw: string): number {
    const m = /^(\d+)([smhd])$/.exec(raw);
    if (!m) return 15 * 60 * 1000;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const carpan: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return n * (carpan[unit] ?? 60 * 1000);
  }

  private async yanlisGirisLog(
    prisma: TenantClient,
    kullaniciId: bigint | null,
    email: string,
    istek: OturumIstekBilgi,
  ): Promise<void> {
    await prisma.auditLog
      .create({
        data: {
          kullaniciId: kullaniciId ?? null,
          eylem: 'giris',
          aciklama: `Basarisiz giris: ${email}`,
          ipAdresi: istek.ip ?? null,
          cihazBilgisi: istek.cihazBilgisi ?? null,
          basariliMi: false,
          hataMesaji: 'GECERSIZ_KIMLIK',
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Yanlis giris audit log yazilamadi', err),
      );
  }
}
