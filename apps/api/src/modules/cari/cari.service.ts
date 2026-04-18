import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type {
  CariGuncelleGirdi,
  CariListeSorgu,
  CariOlusturGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';
import { kodIleOlustur } from '../../common/helpers/kod-uretici.js';

@Injectable()
export class CariService {
  async listele(prisma: TenantClient, sorgu: CariListeSorgu) {
    const where: Record<string, unknown> = { silindiMi: false };
    if (sorgu.tip) where.tip = sorgu.tip;
    if (sorgu.grupId) where.cariGrupId = BigInt(sorgu.grupId);
    if (sorgu.aktifMi !== undefined) where.aktifMi = sorgu.aktifMi === 'true';
    if (sorgu.ilId) where.ilId = BigInt(sorgu.ilId);
    if (sorgu.arama) {
      where.OR = [
        { ad: { contains: sorgu.arama, mode: 'insensitive' } },
        { soyad: { contains: sorgu.arama, mode: 'insensitive' } },
        { unvan: { contains: sorgu.arama, mode: 'insensitive' } },
        { kod: { contains: sorgu.arama, mode: 'insensitive' } },
        { kisaAd: { contains: sorgu.arama, mode: 'insensitive' } },
      ];
    }

    const [toplam, veriler] = await Promise.all([
      prisma.cari.count({ where }),
      prisma.cari.findMany({
        where,
        skip: (sorgu.sayfa - 1) * sorgu.boyut,
        take: sorgu.boyut,
        orderBy: { olusturmaTarihi: 'desc' },
        include: {
          cariGrup: { select: { id: true, ad: true, kod: true } },
          iletisimler: { where: { aktifMi: true }, take: 5 },
        },
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
      include: {
        adresler: { where: { aktifMi: true }, orderBy: { varsayilanFaturaMi: 'desc' } },
        iletisimler: { where: { aktifMi: true } },
        cariGrup: { select: { id: true, ad: true, kod: true } },
        bankalar: { where: { aktifMi: true } },
      },
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
    const olusturVeri = (kod: string) => prisma.cari.create({
      data: {
        kod,
        tip: girdi.tip,
        kisiTipi: girdi.kisiTipi,
        cariGrupId: girdi.cariGrupId ? BigInt(girdi.cariGrupId) : null,
        ad: girdi.ad ?? null,
        soyad: girdi.soyad ?? null,
        unvan: girdi.unvan ?? null,
        kisaAd: girdi.kisaAd ?? null,
        cinsiyet: girdi.cinsiyet ?? null,
        dogumTarihi: girdi.dogumTarihi ? new Date(girdi.dogumTarihi) : null,
        yetkiliAdSoyad: girdi.yetkiliAdSoyad ?? null,
        yetkiliGorev: girdi.yetkiliGorev ?? null,
        vergiNo: girdi.vergiNo ?? null,
        vergiNoTipi: girdi.vergiNoTipi ?? null,
        vergiDairesiId: girdi.vergiDairesiId ? BigInt(girdi.vergiDairesiId) : null,
        ulkeKodu: girdi.ulkeKodu ?? 'TR',
        ilId: girdi.ilId ? BigInt(girdi.ilId) : null,
        ilceId: girdi.ilceId ? BigInt(girdi.ilceId) : null,
        paraBirimiKod: girdi.paraBirimiKod,
        fiyatListesiId: girdi.fiyatListesiId ? BigInt(girdi.fiyatListesiId) : null,
        iskontoOrani: girdi.iskontoOrani.toString(),
        vadeGun: girdi.vadeGun,
        krediLimiti: girdi.krediLimiti?.toString() ?? '0',
        krediLimitiAktifMi: girdi.krediLimitiAktifMi ?? false,
        riskDurumu: girdi.riskDurumu ?? 'normal',
        riskAciklama: girdi.riskAciklama ?? null,
        portalAktif: girdi.portalAktif ?? false,
        sektor: girdi.sektor ?? null,
        calisanSayisi: girdi.calisanSayisi ?? null,
        kaynak: girdi.kaynak ?? null,
        kvkkOnayMi: girdi.kvkkOnayMi,
        pazarlamaEmailOnay: girdi.pazarlamaEmailOnay ?? false,
        pazarlamaSmsOnay: girdi.pazarlamaSmsOnay ?? false,
        olusturanKullaniciId: kullaniciId,
      },
    });

    if (girdi.kod) return olusturVeri(girdi.kod);
    return kodIleOlustur(prisma, 'cari', 'CAR', olusturVeri, 5);
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

    // Basit alanlar
    const basitAlanlar = [
      'kod', 'tip', 'kisiTipi', 'ad', 'soyad', 'unvan', 'kisaAd',
      'cinsiyet', 'yetkiliAdSoyad', 'yetkiliGorev', 'vergiNo', 'vergiNoTipi',
      'ulkeKodu', 'paraBirimiKod', 'riskDurumu', 'riskAciklama',
      'portalAktif', 'sektor', 'kaynak', 'aktifMi',
      'kvkkOnayMi', 'pazarlamaEmailOnay', 'pazarlamaSmsOnay',
      'krediLimitiAktifMi',
    ] as const;

    for (const alan of basitAlanlar) {
      if ((girdi as Record<string, unknown>)[alan] !== undefined) {
        veri[alan] = (girdi as Record<string, unknown>)[alan];
      }
    }

    // Sayısal alanlar → Decimal
    if (girdi.iskontoOrani !== undefined) veri.iskontoOrani = girdi.iskontoOrani.toString();
    if (girdi.krediLimiti !== undefined) veri.krediLimiti = girdi.krediLimiti.toString();
    if (girdi.vadeGun !== undefined) veri.vadeGun = girdi.vadeGun;
    if (girdi.calisanSayisi !== undefined) veri.calisanSayisi = girdi.calisanSayisi;

    // BigInt FK'lar
    if (girdi.cariGrupId !== undefined) veri.cariGrupId = girdi.cariGrupId ? BigInt(girdi.cariGrupId) : null;
    if (girdi.vergiDairesiId !== undefined) veri.vergiDairesiId = girdi.vergiDairesiId ? BigInt(girdi.vergiDairesiId) : null;
    if (girdi.fiyatListesiId !== undefined) veri.fiyatListesiId = girdi.fiyatListesiId ? BigInt(girdi.fiyatListesiId) : null;
    if (girdi.ilId !== undefined) veri.ilId = girdi.ilId ? BigInt(girdi.ilId) : null;
    if (girdi.ilceId !== undefined) veri.ilceId = girdi.ilceId ? BigInt(girdi.ilceId) : null;

    // Tarih
    if (girdi.dogumTarihi !== undefined) {
      veri.dogumTarihi = girdi.dogumTarihi ? new Date(girdi.dogumTarihi) : null;
    }

    return prisma.cari.update({
      where: { id: BigInt(id) },
      data: veri,
    });
  }

  async tipDegistir(prisma: TenantClient, id: number, tip: string, kullaniciId: bigint) {
    await this.detay(prisma, id);
    return prisma.cari.update({
      where: { id: BigInt(id) },
      data: { tip, guncelleyenKullaniciId: kullaniciId },
    });
  }

  async aktiflikDegistir(prisma: TenantClient, id: number, kullaniciId: bigint) {
    const cari = await this.detay(prisma, id);
    return prisma.cari.update({
      where: { id: BigInt(id) },
      data: {
        aktifMi: !cari.aktifMi,
        guncelleyenKullaniciId: kullaniciId,
      },
    });
  }

  async sil(prisma: TenantClient, id: number, kullaniciId: bigint): Promise<void> {
    await this.detay(prisma, id);

    // Referans bütünlüğü kontrolleri — bağlı kayıt varsa silmeyi engelle
    const siparisSayi = await prisma.siparis.count({
      where: { cariId: BigInt(id) },
    });
    if (siparisSayi > 0) {
      throw new BadRequestException({
        kod: 'CARI_KULLANIMDA',
        mesaj: `Bu cariye bağlı ${siparisSayi} sipariş var, silinemez. Pasife alabilirsiniz.`,
      });
    }

    await prisma.cari.update({
      where: { id: BigInt(id) },
      data: {
        silindiMi: true,
        silinmeTarihi: new Date(),
        silenKullaniciId: kullaniciId,
      },
    });
  }

  // ── Adres CRUD ──────────────────────────────────────────

  async adresListele(prisma: TenantClient, cariId: number) {
    return prisma.cariAdres.findMany({
      where: { cariId: BigInt(cariId), aktifMi: true },
      orderBy: [{ varsayilanFaturaMi: 'desc' }, { olusturmaTarihi: 'desc' }],
    });
  }

  async adresOlustur(prisma: TenantClient, cariId: number, girdi: Record<string, unknown>) {
    await this.detay(prisma, cariId);
    return prisma.cariAdres.create({
      data: {
        cariId: BigInt(cariId),
        baslik: girdi.baslik as string,
        tip: (girdi.tip as string) ?? 'genel',
        yetkiliAdSoyad: (girdi.yetkiliAdSoyad as string) ?? null,
        yetkiliTelefon: (girdi.yetkiliTelefon as string) ?? null,
        ulkeKodu: (girdi.ulkeKodu as string) ?? 'TR',
        ilId: girdi.ilId ? BigInt(girdi.ilId as number) : null,
        ilceId: girdi.ilceId ? BigInt(girdi.ilceId as number) : null,
        mahalle: (girdi.mahalle as string) ?? null,
        sokak: (girdi.sokak as string) ?? null,
        binaNo: (girdi.binaNo as string) ?? null,
        daireNo: (girdi.daireNo as string) ?? null,
        postaKodu: (girdi.postaKodu as string) ?? null,
        adresSatir1: girdi.adresSatir1 as string,
        adresSatir2: (girdi.adresSatir2 as string) ?? null,
        varsayilanFaturaMi: (girdi.varsayilanFaturaMi as boolean) ?? false,
        varsayilanSevkMi: (girdi.varsayilanSevkMi as boolean) ?? false,
      },
    });
  }

  async adresGuncelle(prisma: TenantClient, cariId: number, adresId: number, girdi: Record<string, unknown>) {
    const adres = await prisma.cariAdres.findFirst({
      where: { id: BigInt(adresId), cariId: BigInt(cariId), aktifMi: true },
    });
    if (!adres) throw new NotFoundException({ kod: 'ADRES_BULUNAMADI', mesaj: 'Adres bulunamadi' });

    const veri: Record<string, unknown> = {};
    const alanlar = [
      'baslik', 'tip', 'yetkiliAdSoyad', 'yetkiliTelefon', 'ulkeKodu',
      'mahalle', 'sokak', 'binaNo', 'daireNo', 'postaKodu',
      'adresSatir1', 'adresSatir2', 'varsayilanFaturaMi', 'varsayilanSevkMi',
    ];
    for (const alan of alanlar) {
      if (girdi[alan] !== undefined) veri[alan] = girdi[alan];
    }
    if (girdi.ilId !== undefined) veri.ilId = girdi.ilId ? BigInt(girdi.ilId as number) : null;
    if (girdi.ilceId !== undefined) veri.ilceId = girdi.ilceId ? BigInt(girdi.ilceId as number) : null;

    return prisma.cariAdres.update({ where: { id: BigInt(adresId) }, data: veri });
  }

  async adresSil(prisma: TenantClient, cariId: number, adresId: number) {
    const adres = await prisma.cariAdres.findFirst({
      where: { id: BigInt(adresId), cariId: BigInt(cariId), aktifMi: true },
    });
    if (!adres) throw new NotFoundException({ kod: 'ADRES_BULUNAMADI', mesaj: 'Adres bulunamadi' });
    await prisma.cariAdres.update({ where: { id: BigInt(adresId) }, data: { aktifMi: false } });
  }

  async adresVarsayilanYap(prisma: TenantClient, cariId: number, adresId: number, tip: 'fatura' | 'sevk') {
    const alan = tip === 'fatura' ? 'varsayilanFaturaMi' : 'varsayilanSevkMi';
    // Önce hepsini sıfırla
    await prisma.cariAdres.updateMany({
      where: { cariId: BigInt(cariId), aktifMi: true },
      data: { [alan]: false },
    });
    // Seçileni varsayılan yap
    return prisma.cariAdres.update({
      where: { id: BigInt(adresId) },
      data: { [alan]: true },
    });
  }

  // ── İletişim CRUD ──────────────────────────────────────────

  async iletisimListele(prisma: TenantClient, cariId: number) {
    return prisma.cariIletisim.findMany({
      where: { cariId: BigInt(cariId), aktifMi: true },
      orderBy: [{ varsayilanMi: 'desc' }, { olusturmaTarihi: 'desc' }],
    });
  }

  async iletisimOlustur(prisma: TenantClient, cariId: number, girdi: { tip: string; deger: string; aciklama?: string | null; varsayilanMi?: boolean }) {
    await this.detay(prisma, cariId);
    return prisma.cariIletisim.create({
      data: {
        cariId: BigInt(cariId),
        tip: girdi.tip,
        deger: girdi.deger,
        aciklama: girdi.aciklama ?? null,
        varsayilanMi: girdi.varsayilanMi ?? false,
      },
    });
  }

  async iletisimSil(prisma: TenantClient, cariId: number, iletisimId: number) {
    const iletisim = await prisma.cariIletisim.findFirst({
      where: { id: BigInt(iletisimId), cariId: BigInt(cariId), aktifMi: true },
    });
    if (!iletisim) throw new NotFoundException({ kod: 'ILETISIM_BULUNAMADI', mesaj: 'Iletisim bulunamadi' });
    await prisma.cariIletisim.update({ where: { id: BigInt(iletisimId) }, data: { aktifMi: false } });
  }
}
