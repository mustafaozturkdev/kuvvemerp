/**
 * Para biçimleme — Intl.NumberFormat tabanlı.
 * Dinero.js ile tam decimal-safe versiyonu ileride eklenecek,
 * şimdilik string güvenli bir wrapper.
 */

export interface FormatParaSecenek {
  paraBirimi?: string;
  locale?: string;
  ondalikBasamak?: number;
  gizleSembol?: boolean;
  kisalt?: boolean;
}

const VARSAYILAN_LOCALE = "tr-TR";

export function formatPara(
  tutar: number | string,
  secenek: FormatParaSecenek = {},
): string {
  const {
    paraBirimi = "TRY",
    locale = VARSAYILAN_LOCALE,
    ondalikBasamak = 2,
    gizleSembol = false,
    kisalt = false,
  } = secenek;

  const sayi = typeof tutar === "string" ? Number.parseFloat(tutar) : tutar;
  if (!Number.isFinite(sayi)) return "-";

  if (kisalt) {
    return kisaltmaFormat(sayi, paraBirimi, locale);
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: gizleSembol ? "decimal" : "currency",
    currency: paraBirimi,
    minimumFractionDigits: ondalikBasamak,
    maximumFractionDigits: ondalikBasamak,
  });

  return formatter.format(sayi);
}

function kisaltmaFormat(sayi: number, paraBirimi: string, locale: string): string {
  const mutlak = Math.abs(sayi);
  const isaret = sayi < 0 ? "-" : "";
  let deger: string;

  if (mutlak >= 1_000_000_000) deger = `${(sayi / 1_000_000_000).toFixed(2)}Mr`;
  else if (mutlak >= 1_000_000) deger = `${(sayi / 1_000_000).toFixed(2)}M`;
  else if (mutlak >= 1_000) deger = `${(sayi / 1_000).toFixed(1)}K`;
  else return new Intl.NumberFormat(locale, { style: "currency", currency: paraBirimi }).format(sayi);

  const sembol = paraBirimiSembol(paraBirimi);
  return `${isaret}${deger} ${sembol}`;
}

export function paraBirimiSembol(paraBirimi: string): string {
  switch (paraBirimi.toUpperCase()) {
    case "TRY":
      return "₺";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return paraBirimi;
  }
}
