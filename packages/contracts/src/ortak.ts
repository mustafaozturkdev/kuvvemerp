import { z } from 'zod';

/**
 * Standart API cevap zarfı — tüm endpoint'ler bu formatta döner.
 * Hata durumunda `veri` null, `hata` dolu; başarı durumunda tersi.
 */
export const HataSemasi = z.object({
  kod: z.string(),
  mesaj: z.string(),
  alan: z.string().nullable().optional(),
  detay: z.record(z.unknown()).optional(),
});

export type Hata = z.infer<typeof HataSemasi>;

export const MetaSemasi = z.object({
  toplam: z.number().int().nonnegative(),
  sayfa: z.number().int().positive(),
  boyut: z.number().int().positive(),
});

export type Meta = z.infer<typeof MetaSemasi>;

export interface BasariliCevap<T> {
  veri: T;
  meta?: Meta;
  hata: null;
}

export interface HataliCevap {
  veri: null;
  hata: Hata;
}

export type ApiCevap<T> = BasariliCevap<T> | HataliCevap;

/** Sayfalama query parametreleri */
export const SayfalamaSemasi = z.object({
  sayfa: z.coerce.number().int().positive().default(1),
  boyut: z.coerce.number().int().positive().max(200).default(25),
});

export type SayfalamaGirdi = z.infer<typeof SayfalamaSemasi>;

/** UUID public_id doğrulama */
export const PublicIdSemasi = z.string().uuid();
