import { z } from 'zod';

// ─── Rol ───

export const RolOlusturSemasi = z.object({
  kod: z.string().min(2).max(50),
  ad: z.string().min(1).max(100),
  aciklama: z.string().max(500).optional().nullable(),
});
export type RolOlusturGirdi = z.infer<typeof RolOlusturSemasi>;

export const RolGuncelleSemasi = RolOlusturSemasi.partial();
export type RolGuncelleGirdi = z.infer<typeof RolGuncelleSemasi>;

// ─── Sistem Ayar (Firma bilgileri dahil) ───

export const SistemAyarGuncelleSemasi = z.object({
  firmaAdi: z.string().max(200).optional(),
  kisaAd: z.string().max(100).optional().nullable(),
  sahipAdi: z.string().max(200).optional().nullable(),
  firmaLogoUrl: z.string().max(500).optional().nullable(),
  firmaFaviconUrl: z.string().max(500).optional().nullable(),
  // Iletisim
  email: z.string().email().optional().nullable(),
  bildirimEmail: z.string().email().optional().nullable(),
  telefon: z.string().max(30).optional().nullable(),
  cep: z.string().max(30).optional().nullable(),
  faks: z.string().max(30).optional().nullable(),
  // Konum
  il: z.string().max(50).optional().nullable(),
  ilce: z.string().max(50).optional().nullable(),
  adres: z.string().max(500).optional().nullable(),
  // Vergi
  vergiDairesi: z.string().max(100).optional().nullable(),
  vergiNo: z.string().max(50).optional().nullable(),
  // Bolgesel
  varsayilanDil: z.string().length(2).optional(),
  varsayilanParaBirimi: z.string().length(3).optional(),
  zamanDilimi: z.string().max(50).optional(),
  ulkeKodu: z.string().length(2).optional(),
  tarihFormati: z.string().max(20).optional(),
  saatFormati: z.string().max(10).optional(),
  // Gorsel
  tema: z.string().max(20).optional(),
  markaRengi: z.string().max(20).optional().nullable(),
});
export type SistemAyarGuncelleGirdi = z.infer<typeof SistemAyarGuncelleSemasi>;

// ─── Şifre Değiştir ───

export const SifreDegistirSemasi = z.object({
  eskiSifre: z.string().min(1),
  yeniSifre: z
    .string()
    .min(6, 'Sifre en az 6 karakter olmali')
    .regex(/[a-z]/, 'Kucuk harf icermeli')
    .regex(/[A-Z]/, 'Buyuk harf icermeli')
    .regex(/\d/, 'Rakam icermeli'),
});
export type SifreDegistirGirdi = z.infer<typeof SifreDegistirSemasi>;

// ─── Kullanıcı Mağaza Atama ───

export const KullaniciMagazaAtamaSemasi = z.object({
  magazaIdler: z.array(z.number().int()),
});
export type KullaniciMagazaAtamaGirdi = z.infer<typeof KullaniciMagazaAtamaSemasi>;

// ─── Kullanıcı Rol Atama ───

export const KullaniciRolAtamaSemasi = z.object({
  rolKodlari: z.array(z.string()),
});
export type KullaniciRolAtamaGirdi = z.infer<typeof KullaniciRolAtamaSemasi>;
