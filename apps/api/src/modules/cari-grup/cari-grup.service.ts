import { Injectable, NotFoundException } from '@nestjs/common';
import type { CariGrupOlusturGirdi, CariGrupGuncelleGirdi } from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

@Injectable()
export class CariGrupService {
  async listele(prisma: TenantClient, aktifMi?: boolean) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (aktifMi !== undefined) where.aktifMi = aktifMi;
    return prisma.cariGrup.findMany({
      where,
      orderBy: [{ sira: 'asc' }, { ad: 'asc' }],
      include: { _count: { select: { cariler: { where: { silindiMi: false } } } } },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const grup = await prisma.cariGrup.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: { _count: { select: { cariler: { where: { silindiMi: false } } } } },
    });
    if (!grup) throw new NotFoundException({ kod: 'CARI_GRUP_BULUNAMADI', mesaj: `Cari grup bulunamadi: ${id}` });
    return grup;
  }

  async olustur(prisma: TenantClient, girdi: CariGrupOlusturGirdi, kullaniciId: bigint) {
    const olusturVeri = (kod: string) => prisma.cariGrup.create({
      data: {
        kod,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        varsayilanIskontoOrani: girdi.varsayilanIskontoOrani?.toString() ?? '0',
        varsayilanVadeGun: girdi.varsayilanVadeGun ?? null,
        renk: girdi.renk ?? null,
        ikon: girdi.ikon ?? null,
        sira: girdi.sira ?? 0,
        olusturanKullaniciId: kullaniciId,
      },
    });

    if (girdi.kod) return olusturVeri(girdi.kod);
    return kodIleOlustur(prisma, 'cari_grup', 'CG', olusturVeri, 4);
  }

  async guncelle(prisma: TenantClient, id: number, girdi: CariGrupGuncelleGirdi, kullaniciId: bigint) {
    await this.detay(prisma, id);
    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };

    if (girdi.kod !== undefined) veri.kod = girdi.kod;
    if (girdi.ad !== undefined) veri.ad = girdi.ad;
    if (girdi.aciklama !== undefined) veri.aciklama = girdi.aciklama;
    if (girdi.varsayilanIskontoOrani !== undefined) veri.varsayilanIskontoOrani = girdi.varsayilanIskontoOrani.toString();
    if (girdi.varsayilanVadeGun !== undefined) veri.varsayilanVadeGun = girdi.varsayilanVadeGun;
    if (girdi.renk !== undefined) veri.renk = girdi.renk;
    if (girdi.ikon !== undefined) veri.ikon = girdi.ikon;
    if (girdi.sira !== undefined) veri.sira = girdi.sira;
    if (girdi.aktifMi !== undefined) veri.aktifMi = girdi.aktifMi;

    return prisma.cariGrup.update({ where: { id: BigInt(id) }, data: veri });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const grup = await this.detay(prisma, id);
    return prisma.cariGrup.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !grup.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    await this.detay(prisma, id);
    await prisma.cariGrup.update({
      where: { id: BigInt(id) },
      data: { silindiMi: true, silinmeTarihi: new Date(), silenKullaniciId: kullaniciId },
    });
  }
}
