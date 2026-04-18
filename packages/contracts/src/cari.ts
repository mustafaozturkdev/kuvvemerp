import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

export const CariTipleri = ['musteri', 'tedarikci', 'her_ikisi', 'personel', 'diger'] as const;
export const KisiTipleri = ['gercek', 'tuzel'] as const;
export const VergiNoTipleri = ['TCKN', 'VKN', 'YKN', 'TRN', 'EU_VAT', 'SSN', 'EIN', 'GSTIN', 'DIGER'] as const;
export const RiskDurumlari = ['normal', 'dikkat', 'riskli', 'kara_liste'] as const;
export const CrmSegmentler = ['VIP', 'Premium', 'Standart', 'Risk'] as const;

// ── Cari Oluşturma ──────────────────────────────────────────────
export const CariOlusturSemasi = z
  .object({
    kod: z.string().min(1).max(50).optional(),
    tip: z.enum(CariTipleri).default('musteri'),
    kisiTipi: z.enum(KisiTipleri),
    cariGrupId: z.coerce.number().int().positive().optional().nullable(),

    // Kimlik
    ad: z.string().max(100).optional().nullable(),
    soyad: z.string().max(100).optional().nullable(),
    unvan: z.string().max(300).optional().nullable(),
    kisaAd: z.string().max(100).optional().nullable(),
    cinsiyet: z.string().max(20).optional().nullable(),
    dogumTarihi: z.string().optional().nullable(),

    // Yetkili
    yetkiliAdSoyad: z.string().max(200).optional().nullable(),
    yetkiliGorev: z.string().max(100).optional().nullable(),

    // Vergi
    vergiNo: z.string().max(30).optional().nullable(),
    vergiNoTipi: z.enum(VergiNoTipleri).optional().nullable(),
    vergiDairesiId: z.coerce.number().int().optional().nullable(),

    // İletişim — v2'de Cari tablosunda direkt yok, CariIletisim tablosunda
    // ama PHP uyumu için ilk iletişimi buradan alıp CariIletisim'e yazacağız

    // Adres
    ulkeKodu: z.string().length(2).default('TR').optional(),
    ilId: z.coerce.number().int().optional().nullable(),
    ilceId: z.coerce.number().int().optional().nullable(),

    // Ticari
    paraBirimiKod: z.string().length(3).default('TRY'),
    fiyatListesiId: z.coerce.number().int().optional().nullable(),
    iskontoOrani: z.number().min(0).max(100).default(0),
    vadeGun: z.number().int().min(0).default(0),
    krediLimiti: z.number().min(0).default(0),
    krediLimitiAktifMi: z.boolean().default(false),

    // Risk
    riskDurumu: z.enum(RiskDurumlari).default('normal'),
    riskAciklama: z.string().optional().nullable(),

    // Portal
    portalAktif: z.boolean().default(false),

    // CRM
    sektor: z.string().max(100).optional().nullable(),
    calisanSayisi: z.number().int().optional().nullable(),
    kaynak: z.string().max(50).optional().nullable(),

    // KVKK
    kvkkOnayMi: z.boolean().default(false),
    pazarlamaEmailOnay: z.boolean().default(false),
    pazarlamaSmsOnay: z.boolean().default(false),
  })
  .superRefine((veri, ctx) => {
    if (veri.kisiTipi === 'gercek' && (!veri.ad || !veri.soyad)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gercek kisi icin ad ve soyad zorunlu',
        path: ['ad'],
      });
    }
    if (veri.kisiTipi === 'tuzel' && !veri.unvan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tuzel kisi icin unvan zorunlu',
        path: ['unvan'],
      });
    }
  });

export type CariOlusturGirdi = z.infer<typeof CariOlusturSemasi>;

