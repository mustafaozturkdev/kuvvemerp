import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

// ────────────────────────────────────────────────────────────
// MARKA
// ────────────────────────────────────────────────────────────

export const MarkaOlusturSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(200),
  aciklama: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  webSitesi: z.string().max(255).optional().nullable(),
  ulkeKodu: z.string().length(2).optional().nullable(),
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
export type MarkaOlusturGirdi = z.infer<typeof MarkaOlusturSemasi>;

export const MarkaGuncelleSemasi = z.object({
  kod: z.string().min(1).max(50).optional(),
  ad: z.string().min(1).max(200).optional(),
  aciklama: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  webSitesi: z.string().max(255).nullable().optional(),
  ulkeKodu: z.string().length(2).nullable().optional(),
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
export type MarkaGuncelleGirdi = z.infer<typeof MarkaGuncelleSemasi>;

export const MarkaListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(),
  aktifMi: z.enum(['true', 'false']).optional(),
  eticaretAktif: z.enum(['true', 'false']).optional(),
  b2bAktif: z.enum(['true', 'false']).optional(),
});
export type MarkaListeSorgu = z.infer<typeof MarkaListeSorguSemasi>;

// ────────────────────────────────────────────────────────────
// MARKA MODEL (Marka altında)
// ────────────────────────────────────────────────────────────

export const MarkaModelOlusturSemasi = z.object({
  markaId: z.coerce.number().int().positive(),
  kod: z.string().max(50).optional().nullable(),
  ad: z.string().min(1).max(200),
  aciklama: z.string().optional().nullable(),
  gorselUrl: z.string().url().optional().nullable(),
  uretimYili: z.number().int().min(1900).max(2100).optional().nullable(),
  sira: z.number().int().default(0),
});
export type MarkaModelOlusturGirdi = z.infer<typeof MarkaModelOlusturSemasi>;

export const MarkaModelGuncelleSemasi = z.object({
  kod: z.string().max(50).nullable().optional(),
  ad: z.string().min(1).max(200).optional(),
  aciklama: z.string().nullable().optional(),
  gorselUrl: z.string().url().nullable().optional(),
  uretimYili: z.number().int().min(1900).max(2100).nullable().optional(),
  sira: z.number().int().optional(),
  aktifMi: z.boolean().optional(),
});
export type MarkaModelGuncelleGirdi = z.infer<typeof MarkaModelGuncelleSemasi>;

export const MarkaModelListeSorguSemasi = z.object({
  markaId: z.coerce.number().int().positive().optional(),
  arama: z.string().optional(),
  aktifMi: z.enum(['true', 'false']).optional(),
});
export type MarkaModelListeSorgu = z.infer<typeof MarkaModelListeSorguSemasi>;
