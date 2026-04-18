/**
 * slugOlustur — TR karakter normalizasyonu ile URL slug uretir.
 * Backend (NestJS) tarafinda kullanilir. Frontend'deki slug.ts ile senkron.
 *
 * Ornekler:
 *   "Erkek Klasik Gömlek Beyaz" -> "erkek-klasik-gomlek-beyaz"
 *   "Türk Çayı Premium 1 KG"    -> "turk-cayi-premium-1-kg"
 */
export function slugOlustur(str: string): string {
  if (!str) return '';
  const trMap: Record<string, string> = {
    ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u',
    ş: 's', Ş: 's',
    ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o',
    ç: 'c', Ç: 'c',
  };
  return str
    .split('')
    .map((c) => trMap[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}
