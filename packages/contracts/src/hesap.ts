import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

// ────────────────────────────────────────────────────────────
// Hesap tipleri (SQL CHECK constraint ile uyumlu)
// ────────────────────────────────────────────────────────────

export const HesapTipleri = [
  'kasa',              // Nakit kasası
  'banka',             // Banka hesabı (IBAN'lı)
  'pos',               // POS (fiziksel veya sanal — ayarlar içinde belirtilir)
  'kredi_karti',       // Firma harcama kartı (eksi bakiye normal)
  'e_cuzdan',          // PayPal, Stripe, iyzico, Param bakiye
  'cek_portfoy',       // Alınan çek portföyü
  'senet_portfoy',     // Alınan senet portföyü
  'pazaryeri_alacak',  // Trendyol/HB bekleyen net tutar
  'diger',
] as const;

export type HesapTipi = (typeof HesapTipleri)[number];

// POS alt tipi (ayarlar.posAltTipi)
export const PosAltTipleri = ['fiziksel', 'sanal'] as const;
export type PosAltTipi = (typeof PosAltTipleri)[number];

// ────────────────────────────────────────────────────────────
// Mağaza ilişkisi (JSON field)
// ────────────────────────────────────────────────────────────

export const HesapMagazalarSemasi = z.object({
  magazaIdler: z.array(z.coerce.number().int().positive()).default([]),
  varsayilanMagazaId: z.coerce.number().int().positive().nullable().default(null),
});
export type HesapMagazalar = z.infer<typeof HesapMagazalarSemasi>;

// ────────────────────────────────────────────────────────────
// Tip bazlı ayarlar (JSON field) — her tip için ayrı şema
// ────────────────────────────────────────────────────────────

// Kasa ayarları
export const KasaAyarlarSemasi = z.object({
  minBakiye: z.number().optional().nullable(),
  maxBakiye: z.number().optional().nullable(),
  sayimZorunlu: z.boolean().default(false),
  otomatikYuvarla: z.boolean().default(false),
  yuvarlamaKurali: z.enum(['yakin', 'yukari', 'asagi']).optional().nullable(),
});
export type KasaAyarlar = z.infer<typeof KasaAyarlarSemasi>;

// POS ayarları
export const PosAyarlarSemasi = z.object({
  posAltTipi: z.enum(PosAltTipleri).default('sanal'),
  cihazMarkasi: z.string().max(50).optional().nullable(),
  cihazSeriNo: z.string().max(50).optional().nullable(),
  entegrasyonTipi: z.enum(['manuel', 'api']).default('manuel'),
  merchantId: z.string().max(100).optional().nullable(),
  terminalNo: z.string().max(50).optional().nullable(),
  uyeIsyeriNo: z.string().max(50).optional().nullable(),
  komisyonTipi: z.enum(['yuzde', 'sabit']).default('yuzde'),
  taksitSecenekleri: z.array(z.object({
    taksit: z.number().int().min(2).max(36),
    komisyon: z.number().min(0),
  })).default([]),
  testModu: z.boolean().default(false),
  desteklenenKartlar: z.object({
    visa: z.boolean().default(true),
    mastercard: z.boolean().default(true),
    amex: z.boolean().default(false),
    troy: z.boolean().default(true),
  }).default({ visa: true, mastercard: true, amex: false, troy: true }),
});
export type PosAyarlar = z.infer<typeof PosAyarlarSemasi>;

// Kredi kartı ayarları (firma harcama kartı)
export const KrediKartiAyarlarSemasi = z.object({
  kartSonDortHane: z.string().length(4).optional().nullable(),
  ekstreKesimGunu: z.number().int().min(1).max(31).optional().nullable(),
  sonOdemeGunu: z.number().int().min(1).max(31).optional().nullable(),
  kartSahibi: z.string().max(100).optional().nullable(),
});
export type KrediKartiAyarlar = z.infer<typeof KrediKartiAyarlarSemasi>;

// E-cüzdan ayarları
export const ECuzdanAyarlarSemasi = z.object({
  saglayici: z.enum(['paypal', 'stripe', 'iyzico', 'param', 'payu', 'diger']).default('diger'),
  merchantId: z.string().max(100).optional().nullable(),
  apiKey: z.string().optional().nullable(),
  apiSecret: z.string().optional().nullable(),
});
export type ECuzdanAyarlar = z.infer<typeof ECuzdanAyarlarSemasi>;

// Çek/Senet portföy ayarları
export const CekSenetPortfoyAyarlarSemasi = z.object({
  otomatikUyari: z.boolean().default(true),
  vadeUyariGun: z.number().int().min(0).default(7),
});
export type CekSenetPortfoyAyarlar = z.infer<typeof CekSenetPortfoyAyarlarSemasi>;

// Pazaryeri alacak ayarları
export const PazaryeriAlacakAyarlarSemasi = z.object({
  pazaryeri: z.enum(['trendyol', 'hepsiburada', 'n11', 'amazon', 'gittigidiyor', 'diger']).default('diger'),
  magazaKodu: z.string().optional().nullable(),
  netBlokeGunu: z.number().int().min(0).default(0),
});
export type PazaryeriAlacakAyarlar = z.infer<typeof PazaryeriAlacakAyarlarSemasi>;

// ────────────────────────────────────────────────────────────
// Hesap Oluştur
// ────────────────────────────────────────────────────────────

