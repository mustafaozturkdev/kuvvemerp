import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  UrunOlusturGirdi,
  UrunGuncelleGirdi,
  UrunListeSorgu,
  UrunTopluAktiflikGirdi,
  UrunTopluAlanGuncelleGirdi,
  VaryantFiyatGuncelleGirdi,
  VaryantBarkodEkleGirdi,
  EksenOlusturGirdi,
  SecenekOlusturGirdi,
  VaryantOlusturGirdi,
  VaryantGuncelleGirdi,
  StokSayimGirdi,
  StokDevirGirdi,
  OrtalamaMaliyetOverrideGirdi,
  StokTransferOlusturGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';
import { slugOlustur } from '../../common/helpers/slug.js';
import { ean13BenzersizUret } from '../../common/helpers/barkod-uretici.js';
import { UploadService } from '../upload/upload.service.js';
import { HAZIR_EKSENLER } from './hazir-eksenler.js';

type AnyPrisma = TenantClient | any;

@Injectable()
export class UrunService {
  constructor(private readonly uploadService: UploadService) {}

  // ════════════════════════════════════════════════════════════
  // LISTE / DETAY
  // ════════════════════════════════════════════════════════════

  async listele(prisma: TenantClient, sorgu: UrunListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };

    if (sorgu.aktifMi !== undefined)        where.aktifMi        = sorgu.aktifMi        === 'true';
    if (sorgu.eticaretAktif !== undefined)  where.eticaretAktif  = sorgu.eticaretAktif  === 'true';
    if (sorgu.b2bAktif !== undefined)       where.b2bAktif       = sorgu.b2bAktif       === 'true';
    if (sorgu.pazaryeriAktif !== undefined) where.pazaryeriAktif = sorgu.pazaryeriAktif === 'true';
    if (sorgu.vitrindeGoster !== undefined) where.vitrindeGoster = sorgu.vitrindeGoster === 'true';
    if (sorgu.firsatUrun !== undefined)     where.firsatUrun     = sorgu.firsatUrun     === 'true';
    if (sorgu.yeniUrun !== undefined)       where.yeniUrun       = sorgu.yeniUrun       === 'true';
    if (sorgu.kategoriId)    where.kategoriId    = BigInt(sorgu.kategoriId);
    if (sorgu.markaId)       where.markaId       = BigInt(sorgu.markaId);
    if (sorgu.markaModelId)  where.markaModelId  = BigInt(sorgu.markaModelId);
    if (sorgu.tip)           where.tip           = sorgu.tip;

    if (sorgu.arama) {
      where.OR = [
        { ad:              { contains: sorgu.arama, mode: 'insensitive' } },
        { kod:             { contains: sorgu.arama, mode: 'insensitive' } },
        { takmaAdi:        { contains: sorgu.arama, mode: 'insensitive' } },
        { faturaKalemAdi:  { contains: sorgu.arama, mode: 'insensitive' } },
        { varyantlar: { some: { barkod:       { contains: sorgu.arama, mode: 'insensitive' } } } },
        { varyantlar: { some: { sku:          { contains: sorgu.arama, mode: 'insensitive' } } } },
        { varyantlar: { some: { ureticiKodu:  { contains: sorgu.arama, mode: 'insensitive' } } } },
      ];
    }

    const orderBy = (() => {
      switch (sorgu.siralama) {
        case 'ad-asc':     return [{ ad: 'asc' as const }];
        case 'ad-desc':    return [{ ad: 'desc' as const }];
        case 'kod-asc':    return [{ kod: 'asc' as const }];
        case 'kod-desc':   return [{ kod: 'desc' as const }];
        case 'yeni-once':  return [{ olusturmaTarihi: 'desc' as const }];
        case 'eski-once':  return [{ olusturmaTarihi: 'asc' as const }];
        case 'sira-asc':
        default:           return [{ sira: 'asc' as const }, { ad: 'asc' as const }];
      }
    })();

