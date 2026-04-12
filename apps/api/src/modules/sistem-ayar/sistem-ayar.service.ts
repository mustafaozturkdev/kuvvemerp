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
    girdi: SistemAyarGuncelleGirdi,
    guncelleyenId: bigint,
  ) {
    const mevcut = await this.getir(prisma);

    // Versiyon gecmisi olustur
    const degisimAlanlari = Object.keys(girdi).filter(
      (k) => (girdi as any)[k] !== undefined,
    );

    if (degisimAlanlari.length > 0) {
      await prisma.sistemAyarVersiyon.create({
        data: {
          versiyonNo: (await prisma.sistemAyarVersiyon.count()) + 1,
          oncekiAyar: mevcut as any,
          yeniAyar: { ...mevcut, ...girdi } as any,
          degisimAlanlari,
          olusturanKullaniciId: guncelleyenId,
        },
      });
    }

    return prisma.sistemAyar.update({
      where: { id: mevcut.id },
      data: {
        // Sadece Zod'dan gecen, SistemAyar modelinde olan alanlari guncelle
        ...(girdi.firmaAdi !== undefined && { firmaAdi: girdi.firmaAdi }),
        ...(girdi.firmaLogoUrl !== undefined && { firmaLogoUrl: girdi.firmaLogoUrl }),
        ...(girdi.firmaFaviconUrl !== undefined && { firmaFaviconUrl: girdi.firmaFaviconUrl }),
        ...(girdi.varsayilanDil !== undefined && { varsayilanDil: girdi.varsayilanDil }),
        ...(girdi.varsayilanParaBirimi !== undefined && { varsayilanParaBirimi: girdi.varsayilanParaBirimi }),
        ...(girdi.zamanDilimi !== undefined && { zamanDilimi: girdi.zamanDilimi }),
        ...(girdi.ulkeKodu !== undefined && { ulkeKodu: girdi.ulkeKodu }),
        ...(girdi.tarihFormati !== undefined && { tarihFormati: girdi.tarihFormati }),
        ...(girdi.saatFormati !== undefined && { saatFormati: girdi.saatFormati }),
        ...(girdi.tema !== undefined && { tema: girdi.tema }),
        ...(girdi.markaRengi !== undefined && { markaRengi: girdi.markaRengi }),
        // Yeni firma alanlari (K3 fix)
        ...(girdi.kisaAd !== undefined && { kisaAd: girdi.kisaAd }),
        ...(girdi.sahipAdi !== undefined && { sahipAdi: girdi.sahipAdi }),
        ...(girdi.email !== undefined && { email: girdi.email }),
        ...(girdi.bildirimEmail !== undefined && { bildirimEmail: girdi.bildirimEmail }),
        ...(girdi.telefon !== undefined && { telefon: girdi.telefon }),
        ...(girdi.cep !== undefined && { cep: girdi.cep }),
        ...(girdi.faks !== undefined && { faks: girdi.faks }),
        ...(girdi.il !== undefined && { il: girdi.il }),
        ...(girdi.ilce !== undefined && { ilce: girdi.ilce }),
        ...(girdi.adres !== undefined && { adres: girdi.adres }),
        ...(girdi.vergiDairesi !== undefined && { vergiDairesi: girdi.vergiDairesi }),
        ...(girdi.vergiNo !== undefined && { vergiNo: girdi.vergiNo }),
      },
    });
  }
}
