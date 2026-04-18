import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

// ════════════════════════════════════════════════════════════
// URUN — Temel CRUD şemaları
// ════════════════════════════════════════════════════════════

/**
 * UrunOlusturSemasi
 *
 * Yeni ürün oluşturma girişi. Tek varyantlı (basit) ürünler için temel alanlar +
 * default varyanta ait ilk fiyat/barkod bilgileri aynı forma sığar.
 *
 * Not: `trg_urun_default_varyant` trigger'ı ürün kaydından sonra otomatik bir
 * default varyant oluşturur (sku = urun.kod). Service katmanı bu varyantı
 * alisFiyati/satisFiyati/barkod gibi detay alanlarla zenginleştirir.
 */
export const UrunOlusturSemasi = z.object({
  // ─── Zorunlu ───
  ad: z.string().min(1, 'Ürün adı gerekli').max(300),
  anaBirimId: z.coerce.number().int().positive('Birim seçimi gerekli'),
  vergiOraniId: z.coerce.number().int().positive('Vergi oranı gerekli'),

  // ─── Temel (opsiyonel) ───
  kod: z.string().max(50).optional(), // boşsa otomatik URN-XXXXXX
  kategoriId: z.coerce.number().int().positive().optional().nullable(),
  markaId: z.coerce.number().int().positive().optional().nullable(),
  markaModelId: z.coerce.number().int().positive().optional().nullable(),
  tip: z.enum(['fiziksel', 'dijital', 'hizmet']).default('fiziksel'),

  // ─── İsimlendirme ───
  faturaKalemAdi: z.string().max(300).optional().nullable(),
  takmaAdi: z.string().max(200).optional().nullable(),

  // ─── İçerik ───
  aciklama: z.string().optional().nullable(),
  kisaAciklama: z.string().max(500).optional().nullable(),
  icerikAciklama: z.string().optional().nullable(),
  kargoIadeMetin: z.string().optional().nullable(),

  // ─── Kod/GTIP/Muhasebe ───
  muhasebeKodu: z.string().max(50).optional().nullable(),
  gtipKodu: z.string().max(20).optional().nullable(),
  mensheiUlkeKodu: z.string().length(2).optional().nullable(),
  uretici: z.string().max(200).optional().nullable(),

  // ─── Entegrasyon ozel alanlari (PHP OzelAlan1..5) ───
  ozelAlan1: z.string().max(500).optional().nullable(),
  ozelAlan2: z.string().max(500).optional().nullable(),
  ozelAlan3: z.string().max(500).optional().nullable(),
  ozelAlan4: z.string().max(500).optional().nullable(),
  ozelAlan5: z.string().max(500).optional().nullable(),

  // ─── Fiziksel (desi + boyut) ───
  desi1: z.coerce.number().nonnegative().default(0),
  desi2: z.coerce.number().nonnegative().default(0),

  // ─── Vergi/Fiyat politikasi ───
  fiyatlarKdvDahilMi: z.boolean().default(true),

  // ─── Stok ve takip ───
  stokTakibi: z.boolean().default(true),
  seriNoTakibi: z.boolean().default(false),
  lotTakibi: z.boolean().default(false),

  // ─── Satis ayarlari ───
  iskontoUygulanirMi: z.boolean().default(true),
  puanKazandirirMi: z.boolean().default(true),
  minimumSatisMiktar: z.coerce.number().positive().default(1),
  primVarYok: z.boolean().default(false),

  // ─── Kanal: E-ticaret ───
  eticaretAktif: z.boolean().default(false),
  eticaretSatilikMi: z.boolean().default(true),

  // ─── Kanal: B2B ───
  b2bAktif: z.boolean().default(false),
  b2bSatilikMi: z.boolean().default(true),

  // ─── Kanal: Pazaryeri ───
  pazaryeriAktif: z.boolean().default(false),

  // ─── Vitrin / Pazarlama ───
  vitrindeGoster: z.boolean().default(false),
  vitrinSira: z.number().int().default(0),
  firsatUrun: z.boolean().default(false),
  yeniUrun: z.boolean().default(false),

  // ─── Kargo politikalari ───
  ucretsizKargo: z.boolean().default(false),
  tahminiTeslimSuresiGun: z.number().int().nonnegative().default(0),
  garantiAy: z.number().int().nonnegative().optional().nullable(),

  // ─── Sepet indirimleri ───
  sepetIndirimEticaret: z.coerce.number().min(0).max(100).optional().nullable(),
  sepetIndirimB2b: z.coerce.number().min(0).max(100).optional().nullable(),

  // ─── SEO ───
  seoUrl: z.string().max(500).optional().nullable(),
  seoBaslik: z.string().max(255).optional().nullable(),
  seoAciklama: z.string().optional().nullable(),
  seoAnahtarKelimeler: z.array(z.string()).default([]),

  // ─── Resim ───
  anaResimUrl: z.string().optional().nullable(),

  // ─── Tarih / sira ───
  uretimTarihi: z.coerce.date().optional().nullable(),
  sira: z.number().int().default(0),

  // ─── Abonelik ───
  abonelikAktif: z.boolean().default(false),
  abonelikData: z.record(z.string(), z.unknown()).optional().nullable(),

  // ─── Default Varyant bilgileri (trigger sonrasi zenginlestirme) ───
  barkod: z.string().max(100).optional().nullable(),
  alisFiyati: z.coerce.number().nonnegative().optional().nullable(),
  sonAlisFiyati: z.coerce.number().nonnegative().optional().nullable(),
  piyasaFiyati: z.coerce.number().nonnegative().optional().nullable(),
  satilabilirSonFiyat: z.coerce.number().nonnegative().optional().nullable(),
  karMarji: z.coerce.number().optional().nullable(),

  // Default fiyat listesine yazilacak satis fiyati (opsiyonel)
  satisFiyati: z.coerce.number().nonnegative().optional().nullable(),

  // Default varyantin fiziksel boyutlari
  agirlikGr: z.coerce.number().nonnegative().optional().nullable(),
  enCm: z.coerce.number().nonnegative().optional().nullable(),
  boyCm: z.coerce.number().nonnegative().optional().nullable(),
  yukseklikCm: z.coerce.number().nonnegative().optional().nullable(),

  // Default varyantin kritik/min/max stok esikleri
  kritikStok: z.coerce.number().nonnegative().default(0),
  minimumStok: z.coerce.number().nonnegative().default(0),
  maksimumStok: z.coerce.number().nonnegative().optional().nullable(),
});
export type UrunOlusturGirdi = z.infer<typeof UrunOlusturSemasi>;

