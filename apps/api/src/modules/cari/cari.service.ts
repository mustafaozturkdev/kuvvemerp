import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CariGuncelleGirdi,
  CariListeSorgu,
  CariOlusturGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database/tenant-client';

/**
 * CariService — cari CRUD. req.prisma uzerinden tenant DB'sinde islem yapar.
 */
@Injectable()
export class CariService {
  async listele(prisma: TenantClient, sorgu: CariListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.tip) where.tip = sorgu.tip;
    if (sorgu.grupId) where.cariGrupId = BigInt(sorgu.grupId);
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { soyad: { contains: sorgu.arama, mode: 'insensitive' } },
        { unvan: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    const [toplam, veriler] = await Promise.all([
      prisma.cari.count({ where }),
      prisma.cari.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy: { olusturmaTarihi: 'desc' },
      }),
    ]);

    return {
      veriler,
      meta: { toplam, sayfa: sorgu.sayfa, boyut: sorgu.boyut },
    };
  }

  async detay(prisma: TenantClient, id: number) {
    const cari = await prisma.cari.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: { adresler: true, cariGrup: true },
    });
    if (!cari) {
      throw new NotFoundException({
        kod: 'CARI_BULUNAMADI',
        mesaj: `Cari bulunamadi: ${id}`,
      });
    }
    return cari;
  }

  async olustur(
    prisma: TenantClient,
    girdi: CariOlusturGirdi,
    kullaniciId: bigint,
  ) {
    return prisma.cari.create({
      data: {
        kod: girdi.kod,
        tip: girdi.tip,
        kisiTipi: girdi.kisiTipi,
        ad: girdi.ad ?? null,
        soyad: girdi.soyad ?? null,
        unvan: girdi.unvan ?? null,
        kisaAd: girdi.kisaAd ?? null,
        vergiNo: girdi.vergiNo ?? null,
        vergiNoTipi: girdi.vergiNoTipi ?? null,
        paraBirimiKod: girdi.paraBirimiKod,
        iskontoOrani: girdi.iskontoOrani.toString(),
        vadeGun: girdi.vadeGun,
        kvkkOnayMi: girdi.kvkkOnayMi,
        olusturanKullaniciId: kullaniciId,
      },
    });
  }

  async guncelle(
    prisma: TenantClient,
    id: number,
    girdi: CariGuncelleGirdi,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, id);
    const veri: Record<string, unknown> = {
      guncelleyenKullaniciId: kullaniciId,
    };
    if (girdi.kod !== undefined) veri.kod = girdi.kod;
    if (girdi.tip !== undefined) veri.tip = girdi.tip;
    if (girdi.ad !== undefined) veri.ad = girdi.ad;
    if (girdi.soyad !== undefined) veri.soyad = girdi.soyad;
    if (girdi.unvan !== undefined) veri.unvan = girdi.unvan;
    if (girdi.kisaAd !== undefined) veri.kisaAd = girdi.kisaAd;
    if (girdi.vergiNo !== undefined) veri.vergiNo = girdi.vergiNo;
    if (girdi.vergiNoTipi !== undefined) veri.vergiNoTipi = girdi.vergiNoTipi;
    if (girdi.iskontoOrani !== undefined)
      veri.iskontoOrani = girdi.iskontoOrani.toString();
    if (girdi.vadeGun !== undefined) veri.vadeGun = girdi.vadeGun;
    if (girdi.aktifMi !== undefined) veri.aktifMi = girdi.aktifMi;

    return prisma.cari.update({
      where: { id: BigInt(id) },
      data: veri,
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    await this.detay(prisma, id);
    await prisma.cari.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }
}
