import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  MarkaModelOlusturGirdi,
  MarkaModelGuncelleGirdi,
  MarkaModelListeSorgu,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class MarkaModelService {
  async listele(prisma: TenantClient, sorgu: MarkaModelListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.markaId) where.markaId = BigInt(sorgu.markaId);
    if (sorgu.aktifMi !== undefined) where.aktifMi = sorgu.aktifMi === 'true';
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    return prisma.markaModel.findMany({
      where,
      orderBy: [{ sira: 'asc' }, { ad: 'asc' }],
      include: {
        marka: { select: { id: true, kod: true, ad: true } },
        _count: { select: { urunler: { where: { silindiMi: false } } } },
      },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const model = await prisma.markaModel.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: {
        marka: { select: { id: true, kod: true, ad: true } },
        _count: { select: { urunler: { where: { silindiMi: false } } } },
      },
    });
    if (!model) {
      throw new NotFoundException({ kod: 'MARKA_MODEL_BULUNAMADI', mesaj: `Marka modeli bulunamadı: ${id}` });
    }
    return model;
  }

  async olustur(prisma: TenantClient, girdi: MarkaModelOlusturGirdi, kullaniciId: bigint) {
    // Marka var mı?
    const marka = await prisma.marka.findFirst({
      where: { id: BigInt(girdi.markaId), silindiMi: false },
      select: { id: true },
    });
    if (!marka) {
      throw new BadRequestException({ kod: 'MARKA_BULUNAMADI', mesaj: `Marka bulunamadı: ${girdi.markaId}` });
    }

    // Aynı marka altında aynı ad var mı?
    const mevcut = await prisma.markaModel.findFirst({
      where: {
        markaId: BigInt(girdi.markaId),
        ad: girdi.ad,
        silindiMi: false,
      },
      select: { id: true },
    });
    if (mevcut) {
      throw new BadRequestException({
        kod: 'MODEL_TEKRAR',
        mesaj: `Bu marka altında '${girdi.ad}' adında bir model zaten var`,
      });
    }

    return prisma.markaModel.create({
      data: {
        markaId: BigInt(girdi.markaId),
        kod: girdi.kod ?? null,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        gorselUrl: girdi.gorselUrl ?? null,
        uretimYili: girdi.uretimYili ?? null,
        sira: girdi.sira,
        olusturanKullaniciId: kullaniciId,
      },
      include: { marka: { select: { id: true, kod: true, ad: true } } },
    });
  }

  async guncelle(prisma: TenantClient, id: number, girdi: MarkaModelGuncelleGirdi, kullaniciId: bigint) {
    const mevcut = await this.detay(prisma, id);

    if (girdi.ad && girdi.ad !== mevcut.ad) {
      const cakisma = await prisma.markaModel.findFirst({
        where: {
          markaId: mevcut.markaId,
          ad: girdi.ad,
          silindiMi: false,
          NOT: { id: BigInt(id) },
        },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({
          kod: 'MODEL_TEKRAR',
          mesaj: `Bu marka altında '${girdi.ad}' adında bir model zaten var`,
        });
      }
    }

    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };
    const alanlar: Array<keyof MarkaModelGuncelleGirdi> = [
      'kod', 'ad', 'aciklama', 'gorselUrl', 'uretimYili', 'sira', 'aktifMi',
    ];
    for (const alan of alanlar) {
      if ((girdi as Record<string, unknown>)[alan] !== undefined) {
        veri[alan] = (girdi as Record<string, unknown>)[alan];
      }
    }

    return prisma.markaModel.update({
      where: { id: BigInt(id) },
      data: veri,
      include: { marka: { select: { id: true, kod: true, ad: true } } },
    });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const model = await this.detay(prisma, id);
    return prisma.markaModel.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !model.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    const model = await this.detay(prisma, id);
    if (model._count.urunler > 0) {
      throw new BadRequestException({
        kod: 'MODEL_KULLANIMDA',
        mesaj: `Bu modele bağlı ${model._count.urunler} ürün var, silinemez.`,
      });
    }
    await prisma.markaModel.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }
}