/**
 * UrunGuncelleSemasi
 * Tum alanlari opsiyonel, sadece degisenler gonderilir (PATCH semantigi).
 */
export const UrunGuncelleSemasi = UrunOlusturSemasi.partial().extend({
  aktifMi: z.boolean().optional(),
});
export type UrunGuncelleGirdi = z.infer<typeof UrunGuncelleSemasi>;

/**
 * UrunListeSorguSemasi
 * Liste sayfasi icin filtre + arama + sayfalama parametreleri.
 */
export const UrunListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(), // ad, kod, barkod, takma ad, fatura kalem ad
  aktifMi: z.enum(['true', 'false']).optional(),
  kategoriId: z.coerce.number().int().positive().optional(),
  markaId: z.coerce.number().int().positive().optional(),
  markaModelId: z.coerce.number().int().positive().optional(),
  tip: z.enum(['fiziksel', 'dijital', 'hizmet']).optional(),
  eticaretAktif: z.enum(['true', 'false']).optional(),
  b2bAktif: z.enum(['true', 'false']).optional(),
  pazaryeriAktif: z.enum(['true', 'false']).optional(),
  vitrindeGoster: z.enum(['true', 'false']).optional(),
  firsatUrun: z.enum(['true', 'false']).optional(),
  yeniUrun: z.enum(['true', 'false']).optional(),
  stokDurumu: z.enum(['var', 'yok', 'kritik']).optional(),
  siralama: z.enum(['ad-asc', 'ad-desc', 'kod-asc', 'kod-desc', 'sira-asc', 'yeni-once', 'eski-once']).default('sira-asc'),
});
export type UrunListeSorgu = z.infer<typeof UrunListeSorguSemasi>;

// ════════════════════════════════════════════════════════════
// URUN VARYANT — Bağımsız güncelleme şemaları
// ════════════════════════════════════════════════════════════

/**
 * VaryantFiyatGuncelleSemasi
 * Varyant başına fiyat alanlarını günceller (alış/piyasa/satılabilir son fiyat vb.).
 */
export const VaryantFiyatGuncelleSemasi = z.object({
  alisFiyati: z.coerce.number().nonnegative().nullable().optional(),
  sonAlisFiyati: z.coerce.number().nonnegative().nullable().optional(),
  piyasaFiyati: z.coerce.number().nonnegative().nullable().optional(),
  satilabilirSonFiyat: z.coerce.number().nonnegative().nullable().optional(),
  karMarji: z.coerce.number().nullable().optional(),
});
export type VaryantFiyatGuncelleGirdi = z.infer<typeof VaryantFiyatGuncelleSemasi>;

/**
 * VaryantBarkodEkleSemasi
 * Varyant'a ek barkod ekleme (urun_varyant_barkod N-N).
 */
export const VaryantBarkodEkleSemasi = z.object({
  barkod: z.string().min(1).max(100),
  tip: z.string().max(20).default('EAN13'),
  aciklama: z.string().max(200).optional().nullable(),
  varsayilanMi: z.boolean().default(false),
});
export type VaryantBarkodEkleGirdi = z.infer<typeof VaryantBarkodEkleSemasi>;

// ════════════════════════════════════════════════════════════
// TOPLU İŞLEMLER
// ════════════════════════════════════════════════════════════

/**
 * UrunTopluAktiflikSemasi
 * Seçili ürünlere toplu aktif/pasif değişikliği.
 */
export const UrunTopluAktiflikSemasi = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1),
  aktifMi: z.boolean(),
});
export type UrunTopluAktiflikGirdi = z.infer<typeof UrunTopluAktiflikSemasi>;

/**
 * UrunTopluAlanGuncelleSemasi
 * Belirli bir tek alanı seçili ürünlerde toplu değiştirir.
 * Desteklenen alanlar: kategori, marka, ticari bayraklar, sira vs.
 */
export const UrunTopluAlanGuncelleSemasi = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1),
  alan: z.enum([
    'kategoriId',
    'markaId',
    'markaModelId',
    'eticaretAktif',
    'b2bAktif',
    'pazaryeriAktif',
    'vitrindeGoster',
    'firsatUrun',
    'yeniUrun',
    'ucretsizKargo',
    'primVarYok',
    'stokTakibi',
    'iskontoUygulanirMi',
  ]),
  deger: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type UrunTopluAlanGuncelleGirdi = z.infer<typeof UrunTopluAlanGuncelleSemasi>;
