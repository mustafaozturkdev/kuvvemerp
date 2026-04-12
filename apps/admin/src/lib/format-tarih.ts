import { format, formatDistanceToNow, parseISO } from "date-fns";
import { tr, enUS } from "date-fns/locale";

const LOCALE_HARITA = {
  tr: tr,
  en: enUS,
};

export type TarihFormatAnahtar = "kisa" | "orta" | "uzun" | "saat" | "tam";

const FORMAT_HARITA: Record<TarihFormatAnahtar, string> = {
  kisa: "dd.MM.yyyy",
  orta: "dd MMM yyyy HH:mm",
  uzun: "dd MMMM yyyy, EEEE",
  saat: "HH:mm",
  tam: "dd MMMM yyyy, EEEE HH:mm",
};

export function formatTarih(
  tarih: string | Date,
  formatAnahtar: TarihFormatAnahtar = "orta",
  dil: "tr" | "en" = "tr",
): string {
  const nesne = typeof tarih === "string" ? parseISO(tarih) : tarih;
  if (Number.isNaN(nesne.getTime())) return "-";
  return format(nesne, FORMAT_HARITA[formatAnahtar], { locale: LOCALE_HARITA[dil] });
}

export function formatTarihGoreceli(
  tarih: string | Date,
  dil: "tr" | "en" = "tr",
): string {
  const nesne = typeof tarih === "string" ? parseISO(tarih) : tarih;
  if (Number.isNaN(nesne.getTime())) return "-";
  return formatDistanceToNow(nesne, {
    addSuffix: true,
    locale: LOCALE_HARITA[dil],
  });
}
