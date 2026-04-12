import { z } from 'zod';

// ─── Personel ───

export const PersonelOlusturSemasi = z.object({
  adiSoyadi: z.string().min(1, 'Ad soyad zorunludur').max(200),
  tc: z
    .string()
    .regex(/^\d{11}$/, 'TC Kimlik No 11 haneli olmalıdır')
    .optional()
    .nullable(),
  unvan: z.string().max(100).optional().nullable(),
  cep: z
    .string()
    .regex(/^\d{10,15}$/, 'Telefon sadece rakam, 10-15 hane')
    .optional()
    .nullable(),
  mailAdresi: z.string().email('Gecerli bir e-posta giriniz').optional().nullable(),
  iseGiris: z.string().optional().nullable(), // ISO date string
  istenCikis: z.string().optional().nullable(),
  maas: z.number().min(0, 'Maas negatif olamaz').default(0),
  maasGunu: z.number().int().min(1).max(30).default(1),
  iban: z
    .string()
    .regex(/^TR\d{24}$/, 'IBAN TR + 24 haneli rakam olmalidir')
    .optional()
    .nullable(),
  magazaIdler: z.array(z.number().int()).default([]),
});
export type PersonelOlusturGirdi = z.infer<typeof PersonelOlusturSemasi>;

export const PersonelGuncelleSemasi = PersonelOlusturSemasi.partial();
export type PersonelGuncelleGirdi = z.infer<typeof PersonelGuncelleSemasi>;

// ─── Personel Odeme ───

export const PersonelOdemeTipSemasi = z.enum(['hakedis', 'odeme', 'mahsup']);
export type PersonelOdemeTip = z.infer<typeof PersonelOdemeTipSemasi>;

export const PersonelOdemeOlusturSemasi = z.object({
  tip: PersonelOdemeTipSemasi,
  tutar: z.number().min(0.01, 'Tutar 0 dan buyuk olmalidir'),
  aciklama: z.string().max(500).optional().nullable(),
  tarih: z.string(), // ISO date string
});
export type PersonelOdemeOlusturGirdi = z.infer<typeof PersonelOdemeOlusturSemasi>;