// ── Cari Güncelleme ──────────────────────────────────────────────
export const CariGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  tip: z.enum(CariTipleri).optional(),
  kisiTipi: z.enum(KisiTipleri).optional(),
  cariGrupId: z.coerce.number().int().positive().nullable().optional(),
  ad: z.string().max(100).nullable().optional(),
  soyad: z.string().max(100).nullable().optional(),
  unvan: z.string().max(300).nullable().optional(),
  kisaAd: z.string().max(100).nullable().optional(),
  cinsiyet: z.string().max(20).nullable().optional(),
  dogumTarihi: z.string().nullable().optional(),
  yetkiliAdSoyad: z.string().max(200).nullable().optional(),
  yetkiliGorev: z.string().max(100).nullable().optional(),
  vergiNo: z.string().max(30).nullable().optional(),
  vergiNoTipi: z.enum(VergiNoTipleri).nullable().optional(),
  vergiDairesiId: z.coerce.number().int().nullable().optional(),
  ulkeKodu: z.string().length(2).optional(),
  ilId: z.coerce.number().int().nullable().optional(),
  ilceId: z.coerce.number().int().nullable().optional(),
  paraBirimiKod: z.string().length(3).optional(),
  fiyatListesiId: z.coerce.number().int().nullable().optional(),
  iskontoOrani: z.number().min(0).max(100).optional(),
  vadeGun: z.number().int().min(0).optional(),
  krediLimiti: z.number().min(0).optional(),
  krediLimitiAktifMi: z.boolean().optional(),
  riskDurumu: z.enum(RiskDurumlari).optional(),
  riskAciklama: z.string().nullable().optional(),
  portalAktif: z.boolean().optional(),
  sektor: z.string().max(100).nullable().optional(),
  calisanSayisi: z.number().int().nullable().optional(),
  kaynak: z.string().max(50).nullable().optional(),
  kvkkOnayMi: z.boolean().optional(),
  pazarlamaEmailOnay: z.boolean().optional(),
  pazarlamaSmsOnay: z.boolean().optional(),
  aktifMi: z.boolean().optional(),
});

export type CariGuncelleGirdi = z.infer<typeof CariGuncelleSemasi>;

// ── Cari Liste Sorgu ──────────────────────────────────────────────
export const CariListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(),
  tip: z.enum(CariTipleri).optional(),
  grupId: z.coerce.number().int().optional(),
  aktifMi: z.enum(['true', 'false']).optional(),
  ilId: z.coerce.number().int().optional(),
});
export type CariListeSorgu = z.infer<typeof CariListeSorguSemasi>;

// ── Cari Grup ──────────────────────────────────────────────
export const CariGrupOlusturSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(100),
  aciklama: z.string().optional().nullable(),
  varsayilanIskontoOrani: z.number().min(0).max(100).default(0),
  varsayilanVadeGun: z.number().int().min(0).optional().nullable(),
  renk: z.string().max(20).optional().nullable(),
  ikon: z.string().max(50).optional().nullable(),
  sira: z.number().int().default(0),
});
export type CariGrupOlusturGirdi = z.infer<typeof CariGrupOlusturSemasi>;

export const CariGrupGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(100).optional(),
  aciklama: z.string().nullable().optional(),
  varsayilanIskontoOrani: z.number().min(0).max(100).optional(),
  varsayilanVadeGun: z.number().int().min(0).nullable().optional(),
  renk: z.string().max(20).nullable().optional(),
  ikon: z.string().max(50).nullable().optional(),
  sira: z.number().int().optional(),
  aktifMi: z.boolean().optional(),
});
export type CariGrupGuncelleGirdi = z.infer<typeof CariGrupGuncelleSemasi>;

// ── Cari Adres ──────────────────────────────────────────────
export const CariAdresOlusturSemasi = z.object({
  baslik: z.string().min(1).max(100),
  tip: z.string().max(20).default('genel'),
  yetkiliAdSoyad: z.string().max(200).optional().nullable(),
  yetkiliTelefon: z.string().max(30).optional().nullable(),
  ulkeKodu: z.string().length(2).default('TR'),
  ilId: z.coerce.number().int().optional().nullable(),
  ilceId: z.coerce.number().int().optional().nullable(),
  mahalle: z.string().max(200).optional().nullable(),
  sokak: z.string().max(200).optional().nullable(),
  binaNo: z.string().max(20).optional().nullable(),
  daireNo: z.string().max(20).optional().nullable(),
  postaKodu: z.string().max(20).optional().nullable(),
  adresSatir1: z.string().min(1),
  adresSatir2: z.string().optional().nullable(),
  varsayilanFaturaMi: z.boolean().default(false),
  varsayilanSevkMi: z.boolean().default(false),
});
export type CariAdresOlusturGirdi = z.infer<typeof CariAdresOlusturSemasi>;

export const CariAdresGuncelleSemasi = CariAdresOlusturSemasi.partial();
export type CariAdresGuncelleGirdi = z.infer<typeof CariAdresGuncelleSemasi>;

// ── Cari İletişim ──────────────────────────────────────────────
export const CariIletisimOlusturSemasi = z.object({
  tip: z.enum(['telefon', 'cep', 'email', 'faks', 'web', 'diger']),
  deger: z.string().min(1).max(255),
  aciklama: z.string().max(100).optional().nullable(),
  varsayilanMi: z.boolean().default(false),
});
export type CariIletisimOlusturGirdi = z.infer<typeof CariIletisimOlusturSemasi>;
