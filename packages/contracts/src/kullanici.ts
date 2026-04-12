import { z } from 'zod';

export const KullaniciOlusturSemasi = z.object({
  email: z.string().email(),
  sifre: z.string().min(10),
  ad: z.string().min(1).max(100),
  soyad: z.string().min(1).max(100),
  telefon: z.string().max(30).optional().nullable(),
  rolKodlari: z.array(z.string()).default([]),
});
export type KullaniciOlusturGirdi = z.infer<typeof KullaniciOlusturSemasi>;

export const KullaniciGuncelleSemasi = KullaniciOlusturSemasi
  .omit({ sifre: true })
  .partial();
export type KullaniciGuncelleGirdi = z.infer<typeof KullaniciGuncelleSemasi>;

export const KullaniciOzetSemasi = z.object({
  id: z.number().int(),
  publicId: z.string().uuid(),
  email: z.string().email(),
  ad: z.string(),
  soyad: z.string(),
  aktifMi: z.boolean(),
  olusturmaTarihi: z.string(),
});
export type KullaniciOzet = z.infer<typeof KullaniciOzetSemasi>;
