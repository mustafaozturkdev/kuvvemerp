import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

// ────────────────────────────────────────────────────────────
// KATEGORI
// ────────────────────────────────────────────────────────────

export const KategoriOlusturSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(200),
  aciklama: z.string().optional().nullable(),
  ustKategoriId: z.coerce.number().int().positive().optional().nullable(),

  // Görsel
  resimUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  ikon: z.string().max(50).optional().nullable(),
  renk: z.string().max(20).optional().nullable(),

  // İçerik (TipTap HTML)
  icerik: z.string().optional().nullable(),

  // SEO
  seoUrl: z.string().max(500).optional().nullable(),
  seoBaslik: z.string().max(255).optional().nullable(),
  seoAciklama: z.string().optional().nullable(),
  seoAnahtarKelimeler: z.array(z.string()).default([]),
  ogImageUrl: z.string().url().optional().nullable(),
  canonicalUrl: z.string().optional().nullable(),

  // Yayın
  eticaretAktif: z.boolean().default(false),
  b2bAktif: z.boolean().default(false),
  sira: z.number().int().default(0),
});
export type KategoriOlusturGirdi = z.infer<typeof KategoriOlusturSemasi>;

export const KategoriGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(200).optional(),
  aciklama: z.string().nullable().optional(),
  ustKategoriId: z.coerce.number().int().positive().nullable().optional(),
  resimUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  ikon: z.string().max(50).nullable().optional(),
  renk: z.string().max(20).nullable().optional(),
  icerik: z.string().nullable().optional(),
  seoUrl: z.string().max(500).nullable().optional(),
  seoBaslik: z.string().max(255).nullable().optional(),
  seoAciklama: z.string().nullable().optional(),
  seoAnahtarKelimeler: z.array(z.string()).optional(),
  ogImageUrl: z.string().url().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  eticaretAktif: z.boolean().optional(),
  b2bAktif: z.boolean().optional(),
  sira: z.number().int().optional(),
  aktifMi: z.boolean().optional(),
});
export type KategoriGuncelleGirdi = z.infer<typeof KategoriGuncelleSemasi>;

export const KategoriListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(),
  ustKategoriId: z.coerce.number().int().optional(),
  aktifMi: z.enum(['true', 'false']).optional(),
  eticaretAktif: z.enum(['true', 'false']).optional(),
  b2bAktif: z.enum(['true', 'false']).optional(),
});
export type KategoriListeSorgu = z.infer<typeof KategoriListeSorguSemasi>;

// ────────────────────────────────────────────────────────────
// KATEGORI AĞACI TAŞIMA (drag-drop)
// ────────────────────────────────────────────────────────────

export const KategoriTasiSemasi = z.object({
  id: z.coerce.number().int().positive(),
  yeniUstKategoriId: z.coerce.number().int().positive().nullable(),
  yeniSira: z.number().int().default(0),
});
export type KategoriTasiGirdi = z.infer<typeof KategoriTasiSemasi>;

// Toplu sıralama — aynı parent altındaki kategorileri yeni sıraya göre güncelle
export const KategoriSiralaSemasi = z.object({
  ustKategoriId: z.coerce.number().int().positive().nullable(),
  siralama: z.array(z.object({
    id: z.coerce.number().int().positive(),
    sira: z.number().int(),
  })),
});
export type KategoriSiralaGirdi = z.infer<typeof KategoriSiralaSemasi>;
