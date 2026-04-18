import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  MarkaOlusturGirdi,
  MarkaGuncelleGirdi,
  MarkaListeSorgu,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

@Injectable()
export class MarkaService {
  async listele(prisma: TenantClient, sorgu: MarkaListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.aktifMi !== undefined) where.aktifMi = sorgu.aktifMi === 'true';
    if (sorgu.eticaretAktif !== undefined) where.eticaretAktif = sorgu.eticaretAktif === 'true';
    if (sorgu.b2bAktif !== undefined) where.b2bAktif = sorgu.b2bAktif === 'true';
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    const [toplam, veriler] = await Promise.all([
      prisma.marka.count({ where }),
      prisma.marka.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy: [{ sira: 'asc' }, { ad: 'asc' }],
        include: {
          _count: {
            select: {
              urunler: { where: { silindiMi: false } },
              modeller: { where: { silindiMi: false } },
            },
          },
        },
      }),
    ]);

    return { veriler, meta: { toplam, sayfa: sorgu.sayfa, boyut: sorgu.boyut } };
  }

  async detay(prisma: TenantClient, id: number) {
    const marka = await prisma.marka.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: {
        _count: {
          select: {
            urunler: { where: { silindiMi: false } },
            modeller: { where: { silindiMi: false } },
          },
        },
      },
    });
    if (!marka) {
      throw new NotFoundException({ kod: 'MARKA_BULUNAMADI', mesaj: `Marka bulunamadı: ${id}` });
    }
    return marka;
  }

  async olustur(prisma: TenantClient, girdi: MarkaOlusturGirdi, kullaniciId: bigint) {
    if (girdi.kod) {
      const mevcut = await prisma.marka.findFirst({
        where: { kod: girdi.kod, silindiMi: false },
        select: { id: true },
      });
      if (mevcut) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    const olusturVeri = (kod: string) => prisma.marka.create({
      data: {
        kod,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        logoUrl: girdi.logoUrl ?? null,
        bannerUrl: girdi.bannerUrl ?? null,
        webSitesi: girdi.webSitesi ?? null,
        ulkeKodu: girdi.ulkeKodu ?? null,
        seoUrl: girdi.seoUrl ?? null,
        seoBaslik: girdi.seoBaslik ?? null,
        seoAciklama: girdi.seoAciklama ?? null,
        seoAnahtarKelimeler: girdi.seoAnahtarKelimeler,
        ogImageUrl: girdi.ogImageUrl ?? null,
        canonicalUrl: girdi.canonicalUrl ?? null,
        eticaretAktif: girdi.eticaretAktif,
        b2bAktif: girdi.b2bAktif,
        sira: girdi.sira,
        olusturanKullaniciId: kullaniciId,
      },
    });

    if (girdi.kod) return olusturVeri(girdi.kod);
    return kodIleOlustur(prisma, 'marka', 'MRK', olusturVeri);
  }

  async guncelle(prisma: TenantClient, id: number, girdi: MarkaGuncelleGirdi, kullaniciId: bigint) {
    const mevcut = await this.detay(prisma, id);

    if (girdi.kod && girdi.kod !== mevcut.kod) {
      const cakisma = await prisma.marka.findFirst({
        where: { kod: girdi.kod, silindiMi: false, NOT: { id: BigInt(id) } },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };
    const alanlar: Array<keyof MarkaGuncelleGirdi> = [
      'kod', 'ad', 'aciklama', 'logoUrl', 'bannerUrl', 'webSitesi', 'ulkeKodu',
      'seoUrl', 'seoBaslik', 'seoAciklama', 'seoAnahtarKelimeler',
      'ogImageUrl', 'canonicalUrl', 'eticaretAktif', 'b2bAktif', 'sira', 'aktifMi',
    ];
    for (const alan of alanlar) {
      if ((girdi as Record<string, unknown>)[alan] !== undefined) {
        veri[alan] = (girdi as Record<string, unknown>)[alan];
      }
    }

    return prisma.marka.update({ where: { id: BigInt(id) }, data: veri });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const marka = await this.detay(prisma, id);
    return prisma.marka.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !marka.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    const marka = await this.detay(prisma, id);
    if (marka._count.urunler > 0) {
      throw new BadRequestException({
        kod: 'MARKA_KULLANIMDA',
        mesaj: `Bu markaya bağlı ${marka._count.urunler} ürün var, silinemez. Pasife alabilirsiniz.`,
      });
    }
    await prisma.marka.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }
}