export const HesapOlusturSemasi = z
  .object({
    kod: z.string().min(1).max(50).optional(),
    ad: z.string().min(1).max(200),
    tip: z.enum(HesapTipleri),
    grupId: z.coerce.number().int().positive().nullable().optional(),
    paraBirimiKod: z.string().length(3).default('TRY'),
    firmaId: z.coerce.number().int().positive().nullable().optional(),

    // Mağaza ilişkisi
    magazalar: HesapMagazalarSemasi.default({ magazaIdler: [], varsayilanMagazaId: null }),

    // Banka bilgileri (banka/POS için)
    bankaAdi: z.string().max(100).nullable().optional(),
    sube: z.string().max(100).nullable().optional(),
    hesapNo: z.string().max(50).nullable().optional(),
    iban: z.string().max(34).nullable().optional(),
    swiftKod: z.string().max(20).nullable().optional(),

    // POS alanları
    posSaglayici: z.string().max(50).nullable().optional(),
    posTerminalId: z.string().max(100).nullable().optional(),
    posKomisyonOrani: z.number().min(0).max(100).default(0),
    posBlokeliGun: z.number().int().min(0).default(0),
    posNetHesapId: z.coerce.number().int().positive().nullable().optional(),

    // Bakiye ve limit
    baslangicBakiye: z.number().default(0),
    negatifBakiyeIzin: z.boolean().default(false),
    limitTutar: z.number().min(0).nullable().optional(),

    // Diğer
    varsayilanMi: z.boolean().default(false),
    sira: z.number().int().default(0),

    // Tip bazlı ayarlar (hepsi opsiyonel - tipe göre doldurulacak)
    ayarlar: z.record(z.string(), z.any()).nullable().optional(),
  })
  .superRefine((veri, ctx) => {
    // Banka tipi için IBAN zorunlu
    if (veri.tip === 'banka' && !veri.iban && !veri.hesapNo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Banka hesabı için IBAN veya hesap numarası zorunlu',
        path: ['iban'],
      });
    }
    // POS için sağlayıcı zorunlu
    if (veri.tip === 'pos' && !veri.posSaglayici) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'POS için sağlayıcı zorunlu',
        path: ['posSaglayici'],
      });
    }
    // Kredi kartı için banka adı zorunlu
    if (veri.tip === 'kredi_karti' && !veri.bankaAdi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Kredi kartı için banka adı zorunlu',
        path: ['bankaAdi'],
      });
    }
  });

export type HesapOlusturGirdi = z.infer<typeof HesapOlusturSemasi>;

// ────────────────────────────────────────────────────────────
// Hesap Güncelle
// ────────────────────────────────────────────────────────────

export const HesapGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(200).optional(),
  grupId: z.coerce.number().int().positive().nullable().optional(),
  paraBirimiKod: z.string().length(3).optional(),
  magazalar: HesapMagazalarSemasi.optional(),
  bankaAdi: z.string().max(100).nullable().optional(),
  sube: z.string().max(100).nullable().optional(),
  hesapNo: z.string().max(50).nullable().optional(),
  iban: z.string().max(34).nullable().optional(),
  swiftKod: z.string().max(20).nullable().optional(),
  posSaglayici: z.string().max(50).nullable().optional(),
  posTerminalId: z.string().max(100).nullable().optional(),
  posKomisyonOrani: z.number().min(0).max(100).optional(),
  posBlokeliGun: z.number().int().min(0).optional(),
  posNetHesapId: z.coerce.number().int().positive().nullable().optional(),
  baslangicBakiye: z.number().optional(),
  negatifBakiyeIzin: z.boolean().optional(),
  limitTutar: z.number().min(0).nullable().optional(),
  varsayilanMi: z.boolean().optional(),
  sira: z.number().int().optional(),
  ayarlar: z.record(z.string(), z.any()).nullable().optional(),
  aktifMi: z.boolean().optional(),
});
export type HesapGuncelleGirdi = z.infer<typeof HesapGuncelleSemasi>;

// ────────────────────────────────────────────────────────────
// Hesap Liste Sorgu
// ────────────────────────────────────────────────────────────

export const HesapListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(),
  tip: z.enum(HesapTipleri).optional(),
  grupId: z.coerce.number().int().positive().optional(),
  magazaId: z.coerce.number().int().positive().optional(),
  paraBirimiKod: z.string().length(3).optional(),
  aktifMi: z.enum(['true', 'false']).optional(),
});
export type HesapListeSorgu = z.infer<typeof HesapListeSorguSemasi>;

// ────────────────────────────────────────────────────────────
// Hesap Grup Şemaları
// ────────────────────────────────────────────────────────────

export const HesapGrupOlusturSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(100),
  aciklama: z.string().optional().nullable(),
  ikon: z.string().max(50).optional().nullable(),
  renk: z.string().max(20).optional().nullable(),
  sira: z.number().int().default(0),
});
export type HesapGrupOlusturGirdi = z.infer<typeof HesapGrupOlusturSemasi>;

export const HesapGrupGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(100).optional(),
  aciklama: z.string().nullable().optional(),
  ikon: z.string().max(50).nullable().optional(),
  renk: z.string().max(20).nullable().optional(),
  sira: z.number().int().optional(),
  aktifMi: z.boolean().optional(),
});
export type HesapGrupGuncelleGirdi = z.infer<typeof HesapGrupGuncelleSemasi>;
