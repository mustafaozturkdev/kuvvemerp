/**
 * kodUret — Belirlenen tablo ve prefix için benzersiz ardışık kod üretir.
 *
 * Örn: MRK-0001, CAR-00001, KAT-0001
 *
 * PostgreSQL regex kullanır; mevcut maksimum numeric suffix bulunup +1 eklenir.
 * Eşzamanlı insert'lerde tablodaki UNIQUE(kod) constraint yarışı çözer; çağıran
 * servis P2002 (Prisma unique violation) durumunda retry yapmalıdır.
 */
export async function kodUret(
  prisma: any,
  tablo: string,
  prefix: string,
  uzunluk = 4,
): Promise<string> {
  const sonuc = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(kod FROM '[0-9]+$') AS INTEGER)), 0) AS max_sira
     FROM ${tablo}
     WHERE kod ~ $1`,
    `^${prefix}-[0-9]+$`,
  )) as { max_sira: number | null }[];
  const sonraki = Number(sonuc[0]?.max_sira ?? 0) + 1;
  return `${prefix}-${String(sonraki).padStart(uzunluk, '0')}`;
}

/**
 * kodUretRetry — Unique çakışmasında N kez tekrar dener.
 *
 * Kullanım:
 *   const kod = await kodUretRetry(
 *     () => kodUret(prisma, 'marka', 'MRK'),
 *     (k) => prisma.marka.create({ data: { ...veri, kod: k } }),
 *   );
 */
export async function kodIleOlustur<T>(
  prisma: any,
  tablo: string,
  prefix: string,
  olustur: (kod: string) => Promise<T>,
  uzunluk = 4,
  maksDenemeler = 5,
): Promise<T> {
  let sonHata: unknown;
  for (let i = 0; i < maksDenemeler; i++) {
    const kod = await kodUret(prisma, tablo, prefix, uzunluk);
    try {
      return await olustur(kod);
    } catch (err: any) {
      // Prisma P2002 = unique constraint violation → başka bir süreç aynı kodu kaptı
      if (err?.code === 'P2002') {
        sonHata = err;
        continue;
      }
      throw err;
    }
  }
  throw sonHata ?? new Error('Kod üretilemedi');
}
