import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  KategoriOlusturGirdi,
  KategoriGuncelleGirdi,
  KategoriListeSorgu,
  KategoriTasiGirdi,
  KategoriSiralaGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

// UI derinlik limiti (DB'de sınırsız, UX için)
const MAKS_DERINLIK = 5;

@Injectable()
export class KategoriService {
  // ────────────────────────────────────────────────
  // LİSTE / AĞAÇ
  // ────────────────────────────────────────────────

  /** Flat listele (filtrelenebilir, sayfalanabilir) */
  async listele(prisma: TenantClient, sorgu: KategoriListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.aktifMi !== undefined) where.aktifMi = sorgu.aktifMi === 'true';
    if (sorgu.eticaretAktif !== undefined) where.eticaretAktif = sorgu.eticaretAktif === 'true';
    if (sorgu.b2bAktif !== undefined) where.b2bAktif = sorgu.b2bAktif === 'true';
    if (sorgu.ustKategoriId !== undefined) {
      where.ustKategoriId = sorgu.ustKategoriId === 0 ? null : BigInt(sorgu.ustKategoriId);
    }
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    const [toplam, veriler] = await Promise.all([
      prisma.kategori.count({ where }),
      prisma.kategori.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy: [{ seviye: 'asc' }, { sira: 'asc' }, { ad: 'asc' }],
        include: {
          _count: {
            select: {
              urunler: { where: { silindiMi: false } },
              altKategoriler: { where: { silindiMi: false } },
            },
          },
        },
      }),
    ]);

    return { veriler, meta: { toplam, sayfa: sorgu.sayfa, boyut: sorgu.boyut } };
  }

  /** Hiyerarşik ağaç — tüm kategoriler, nested olarak döner */
  async agac(prisma: TenantClient, sadeceAktif = false) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sadeceAktif) where.aktifMi = true;

    const kategoriler = await prisma.kategori.findMany({
      where,
      orderBy: [{ seviye: 'asc' }, { sira: 'asc' }, { ad: 'asc' }],
      include: {
        _count: {
          select: {
            urunler: { where: { silindiMi: false } },
            altKategoriler: { where: { silindiMi: false } },
          },
        },
      },
    });

    // ID → kategori haritası
    const harita = new Map<string, any>();
    kategoriler.forEach((k) => harita.set(k.id.toString(), { ...k, altKategoriler: [] }));

    // Ağaç kur
    const kok: any[] = [];
    for (const k of kategoriler) {
      const dugum = harita.get(k.id.toString());
      if (k.ustKategoriId) {
        const ust = harita.get(k.ustKategoriId.toString());
        if (ust) ust.altKategoriler.push(dugum);
        else kok.push(dugum); // parent yoksa kök olarak at
      } else {
        kok.push(dugum);
      }
    }
    return kok;
  }

  async detay(prisma: TenantClient, id: number) {
    const kategori = await prisma.kategori.findFirst({
      where: { id: BigInt(id), silindiMi: false },
      include: {
        ustKategori: { select: { id: true, kod: true, ad: true } },
        _count: {
          select: {
            urunler: { where: { silindiMi: false } },
            altKategoriler: { where: { silindiMi: false } },
          },
        },
      },
    });
    if (!kategori) {
      throw new NotFoundException({ kod: 'KATEGORI_BULUNAMADI', mesaj: `Kategori bulunamadı: ${id}` });
    }
    return kategori;
  }

  // ────────────────────────────────────────────────
  // OLUŞTUR
  // ────────────────────────────────────────────────

  async olustur(prisma: TenantClient, girdi: KategoriOlusturGirdi, kullaniciId: bigint) {
    // Kullanıcı kod verdiyse benzersiz mi kontrol et
    if (girdi.kod) {
      const cakisma = await prisma.kategori.findFirst({
        where: { kod: girdi.kod, silindiMi: false },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    // Seviye hesapla
    let seviye = 1;
    if (girdi.ustKategoriId) {
      const ust = await prisma.kategori.findFirst({
        where: { id: BigInt(girdi.ustKategoriId), silindiMi: false },
        select: { id: true, seviye: true },
      });
      if (!ust) {
        throw new BadRequestException({ kod: 'UST_KATEGORI_BULUNAMADI', mesaj: 'Üst kategori bulunamadı' });
      }
      seviye = ust.seviye + 1;
      if (seviye > MAKS_DERINLIK) {
        throw new BadRequestException({
          kod: 'MAKS_DERINLIK',
          mesaj: `Maksimum ${MAKS_DERINLIK} seviyeye kadar kategori oluşturulabilir`,
        });
      }
    }

    const olusturVeri = (kod: string) => prisma.kategori.create({
      data: {
        kod,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        ustKategoriId: girdi.ustKategoriId ? BigInt(girdi.ustKategoriId) : null,
        seviye,
        resimUrl: girdi.resimUrl ?? null,
        bannerUrl: girdi.bannerUrl ?? null,
        ikon: girdi.ikon ?? null,
        renk: girdi.renk ?? null,
        icerik: girdi.icerik ?? null,
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
    return kodIleOlustur(prisma, 'kategori', 'KAT', olusturVeri);
  }

  // ────────────────────────────────────────────────
  // GÜNCELLE
  // ────────────────────────────────────────────────

  async guncelle(prisma: TenantClient, id: number, girdi: KategoriGuncelleGirdi, kullaniciId: bigint) {
    const mevcut = await this.detay(prisma, id);

    if (girdi.kod && girdi.kod !== mevcut.kod) {
      const cakisma = await prisma.kategori.findFirst({
        where: { kod: girdi.kod, silindiMi: false, NOT: { id: BigInt(id) } },
        select: { id: true },
      });
      if (cakisma) {
        throw new BadRequestException({ kod: 'KOD_TEKRAR', mesaj: `Bu kod zaten kullanılıyor: ${girdi.kod}` });
      }
    }

    // Üst kategori değişiyorsa → taşı (seviyelerini güncelle)
    if (girdi.ustKategoriId !== undefined) {
      const yeniUst = girdi.ustKategoriId;
      if (yeniUst !== (mevcut.ustKategoriId ? Number(mevcut.ustKategoriId) : null)) {
        await this.tasi(prisma, id, { id, yeniUstKategoriId: yeniUst, yeniSira: girdi.sira ?? mevcut.sira });
      }
    }

    const veri: Record<string, unknown> = { guncelleyenKullaniciId: kullaniciId };
    const alanlar: Array<keyof KategoriGuncelleGirdi> = [
      'kod', 'ad', 'aciklama', 'resimUrl', 'bannerUrl', 'ikon', 'renk', 'icerik',
      'seoUrl', 'seoBaslik', 'seoAciklama', 'seoAnahtarKelimeler',
      'ogImageUrl', 'canonicalUrl', 'eticaretAktif', 'b2bAktif', 'sira', 'aktifMi',
    ];
    for (const alan of alanlar) {
      if ((girdi as Record<string, unknown>)[alan] !== undefined) {
        veri[alan] = (girdi as Record<string, unknown>)[alan];
      }
    }

    return prisma.kategori.update({ where: { id: BigInt(id) }, data: veri });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const kategori = await this.detay(prisma, id);
    return prisma.kategori.update({
      where: { id: BigInt(id) },
      data: { aktifMi: !kategori.aktifMi, guncelleyenKullaniciId: kullaniciId },
    });
  }

  // ────────────────────────────────────────────────
  // TAŞIMA (drag-drop parent değişimi)
  // ────────────────────────────────────────────────

  async tasi(prisma: TenantClient, id: number, girdi: KategoriTasiGirdi) {
    const kategori = await this.detay(prisma, id);

    // Kendini parent yapamaz
    if (girdi.yeniUstKategoriId === id) {
      throw new BadRequestException({ kod: 'KENDINI_TASIYAMAZ', mesaj: 'Kategori kendisinin altına taşınamaz' });
    }

    // Kendi alt ağacına taşıma engeli (döngü önleme)
    if (girdi.yeniUstKategoriId !== null) {
      const altAgacIdleri = await this.altAgacIdleri(prisma, id);
      if (altAgacIdleri.includes(girdi.yeniUstKategoriId)) {
        throw new BadRequestException({
          kod: 'DONGU',
          mesaj: 'Kategori kendi alt kategorilerinden birinin altına taşınamaz',
        });
      }
    }

    // Yeni seviye hesapla
    let yeniSeviye = 1;
    if (girdi.yeniUstKategoriId) {
      const yeniUst = await prisma.kategori.findFirst({
        where: { id: BigInt(girdi.yeniUstKategoriId), silindiMi: false },
        select: { seviye: true },
      });
      if (!yeniUst) {
        throw new BadRequestException({ kod: 'UST_KATEGORI_BULUNAMADI', mesaj: 'Yeni üst kategori bulunamadı' });
      }
      yeniSeviye = yeniUst.seviye + 1;
    }

    // Max derinlik kontrolü (kendisi + alt ağacı için)
    const altDerinlik = await this.altMaksDerinlik(prisma, id, kategori.seviye);
    const ekSeviye = altDerinlik - kategori.seviye;
    if (yeniSeviye + ekSeviye > MAKS_DERINLIK) {
      throw new BadRequestException({
        kod: 'MAKS_DERINLIK',
        mesaj: `Taşıma sonrası maksimum ${MAKS_DERINLIK} seviye aşılıyor`,
      });
    }

    // Güncelle
    await prisma.kategori.update({
      where: { id: BigInt(id) },
      data: {
        ustKategoriId: girdi.yeniUstKategoriId ? BigInt(girdi.yeniUstKategoriId) : null,
        seviye: yeniSeviye,
        sira: girdi.yeniSira,
      },
    });

    // Alt ağacın seviyelerini kaskat güncelle
    const seviyeFarki = yeniSeviye - kategori.seviye;
    if (seviyeFarki !== 0) {
      const altIdler = await this.altAgacIdleri(prisma, id);
      if (altIdler.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE kategori SET seviye = seviye + $1 WHERE id = ANY($2::bigint[])`,
          seviyeFarki,
          altIdler,
        );
      }
    }

    return this.detay(prisma, id);
  }

  // ────────────────────────────────────────────────
  // SIRALAMA (aynı parent altında)
  // ────────────────────────────────────────────────

  async sirala(prisma: TenantClient, girdi: KategoriSiralaGirdi): Promise<void> {
    // Toplu transaction
    await prisma.$transaction(
      girdi.siralama.map((s) =>
        prisma.kategori.update({
          where: { id: BigInt(s.id) },
          data: { sira: s.sira },
        }),
      ),
    );
  }

  // ────────────────────────────────────────────────
  // SİL (yumuşak silme)
  // ────────────────────────────────────────────────

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    const kategori = await this.detay(prisma, id);
    if (kategori._count.altKategoriler > 0) {
      throw new BadRequestException({
        kod: 'ALT_KATEGORI_VAR',
        mesaj: `Bu kategoride ${kategori._count.altKategoriler} alt kategori var, önce onları silin veya taşıyın.`,
      });
    }
    if (kategori._count.urunler > 0) {
      throw new BadRequestException({
        kod: 'URUN_VAR',
        mesaj: `Bu kategoride ${kategori._count.urunler} ürün var, silinemez. Pasife alabilirsiniz.`,
      });
    }
    await prisma.kategori.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }

  // ────────────────────────────────────────────────
  // YARDIMCI
  // ────────────────────────────────────────────────

  /** Bir kategorinin tüm alt ağacındaki ID'leri döndürür (kendisi hariç) */
  private async altAgacIdleri(prisma: TenantClient, id: number): Promise<number[]> {
    const sonuc: number[] = [];
    const kuyruk: bigint[] = [BigInt(id)];
    while (kuyruk.length > 0) {
      const mevcut = kuyruk.shift()!;
      const altlar = await prisma.kategori.findMany({
        where: { ustKategoriId: mevcut, silindiMi: false },
        select: { id: true },
      });
      for (const alt of altlar) {
        sonuc.push(Number(alt.id));
        kuyruk.push(alt.id);
      }
    }
    return sonuc;
  }

  /** Alt ağacın ulaştığı maksimum seviyeyi hesapla */
  private async altMaksDerinlik(prisma: TenantClient, id: number, baslangicSeviye: number): Promise<number> {
    const altIdler = await this.altAgacIdleri(prisma, id);
    if (altIdler.length === 0) return baslangicSeviye;
    const sonuc = await prisma.kategori.aggregate({
      where: { id: { in: altIdler.map((x) => BigInt(x)) }, silindiMi: false },
      _max: { seviye: true },
    });
    return sonuc._max.seviye ?? baslangicSeviye;
  }
}
