/**
 * EAN-13 Barkod Uretici
 *
 * Standart 13 haneli EAN-13 barkodu uretir. Son hane check digit'tir.
 * Algoritma:
 *   - 12 hane random rakam
 *   - 13. hane: (tek pozisyonlar + cift pozisyonlar x 3) % 10'un tamamlayicisi
 *
 * Ornek: 8690123456789 (869 = Turkiye ulke kodu)
 */

const TR_ULKE_KODU = '869'; // Turkiye GS1 ulke kodu

/**
 * 12 rakam verildiğinde EAN-13 check digit hesaplar.
 * Tek pozisyonlar (1., 3., 5...) x 1, cift pozisyonlar (2., 4., 6...) x 3 toplanir.
 * Check = (10 - (toplam mod 10)) mod 10
 */
export function ean13CheckDigit(ilk12: string): number {
  if (ilk12.length !== 12 || !/^\d{12}$/.test(ilk12)) {
    throw new Error('EAN-13 check digit için 12 rakam gerekli');
  }
  let toplam = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(ilk12[i], 10);
    toplam += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (toplam % 10)) % 10;
}

/**
 * Rastgele EAN-13 barkod üretir. Türkiye ülke kodu (869) ile başlar.
 *
 * 869 + 9 rakam random + 1 check digit = 13 hane
 */
export function ean13Uret(): string {
  let rasgele = '';
  for (let i = 0; i < 9; i++) {
    rasgele += Math.floor(Math.random() * 10).toString();
  }
  const ilk12 = TR_ULKE_KODU + rasgele;
  const check = ean13CheckDigit(ilk12);
  return ilk12 + check.toString();
}

/**
 * Benzersiz EAN-13 üretir — veritabanında çakışma varsa yeniden dener.
 * @param benzersizMi - (barkod: string) => Promise<boolean> (true = uygun)
 */
export async function ean13BenzersizUret(
  benzersizMi: (barkod: string) => Promise<boolean>,
  maksDenemeler = 10,
): Promise<string> {
  for (let i = 0; i < maksDenemeler; i++) {
    const barkod = ean13Uret();
    if (await benzersizMi(barkod)) return barkod;
  }
  throw new Error('Benzersiz EAN-13 barkod üretilemedi (10 deneme aşıldı)');
}
