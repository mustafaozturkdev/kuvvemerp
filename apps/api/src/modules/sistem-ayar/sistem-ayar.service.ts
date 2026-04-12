import { Injectable, NotFoundException } from '@nestjs/common';
import type { SistemAyarGuncelleGirdi } from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class SistemAyarService {
  async getir(prisma: TenantClient) {
    const ayar = await prisma.sistemAyar.findFirst();
    if (!ayar) {
      throw new NotFoundException({
        kod: 'SISTEM_AYAR_BULUNAMADI',
        mesaj: 'Sistem ayarlari bulunamadi',
      });
    }
    return ayar;
  }

  async guncelle(
    prisma: TenantClient,
    girdi: Partial<{
      firmaAdi: string;
      firmaLogoUrl: string | null;
      firmaFaviconUrl: string | null;
      varsayilanDil: string;
      varsayilanParaBirimi: string;
      zamanDilimi: string;
      ulkeKodu: string;
      tarihFormati: string;
      saatFormati: string;
      tema: string;
      markaRengi: string | null;
    }>,
    guncelleyenId: bigint,
  ) {
    const mevcut = await this.getir(prisma);

    // Versiyon gecmisi olustur
    await prisma.sistemAyarVersiyon.create({
      data: {
        versiyonNo: (await prisma.sistemAyarVersiyon.count()) + 1,
        oncekiAyar: mevcut as any,
        yeniAyar: { ...mevcut, ...girdi } as any,
        degisimAlanlari: Object.keys(girdi),
        olusturanKullaniciId: guncelleyenId,
      },
    });

    return prisma.sistemAyar.update({
      where: { id: mevcut.id },
      data: {
        ...girdi,
      },
    });
  }
}
