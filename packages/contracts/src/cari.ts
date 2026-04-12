import { z } from 'zod';
import { SayfalamaSemasi } from './ortak.js';

export const CariTipleri = ['musteri', 'tedarikci', 'her_ikisi', 'personel', 'diger'] as const;
export const KisiTipleri = ['gercek', 'tuzel'] as const;

/**
 * Cari oluşturma — DB'deki CHECK constraint'leri burada da replike ediliyor.
 * (gercek kisi → ad+soyad zorunlu, tuzel → unvan zorunlu)
 */
export const CariOlusturSemasi = z
  .object({
    kod: z.string().min(1).max(50),
    tip: z.enum(CariTipleri).default('musteri'),
    kisiTipi: z.enum(KisiTipleri),
    ad: z.string().max(100).optional().nullable(),
    soyad: z.string().max(100).optional().nullable(),
    unvan: z.string().max(300).optional().nullable(),
    kisaAd: z.string().max(100).optional().nullable(),
    vergiNo: z.string().max(30).optional().nullable(),
    vergiNoTipi: z.string().max(20).optional().nullable(),
    paraBirimiKod: z.string().length(3).default('TRY'),
    iskontoOrani: z.number().min(0).max(100).default(0),
    vadeGun: z.number().int().min(0).default(0),
    kvkkOnayMi: z.boolean().default(false),
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

export const CariGuncelleSemasi = z
  .object({
    kod: z.string().min(1).max(50).optional(),
    tip: z.enum(CariTipleri).optional(),
    ad: z.string().max(100).nullable().optional(),
    soyad: z.string().max(100).nullable().optional(),
    unvan: z.string().max(300).nullable().optional(),
    kisaAd: z.string().max(100).nullable().optional(),
    vergiNo: z.string().max(30).nullable().optional(),
    vergiNoTipi: z.string().max(20).nullable().optional(),
    iskontoOrani: z.number().min(0).max(100).optional(),
    vadeGun: z.number().int().min(0).optional(),
    aktifMi: z.boolean().optional(),
  })
  .partial();

export type CariGuncelleGirdi = z.infer<typeof CariGuncelleSemasi>;

export const CariListeSorguSemasi = SayfalamaSemasi.extend({
  arama: z.string().optional(),
  tip: z.enum(CariTipleri).optional(),
  grupId: z.coerce.number().int().optional(),
});
export type CariListeSorgu = z.infer<typeof CariListeSorguSemasi>;
