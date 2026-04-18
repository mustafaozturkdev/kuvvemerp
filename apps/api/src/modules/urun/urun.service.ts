import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  UrunOlusturGirdi,
  UrunGuncelleGirdi,
  UrunListeSorgu,
  UrunTopluAktiflikGirdi,
  UrunTopluAlanGuncelleGirdi,
  VaryantFiyatGuncelleGirdi,
  VaryantBarkodEkleGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

type AnyPrisma = TenantClient | any;

@Injectable()
export class UrunService {
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
