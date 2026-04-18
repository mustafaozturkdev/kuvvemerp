import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

interface SerpOnizlemeOzellik {
  baslik: string;
  aciklama: string;
  slug: string;
  alanAdi?: string;
  yolPrefix?: string; // "urun" gibi
}

/**
 * SerpOnizleme — Google arama sonuclari icin canli onizleme.
 * SEO baslik + aciklama + URL doldurulurken kullanici Google'da nasil
 * gorunecegini gorsel olarak goruyor.
 */
export function SerpOnizleme({
  baslik,
  aciklama,
  slug,
  alanAdi = "kuvvem.com",
  yolPrefix = "urun",
}: SerpOnizlemeOzellik) {
  const { t } = useTranslation();

  const baslikMetin = baslik.trim() || t("serp.baslik-bos");
  const aciklamaMetin = aciklama.trim() || t("serp.aciklama-bos");
  const slugMetin = slug.trim() || t("serp.slug-bos");

  // Google SERP limitleri:
  //   Baslik ~60 karakter, aciklama ~160 karakter
  const baslikKesilmis = baslikMetin.length > 60 ? baslikMetin.substring(0, 60) + "..." : baslikMetin;
  const aciklamaKesilmis = aciklamaMetin.length > 160 ? aciklamaMetin.substring(0, 160) + "..." : aciklamaMetin;

  return (
    <div className="rounded-md border border-kenarlik bg-yuzey/50 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-metin-pasif font-medium uppercase tracking-wide">
        <Globe className="h-3 w-3" />
        {t("serp.onizleme-baslik")}
      </div>

      <div className="bg-white dark:bg-arkaplan rounded-md p-3 border border-kenarlik">
        {/* URL (favicon + breadcrumb) */}
        <div className="flex items-center gap-2 text-xs text-metin-ikinci mb-1">
          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold shrink-0">
            K
          </div>
          <div className="truncate">
            <span className="font-medium text-metin">{alanAdi}</span>
            <span className="text-metin-pasif"> › {yolPrefix} › </span>
            <span className={slug.trim() ? "text-metin-ikinci" : "text-metin-pasif italic"}>{slugMetin}</span>
          </div>
        </div>

        {/* Baslik (Google mavi tonuna yakin) */}
        <h3 className={`text-[18px] leading-6 text-[#1a0dab] dark:text-[#8ab4f8] font-normal truncate ${!baslik.trim() && "italic text-metin-pasif"}`}>
          {baslikKesilmis}
        </h3>

        {/* Aciklama (Google gri tonuna yakin) */}
        <p className={`text-sm text-[#4d5156] dark:text-[#bdc1c6] leading-snug line-clamp-2 mt-1 ${!aciklama.trim() && "italic text-metin-pasif"}`}>
          {aciklamaKesilmis}
        </p>
      </div>

      {/* Uyari: uzunluk limitleri */}
      <div className="flex gap-3 text-[11px] text-metin-pasif">
        <span className={baslikMetin.length > 60 ? "text-orange-500" : ""}>
          {t("serp.baslik-karakter", { mevcut: baslikMetin.length, max: 60 })}
        </span>
        <span className={aciklamaMetin.length > 160 ? "text-orange-500" : ""}>
          {t("serp.aciklama-karakter", { mevcut: aciklamaMetin.length, max: 160 })}
        </span>
      </div>
    </div>
  );
}
