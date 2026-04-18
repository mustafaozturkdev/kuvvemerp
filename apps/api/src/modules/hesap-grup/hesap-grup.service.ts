import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { HesapGrupOlusturGirdi, HesapGrupGuncelleGirdi } from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

@Injectable()
export class HesapGrupService {
  async listele(prisma: TenantClient, aktifMi?: boolean) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (aktifMi !== undefined) where.aktifMi = aktifMi;
    return prisma.hesapGrup.findMany({
      where,
      orderBy: [{ sira: 'asc' }, { ad: 'asc' }],
      include: { _count: { select: { hesaplar: { where: { silindiMi: false } } } } },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const grup = await prisma.hesapGrup.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: { _count: { select: { hesaplar: { where: { silindiMi: false } } } } },
    });
    if (!grup) {
      throw new NotFoundException({ kod: 'HESAP_GRUP_BULUNAMADI', mesaj: `Hesap grup bulunamadı: ${id}` });
    }
    return grup;
  }

  async olustur(prisma: TenantClient, girdi: HesapGrupOlusturGirdi, kullaniciId: bigint) {
    const olusturVeri = (kod: string) => prisma.hesapGrup.create({
      data: {
        kod,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        ikon: girdi.ikon ?? null,
        renk: girdi.renk ?? null,
        sira: girdi.sira ?? 0,
        olusturanKullaniciId: kullaniciId,
      },
    });

    if (girdi.kod) return olusturVeri(girdi.kod);
    return kodIleOlustur(prisma, 'hesap_grup', 'HG', olusturVeri, 4);
  }

  async guncelle(prisma: TenantClient, id: number, girdi: HesapGrupGuncelleGirdi, kullaniciId: bigint) {
    await this.detay(prisma, id);
    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };

    if (girdi.kod !== undefined) veri.kod = girdi.kod;
    if (girdi.ad !== undefined) veri.ad = girdi.ad;
    if (girdi.aciklama !== undefined) veri.aciklama = girdi.aciklama;
    if (girdi.ikon !== undefined) veri.ikon = girdi.ikon;
    if (girdi.renk !== undefined) veri.renk = girdi.renk;
    if (girdi.sira !== undefined) veri.sira = girdi.sira;
    if (girdi.aktifMi !== undefined) veri.aktifMi = girdi.aktifMi;

    return prisma.hesapGrup.update({ where: { id: BigInt(id) }, data: veri });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const grup = await this.detay(prisma, id);
    return prisma.hesapGrup.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !grup.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    const grup = await this.detay(prisma, id);
    if (grup._count.hesaplar > 0) {
      throw new BadRequestException({
        kod: 'GRUP_KULLANIMDA',
        mesaj: `Bu gruba bağlı ${grup._count.hesaplar} ödeme aracı var, önce onları kaldırın`,
      });
    }
    await prisma.hesapGrup.update({
      where: { id: BigInt(id) },
      data: { silindiMi: true, silinmeTarihi: new Date(), silenKullaniciId: kullaniciId },
    });
  }
}
