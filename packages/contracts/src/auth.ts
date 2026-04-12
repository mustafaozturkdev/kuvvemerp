import { z } from 'zod';

export const GirisGirdiSemasi = z.object({
  email: z.string().email('Gecerli bir email adresi giriniz'),
  sifre: z.string().min(1, 'Sifre zorunlu'),
});
export type GirisGirdi = z.infer<typeof GirisGirdiSemasi>;

export const KayitGirdiSemasi = z.object({
  email: z.string().email(),
  sifre: z.string().min(10, 'Sifre en az 10 karakter olmali'),
  ad: z.string().min(1).max(100),
  soyad: z.string().min(1).max(100),
});
export type KayitGirdi = z.infer<typeof KayitGirdiSemasi>;

export const YenilemeGirdiSemasi = z.object({
  refreshToken: z.string().min(10),
});
export type YenilemeGirdi = z.infer<typeof YenilemeGirdiSemasi>;

export const TokenCevapSemasi = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenBitis: z.string(), // ISO8601
});
export type TokenCevap = z.infer<typeof TokenCevapSemasi>;

/** JWT payload — access token içinde taşınan minimum claim seti */
export interface JwtPayload {
  sub: string; // kullanici public_id
  kullanici_id: number; // bigint id (JSON serileştirme için number — 2^53 limiti OK)
  tenant_id: string; // tenant uuid
  tenant_slug: string;
  roller: string[];
  yetkiler: string[];
  oturum_id: number;
  iat?: number;
  exp?: number;
}
