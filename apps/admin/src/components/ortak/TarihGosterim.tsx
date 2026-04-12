import { formatTarih, formatTarihGoreceli, type TarihFormatAnahtar } from "@/lib/format-tarih";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TarihGosterimOzellik {
  tarih: string | Date;
  format?: TarihFormatAnahtar;
  goreceli?: boolean;
  dil?: "tr" | "en";
  className?: string;
}

export function TarihGosterim({
  tarih,
  format: formatAnahtar = "orta",
  goreceli = false,
  dil = "tr",
  className,
}: TarihGosterimOzellik) {
  const metin = goreceli
    ? formatTarihGoreceli(tarih, dil)
    : formatTarih(tarih, formatAnahtar, dil);
  const tamMetin = formatTarih(tarih, "tam", dil);

  return (
    <Tooltip icerik={tamMetin}>
      <time
        className={cn("text-metin-ikinci tabular-nums", className)}
        dateTime={typeof tarih === "string" ? tarih : tarih.toISOString()}
      >
        {metin}
      </time>
    </Tooltip>
  );
}
