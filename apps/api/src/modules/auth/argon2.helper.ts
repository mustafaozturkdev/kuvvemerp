import * as argon2 from 'argon2';

/**
 * Argon2id yardimcilari — sifre hash/verify.
 * Parametreler env'den okunmali (ARGON2_MEMORY_COST, ARGON2_TIME_COST, ARGON2_PARALLELISM).
 */
export interface Argon2Ayar {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export async function sifreHashle(sifre: string, ayar: Argon2Ayar): Promise<string> {
  return argon2.hash(sifre, {
    type: argon2.argon2id,
    memoryCost: ayar.memoryCost,
    timeCost: ayar.timeCost,
    parallelism: ayar.parallelism,
  });
}

export async function sifreDogrula(hash: string, sifre: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, sifre);
  } catch {
    return false;
  }
}
