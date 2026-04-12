import { formatPara } from "@/lib/format-para";
import { cn } from "@/lib/utils";

interface ParaTutarOzellik {
  tutar: number | string;
  paraBirimi?: string;
  locale?: string;
  kisalt?: boolean;
  isaretliRenk?: boolean;
  className?: string;
}

/**
 * Para formatli hucre — +/- renk opsiyonlu, tabular-nums.
 */
export function ParaTutar({
  tutar,
  paraBirimi = "TRY",
  locale,
  kisalt,
  isaretliRenk = false,
  className,
}: ParaTutarOzellik) {
  const sayi = typeof tutar === "string" ? Number.parseFloat(tutar) : tutar;
  const metin = formatPara(tutar, { paraBirimi, locale, kisalt });
  const renkSinif =
    isaretliRenk && Number.isFinite(sayi)
      ? sayi > 0
        ? "text-[color:var(--renk-basarili)]"
        : sayi < 0
          ? "text-[color:var(--renk-tehlike)]"
          : "text-metin-ikinci"
      : "text-metin";

  return (
    <span
      data-para
      className={cn("para-gosterim", renkSinif, className)}
      title={`${metin}`}
    >
      {metin}
    </span>
  );
}