    const [toplam, veriler] = await Promise.all([
      prisma.urun.count({ where }),
      prisma.urun.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy,
        include: {
          kategori:   { select: { id: true, ad: true } },
          marka:      { select: { id: true, ad: true } },
          markaModel: { select: { id: true, ad: true } },
          // Default (varsayılan) varyant — liste sayfasında tek varyantlı özet için
          varyantlar: {
            where: { silindiMi: false, varsayilanMi: true },
            take: 1,
            select: {
              id: true,
              sku: true,
              barkod: true,
              alisFiyati: true,
              sonAlisFiyati: true,
              satilabilirSonFiyat: true,
              kritikStok: true,
              paraBirimiKod: true,
              fiyatListeVaryantlar: {
                where: { fiyatListesi: { varsayilanMi: true, aktifMi: true } },
                take: 1,
                select: { fiyat: true, listeFiyati: true },
              },
              stoklar: { select: { mevcutMiktar: true, rezerveMiktar: true, magazaId: true } },
            },
          },
        },
      }),
    ]);

    return { veriler, meta: { toplam, sayfa: sorgu.sayfa, boyut: sorgu.boyut } };
  }

  async detay(prisma: AnyPrisma, id: number) {
    const urun = await prisma.urun.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: {
        kategori:   { select: { id: true, ad: true } },
        marka:      { select: { id: true, ad: true } },
        markaModel: { select: { id: true, ad: true } },
        ekKategoriler: {
          include: { kategori: { select: { id: true, ad: true } } },
          orderBy: { sira: 'asc' },
        },
        varyantlar: {
          where: { silindiMi: false },
          orderBy: [{ varsayilanMi: 'desc' }, { sira: 'asc' }],
          include: {
            barkodlar: true,
            fiyatListeVaryantlar: {
              include: {
                fiyatListesi: { select: { id: true, kod: true, ad: true, varsayilanMi: true, paraBirimiKod: true } },
              },
            },
            stoklar: { include: { magaza: { select: { id: true, ad: true } } } },
          },
        },
        resimler:  { orderBy: [{ sira: 'asc' }] },
        ceviriler: true,
      },
    });

    if (!urun) {
      throw new NotFoundException({ kod: 'URUN_BULUNAMADI', mesaj: `Ürün bulunamadı: ${id}` });
    }
    return urun;
  }

  // ════════════════════════════════════════════════════════════
  // OLUŞTUR
  // ════════════════════════════════════════════════════════════

  async olustur(prisma: TenantClient, girdi: UrunOlusturGirdi, kullaniciId: bigint) {
    // Kod çakışma ön-kontrolü (elle girilmişse)
    if (girdi.kod) {
      const mevcut = await prisma.urun.findFirst({
        where: { kod: girdi.kod, silindiMi: false },
        select: { id: true },
      });
      if (mevcut) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu ürün kodu kullanılıyor: ${girdi.kod}` });
      }
    }

    // Varsayılan fiyat listesi (satış fiyatı yazmak için)
    const varsayilanFL = await prisma.fiyatListesi.findFirst({
      where: { varsayilanMi: true, aktifMi: true, silindiMi: false },
      select: { id: true },
    });

    return prisma.$transaction(async (tx: any) => {
      const urunOlustur = (kod: string) => tx.urun.create({
        data: {
          kod,
          ad: girdi.ad,
          tip: girdi.tip,
          kategoriId:     girdi.kategoriId    ? BigInt(girdi.kategoriId)    : null,
          markaId:        girdi.markaId       ? BigInt(girdi.markaId)       : null,
          markaModelId:   girdi.markaModelId  ? BigInt(girdi.markaModelId)  : null,
          anaBirimId:     BigInt(girdi.anaBirimId),
          vergiOraniId:   BigInt(girdi.vergiOraniId),
          fiyatlarKdvDahilMi: girdi.fiyatlarKdvDahilMi,

          aciklama:        girdi.aciklama        ?? null,
          kisaAciklama:    girdi.kisaAciklama    ?? null,
          icerikAciklama:  girdi.icerikAciklama  ?? null,
          kargoIadeMetin:  girdi.kargoIadeMetin  ?? null,
          faturaKalemAdi:  girdi.faturaKalemAdi  ?? null,
          takmaAdi:        girdi.takmaAdi       ?? null,
          muhasebeKodu:    girdi.muhasebeKodu   ?? null,
          gtipKodu:        girdi.gtipKodu       ?? null,
          mensheiUlkeKodu: girdi.mensheiUlkeKodu ?? null,
          uretici:         girdi.uretici        ?? null,

          ozelAlan1: girdi.ozelAlan1 ?? null,
          ozelAlan2: girdi.ozelAlan2 ?? null,
          ozelAlan3: girdi.ozelAlan3 ?? null,
          ozelAlan4: girdi.ozelAlan4 ?? null,
          ozelAlan5: girdi.ozelAlan5 ?? null,

          desi1: girdi.desi1,
          desi2: girdi.desi2,

          stokTakibi:   girdi.stokTakibi,
          seriNoTakibi: girdi.seriNoTakibi,
          lotTakibi:    girdi.lotTakibi,

          iskontoUygulanirMi: girdi.iskontoUygulanirMi,
          puanKazandirirMi:   girdi.puanKazandirirMi,
          minimumSatisMiktar: girdi.minimumSatisMiktar,
          primVarYok:         girdi.primVarYok,

          eticaretAktif:     girdi.eticaretAktif,
          eticaretSatilikMi: girdi.eticaretSatilikMi,
          b2bAktif:          girdi.b2bAktif,
          b2bSatilikMi:      girdi.b2bSatilikMi,
          pazaryeriAktif:    girdi.pazaryeriAktif,

          vitrindeGoster: girdi.vitrindeGoster,
          vitrinSira:     girdi.vitrinSira,
          firsatUrun:     girdi.firsatUrun,
          yeniUrun:       girdi.yeniUrun,

          ucretsizKargo:          girdi.ucretsizKargo,
          tahminiTeslimSuresiGun: girdi.tahminiTeslimSuresiGun,
          garantiAy:              girdi.garantiAy ?? null,

          sepetIndirimEticaret: girdi.sepetIndirimEticaret ?? null,
          sepetIndirimB2b:      girdi.sepetIndirimB2b      ?? null,

          seoUrl:              girdi.seoUrl       ?? null,
          seoBaslik:           girdi.seoBaslik    ?? null,
          seoAciklama:         girdi.seoAciklama  ?? null,
          seoAnahtarKelimeler: girdi.seoAnahtarKelimeler,

          anaResimUrl: girdi.anaResimUrl ?? null,
          uretimTarihi: girdi.uretimTarihi ?? null,
          sira:        girdi.sira,

          abonelikAktif: girdi.abonelikAktif,
          abonelikData:  girdi.abonelikData ?? undefined,

          olusturanKullaniciId: kullaniciId,
        },
      });

      // Kod verildiyse direkt, verilmediyse otomatik üret (URN-000001 formatı)
      const urun = girdi.kod
        ? await urunOlustur(girdi.kod)
        : await kodIleOlustur(tx, 'urun', 'URN', urunOlustur, 6);

      // Ek kategoriler (N-N)
      if (girdi.ekKategoriIds && girdi.ekKategoriIds.length > 0) {
        await tx.urunKategori.createMany({
          data: girdi.ekKategoriIds.map((kid, idx) => ({
            urunId: urun.id,
            kategoriId: BigInt(kid),
            sira: idx,
          })),
          skipDuplicates: true,
        });
      }

      // Trigger default varyantı oluşturdu — şimdi kullanıcının verdiği detaylarla zenginleştir
      const varyantVeri: Record<string, unknown> = {
        vergiOraniId: BigInt(girdi.vergiOraniId),
        birimId:      BigInt(girdi.anaBirimId),
        kritikStok:   girdi.kritikStok,
        minimumStok:  girdi.minimumStok,
        olusturanKullaniciId: kullaniciId,
      };
      if (girdi.paraBirimiKod) varyantVeri.paraBirimiKod = girdi.paraBirimiKod.toUpperCase();
      if (girdi.barkod !== undefined)              varyantVeri.barkod = girdi.barkod;
      if (girdi.alisFiyati !== undefined)          varyantVeri.alisFiyati = girdi.alisFiyati;
      if (girdi.sonAlisFiyati !== undefined)       varyantVeri.sonAlisFiyati = girdi.sonAlisFiyati;
      if (girdi.piyasaFiyati !== undefined)        varyantVeri.piyasaFiyati = girdi.piyasaFiyati;
      if (girdi.satilabilirSonFiyat !== undefined) varyantVeri.satilabilirSonFiyat = girdi.satilabilirSonFiyat;
      if (girdi.karMarji !== undefined)            varyantVeri.karMarji = girdi.karMarji;
      if (girdi.agirlikGr !== undefined)           varyantVeri.agirlikGr = girdi.agirlikGr;
      if (girdi.enCm !== undefined)                varyantVeri.enCm = girdi.enCm;
      if (girdi.boyCm !== undefined)               varyantVeri.boyCm = girdi.boyCm;
      if (girdi.yukseklikCm !== undefined)         varyantVeri.yukseklikCm = girdi.yukseklikCm;
      if (girdi.maksimumStok !== undefined)        varyantVeri.maksimumStok = girdi.maksimumStok;

      await tx.urunVaryant.updateMany({
        where: { urunId: urun.id, varsayilanMi: true },
        data: varyantVeri,
      });

      // Satış fiyatı verilmişse varsayılan fiyat listesine yaz
      if (girdi.satisFiyati !== undefined && girdi.satisFiyati !== null && varsayilanFL) {
        const defaultVaryant = await tx.urunVaryant.findFirst({
          where: { urunId: urun.id, varsayilanMi: true },
          select: { id: true },
        });
        if (defaultVaryant) {
          await tx.fiyatListesiVaryant.upsert({
            where: {
              fiyatListesiId_urunVaryantId_minimumMiktar: {
                fiyatListesiId: varsayilanFL.id,
                urunVaryantId: defaultVaryant.id,
                minimumMiktar: 1,
              },
            },
            create: {
              fiyatListesiId: varsayilanFL.id,
              urunVaryantId:  defaultVaryant.id,
              fiyat:          girdi.satisFiyati,
              minimumMiktar:  1,
            },
            update: { fiyat: girdi.satisFiyati },
          });
        }
      }

      return this.detay(tx, Number(urun.id));
    });
  }

  // ════════════════════════════════════════════════════════════
  // GÜNCELLE
  // ════════════════════════════════════════════════════════════

  async guncelle(prisma: TenantClient, id: number, girdi: UrunGuncelleGirdi, kullaniciId: bigint) {
    const mevcut = await this.detay(prisma, id);

    // Kod çakışma kontrolü
    if (girdi.kod && girdi.kod !== mevcut.kod) {
      const cakisma = await prisma.urun.findFirst({
        where: { kod: girdi.kod, silindiMi: false, NOT: { id: BigInt(id) } },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu ürün kodu kullanılıyor: ${girdi.kod}` });
      }
    }

    // Urun tablosuna gidecek alanlar
    const urunAlanlari: Array<keyof UrunGuncelleGirdi> = [
      'kod', 'ad', 'tip',
      'aciklama', 'kisaAciklama', 'icerikAciklama', 'kargoIadeMetin',
      'faturaKalemAdi', 'takmaAdi', 'muhasebeKodu', 'gtipKodu', 'mensheiUlkeKodu', 'uretici',
      'ozelAlan1', 'ozelAlan2', 'ozelAlan3', 'ozelAlan4', 'ozelAlan5',
      'desi1', 'desi2',
      'stokTakibi', 'seriNoTakibi', 'lotTakibi',
      'iskontoUygulanirMi', 'puanKazandirirMi', 'minimumSatisMiktar', 'primVarYok',
      'eticaretAktif', 'eticaretSatilikMi', 'b2bAktif', 'b2bSatilikMi', 'pazaryeriAktif',
      'vitrindeGoster', 'vitrinSira', 'firsatUrun', 'yeniUrun',
      'ucretsizKargo', 'tahminiTeslimSuresiGun', 'garantiAy',
      'sepetIndirimEticaret', 'sepetIndirimB2b',
      'seoUrl', 'seoBaslik', 'seoAciklama', 'seoAnahtarKelimeler',
      'anaResimUrl', 'uretimTarihi', 'sira',
      'abonelikAktif',
      'fiyatlarKdvDahilMi', 'aktifMi',
    ];

    const urunData: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };
    for (const alan of urunAlanlari) {
      const val = (girdi as Record<string, unknown>)[alan];
      if (val !== undefined) urunData[alan] = val;
    }
    // FK alanları (BigInt dönüşümü)
    if (girdi.kategoriId !== undefined)   urunData.kategoriId   = girdi.kategoriId   ? BigInt(girdi.kategoriId)   : null;
    if (girdi.markaId !== undefined)      urunData.markaId      = girdi.markaId      ? BigInt(girdi.markaId)      : null;
    if (girdi.markaModelId !== undefined) urunData.markaModelId = girdi.markaModelId ? BigInt(girdi.markaModelId) : null;
    if (girdi.anaBirimId !== undefined)   urunData.anaBirimId   = BigInt(girdi.anaBirimId);
    if (girdi.vergiOraniId !== undefined) urunData.vergiOraniId = BigInt(girdi.vergiOraniId);
    if (girdi.abonelikData !== undefined) urunData.abonelikData = girdi.abonelikData ?? undefined;

    // Transaction: Urun + (varsa) default varyant fiyat alanları
    return prisma.$transaction(async (tx: any) => {
      if (Object.keys(urunData).length > 1) {
        await tx.urun.update({ where: { id: BigInt(id) }, data: urunData });
      }

      // Ek kategoriler guncellemesi (gonderildiyse) — replace mantigi
      if (girdi.ekKategoriIds !== undefined) {
        await tx.urunKategori.deleteMany({ where: { urunId: BigInt(id) } });
        if (girdi.ekKategoriIds.length > 0) {
          await tx.urunKategori.createMany({
            data: girdi.ekKategoriIds.map((kid, idx) => ({
              urunId: BigInt(id),
              kategoriId: BigInt(kid),
              sira: idx,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Varyant-seviyeli alanlar varsa default varyantta da güncelle
      const varyantData: Record<string, unknown> = {};
      if (girdi.barkod !== undefined)              varyantData.barkod = girdi.barkod;
      if (girdi.alisFiyati !== undefined)          varyantData.alisFiyati = girdi.alisFiyati;
      if (girdi.sonAlisFiyati !== undefined)       varyantData.sonAlisFiyati = girdi.sonAlisFiyati;
      if (girdi.piyasaFiyati !== undefined)        varyantData.piyasaFiyati = girdi.piyasaFiyati;
      if (girdi.satilabilirSonFiyat !== undefined) varyantData.satilabilirSonFiyat = girdi.satilabilirSonFiyat;
      if (girdi.karMarji !== undefined)            varyantData.karMarji = girdi.karMarji;
      if (girdi.agirlikGr !== undefined)           varyantData.agirlikGr = girdi.agirlikGr;
      if (girdi.enCm !== undefined)                varyantData.enCm = girdi.enCm;
      if (girdi.boyCm !== undefined)               varyantData.boyCm = girdi.boyCm;
      if (girdi.yukseklikCm !== undefined)         varyantData.yukseklikCm = girdi.yukseklikCm;
      if (girdi.kritikStok !== undefined)          varyantData.kritikStok = girdi.kritikStok;
      if (girdi.minimumStok !== undefined)         varyantData.minimumStok = girdi.minimumStok;
      if (girdi.maksimumStok !== undefined)        varyantData.maksimumStok = girdi.maksimumStok;
      if (girdi.vergiOraniId !== undefined)        varyantData.vergiOraniId = BigInt(girdi.vergiOraniId);
      if (girdi.paraBirimiKod !== undefined && girdi.paraBirimiKod) {
        varyantData.paraBirimiKod = girdi.paraBirimiKod.toUpperCase();
      }

      if (Object.keys(varyantData).length > 0) {
        varyantData.guncelleyenKullaniciId = kullaniciId;
        if (girdi.alisFiyati !== undefined || girdi.piyasaFiyati !== undefined) {
          varyantData.fiyatDegisiklikTarihi = new Date();
        }
        await tx.urunVaryant.updateMany({
          where: { urunId: BigInt(id), varsayilanMi: true },
          data: varyantData,
        });
      }

      // Satış fiyatı güncellemesi (varsayılan fiyat listesi)
      if (girdi.satisFiyati !== undefined && girdi.satisFiyati !== null) {
        const varsayilanFL = await tx.fiyatListesi.findFirst({
          where: { varsayilanMi: true, aktifMi: true, silindiMi: false },
          select: { id: true },
        });
        const defaultVaryant = await tx.urunVaryant.findFirst({
          where: { urunId: BigInt(id), varsayilanMi: true },
          select: { id: true },
        });
        if (varsayilanFL && defaultVaryant) {
          await tx.fiyatListesiVaryant.upsert({
            where: {
              fiyatListesiId_urunVaryantId_minimumMiktar: {
                fiyatListesiId: varsayilanFL.id,
                urunVaryantId:  defaultVaryant.id,
                minimumMiktar:  1,
              },
            },
            create: {
              fiyatListesiId: varsayilanFL.id,
              urunVaryantId:  defaultVaryant.id,
              fiyat:          girdi.satisFiyati,
              minimumMiktar:  1,
            },
            update: { fiyat: girdi.satisFiyati },
          });
        }
      }

      return this.detay(tx, id);
    });
  }

  // ════════════════════════════════════════════════════════════
  // AKTİFLİK / SİLME
  // ════════════════════════════════════════════════════════════

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const urun = await this.detay(prisma, id);
    return prisma.urun.update({
      where: { id: BigInt(id) },
      data:  { aktifMi: !urun.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    // Önce detay kontrolü (yoksa 404)
    await this.detay(prisma, id);

    // Bağlı sipariş kalemi var mı? (SiparisKalem modelinde urun_varyant_id FK var)
    const siparisKalemi = await prisma.siparisKalem.findFirst({
      where: { urunVaryant: { urunId: BigInt(id) } },
      select: { id: true },
    });
    if (siparisKalemi) {
      throw new BadRequestException({
        kod: 'URUN_KULLANIMDA',
        mesaj: 'Bu ürüne bağlı siparişler var, silinemez. Pasife alabilirsiniz.',
      });
    }

    await prisma.urun.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
        aktifMi: false,
      },
    });
  }

  // ════════════════════════════════════════════════════════════
  // TOPLU İŞLEMLER
  // ════════════════════════════════════════════════════════════

  async topluAktiflik(prisma: TenantClient, girdi: UrunTopluAktiflikGirdi, kullaniciId: bigint) {
    const ids = girdi.ids.map((i) => BigInt(i));
    const result = await prisma.urun.updateMany({
      where: { id: { in: ids }, silindiMi: false },
      data: { aktifMi: girdi.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
    return { etkilenen: result.count };
  }

  async topluAlanGuncelle(prisma: TenantClient, girdi: UrunTopluAlanGuncelleGirdi, kullaniciId: bigint) {
    const ids = girdi.ids.map((i) => BigInt(i));
    const data: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };

    // FK alanları BigInt dönüşüm
    if (girdi.alan === 'kategoriId' || girdi.alan === 'markaId' || girdi.alan === 'markaModelId') {
      data[girdi.alan] = girdi.deger === null || girdi.deger === '' ? null : BigInt(Number(girdi.deger));
    } else {
      data[girdi.alan] = girdi.deger;
    }

    const result = await prisma.urun.updateMany({
      where: { id: { in: ids }, silindiMi: false },
      data,
    });
    return { etkilenen: result.count };
  }

  // ════════════════════════════════════════════════════════════
  // VARYANT — fiyat / barkod bağımsız endpoint'ler
  // ════════════════════════════════════════════════════════════

  async varyantDetay(prisma: TenantClient, varyantId: number) {
    const varyant = await prisma.urunVaryant.findFirst({
      where: { id: BigInt(varyantId), silindiMi: false },
      include: {
        barkodlar: true,
        fiyatListeVaryantlar: {
          include: { fiyatListesi: { select: { id: true, kod: true, ad: true } } },
        },
        stoklar: { include: { magaza: { select: { id: true, ad: true } } } },
      },
    });
    if (!varyant) {
      throw new NotFoundException({ kod: 'VARYANT_BULUNAMADI', mesaj: `Varyant bulunamadı: ${varyantId}` });
    }
    return varyant;
  }

  async varyantFiyatGuncelle(
    prisma: TenantClient,
    varyantId: number,
    girdi: VaryantFiyatGuncelleGirdi,
    kullaniciId: bigint,
  ) {
    await this.varyantDetay(prisma, varyantId);

    const data: Record<string, unknown> = {
      guncelleyenKullaniciId: kullaniciId,
      fiyatDegisiklikTarihi: new Date(),
    };
    if (girdi.alisFiyati !== undefined)          data.alisFiyati = girdi.alisFiyati;
    if (girdi.sonAlisFiyati !== undefined)       data.sonAlisFiyati = girdi.sonAlisFiyati;
    if (girdi.piyasaFiyati !== undefined)        data.piyasaFiyati = girdi.piyasaFiyati;
    if (girdi.satilabilirSonFiyat !== undefined) data.satilabilirSonFiyat = girdi.satilabilirSonFiyat;
    if (girdi.karMarji !== undefined)            data.karMarji = girdi.karMarji;

    return prisma.urunVaryant.update({
      where: { id: BigInt(varyantId) },
      data,
    });
  }

  async varyantBarkodEkle(
    prisma: TenantClient,
    varyantId: number,
    girdi: VaryantBarkodEkleGirdi,
  ) {
    await this.varyantDetay(prisma, varyantId);

    // Çakışma kontrolü (barkod @unique)
    const mevcut = await prisma.urunVaryantBarkod.findUnique({
      where: { barkod: girdi.barkod },
      select: { id: true },
    });
    if (mevcut) {
      throw new BadRequestException({ kod: 'BARKOD_TEKRAR', mesaj: `Bu barkod kullanılıyor: ${girdi.barkod}` });
    }

    // Eğer varsayılan olarak işaretlendi ise önce diğer varsayılanları kaldır
    if (girdi.varsayilanMi) {
      await prisma.urunVaryantBarkod.updateMany({
        where: { urunVaryantId: BigInt(varyantId), varsayilanMi: true },
        data: { varsayilanMi: false },
      });
    }

    return prisma.urunVaryantBarkod.create({
      data: {
        urunVaryantId: BigInt(varyantId),
        barkod:        girdi.barkod,
        tip:           girdi.tip,
        aciklama:      girdi.aciklama ?? null,
        varsayilanMi:  girdi.varsayilanMi,
      },
    });
  }

  async varyantBarkodSil(prisma: TenantClient, varyantId: number, barkodId: number): Promise<void> {
    const barkod = await prisma.urunVaryantBarkod.findFirst({
      where: { id: BigInt(barkodId), urunVaryantId: BigInt(varyantId) },
      select: { id: true },
    });
    if (!barkod) {
      throw new NotFoundException({ kod: 'BARKOD_BULUNAMADI', mesaj: `Barkod bulunamadı: ${barkodId}` });
    }
    await prisma.urunVaryantBarkod.delete({ where: { id: BigInt(barkodId) } });
  }

  // ════════════════════════════════════════════════════════════
  // VARYANT EKSENLERİ (Renk, Beden vb.)
  // ════════════════════════════════════════════════════════════

  async eksenleriListele(prisma: TenantClient, urunId: number) {
    await this.detay(prisma, urunId);
    return prisma.urunVaryantEksen.findMany({
      where: { urunId: BigInt(urunId) },
      orderBy: { sira: 'asc' },
      include: { secenekler: { orderBy: { sira: 'asc' } } },
    });
  }

  async eksenEkle(prisma: TenantClient, urunId: number, girdi: EksenOlusturGirdi) {
    await this.detay(prisma, urunId);
    const cakisma = await prisma.urunVaryantEksen.findFirst({
      where: { urunId: BigInt(urunId), eksenKod: girdi.eksenKod },
      select: { id: true },
    });
    if (cakisma) {
      throw new BadRequestException({ kod: 'EKSEN_MEVCUT', mesaj: `Bu üründe '${girdi.eksenKod}' ekseni zaten var` });
    }
    return prisma.urunVaryantEksen.create({
      data: {
        urunId: BigInt(urunId),
        eksenKod: girdi.eksenKod,
        eksenAd: girdi.eksenAd,
        sira: girdi.sira,
      },
    });
  }

  async eksenSil(prisma: TenantClient, urunId: number, eksenId: number): Promise<void> {
    const eksen = await prisma.urunVaryantEksen.findFirst({
      where: { id: BigInt(eksenId), urunId: BigInt(urunId) },
    });
    if (!eksen) {
      throw new NotFoundException({ kod: 'EKSEN_BULUNAMADI', mesaj: `Eksen bulunamadı: ${eksenId}` });
    }
    await prisma.urunVaryantEksen.delete({ where: { id: eksen.id } });
  }

  async secenekEkle(prisma: TenantClient, urunId: number, eksenId: number, girdi: SecenekOlusturGirdi) {
    await this.detay(prisma, urunId);
    const eksen = await prisma.urunVaryantEksen.findFirst({
      where: { id: BigInt(eksenId), urunId: BigInt(urunId) },
      select: { id: true },
    });
    if (!eksen) {
      throw new NotFoundException({ kod: 'EKSEN_BULUNAMADI', mesaj: `Eksen bulunamadı: ${eksenId}` });
    }
    const cakisma = await prisma.urunVaryantSecenek.findFirst({
      where: { eksenId: eksen.id, degerKod: girdi.degerKod },
      select: { id: true },
    });
    if (cakisma) {
      throw new BadRequestException({ kod: 'SECENEK_MEVCUT', mesaj: `Bu eksende '${girdi.degerKod}' seçeneği zaten var` });
    }
    return prisma.urunVaryantSecenek.create({
      data: {
        eksenId: eksen.id,
        degerKod: girdi.degerKod,
        degerAd: girdi.degerAd,
        hexRenk: girdi.hexRenk ?? null,
        resimUrl: girdi.resimUrl ?? null,
        sira: girdi.sira,
        aktifMi: girdi.aktifMi,
      },
    });
  }

  /**
   * Hazır eksen kütüphanesi (sistem seviyesinde, tenant'tan bağımsız).
   */
  hazirEksenler() {
    return HAZIR_EKSENLER;
  }

  /**
   * Toplu eksen + seçenekler ekleme — hazır eksenden veya özel seçim'den gelir.
   * Transaction atomik: biri başarısızsa tümü geri alınır.
   */
  async eksenVeSecenekToplu(
    prisma: TenantClient,
    urunId: number,
    girdi: {
      eksenKod: string;
      eksenAd: string;
      sira?: number;
      secenekler: Array<{ degerKod: string; degerAd: string; hexRenk?: string | null; sira?: number }>;
    },
  ) {
    await this.detay(prisma, urunId);

    // Mevcut eksen var mı?
    const mevcut = await prisma.urunVaryantEksen.findFirst({
      where: { urunId: BigInt(urunId), eksenKod: girdi.eksenKod },
      select: { id: true },
    });
    if (mevcut) {
      throw new BadRequestException({
        kod: 'EKSEN_MEVCUT',
        mesaj: `Bu üründe '${girdi.eksenAd}' ekseni zaten var`,
      });
    }

    return prisma.$transaction(async (tx: any) => {
      const eksen = await tx.urunVaryantEksen.create({
        data: {
          urunId: BigInt(urunId),
          eksenKod: girdi.eksenKod,
          eksenAd: girdi.eksenAd,
          sira: girdi.sira ?? 0,
        },
      });

      if (girdi.secenekler.length > 0) {
        await tx.urunVaryantSecenek.createMany({
          data: girdi.secenekler.map((s, idx) => ({
            eksenId: eksen.id,
            degerKod: s.degerKod,
            degerAd: s.degerAd,
            hexRenk: s.hexRenk ?? null,
            sira: s.sira ?? idx,
            aktifMi: true,
          })),
          skipDuplicates: true,
        });
      }

      return tx.urunVaryantEksen.findUnique({
        where: { id: eksen.id },
        include: { secenekler: { orderBy: { sira: 'asc' } } },
      });
    });
  }

  async secenekSil(prisma: TenantClient, urunId: number, eksenId: number, secenekId: number): Promise<void> {
    const secenek = await prisma.urunVaryantSecenek.findFirst({
      where: { id: BigInt(secenekId), eksen: { id: BigInt(eksenId), urunId: BigInt(urunId) } },
    });
    if (!secenek) {
      throw new NotFoundException({ kod: 'SECENEK_BULUNAMADI', mesaj: `Seçenek bulunamadı: ${secenekId}` });
    }
    await prisma.urunVaryantSecenek.delete({ where: { id: secenek.id } });
  }

  // ════════════════════════════════════════════════════════════
  // VARYANT CRUD (manuel + matris)
  // ════════════════════════════════════════════════════════════

  private skuUret(urunKod: string, eksenKombinasyon: Record<string, string>): string {
    const parts = Object.values(eksenKombinasyon)
      .map((v) => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))
      .filter(Boolean);
    return parts.length > 0 ? `${urunKod}-${parts.join('-')}` : urunKod;
  }

  async varyantOlustur(
    prisma: TenantClient,
    urunId: number,
    girdi: VaryantOlusturGirdi,
    kullaniciId: bigint,
  ) {
    const urun = await this.detay(prisma, urunId);
    const sku = girdi.sku?.trim() || this.skuUret(urun.kod, girdi.eksenKombinasyon);
    const cakisma = await prisma.urunVaryant.findUnique({ where: { sku }, select: { id: true } });
    if (cakisma) {
      throw new BadRequestException({ kod: 'SKU_TEKRAR', mesaj: `Bu SKU kullanılıyor: ${sku}` });
    }

    return prisma.$transaction(async (tx: any) => {
      if (girdi.varsayilanMi) {
        await tx.urunVaryant.updateMany({
          where: { urunId: BigInt(urunId), varsayilanMi: true },
          data: { varsayilanMi: false },
        });
      }
      const varyant = await tx.urunVaryant.create({
        data: {
          urunId: BigInt(urunId),
          sku,
          barkod: girdi.barkod ?? null,
          varyantAd: girdi.varyantAd ?? null,
          varsayilanMi: girdi.varsayilanMi,
          eksenKombinasyon: girdi.eksenKombinasyon ?? {},
          paraBirimiKod: (urun as any).varyantlar?.[0]?.paraBirimiKod ?? 'TRY',
          vergiOraniId: urun.vergiOraniId,
          birimId: urun.anaBirimId,
          alisFiyati: girdi.alisFiyati ?? null,
          sonAlisFiyati: girdi.sonAlisFiyati ?? null,
          piyasaFiyati: girdi.piyasaFiyati ?? null,
          satilabilirSonFiyat: girdi.satilabilirSonFiyat ?? null,
          karMarji: girdi.karMarji ?? null,
          agirlikGr: girdi.agirlikGr ?? null,
          enCm: girdi.enCm ?? null,
          boyCm: girdi.boyCm ?? null,
          yukseklikCm: girdi.yukseklikCm ?? null,
          kritikStok: girdi.kritikStok,
          minimumStok: girdi.minimumStok,
          anaResimUrl: girdi.anaResimUrl ?? null,
          sira: girdi.sira,
          olusturanKullaniciId: kullaniciId,
        },
      });

      // Satis fiyati verildiyse varsayilan fiyat listesine yaz
      if (girdi.satisFiyati !== undefined && girdi.satisFiyati !== null) {
        const varsayilanFL = await tx.fiyatListesi.findFirst({
          where: { varsayilanMi: true, aktifMi: true, silindiMi: false },
          select: { id: true },
        });
        if (varsayilanFL) {
          await tx.fiyatListesiVaryant.upsert({
            where: {
              fiyatListesiId_urunVaryantId_minimumMiktar: {
                fiyatListesiId: varsayilanFL.id,
                urunVaryantId: varyant.id,
                minimumMiktar: 1,
              },
            },
            create: {
              fiyatListesiId: varsayilanFL.id,
              urunVaryantId: varyant.id,
              fiyat: girdi.satisFiyati,
              minimumMiktar: 1,
            },
            update: { fiyat: girdi.satisFiyati },
          });
        }
      }

      return varyant;
    });
  }

  async varyantGuncelle(
    prisma: TenantClient,
    urunId: number,
    varyantId: number,
    girdi: VaryantGuncelleGirdi,
    kullaniciId: bigint,
  ) {
    const varyant = await prisma.urunVaryant.findFirst({
      where: { id: BigInt(varyantId), urunId: BigInt(urunId) },
    });
    if (!varyant) {
      throw new NotFoundException({ kod: 'VARYANT_BULUNAMADI', mesaj: `Varyant bulunamadı: ${varyantId}` });
    }

    if (girdi.sku && girdi.sku !== varyant.sku) {
      const cakisma = await prisma.urunVaryant.findUnique({ where: { sku: girdi.sku }, select: { id: true } });
      if (cakisma) {
        throw new BadRequestException({ kod: 'SKU_TEKRAR', mesaj: `Bu SKU kullanılıyor: ${girdi.sku}` });
      }
    }

    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };
    const alanlar: Array<keyof VaryantGuncelleGirdi> = [
      'sku', 'barkod', 'varyantAd', 'eksenKombinasyon',
      'alisFiyati', 'sonAlisFiyati', 'piyasaFiyati', 'satilabilirSonFiyat', 'karMarji',
      'agirlikGr', 'enCm', 'boyCm', 'yukseklikCm',
      'kritikStok', 'minimumStok',
      'anaResimUrl', 'sira', 'aktifMi',
    ];
    for (const alan of alanlar) {
      const val = (girdi as Record<string, unknown>)[alan];
      if (val !== undefined) veri[alan] = val;
    }

    return prisma.$transaction(async (tx: any) => {
      // Varsayilan ise digerlerini kapat
      if (girdi.varsayilanMi === true) {
        await tx.urunVaryant.updateMany({
          where: { urunId: BigInt(urunId), NOT: { id: varyant.id } },
          data: { varsayilanMi: false },
        });
        veri.varsayilanMi = true;
      }

      const guncelVaryant = Object.keys(veri).length > 1
        ? await tx.urunVaryant.update({ where: { id: varyant.id }, data: veri })
        : varyant;

      // Satis fiyati verildiyse varsayilan fiyat listesine yaz
      if (girdi.satisFiyati !== undefined && girdi.satisFiyati !== null) {
        const varsayilanFL = await tx.fiyatListesi.findFirst({
          where: { varsayilanMi: true, aktifMi: true, silindiMi: false },
          select: { id: true },
        });
        if (varsayilanFL) {
          await tx.fiyatListesiVaryant.upsert({
            where: {
              fiyatListesiId_urunVaryantId_minimumMiktar: {
                fiyatListesiId: varsayilanFL.id,
                urunVaryantId: varyant.id,
                minimumMiktar: 1,
              },
            },
            create: {
              fiyatListesiId: varsayilanFL.id,
              urunVaryantId: varyant.id,
              fiyat: girdi.satisFiyati,
              minimumMiktar: 1,
            },
            update: { fiyat: girdi.satisFiyati },
          });
        }
      }

      return guncelVaryant;
    });
  }

  /**
   * Varyant için otomatik EAN-13 barkod üretir ve kaydeder.
   * Veritabanında benzersiz olana kadar dener.
   */
  async varyantBarkodUret(prisma: TenantClient, urunId: number, varyantId: number, kullaniciId: bigint) {
    const varyant = await prisma.urunVaryant.findFirst({
      where: { id: BigInt(varyantId), urunId: BigInt(urunId) },
      select: { id: true, barkod: true },
    });
    if (!varyant) {
      throw new NotFoundException({ kod: 'VARYANT_BULUNAMADI', mesaj: `Varyant bulunamadı: ${varyantId}` });
    }

    const barkod = await ean13BenzersizUret(async (b) => {
      const varMi = await prisma.urunVaryant.findFirst({ where: { barkod: b }, select: { id: true } });
      if (varMi) return false;
      const altMi = await prisma.urunVaryantBarkod.findUnique({ where: { barkod: b }, select: { id: true } });
      return !altMi;
    });

    return prisma.urunVaryant.update({
      where: { id: varyant.id },
      data: { barkod, guncelleyenKullaniciId: kullaniciId },
    });
  }

  /**
   * Barkodu olmayan tüm varyantlara toplu EAN-13 barkod üretir.
   */
  async varyantTopluBarkodUret(prisma: TenantClient, urunId: number, kullaniciId: bigint) {
    await this.detay(prisma, urunId);
    const barkodsuz = await prisma.urunVaryant.findMany({
      where: {
        urunId: BigInt(urunId),
        silindiMi: false,
        OR: [{ barkod: null }, { barkod: '' }],
      },
      select: { id: true },
    });

    if (barkodsuz.length === 0) {
      return { uretilen: 0, mesaj: 'Tüm varyantların barkodu zaten var' };
    }

    let uretilen = 0;
    for (const v of barkodsuz) {
      const barkod = await ean13BenzersizUret(async (b) => {
        const varMi = await prisma.urunVaryant.findFirst({ where: { barkod: b }, select: { id: true } });
        if (varMi) return false;
        const altMi = await prisma.urunVaryantBarkod.findUnique({ where: { barkod: b }, select: { id: true } });
        return !altMi;
      });
      await prisma.urunVaryant.update({
        where: { id: v.id },
        data: { barkod, guncelleyenKullaniciId: kullaniciId },
      });
      uretilen++;
    }
    return { uretilen };
  }

  async varyantSil(prisma: TenantClient, urunId: number, varyantId: number, kullaniciId: bigint): Promise<void> {
    const varyant = await prisma.urunVaryant.findFirst({
      where: { id: BigInt(varyantId), urunId: BigInt(urunId) },
    });
    if (!varyant) {
      throw new NotFoundException({ kod: 'VARYANT_BULUNAMADI', mesaj: `Varyant bulunamadı: ${varyantId}` });
    }

    const siparisKalemi = await prisma.siparisKalem.findFirst({
      where: { urunVaryantId: varyant.id },
      select: { id: true },
    });
    if (siparisKalemi) {
      throw new BadRequestException({
        kod: 'VARYANT_KULLANIMDA',
        mesaj: 'Bu varyanta bağlı sipariş var, silinemez. Pasife alabilirsiniz.',
      });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.urunVaryant.update({
        where: { id: varyant.id },
        data: { silindiMi: true, silinmeTarihi: new Date(), silenKullaniciId: kullaniciId, aktifMi: false },
      });
      if (varyant.varsayilanMi) {
        const sonraki = await tx.urunVaryant.findFirst({
          where: { urunId: BigInt(urunId), silindiMi: false, NOT: { id: varyant.id } },
          orderBy: { sira: 'asc' },
        });
        if (sonraki) {
          await tx.urunVaryant.update({ where: { id: sonraki.id }, data: { varsayilanMi: true } });
        }
      }
    });
  }

  /**
   * Matris oto-üret: Eksenler × Seçenekler kombinasyonlarını varyant olarak oluşturur.
   * Mevcut kombinasyonları atlar.
   */
  async varyantMatrisUret(prisma: TenantClient, urunId: number, kullaniciId: bigint) {
    const urun = await this.detay(prisma, urunId);
    const eksenler = await prisma.urunVaryantEksen.findMany({
      where: { urunId: BigInt(urunId) },
      orderBy: { sira: 'asc' },
      include: { secenekler: { where: { aktifMi: true }, orderBy: { sira: 'asc' } } },
    });

    if (eksenler.length === 0) {
      throw new BadRequestException({
        kod: 'EKSEN_YOK',
        mesaj: 'Matris oluşturmak için önce en az bir eksen ve seçenek eklemelisin',
      });
    }

    // Cartesian product
    let kombinasyonlar: Array<Record<string, string>> = [{}];
    for (const eksen of eksenler) {
      if (eksen.secenekler.length === 0) continue;
      const yeni: Array<Record<string, string>> = [];
      for (const mevcut of kombinasyonlar) {
        for (const secenek of eksen.secenekler) {
          yeni.push({ ...mevcut, [eksen.eksenAd]: secenek.degerAd });
        }
      }
      kombinasyonlar = yeni;
    }

    if (kombinasyonlar.length === 0 || (kombinasyonlar.length === 1 && Object.keys(kombinasyonlar[0]).length === 0)) {
      throw new BadRequestException({ kod: 'KOMBINASYON_YOK', mesaj: 'Hiçbir eksende seçenek tanımlanmamış' });
    }

    const mevcutVaryantlar = await prisma.urunVaryant.findMany({
      where: { urunId: BigInt(urunId), silindiMi: false },
      select: { sku: true, eksenKombinasyon: true, varsayilanMi: true },
    });

    const mevcutKombKeys = new Set(
      mevcutVaryantlar.map((v) => JSON.stringify(v.eksenKombinasyon ?? {})),
    );

    const yeniKombinasyonlar = kombinasyonlar.filter(
      (k) => !mevcutKombKeys.has(JSON.stringify(k)),
    );

    if (yeniKombinasyonlar.length === 0) {
      return { eklenen: 0, toplam: mevcutVaryantlar.length, mesaj: 'Tüm kombinasyonlar zaten var' };
    }

    const varsayilanMevcutMu = mevcutVaryantlar.some((v) => v.varsayilanMi);

    return prisma.$transaction(async (tx: any) => {
      let eklenenSayi = 0;
      let ilkEklenen = true;
      for (const kombinasyon of yeniKombinasyonlar) {
        const sku = this.skuUret(urun.kod, kombinasyon);
        const varMi = await tx.urunVaryant.findUnique({ where: { sku }, select: { id: true } });
        if (varMi) continue;

        await tx.urunVaryant.create({
          data: {
            urunId: BigInt(urunId),
            sku,
            varyantAd: Object.values(kombinasyon).join(' / '),
            eksenKombinasyon: kombinasyon,
            varsayilanMi: !varsayilanMevcutMu && ilkEklenen,
            paraBirimiKod: 'TRY',
            vergiOraniId: urun.vergiOraniId,
            birimId: urun.anaBirimId,
            kritikStok: 0,
            minimumStok: 0,
            sira: eklenenSayi,
            olusturanKullaniciId: kullaniciId,
          },
        });
        eklenenSayi++;
        ilkEklenen = false;
      }
      return { eklenen: eklenenSayi, toplam: mevcutVaryantlar.length + eklenenSayi };
    });
  }

  // ════════════════════════════════════════════════════════════
  // RESİM YÖNETİMİ — UrunResim N-1 (bir urunun N resmi)
  // ════════════════════════════════════════════════════════════

  async resimleriListele(prisma: TenantClient, urunId: number) {
    await this.detay(prisma, urunId);
    return prisma.urunResim.findMany({
      where: { urunId: BigInt(urunId) },
      orderBy: [{ anaResimMi: 'desc' }, { sira: 'asc' }],
      include: {
        urunVaryant: {
          select: { id: true, sku: true, varyantAd: true, eksenKombinasyon: true },
        },
      },
    });
  }

  async resimYukle(
    prisma: TenantClient,
    urunId: number,
    dosya: { buffer: Buffer; filename: string; mimetype: string },
    tenantSlug: string,
    kullaniciId: bigint,
    options?: { varyantId?: number; altText?: string },
  ) {
    const urun = await this.detay(prisma, urunId);

    // SEO-friendly dosya adı: önce urun.seoUrl, yoksa slug(ad), yoksa kod
    const dosyaAdiSlug =
      (urun.seoUrl && urun.seoUrl.trim()) ||
      slugOlustur(urun.ad) ||
      urun.kod;

    // Yükle + WebP dönüşümü
    const yuklenen = await this.uploadService.resimYukle(
      dosya.buffer,
      dosya.filename,
      dosya.mimetype,
      {
        klasor: 'urun',
        tenantSlug,
        dosyaAdiSlug,
        maxGenislik: 1600,
        maxYukseklik: 1600,
        webpDonustur: true,
        kalite: 85,
      },
    );

    // Mevcut resim sayısı — ilk resim ise ana resim yap
    const mevcutSayi = await prisma.urunResim.count({
      where: { urunId: BigInt(urunId) },
    });
    const anaMi = mevcutSayi === 0;

    // Transaction: kayit olustur + urun.anaResimUrl cache guncelle (ilk resimse)
    const olusturulanResim = await prisma.$transaction(async (tx) => {
      const resim = await tx.urunResim.create({
        data: {
          urunId: BigInt(urunId),
          urunVaryantId: options?.varyantId ? BigInt(options.varyantId) : null,
          url: yuklenen.url,
          altText: options?.altText ?? urun.ad,
          sira: mevcutSayi,
          anaResimMi: anaMi,
        },
      });

      if (anaMi) {
        await tx.urun.update({
          where: { id: BigInt(urunId) },
          data: { anaResimUrl: yuklenen.url, guncelleyenKullaniciId: kullaniciId },
        });
      }

      return resim;
    });

    return olusturulanResim;
  }

  async resimSil(prisma: TenantClient, urunId: number, resimId: number, kullaniciId: bigint) {
    await this.detay(prisma, urunId);
    const resim = await prisma.urunResim.findFirst({
      where: { id: BigInt(resimId), urunId: BigInt(urunId) },
    });
    if (!resim) {
      throw new NotFoundException({ kod: 'RESIM_BULUNAMADI', mesaj: `Resim bulunamadı: ${resimId}` });
    }

    await prisma.$transaction(async (tx) => {
      await tx.urunResim.delete({ where: { id: resim.id } });

      // Silinen ana resim ise ilk kalan resmi ana yap
      if (resim.anaResimMi) {
        const sonraki = await tx.urunResim.findFirst({
          where: { urunId: BigInt(urunId) },
          orderBy: { sira: 'asc' },
        });
        if (sonraki) {
          await tx.urunResim.update({
            where: { id: sonraki.id },
            data: { anaResimMi: true },
          });
          await tx.urun.update({
            where: { id: BigInt(urunId) },
            data: { anaResimUrl: sonraki.url, guncelleyenKullaniciId: kullaniciId },
          });
        } else {
          // Hiç resim kalmadı
          await tx.urun.update({
            where: { id: BigInt(urunId) },
            data: { anaResimUrl: null, guncelleyenKullaniciId: kullaniciId },
          });
        }
      }
    });

    // Fiziksel dosyayı sil (best-effort, hata olursa sessizce geç)
    await this.uploadService.dosyaSil(resim.url);
  }

  async resimAnaYap(prisma: TenantClient, urunId: number, resimId: number, kullaniciId: bigint) {
    await this.detay(prisma, urunId);
    const resim = await prisma.urunResim.findFirst({
      where: { id: BigInt(resimId), urunId: BigInt(urunId) },
    });
    if (!resim) {
      throw new NotFoundException({ kod: 'RESIM_BULUNAMADI', mesaj: `Resim bulunamadı: ${resimId}` });
    }

    await prisma.$transaction(async (tx) => {
      // Diğer tüm resimleri ana=false yap
      await tx.urunResim.updateMany({
        where: { urunId: BigInt(urunId), NOT: { id: resim.id } },
        data: { anaResimMi: false },
      });
      // Bu resmi ana yap
      await tx.urunResim.update({
        where: { id: resim.id },
        data: { anaResimMi: true },
      });
      // Urun cache guncelle
      await tx.urun.update({
        where: { id: BigInt(urunId) },
        data: { anaResimUrl: resim.url, guncelleyenKullaniciId: kullaniciId },
      });
    });

    return prisma.urunResim.findUnique({ where: { id: resim.id } });
  }

  async resimSiralama(prisma: TenantClient, urunId: number, resimIds: number[]) {
    await this.detay(prisma, urunId);
    // Verilen sıraya göre UrunResim.sira alanlarını güncelle
    await prisma.$transaction(
      resimIds.map((id, idx) =>
        prisma.urunResim.update({
          where: { id: BigInt(id) },
          data: { sira: idx },
        }),
      ),
    );
    return this.resimleriListele(prisma, urunId);
  }

  // ════════════════════════════════════════════════════════════
  // ŞUBE STOK — varyant × mağaza matrisi + hareket geçmişi
  // ════════════════════════════════════════════════════════════

  /**
   * Bir ürünün tüm varyantlarının tüm mağazalardaki stok durumunu döner.
   * Gruplandırma frontend tarafında yapılır.
   */
  async stokOzet(prisma: TenantClient, urunId: number) {
    await this.detay(prisma, urunId);

    // Aktif varyantlar
    const varyantlar = await prisma.urunVaryant.findMany({
      where: { urunId: BigInt(urunId), silindiMi: false },
      orderBy: [{ varsayilanMi: 'desc' }, { sira: 'asc' }],
      select: {
        id: true,
        sku: true,
        barkod: true,
        varyantAd: true,
        varsayilanMi: true,
        eksenKombinasyon: true,
        paraBirimiKod: true,
        kritikStok: true,
      },
    });

    // Tüm aktif mağazalar
    const magazalar = await prisma.magaza.findMany({
      where: { aktifMi: true },
      orderBy: [{ ad: 'asc' }],
      select: { id: true, ad: true },
    });

    // Stok kayıtları (varyant × mağaza)
    const stoklar = await prisma.urunStok.findMany({
      where: { urunVaryantId: { in: varyantlar.map((v) => v.id) } },
      select: {
        urunVaryantId: true,
        magazaId: true,
        mevcutMiktar: true,
        rezerveMiktar: true,
        yoldaGelenMiktar: true,
        ortalamaMaliyet: true,
        sonAlisFiyati: true,
        sonAlisTarihi: true,
        sonAlisParaBirimi: true,
        sonGirisTarihi: true,
        sonCikisTarihi: true,
        sonSayimTarihi: true,
        kritikStok: true,
      },
    });

    // Varyant ve mağazaya göre O(1) arama için map
    const stokMap = new Map<string, (typeof stoklar)[number]>();
    for (const s of stoklar) {
      stokMap.set(`${s.urunVaryantId}_${s.magazaId}`, s);
    }

    return {
      varyantlar,
      magazalar,
      stoklar: varyantlar.flatMap((v) =>
        magazalar.map((m) => {
          const mevcut = stokMap.get(`${v.id}_${m.id}`);
          return {
            urunVaryantId: v.id,
            magazaId: m.id,
            mevcutMiktar: mevcut?.mevcutMiktar ?? '0',
            rezerveMiktar: mevcut?.rezerveMiktar ?? '0',
            yoldaGelenMiktar: mevcut?.yoldaGelenMiktar ?? '0',
            ortalamaMaliyet: mevcut?.ortalamaMaliyet ?? null,
            sonAlisFiyati: mevcut?.sonAlisFiyati ?? null,
            sonAlisTarihi: mevcut?.sonAlisTarihi ?? null,
            sonAlisParaBirimi: mevcut?.sonAlisParaBirimi ?? null,
            sonGirisTarihi: mevcut?.sonGirisTarihi ?? null,
            sonCikisTarihi: mevcut?.sonCikisTarihi ?? null,
            sonSayimTarihi: mevcut?.sonSayimTarihi ?? null,
            kritikStok: mevcut?.kritikStok ?? v.kritikStok ?? null,
          };
        }),
      ),
    };
  }

  /**
   * Bir varyantın bir mağazadaki stok hareket geçmişi.
   * Sayfalı — default son 50 hareket.
   */
  async stokHareketleri(
    prisma: TenantClient,
    urunId: number,
    varyantId: number,
    opts: { magazaId?: number; sayfa?: number; boyut?: number } = {},
  ) {
    await this.detay(prisma, urunId);
    const sayfa = opts.sayfa ?? 1;
    const boyut = Math.min(opts.boyut ?? 50, 200);

    const where: Record<string, unknown> = {
      urunVaryantId: BigInt(varyantId),
    };
    if (opts.magazaId) where.magazaId = BigInt(opts.magazaId);

    const [toplam, veriler] = await Promise.all([
      prisma.urunStokHareket.count({ where }),
      prisma.urunStokHareket.findMany({
        where,
        orderBy: { olusturmaTarihi: 'desc' },
        skip: (sayfa - 1) * boyut,
        take: boyut,
      }),
    ]);

    return { veriler, meta: { toplam, sayfa, boyut } };
  }

  // ════════════════════════════════════════════════════════════
  // STOK OPERASYONLARI — Sayım, Devir, Maliyet Override
  // ════════════════════════════════════════════════════════════

  /**
   * Sayım — bir mağazada N varyantın fiziksel sayısı. Fark → UrunStokHareket.
   * Transaction: her kalem için (fark varsa) hareket + UrunStok günceller.
   * hareketTipi='sayim' girisMiktar/cikisMiktar fark yönüne göre.
   */
  async stokSayim(
    prisma: TenantClient,
    urunId: number,
    girdi: StokSayimGirdi,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const magazaId = BigInt(girdi.magazaId);
    const varyantIdler = girdi.kalemler.map((k) => BigInt(k.urunVaryantId));

    // Hedef varyantlar bu ürüne mi ait?
    const varyantlar = await prisma.urunVaryant.findMany({
      where: { id: { in: varyantIdler }, urunId: BigInt(urunId), silindiMi: false },
      select: { id: true, paraBirimiKod: true },
    });
    if (varyantlar.length !== varyantIdler.length) {
      throw new BadRequestException({
        kod: 'VARYANT_HATALI',
        mesaj: 'Bazı varyantlar bu ürüne ait değil',
      });
    }
    const paraBirimiMap = new Map(varyantlar.map((v) => [String(v.id), v.paraBirimiKod]));

    return prisma.$transaction(async (tx: any) => {
      const sonuc: Array<{
        varyantId: string;
        sistemMiktar: number;
        sayilanMiktar: number;
        fark: number;
      }> = [];

      for (const kalem of girdi.kalemler) {
        const varyantId = BigInt(kalem.urunVaryantId);

        // Mevcut UrunStok — yoksa sıfırdan başla
        const mevcut = await tx.urunStok.findUnique({
          where: { urunVaryantId_magazaId: { urunVaryantId: varyantId, magazaId } },
        });
        const sistemMiktar = mevcut ? Number(mevcut.mevcutMiktar) : 0;
        const sayilan = kalem.sayilanMiktar;
        const fark = sayilan - sistemMiktar;

        // Fark yoksa hareket yazma, sadece sonSayimTarihi güncelle
        if (fark === 0) {
          if (mevcut) {
            await tx.urunStok.update({
              where: { id: mevcut.id },
              data: { sonSayimTarihi: new Date() },
            });
          } else {
            await tx.urunStok.create({
              data: {
                urunVaryantId: varyantId,
                magazaId,
                mevcutMiktar: 0,
                sonSayimTarihi: new Date(),
              },
            });
          }
          sonuc.push({ varyantId: String(varyantId), sistemMiktar, sayilanMiktar: sayilan, fark: 0 });
          continue;
        }

        // UrunStok upsert
        if (mevcut) {
          await tx.urunStok.update({
            where: { id: mevcut.id },
            data: {
              mevcutMiktar: sayilan,
              sonSayimTarihi: new Date(),
            },
          });
        } else {
          await tx.urunStok.create({
            data: {
              urunVaryantId: varyantId,
              magazaId,
              mevcutMiktar: sayilan,
              sonSayimTarihi: new Date(),
            },
          });
        }

        // Stok hareket kaydı — fark pozitif → giris, negatif → cikis
        await tx.urunStokHareket.create({
          data: {
            urunVaryantId: varyantId,
            magazaId,
            hareketTipi: 'sayim',
            girisMiktar: fark > 0 ? fark : 0,
            cikisMiktar: fark < 0 ? Math.abs(fark) : 0,
            oncesiMiktar: sistemMiktar,
            sonrasiMiktar: sayilan,
            paraBirimiKod: paraBirimiMap.get(String(varyantId)) ?? 'TRY',
            kaynakBelgeTipi: 'sayim',
            aciklama: kalem.aciklama ?? girdi.aciklama ?? null,
            kullaniciId,
          },
        });

        sonuc.push({ varyantId: String(varyantId), sistemMiktar, sayilanMiktar: sayilan, fark });
      }

      return {
        kayitliKalem: sonuc.length,
        farkliKalem: sonuc.filter((s) => s.fark !== 0).length,
        toplamArtis: sonuc.reduce((t, s) => (s.fark > 0 ? t + s.fark : t), 0),
        toplamAzalis: sonuc.reduce((t, s) => (s.fark < 0 ? t + Math.abs(s.fark) : t), 0),
        kalemler: sonuc,
      };
    });
  }

  /**
   * Devir / Açılış bakiyesi — sistem kurulumunda bir kez girilir.
   * Her kalem: varyant × mağaza için başlangıç miktarı + birim maliyet.
   * hareketTipi='devir' + UrunStok.mevcutMiktar + ortalamaMaliyet başlat.
   */
  async stokDevir(
    prisma: TenantClient,
    urunId: number,
    girdi: StokDevirGirdi,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const varyantIdler = Array.from(new Set(girdi.kalemler.map((k) => BigInt(k.urunVaryantId))));
    const varyantlar = await prisma.urunVaryant.findMany({
      where: { id: { in: varyantIdler }, urunId: BigInt(urunId), silindiMi: false },
      select: { id: true, paraBirimiKod: true },
    });
    if (varyantlar.length !== varyantIdler.length) {
      throw new BadRequestException({ kod: 'VARYANT_HATALI', mesaj: 'Bazı varyantlar bu ürüne ait değil' });
    }
    const paraBirimiMap = new Map(varyantlar.map((v) => [String(v.id), v.paraBirimiKod]));

    return prisma.$transaction(async (tx: any) => {
      let eklenenKalem = 0;
      let atlananKalem = 0;

      for (const kalem of girdi.kalemler) {
        const varyantId = BigInt(kalem.urunVaryantId);
        const magazaId = BigInt(kalem.magazaId);
        const paraBirimi = kalem.paraBirimiKod ?? paraBirimiMap.get(String(varyantId)) ?? 'TRY';

        const mevcut = await tx.urunStok.findUnique({
          where: { urunVaryantId_magazaId: { urunVaryantId: varyantId, magazaId } },
        });
        // Devir sadece başlangıç için: eğer stok mevcut ve mevcutMiktar > 0 ise atla
        if (mevcut && Number(mevcut.mevcutMiktar) > 0) {
          atlananKalem++;
          continue;
        }

        const birimMaliyet = kalem.birimMaliyet ?? 0;

        if (mevcut) {
          await tx.urunStok.update({
            where: { id: mevcut.id },
            data: {
              mevcutMiktar: kalem.miktar,
              ortalamaMaliyet: birimMaliyet,
              sonGirisTarihi: new Date(),
            },
          });
        } else {
          await tx.urunStok.create({
            data: {
              urunVaryantId: varyantId,
              magazaId,
              mevcutMiktar: kalem.miktar,
              ortalamaMaliyet: birimMaliyet,
              sonGirisTarihi: new Date(),
            },
          });
        }

        await tx.urunStokHareket.create({
          data: {
            urunVaryantId: varyantId,
            magazaId,
            hareketTipi: 'devir',
            girisMiktar: kalem.miktar,
            cikisMiktar: 0,
            oncesiMiktar: 0,
            sonrasiMiktar: kalem.miktar,
            birimMaliyet: birimMaliyet || null,
            toplamMaliyet: birimMaliyet ? birimMaliyet * kalem.miktar : null,
            paraBirimiKod: paraBirimi,
            kaynakBelgeTipi: 'devir',
            aciklama: girdi.aciklama ?? 'Açılış bakiyesi',
            kullaniciId,
          },
        });

        eklenenKalem++;
      }

      return { eklenenKalem, atlananKalem };
    });
  }

  /**
   * Ortalama maliyet override — kullanıcı manuel ortalama maliyeti düzeltir.
   * Hareket kaydı açıklama ile yazılır, UrunStok.ortalamaMaliyet güncellenir.
   * Fiziksel stok değişmez, sadece maliyet.
   */
  async ortalamaMaliyetOverride(
    prisma: TenantClient,
    urunId: number,
    girdi: OrtalamaMaliyetOverrideGirdi,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const varyantId = BigInt(girdi.urunVaryantId);
    const magazaId = BigInt(girdi.magazaId);

    const varyant = await prisma.urunVaryant.findFirst({
      where: { id: varyantId, urunId: BigInt(urunId), silindiMi: false },
      select: { paraBirimiKod: true },
    });
    if (!varyant) {
      throw new NotFoundException({ kod: 'VARYANT_BULUNAMADI', mesaj: 'Varyant bulunamadı' });
    }

    const mevcut = await prisma.urunStok.findUnique({
      where: { urunVaryantId_magazaId: { urunVaryantId: varyantId, magazaId } },
    });
    if (!mevcut) {
      throw new BadRequestException({
        kod: 'STOK_YOK',
        mesaj: 'Bu mağazada bu varyant için stok kaydı yok — önce devir veya alış ile oluşturun',
      });
    }

    const eskiMaliyet = Number(mevcut.ortalamaMaliyet);

    return prisma.$transaction(async (tx: any) => {
      await tx.urunStok.update({
        where: { id: mevcut.id },
        data: { ortalamaMaliyet: girdi.yeniMaliyet },
      });

      await tx.urunStokHareket.create({
        data: {
          urunVaryantId: varyantId,
          magazaId,
          hareketTipi: 'maliyet_duzeltme',
          girisMiktar: 0,
          cikisMiktar: 0,
          oncesiMiktar: mevcut.mevcutMiktar,
          sonrasiMiktar: mevcut.mevcutMiktar,
          birimMaliyet: girdi.yeniMaliyet,
          paraBirimiKod: varyant.paraBirimiKod,
          kaynakBelgeTipi: 'maliyet_duzeltme',
          aciklama: `Ort. maliyet: ${eskiMaliyet} → ${girdi.yeniMaliyet}. Sebep: ${girdi.aciklama}`,
          kullaniciId,
        },
      });

      return { eskiMaliyet, yeniMaliyet: girdi.yeniMaliyet };
    });
  }

  // ════════════════════════════════════════════════════════════
  // VIRMAN / TRANSFER (Mağazalar arası stok transferi)
  // ════════════════════════════════════════════════════════════

  /**
   * Yeni transfer oluştur — atomik olarak:
   *  1) StokTransfer belgesi (durum='yolda', transferNo oto üretim)
   *  2) StokTransferKalem'ler
   *  3) Her kalem için kaynak UrunStok.mevcutMiktar -= miktar
   *     + hedef UrunStok.yoldaGelenMiktar += miktar
   *     + UrunStokHareket: 2 adet (transfer_cikis kaynak, transfer_yolda hedef)
   * Hata: kaynakta yetersiz stok varsa işlem reddedilir.
   */
  async transferOlustur(
    prisma: TenantClient,
    urunId: number,
    girdi: StokTransferOlusturGirdi,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const kaynakMagazaId = BigInt(girdi.kaynakMagazaId);
    const hedefMagazaId = BigInt(girdi.hedefMagazaId);

    if (kaynakMagazaId === hedefMagazaId) {
      throw new BadRequestException({ kod: 'AYNI_MAGAZA', mesaj: 'Kaynak ve hedef mağaza aynı olamaz' });
    }

    const varyantIdler = Array.from(new Set(girdi.kalemler.map((k) => BigInt(k.urunVaryantId))));
    const varyantlar = await prisma.urunVaryant.findMany({
      where: { id: { in: varyantIdler }, urunId: BigInt(urunId), silindiMi: false },
      select: { id: true, paraBirimiKod: true, sku: true },
    });
    if (varyantlar.length !== varyantIdler.length) {
      throw new BadRequestException({ kod: 'VARYANT_HATALI', mesaj: 'Bazı varyantlar bu ürüne ait değil' });
    }
    const paraBirimiMap = new Map(varyantlar.map((v) => [String(v.id), v.paraBirimiKod]));
    const skuMap = new Map(varyantlar.map((v) => [String(v.id), v.sku]));

    // Kaynak stok yeterlilik ön kontrolü
    const kaynakStoklar = await prisma.urunStok.findMany({
      where: { urunVaryantId: { in: varyantIdler }, magazaId: kaynakMagazaId },
      select: { urunVaryantId: true, mevcutMiktar: true, rezerveMiktar: true },
    });
    const kaynakMap = new Map(
      kaynakStoklar.map((s) => [String(s.urunVaryantId), { mevcut: Number(s.mevcutMiktar), rezerve: Number(s.rezerveMiktar) }]),
    );
    const yetersiz: Array<{ varyantId: string; sku: string; mevcut: number; istenen: number }> = [];
    for (const k of girdi.kalemler) {
      const mevcut = kaynakMap.get(String(k.urunVaryantId))?.mevcut ?? 0;
      if (k.miktar > mevcut) {
        yetersiz.push({
          varyantId: String(k.urunVaryantId),
          sku: skuMap.get(String(k.urunVaryantId)) ?? String(k.urunVaryantId),
          mevcut,
          istenen: k.miktar,
        });
      }
    }
    if (yetersiz.length > 0) {
      throw new BadRequestException({
        kod: 'YETERSIZ_STOK',
        mesaj: `${yetersiz.length} kalemde kaynak stok yetersiz`,
        detay: { yetersiz },
      });
    }

    return prisma.$transaction(async (tx: any) => {
      // 1) Transfer belgesi
      const transferOlusturFn = (transferNo: string) => tx.stokTransfer.create({
        data: {
          transferNo,
          kaynakMagazaId,
          hedefMagazaId,
          durum: 'yolda',
          talepTarihi: new Date(),
          gonderimTarihi: new Date(),
          beklenenTeslimTarihi: girdi.beklenenTeslimTarihi ? new Date(girdi.beklenenTeslimTarihi) : null,
          aracPlaka: girdi.aracPlaka ?? null,
          soforAdSoyad: girdi.soforAdSoyad ?? null,
          kargoFirma: girdi.kargoFirma ?? null,
          kargoTakipNo: girdi.kargoTakipNo ?? null,
          aciklama: girdi.aciklama ?? null,
          talepEdenKullaniciId: kullaniciId,
          gonderenKullaniciId: kullaniciId,
          onaylayanKullaniciId: kullaniciId,
          onayTarihi: new Date(),
          kalemler: {
            create: girdi.kalemler.map((k, idx) => ({
              urunVaryantId: BigInt(k.urunVaryantId),
              talepMiktar: k.miktar,
              gonderilenMiktar: k.miktar,
              teslimAlinanMiktar: 0,
              aciklama: k.aciklama ?? null,
              sira: idx,
            })),
          },
        },
      });

      const transfer: any = await kodIleOlustur(tx, 'stok_transfer', 'TRN', transferOlusturFn, 6);

      // 2) Her kalem için UrunStok + UrunStokHareket
      for (const kalem of girdi.kalemler) {
        const varyantId = BigInt(kalem.urunVaryantId);
        const paraBirimi = paraBirimiMap.get(String(varyantId)) ?? 'TRY';

        // Kaynak stok — mevcut azalır
        const kaynakStok = await tx.urunStok.findUnique({
          where: { urunVaryantId_magazaId: { urunVaryantId: varyantId, magazaId: kaynakMagazaId } },
        });
        if (!kaynakStok) {
          throw new BadRequestException({ kod: 'KAYNAK_STOK_YOK', mesaj: 'Kaynak stok kaydı bulunamadı' });
        }
        const kaynakYeni = Number(kaynakStok.mevcutMiktar) - kalem.miktar;
        await tx.urunStok.update({
          where: { id: kaynakStok.id },
          data: { mevcutMiktar: kaynakYeni, sonCikisTarihi: new Date() },
        });

        // Hedef stok — yolda artar (yoksa oluştur)
        const hedefStok = await tx.urunStok.findUnique({
          where: { urunVaryantId_magazaId: { urunVaryantId: varyantId, magazaId: hedefMagazaId } },
        });
        if (hedefStok) {
          await tx.urunStok.update({
            where: { id: hedefStok.id },
            data: { yoldaGelenMiktar: Number(hedefStok.yoldaGelenMiktar) + kalem.miktar },
          });
        } else {
          await tx.urunStok.create({
            data: {
              urunVaryantId: varyantId,
              magazaId: hedefMagazaId,
              mevcutMiktar: 0,
              yoldaGelenMiktar: kalem.miktar,
            },
          });
        }

        // Hareket logu — kaynak çıkış
        await tx.urunStokHareket.create({
          data: {
            urunVaryantId: varyantId,
            magazaId: kaynakMagazaId,
            hareketTipi: 'transfer_cikis',
            girisMiktar: 0,
            cikisMiktar: kalem.miktar,
            oncesiMiktar: kaynakStok.mevcutMiktar,
            sonrasiMiktar: kaynakYeni,
            paraBirimiKod: paraBirimi,
            kaynakBelgeTipi: 'stok_transfer',
            kaynakBelgeId: transfer.id,
            aciklama: `Transfer ${transfer.transferNo} → gönderildi`,
            kullaniciId,
          },
        });
      }

      return tx.stokTransfer.findUnique({
        where: { id: transfer.id },
        include: { kalemler: true },
      });
    });
  }

  /**
   * Ürüne ait transferleri listele (ürünün varyantlarının dahil olduğu).
   */
  async transferListele(prisma: TenantClient, urunId: number, opts: { durum?: string; sayfa?: number; boyut?: number } = {}) {
    await this.detay(prisma, urunId);
    const sayfa = opts.sayfa ?? 1;
    const boyut = Math.min(opts.boyut ?? 50, 200);

    // Bu ürüne ait varyantları bul
    const varyantlar = await prisma.urunVaryant.findMany({
      where: { urunId: BigInt(urunId) },
      select: { id: true },
    });
    const varyantIdler = varyantlar.map((v) => v.id);

    const where: Record<string, unknown> = {
      kalemler: { some: { urunVaryantId: { in: varyantIdler } } },
    };
    if (opts.durum) where.durum = opts.durum;

    const [toplam, veriler] = await Promise.all([
      prisma.stokTransfer.count({ where }),
      prisma.stokTransfer.findMany({
        where,
        orderBy: { olusturmaTarihi: 'desc' },
        skip: (sayfa - 1) * boyut,
        take: boyut,
        include: {
          kalemler: {
            where: { urunVaryantId: { in: varyantIdler } },
            include: {
              urunVaryant: {
                select: { id: true, sku: true, varyantAd: true, eksenKombinasyon: true },
              },
            },
          },
        },
      }),
    ]);

    return { veriler, meta: { toplam, sayfa, boyut } };
  }

  /**
   * Transfer teslim al — hedef mağazada mevcutMiktar artar, yoldaGelenMiktar azalır.
   * Durum: yolda → tamamlandi
   */
  async transferTeslimAl(
    prisma: TenantClient,
    urunId: number,
    transferId: number,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const transfer = await prisma.stokTransfer.findUnique({
      where: { id: BigInt(transferId) },
      include: {
        kalemler: {
          include: { urunVaryant: { select: { paraBirimiKod: true, urunId: true } } },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException({ kod: 'TRANSFER_BULUNAMADI', mesaj: 'Transfer bulunamadı' });
    }
    if (transfer.durum !== 'yolda') {
      throw new BadRequestException({
        kod: 'DURUM_UYGUN_DEGIL',
        mesaj: `Sadece yoldaki transferler teslim alınabilir (mevcut durum: ${transfer.durum})`,
      });
    }
    // Bu ürüne ait kalemler var mı?
    const urunIdBig = BigInt(urunId);
    if (!transfer.kalemler.some((k) => k.urunVaryant.urunId === urunIdBig)) {
      throw new BadRequestException({ kod: 'URUN_HATALI', mesaj: 'Bu transfer bu ürüne ait değil' });
    }

    return prisma.$transaction(async (tx: any) => {
      for (const kalem of transfer.kalemler) {
        const miktar = Number(kalem.gonderilenMiktar);
        if (miktar <= 0) continue;

        const hedefStok = await tx.urunStok.findUnique({
          where: {
            urunVaryantId_magazaId: {
              urunVaryantId: kalem.urunVaryantId,
              magazaId: transfer.hedefMagazaId,
            },
          },
        });
        if (!hedefStok) {
          throw new BadRequestException({ kod: 'HEDEF_STOK_YOK', mesaj: 'Hedef stok kaydı yok' });
        }

        const oncesiMevcut = Number(hedefStok.mevcutMiktar);
        const oncesiYolda = Number(hedefStok.yoldaGelenMiktar);
        const sonrasiMevcut = oncesiMevcut + miktar;
        const sonrasiYolda = Math.max(0, oncesiYolda - miktar);

        await tx.urunStok.update({
          where: { id: hedefStok.id },
          data: {
            mevcutMiktar: sonrasiMevcut,
            yoldaGelenMiktar: sonrasiYolda,
            sonGirisTarihi: new Date(),
          },
        });

        await tx.stokTransferKalem.update({
          where: { id: kalem.id },
          data: { teslimAlinanMiktar: miktar },
        });

        await tx.urunStokHareket.create({
          data: {
            urunVaryantId: kalem.urunVaryantId,
            magazaId: transfer.hedefMagazaId,
            hareketTipi: 'transfer_giris',
            girisMiktar: miktar,
            cikisMiktar: 0,
            oncesiMiktar: oncesiMevcut,
            sonrasiMiktar: sonrasiMevcut,
            paraBirimiKod: kalem.urunVaryant.paraBirimiKod,
            kaynakBelgeTipi: 'stok_transfer',
            kaynakBelgeId: transfer.id,
            aciklama: `Transfer ${transfer.transferNo} → teslim alındı`,
            kullaniciId,
          },
        });
      }

      return tx.stokTransfer.update({
        where: { id: transfer.id },
        data: {
          durum: 'tamamlandi',
          teslimTarihi: new Date(),
          teslimAlanKullaniciId: kullaniciId,
        },
        include: { kalemler: true },
      });
    });
  }

  /**
   * Transfer iptal — durum='yolda' ise kaynağa geri döndürür.
   * taslak durumdan iptal stok etkisi yok.
   */
  async transferIptal(
    prisma: TenantClient,
    urunId: number,
    transferId: number,
    aciklama: string | null,
    kullaniciId: bigint,
  ) {
    await this.detay(prisma, urunId);

    const transfer = await prisma.stokTransfer.findUnique({
      where: { id: BigInt(transferId) },
      include: {
        kalemler: {
          include: { urunVaryant: { select: { paraBirimiKod: true, urunId: true } } },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException({ kod: 'TRANSFER_BULUNAMADI', mesaj: 'Transfer bulunamadı' });
    }
    if (!['taslak', 'yolda'].includes(transfer.durum)) {
      throw new BadRequestException({
        kod: 'DURUM_UYGUN_DEGIL',
        mesaj: `Tamamlanmış transferler iptal edilemez (durum: ${transfer.durum})`,
      });
    }

    return prisma.$transaction(async (tx: any) => {
      // Yolda ise stok kaynağa geri dön
      if (transfer.durum === 'yolda') {
        for (const kalem of transfer.kalemler) {
          const miktar = Number(kalem.gonderilenMiktar);
          if (miktar <= 0) continue;

          const kaynakStok = await tx.urunStok.findUnique({
            where: {
              urunVaryantId_magazaId: {
                urunVaryantId: kalem.urunVaryantId,
                magazaId: transfer.kaynakMagazaId,
              },
            },
          });
          if (kaynakStok) {
            const yeniMiktar = Number(kaynakStok.mevcutMiktar) + miktar;
            await tx.urunStok.update({
              where: { id: kaynakStok.id },
              data: { mevcutMiktar: yeniMiktar, sonGirisTarihi: new Date() },
            });
            await tx.urunStokHareket.create({
              data: {
                urunVaryantId: kalem.urunVaryantId,
                magazaId: transfer.kaynakMagazaId,
                hareketTipi: 'transfer_iptal',
                girisMiktar: miktar,
                cikisMiktar: 0,
                oncesiMiktar: kaynakStok.mevcutMiktar,
                sonrasiMiktar: yeniMiktar,
                paraBirimiKod: kalem.urunVaryant.paraBirimiKod,
                kaynakBelgeTipi: 'stok_transfer',
                kaynakBelgeId: transfer.id,
                aciklama: `Transfer ${transfer.transferNo} iptal — stok kaynağa iade`,
                kullaniciId,
              },
            });
          }

          // Hedef stokta yoldaGelen azalt
          const hedefStok = await tx.urunStok.findUnique({
            where: {
              urunVaryantId_magazaId: {
                urunVaryantId: kalem.urunVaryantId,
                magazaId: transfer.hedefMagazaId,
              },
            },
          });
          if (hedefStok) {
            await tx.urunStok.update({
              where: { id: hedefStok.id },
              data: { yoldaGelenMiktar: Math.max(0, Number(hedefStok.yoldaGelenMiktar) - miktar) },
            });
          }
        }
      }

      return tx.stokTransfer.update({
        where: { id: transfer.id },
        data: {
          durum: 'iptal',
          notlar: aciklama
            ? `${transfer.notlar ?? ''}\n[İptal] ${aciklama}`.trim()
            : transfer.notlar,
        },
        include: { kalemler: true },
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // BARKOD İLE ÜRÜN ARAMA (POS ve alış ekranları için)
  // ════════════════════════════════════════════════════════════

  async barkodIleAra(prisma: TenantClient, barkod: string) {
    // Önce ana barkod'dan
    const varyant = await prisma.urunVaryant.findFirst({
      where: {
        silindiMi: false,
        OR: [
          { barkod },
          { barkodlar: { some: { barkod } } },
          { sku: barkod },
        ],
      },
      include: {
        urun: {
          include: {
            kategori: { select: { id: true, ad: true } },
            marka:    { select: { id: true, ad: true } },
          },
        },
        fiyatListeVaryantlar: {
          where: { fiyatListesi: { varsayilanMi: true, aktifMi: true } },
          take: 1,
        },
        stoklar: true,
      },
    });

    if (!varyant) {
      throw new NotFoundException({ kod: 'BARKOD_BULUNAMADI', mesaj: `Barkod bulunamadı: ${barkod}` });
    }
    return varyant;
  }
}
