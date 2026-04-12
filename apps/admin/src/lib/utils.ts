import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind class merge + conditional class helper.
 * shadcn/ui standardı.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Basit debounce — küçük sayıda argüman için yeterli.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  gecikme: number,
): (...args: TArgs) => void {
  let zamanlayici: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (zamanlayici) clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => fn(...args), gecikme);
  };
}

/**
 * Türkçe karakter normalize (fuzzy search için).
 * "Şeker" → "seker", "İstanbul" → "istanbul"
 */
export function turkceNormalize(metin: string): string {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

/**
 * Yeni ekrana uygun rastgele ID (non-crypto).
 */
export function yeniId(): string {
  return Math.random().toString(36).slice(2, 10);
}
