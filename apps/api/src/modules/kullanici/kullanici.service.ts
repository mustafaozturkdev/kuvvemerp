import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  KullaniciGuncelleGirdi,
  KullaniciOlusturGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database/tenant-client';
import { sifreHashle } from '../auth/argon2.helper.js';
import type { Env } from '../../config/env.validation.js';

@Injectable()
export class KullaniciService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async listele(prisma: TenantClient) {
    return prisma.kullanici.findMany({
      where: { silindiMi: false },
      orderBy: { olusturmaTarihi: 'desc' },
      select: {
        id: true,
        publicId: true,
        email: true,
        ad: true,
        soyad: true,
        telefon: true,
        aktifMi: true,
        sonGirisTarihi: true,
        olusturmaTarihi: true,
      },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const k = await prisma.kullanici.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: { roller: { include: { rol: true } } },
    });
    if (!k) {
      throw new NotFoundException({
        kod: 'KULLANICI_BULUNAMADI',
        mesaj: `Kullanici bulunamadi: ${id}`,
      });
    }
    return k;
  }

  async olustur(
    prisma: TenantClient,
    girdi: KullaniciOlusturGirdi,
    olusturanId: bigint,
  ) {
    const mevcut = await prisma.kullanici.findUnique({
      where: { email: girdi.email },
    });
    if (mevcut) {
      throw new ConflictException({
        kod: 'EMAIL_MEVCUT',
        mesaj: 'Bu email zaten kullaniliyor',
        alan: 'email',
      });
    }

    const sifreHash = await sifreHashle(girdi.sifre, {
      memoryCost: this.config.get('ARGON2_MEMORY_COST', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });

    const kullanici = await prisma.kullanici.create({
      data: {
        email: girdi.email,
        sifreHash,
        ad: girdi.ad,
        soyad: girdi.soyad,
        telefon: girdi.telefon ?? null,
        olusturanKullaniciId: olusturanId,
      },
    });

    // Rol atamasi
    if (girdi.rolKodlari.length > 0) {
      const roller = await prisma.rol.findMany({
        where: { kod: { in: girdi.rolKodlari } },
      });
      if (roller.length > 0) {
        await prisma.kullaniciRol.createMany({
          data: roller.map((r) => ({
            kullaniciId: kullanici.id,
            rolId: r.id,
            olusturanKullaniciId: olusturanId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return kullanici;
  }

  async guncelle(
    prisma: TenantClient,
    id: number,
    girdi: KullaniciGuncelleGirdi,
    guncelleyenId: bigint,
  ) {
    await this.detay(prisma, id);
    return prisma.kullanici.update({
      where: { id: BigInt(id) },
      data: {
        ad: girdi.ad ?? undefined,
        soyad: girdi.soyad ?? undefined,
        email: girdi.email ?? undefined,
        telefon: girdi.telefon ?? undefined,
        guncelleyenKullaniciId: guncelleyenId,
      },
    });
  }
}
