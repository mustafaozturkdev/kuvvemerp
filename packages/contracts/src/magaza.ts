import { z } from 'zod';

export const MagazaOlusturSemasi = z.object({
  kod: z.string().min(1).max(50),
  ad: z.string().min(1).max(200),
  tip: z.string().max(20).default('sube'),
  ilAdi: z.string().max(50).optional().nullable(),
  ilceAdi: z.string().max(50).optional().nullable(),
  adres: z.string().max(1000).optional().nullable(),
  telefon: z.string().max(30).optional().nullable(),
  cep: z.string().max(30).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  ip: z.string().max(50).optional().nullable(),
  instagram: z.string().max(100).optional().nullable(),
  eFaturaOnEk: z.string().max(3).optional().nullable(),
  eArsivOnEk: z.string().max(3).optional().nullable(),
  harita: z.string().max(5000).optional().nullable(),
  paraBirimiKod: z.string().length(3).default('TRY'),
  ulkeKodu: z.string().length(2).default('TR'),
}).strict();
export type MagazaOlusturGirdi = z.infer<typeof MagazaOlusturSemasi>;

export const MagazaGuncelleSemasi = MagazaOlusturSemasi.partial().strict();
export type MagazaGuncelleGirdi = z.infer<typeof MagazaGuncelleSemasi>;
