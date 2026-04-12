import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  KullaniciGuncelleGirdi,
  KullaniciOlusturGirdi,
  SifreDegistirGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { sifreHashle, sifreDogrula } from '../auth/argon2.helper.js';
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
        roller: { select: { rol: { select: { kod: true, ad: true } } } },
        magazalar: { select: { varsayilanMi: true, magaza: { select: { id: true, kod: true, ad: true } } } },
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
          data: roller.map((r: { id: bigint }) => ({
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
    const kullanici = await prisma.kullanici.update({
      where: { id: BigInt(id) },
      data: {
        ad: girdi.ad ?? undefined,
        soyad: girdi.soyad ?? undefined,
        email: girdi.email ?? undefined,
        telefon: girdi.telefon ?? undefined,
        guncelleyenKullaniciId: guncelleyenId,
      },
    });

    // Rol guncelleme (varsa)
    if (girdi.rolKodlari) {
      // Mevcut rolleri sil
      await prisma.kullaniciRol.deleteMany({ where: { kullaniciId: BigInt(id) } });
      // Yeni rolleri ata
      if (girdi.rolKodlari.length > 0) {
        const roller = await prisma.rol.findMany({ where: { kod: { in: girdi.rolKodlari } } });
        if (roller.length > 0) {
          await prisma.kullaniciRol.createMany({
            data: roller.map((r: { id: bigint }) => ({
              kullaniciId: BigInt(id),
              rolId: r.id,
              olusturanKullaniciId: guncelleyenId,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    return kullanici;
  }

  async aktiflikToggle(prisma: TenantClient, id: number, guncelleyenId: bigint) {
    const k = await this.detay(prisma, id);
    return prisma.kullanici.update({
      where: { id: BigInt(id) },
      data: {
        aktifMi: !k.aktifMi,
        guncelleyenKullaniciId: guncelleyenId,
      },
    });
  }

  async magazaAta(prisma: TenantClient, id: number, magazaIdler: number[], atanId: bigint) {
    await this.detay(prisma, id);
    const kullaniciId = BigInt(id);

    // Mevcut atamalari sil, yenilerini ekle
    await prisma.kullaniciMagaza.deleteMany({ where: { kullaniciId } });

    if (magazaIdler.length > 0) {
      await prisma.kullaniciMagaza.createMany({
        data: magazaIdler.map((mId, idx) => ({
          kullaniciId,
          magazaId: BigInt(mId),
          varsayilanMi: idx === 0,
          olusturanKullaniciId: atanId,
        })),
        skipDuplicates: true,
      });
    }

    return prisma.kullaniciMagaza.findMany({
      where: { kullaniciId },
      include: { magaza: { select: { id: true, kod: true, ad: true, tip: true } } },
    });
  }

  async sifreDegistir(prisma: TenantClient, kullaniciId: bigint, girdi: SifreDegistirGirdi) {
    const k = await prisma.kullanici.findUnique({ where: { id: kullaniciId } });
    if (!k) throw new NotFoundException({ kod: 'KULLANICI_BULUNAMADI', mesaj: 'Kullanici bulunamadi' });

    const eskiDogruMu = await sifreDogrula(k.sifreHash, girdi.eskiSifre);
    if (!eskiDogruMu) {
      throw new BadRequestException({ kod: 'ESKI_SIFRE_YANLIS', mesaj: 'Mevcut sifre hatali' });
    }

    const yeniHash = await sifreHashle(girdi.yeniSifre, {
      memoryCost: this.config.get('ARGON2_MEMORY_COST', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });

    await prisma.kullanici.update({
      where: { id: kullaniciId },
      data: {
        sifreHash: yeniHash,
        sifreSonDegisim: new Date(),
      },
    });

    return { mesaj: 'Sifre basariyla degistirildi' };
  }
}
