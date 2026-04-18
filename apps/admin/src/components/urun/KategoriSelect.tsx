import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Search, X, FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tip
// ────────────────────────────────────────────────────────────

export interface KategoriOgesi {
  id: string;
  ad: string;
  ustKategoriId?: string | null;
  seviye?: number;
}

interface OrtakOzellik {
  kategoriler: KategoriOgesi[];
  etiket?: string;
  zorunlu?: boolean;
  yardim?: string;
  hata?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface TekliOzellik extends OrtakOzellik {
  mod: "tekli";
  deger: string;
  onChange: (deger: string) => void;
  exclude?: string[]; // Gostermeyecek id'ler (cakismayi engeller)
}

interface CokluOzellik extends OrtakOzellik {
  mod: "coklu";
  degerler: string[];
  onChange: (degerler: string[]) => void;
  exclude?: string[];
  maxSecim?: number;
}

type KategoriSelectOzellik = TekliOzellik | CokluOzellik;

// ────────────────────────────────────────────────────────────
// Hiyerarsik yol hesapla (runtime, yolText DB'de bos olabilir)
// ────────────────────────────────────────────────────────────

interface KategoriZenginlestirilmis extends KategoriOgesi {
  yol: string[]; // ['Elektronik', 'Telefon', 'Akilli Telefon']
  yolText: string; // "Elektronik / Telefon / Akilli Telefon"
  derinlik: number;
}

function yolHesapla(kategoriler: KategoriOgesi[]): KategoriZenginlestirilmis[] {
  const map = new Map<string, KategoriOgesi>();
  kategoriler.forEach((k) => map.set(k.id, k));

  const zengin = kategoriler.map((k) => {
    const yol: string[] = [];
    let current: KategoriOgesi | undefined = k;
    const gorulmus = new Set<string>();
    while (current && !gorulmus.has(current.id)) {
      gorulmus.add(current.id);
      yol.unshift(current.ad);
      current = current.ustKategoriId ? map.get(current.ustKategoriId) : undefined;
    }
    return {
      ...k,
      yol,
      yolText: yol.join(" / "),
      derinlik: yol.length - 1,
    };
  });

  // Hiyerarsik sirala (DFS): ust kategorilerden alta
  zengin.sort((a, b) => {
    if (a.yolText < b.yolText) return -1;
    if (a.yolText > b.yolText) return 1;
    return 0;
  });
  return zengin;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function KategoriSelect(props: KategoriSelectOzellik) {
  const { t } = useTranslation();
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const zenginler = useMemo(() => yolHesapla(props.kategoriler), [props.kategoriler]);

  // Dis tikla kapan
  useEffect(() => {
    if (!acik) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [acik]);

  // Filtre
  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLowerCase();
    const excludeSet = new Set(props.exclude ?? []);
    return zenginler.filter((k) => {
      if (excludeSet.has(k.id)) return false;
      if (!q) return true;
      return k.yolText.toLowerCase().includes(q) || k.ad.toLowerCase().includes(q);
    });
  }, [zenginler, arama, props.exclude]);

  // Secili olan(lar)
  const seciliSet = useMemo(() => {
    if (props.mod === "tekli") {
      return new Set(props.deger ? [props.deger] : []);
    }
    return new Set(props.degerler);
  }, [props]);

  const seciliZenginler = useMemo(() => zenginler.filter((k) => seciliSet.has(k.id)), [zenginler, seciliSet]);

  // Ozet etiket
  const ozetEtiket = useMemo(() => {
    if (props.mod === "tekli") {
      const s = seciliZenginler[0];
      return s ? s.yolText : (props.placeholder ?? t("urun.kategori-sec"));
    }
    const s = props.degerler.length;
    if (s === 0) return props.placeholder ?? t("urun.ek-kategori-sec");
    if (s === 1) return seciliZenginler[0]?.yolText ?? "";
    return t("urun.n-kategori-secili", { n: s });
  }, [props, seciliZenginler, t]);

  const tekliSec = (id: string) => {
    if (props.mod !== "tekli") return;
    props.onChange(props.deger === id ? "" : id);
    setAcik(false);
  };

  const cokluSec = (id: string) => {
    if (props.mod !== "coklu") return;
    const mevcut = new Set(props.degerler);
    if (mevcut.has(id)) {
      mevcut.delete(id);
    } else {
      if (props.maxSecim && mevcut.size >= props.maxSecim) return;
      mevcut.add(id);
    }
    props.onChange(Array.from(mevcut));
  };

  const hepsiniKaldir = () => {
    if (props.mod === "coklu") props.onChange([]);
    else props.onChange("");
  };

  const kategoriAktif = (id: string) => seciliSet.has(id);

  return (
    <div className={cn(props.hata && "has-error")}>
      {props.etiket && (
        <label className="block text-[15px] sm:text-sm font-medium text-metin mb-1.5">
          {props.etiket}
          {props.zorunlu && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div ref={wrapperRef} className="relative">
        {/* Tetikleyici — mobile-first: 44px touch target, 16px font */}
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => setAcik((a) => !a)}
          className={cn(
            "w-full flex items-center gap-2 rounded-md border bg-arkaplan text-left transition-colors",
            "px-3.5 sm:px-3 py-2.5 sm:py-1.5 text-base sm:text-sm min-h-[44px] sm:min-h-[36px]",
            "hover:border-metin-ikinci focus:outline-none focus:ring-2 focus:ring-birincil/30",
            props.hata ? "border-red-500" : "border-kenarlik",
            props.disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <FolderTree className="h-5 w-5 sm:h-4 sm:w-4 text-metin-pasif shrink-0" />
          <span className={cn("flex-1 truncate", seciliSet.size === 0 && "text-metin-pasif")}>
            {ozetEtiket}
          </span>
          {seciliSet.size > 0 && (
            <X
              className="h-3.5 w-3.5 text-metin-pasif hover:text-metin"
              onClick={(e) => { e.stopPropagation(); hepsiniKaldir(); }}
            />
          )}
          <ChevronDown className={cn("h-4 w-4 text-metin-pasif shrink-0 transition-transform", acik && "rotate-180")} />
        </button>

        {/* Coklu secim etiketleri */}
        {props.mod === "coklu" && props.degerler.length > 1 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {seciliZenginler.map((k) => (
              <Badge key={k.id} variant="secondary" className="text-[11px] gap-1">
                {k.yolText}
                <button
                  type="button"
                  onClick={() => cokluSec(k.id)}
                  className="hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Dropdown paneli */}
        {acik && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-kenarlik bg-arkaplan shadow-lg max-h-80 overflow-hidden flex flex-col">
            {/* Arama */}
            <div className="p-2 border-b border-kenarlik">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-metin-pasif" />
                <Input
                  autoFocus
                  placeholder={t("urun.kategori-arama-placeholder")}
                  className="pl-8 h-8 text-sm"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                />
              </div>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto py-1">
              {filtrelenmis.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-metin-pasif">
                  {t("genel.kayit-bulunamadi")}
                </div>
              ) : (
                filtrelenmis.map((k) => {
                  const secili = kategoriAktif(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => (props.mod === "tekli" ? tekliSec(k.id) : cokluSec(k.id))}
                      className={cn(
                        "w-full flex items-center gap-2 text-left transition-colors",
                        "px-3 py-3 sm:py-1.5 text-base sm:text-sm min-h-[44px] sm:min-h-0",
                        "hover:bg-yuzey active:bg-yuzey",
                        secili && "bg-birincil/5 text-birincil",
                      )}
                      style={{ paddingLeft: `${12 + k.derinlik * 16}px` }}
                    >
                      {props.mod === "coklu" ? (
                        <div
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                            secili ? "bg-birincil border-birincil" : "border-kenarlik",
                          )}
                        >
                          {secili && <Check className="h-3 w-3 text-white" />}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0",
                            secili ? "border-birincil" : "border-kenarlik",
                          )}
                        >
                          {secili && <div className="h-1.5 w-1.5 rounded-full bg-birincil" />}
                        </div>
                      )}
                      <span className="flex-1 truncate">{k.ad}</span>
                      {k.derinlik > 0 && (
                        <span className="text-[10px] text-metin-pasif font-mono">
                          {k.yolText.split(" / ").slice(0, -1).join(" / ")}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Coklu alt aksiyon */}
            {props.mod === "coklu" && (
              <div className="flex items-center justify-between border-t border-kenarlik px-3 py-1.5 text-xs text-metin-pasif">
                <span>
                  {props.degerler.length} / {zenginler.length}
                </span>
                <div className="flex gap-2">
                  {props.degerler.length > 0 && (
                    <button type="button" className="hover:text-metin" onClick={hepsiniKaldir}>
                      {t("genel.temizle")}
                    </button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAcik(false)}>
                    {t("genel.tamam")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {props.yardim && !props.hata && (
        <p className="text-xs text-metin-pasif mt-1">{props.yardim}</p>
      )}
      {props.hata && <p className="text-xs text-red-500 mt-1">{props.hata}</p>}
    </div>
  );
}
