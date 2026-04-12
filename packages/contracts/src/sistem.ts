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

// ─── Sistem Ayar ───

export const SistemAyarGuncelleSemasi = z.object({
  anahtar: z.string(),
  deger: z.string(),
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
