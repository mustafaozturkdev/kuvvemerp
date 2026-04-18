import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  HesapOlusturGirdi,
  HesapGuncelleGirdi,
  HesapListeSorgu,
  HesapMagazalar,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

@Injectable()
export class HesapService {
  async listele(prisma: TenantClient, sorgu: HesapListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.tip) where.tip = sorgu.tip;
    if (sorgu.grupId) where.grupId = BigInt(sorgu.grupId);
    if (sorgu.paraBirimiKod) where.paraBirimiKod = sorgu.paraBirimiKod;
    if (sorgu.aktifMi !== undefined) where.aktifMi = sorgu.aktifMi === 'true';
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
        { bankaAdi: { contains: sorgu.arama, mode: 'insensitive' } },
        { iban: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    // Mağaza filtresi (JSON içinde magazaIdler array'inde arama)
    if (sorgu.magazaId) {
      where.magazalar = {
        path: ['magazaIdler'],
        array_contains: sorgu.magazaId,
      };
    }

    const [toplam, veriler] = await Promise.all([
      prisma.hesap.count({ where }),
      prisma.hesap.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy: [{ sira: 'asc' }, { ad: 'asc' }],
        include: {
          grup: { select: { id: true, kod: true, ad: true, ikon: true, renk: true } },
          posNetHesap: { select: { id: true, kod: true, ad: true } },
        },
      }),
    ]);

    return {
      veriler,
      meta: { toplam, sayfa: sorgu.sayfa, boyut: sorgu.boyut },
    };
  }

  async detay(prisma: TenantClient, id: number) {
    const hesap = await prisma.hesap.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: {
        grup: true,
        posNetHesap: { select: { id: true, kod: true, ad: true, tip: true } },
      },
    });
    if (!hesap) {
      throw new NotFoundException({ kod: 'HESAP_BULUNAMADI', mesaj: `Ödeme aracı bulunamadı: ${id}` });
    }
    return hesap;
  }

  /**
   * Magazalar JSON alanını doğrula.
   * - varsayılan mağaza listede olmalı
   * - liste en az 1 ise varsayılan null olamaz
   */
  private magazalariDogrula(magazalar: HesapMagazalar): HesapMagazalar {
    if (magazalar.magazaIdler.length === 0) {
      return { magazaIdler: [], varsayilanMagazaId: null };
    }
    // Varsayılan seçiliyse listede olmalı
    if (magazalar.varsayilanMagazaId !== null && !magazalar.magazaIdler.includes(magazalar.varsayilanMagazaId)) {
      magazalar.varsayilanMagazaId = magazalar.magazaIdler[0];
    }
    // Hiç varsayılan yoksa ilkini varsayılan yap
    if (magazalar.varsayilanMagazaId === null) {
      magazalar.varsayilanMagazaId = magazalar.magazaIdler[0];
    }
    return magazalar;
  }

  /**
   * Varsayılan hesap yapılırsa, aynı tip diğerlerinin varsayılanını kaldır.
   */
  private async varsayilanAyarla(
    prisma: TenantClient,
    tip: string,
    mevcutHesapId: bigint | null,
  ): Promise<void> {
    const where: Record<string, unknown> = { tip, varsayilanMi: true, silindiMi: false };
    if (mevcutHesapId !== null) {
      where.NOT = { id: mevcutHesapId };
    }
    await prisma.hesap.updateMany({
      where,
      data: { varsayilanMi: false },
    });
  }

  async olustur(prisma: TenantClient, girdi: HesapOlusturGirdi, kullaniciId: bigint) {
    // Kod benzersizlik — sadece kullanıcı verdiyse
    if (girdi.kod) {
      const mevcut = await prisma.hesap.findFirst({
        where: { kod: girdi.kod, silindiMi: false },
        select: { id: true },
      });
      if (mevcut) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    // Varsayılan işaretliyse diğerlerinin varsayılanını kaldır
    if (girdi.varsayilanMi) {
      await this.varsayilanAyarla(prisma, girdi.tip, null);
    }

    const magazalar = this.magazalariDogrula(girdi.magazalar);

    const olusturVeri = (kod: string) => prisma.hesap.create({
      data: {
        kod,
        ad: girdi.ad,
        tip: girdi.tip,
        grupId: girdi.grupId ? BigInt(girdi.grupId) : null,
        paraBirimiKod: girdi.paraBirimiKod,
        firmaId: girdi.firmaId ? BigInt(girdi.firmaId) : null,
        magazalar: magazalar as any,
        ayarlar: (girdi.ayarlar ?? null) as any,
        bankaAdi: girdi.bankaAdi ?? null,
        sube: girdi.sube ?? null,
        hesapNo: girdi.hesapNo ?? null,
        iban: girdi.iban ?? null,
        swiftKod: girdi.swiftKod ?? null,
        posSaglayici: girdi.posSaglayici ?? null,
        posTerminalId: girdi.posTerminalId ?? null,
        posKomisyonOrani: girdi.posKomisyonOrani.toString(),
        posBlokeliGun: girdi.posBlokeliGun,
        posNetHesapId: girdi.posNetHesapId ? BigInt(girdi.posNetHesapId) : null,
        baslangicBakiye: girdi.baslangicBakiye.toString(),
        negatifBakiyeIzin: girdi.negatifBakiyeIzin,
        limitTutar: girdi.limitTutar != null ? girdi.limitTutar.toString() : null,
        varsayilanMi: girdi.varsayilanMi,
        sira: girdi.sira,
        olusturanKullaniciId: kullaniciId,
      },
      include: {
        grup: { select: { id: true, kod: true, ad: true, ikon: true, renk: true } },
      },
    });

    if (girdi.kod) return olusturVeri(girdi.kod);
    return kodIleOlustur(prisma, 'hesap', 'HSP', olusturVeri, 4);
  }

  async guncelle(prisma: TenantClient, id: number, girdi: HesapGuncelleGirdi, kullaniciId: bigint) {
    const mevcut = await this.detay(prisma, id);

    // Kod değişiyorsa benzersizlik
    if (girdi.kod && girdi.kod !== mevcut.kod) {
      const cakisma = await prisma.hesap.findFirst({
        where: { kod: girdi.kod, silindiMi: false, NOT: { id: BigInt(id) } },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    // Varsayılan işaretliyse diğerlerini kaldır
    if (girdi.varsayilanMi === true) {
      await this.varsayilanAyarla(prisma, mevcut.tip, BigInt(id));
    }

    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };

    const basitAlanlar: Array<keyof HesapGuncelleGirdi> = [
      'kod', 'ad', 'paraBirimiKod', 'bankaAdi', 'sube', 'hesapNo', 'iban', 'swiftKod',
      'posSaglayici', 'posTerminalId', 'posBlokeliGun',
      'negatifBakiyeIzin', 'varsayilanMi', 'sira', 'aktifMi',
    ];
    for (const alan of basitAlanlar) {
      if ((girdi as Record<string, unknown>)[alan] !== undefined) {
        veri[alan] = (girdi as Record<string, unknown>)[alan];
      }
    }

    // Decimal alanlar
    if (girdi.posKomisyonOrani !== undefined) veri.posKomisyonOrani = girdi.posKomisyonOrani.toString();
    if (girdi.baslangicBakiye !== undefined) veri.baslangicBakiye = girdi.baslangicBakiye.toString();
    if (girdi.limitTutar !== undefined) veri.limitTutar = girdi.limitTutar != null ? girdi.limitTutar.toString() : null;

    // FK alanlar
    if (girdi.grupId !== undefined) veri.grupId = girdi.grupId ? BigInt(girdi.grupId) : null;
    if (girdi.posNetHesapId !== undefined) veri.posNetHesapId = girdi.posNetHesapId ? BigInt(girdi.posNetHesapId) : null;

    // JSON alanlar
    if (girdi.magazalar !== undefined) {
      veri.magazalar = this.magazalariDogrula(girdi.magazalar) as any;
    }
    if (girdi.ayarlar !== undefined) {
      veri.ayarlar = girdi.ayarlar as any;
    }

    return prisma.hesap.update({
      where: { id: BigInt(id) },
      data: veri,
      include: {
        grup: { select: { id: true, kod: true, ad: true, ikon: true, renk: true } },
      },
    });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const hesap = await this.detay(prisma, id);
    return prisma.hesap.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !hesap.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    const hesap = await this.detay(prisma, id);
    // Hareketi varsa engelle
    const hareketSayi = await prisma.hesapHareket.count({
      where: { hesapId: hesap.id },
    });
    if (hareketSayi > 0) {
      throw new BadRequestException({
        kod: 'HESAP_KULLANIMDA',
        mesaj: `Bu ödeme aracında ${hareketSayi} hareket var, silinemez. Pasife alabilirsiniz.`,
      });
    }
    await prisma.hesap.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }
}
