import { useState, useEffect, useMemo } from "react";
import {
  X,
  ArrowLeft,
  Check,
  Loader2,
  Palette,
  Shirt,
  Footprints,
  Users,
  Box,
  Ruler,
  Layers,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tipler (backend HAZIR_EKSENLER ile uyumlu)
// ────────────────────────────────────────────────────────────

interface HazirSecenek {
  kod: string;
  ad: string;
  hexRenk?: string | null;
}

interface HazirEksen {
  kod: string;
  ad: string;
  ikon: string;
  aciklama: string;
  secenekler: HazirSecenek[];
}

const IKON_MAP: Record<string, LucideIcon> = {
  Palette, Shirt, Footprints, Users, Box, Ruler, Layers,
};

interface HazirEksenModalOzellik {
  acik: boolean;
  kapat: () => void;
  onEkle: (veri: {
    eksenKod: string;
    eksenAd: string;
    secenekler: Array<{ degerKod: string; degerAd: string; hexRenk?: string | null }>;
  }) => Promise<void>;
}

type Asama = "kartlar" | "secenekler" | "ozel";

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function HazirEksenModal({ acik, kapat, onEkle }: HazirEksenModalOzellik) {
  const { t } = useTranslation();
  const [hazirEksenler, setHazirEksenler] = useState<HazirEksen[]>([]);
  const [asama, setAsama] = useState<Asama>("kartlar");
  const [seciliEksen, setSeciliEksen] = useState<HazirEksen | null>(null);
  const [seciliKodlar, setSeciliKodlar] = useState<Set<string>>(new Set());
  const [ozelAd, setOzelAd] = useState("");
  const [aramaMetni, setAramaMetni] = useState("");
  const [ekliyor, setEkliyor] = useState(false);

  // Hazır eksenleri yükle (modal ilk açıldığında)
  useEffect(() => {
    if (!acik || hazirEksenler.length > 0) return;
    apiIstemci
      .get<HazirEksen[]>("/urun/hazir-eksenler")
      .then((res) => setHazirEksenler(res.data))
      .catch(() => {});
  }, [acik, hazirEksenler.length]);

  // Modal kapanınca state reset
  useEffect(() => {
    if (!acik) {
      setAsama("kartlar");
      setSeciliEksen(null);
      setSeciliKodlar(new Set());
      setOzelAd("");
      setAramaMetni("");
    }
  }, [acik]);

  const kartSec = (eksen: HazirEksen) => {
    setSeciliEksen(eksen);
    // Default: renk için ilk 8, diğerleri için tümü seçili
    const varsayilan = eksen.kod === "renk" ? eksen.secenekler.slice(0, 8) : eksen.secenekler;
    setSeciliKodlar(new Set(varsayilan.map((s) => s.kod)));
    setAramaMetni("");
    setAsama("secenekler");
  };

  const secenekToggle = (kod: string) => {
    const yeni = new Set(seciliKodlar);
    if (yeni.has(kod)) yeni.delete(kod); else yeni.add(kod);
    setSeciliKodlar(yeni);
  };

  const seciliSecenekler = useMemo(() => {
    if (!seciliEksen) return [];
    return seciliEksen.secenekler.filter((s) => seciliKodlar.has(s.kod));
  }, [seciliEksen, seciliKodlar]);

  const filtrelenmis = useMemo(() => {
    if (!seciliEksen || !aramaMetni.trim()) return seciliEksen?.secenekler ?? [];
    const q = aramaMetni.toLowerCase();
    return seciliEksen.secenekler.filter((s) => s.ad.toLowerCase().includes(q));
  }, [seciliEksen, aramaMetni]);

  const hazirEkle = async () => {
    if (!seciliEksen || seciliSecenekler.length === 0) return;
    setEkliyor(true);
    try {
      await onEkle({
        eksenKod: seciliEksen.kod,
        eksenAd: seciliEksen.ad,
        secenekler: seciliSecenekler.map((s) => ({
          degerKod: s.kod,
          degerAd: s.ad,
          hexRenk: s.hexRenk ?? null,
        })),
      });
      kapat();
    } catch {
      // onEkle hata toast'ı zaten gösteriyor
    }
    setEkliyor(false);
  };

  const ozelEkle = async () => {
    const ad = ozelAd.trim();
    if (!ad) return;
    const kod = ad
      .toLowerCase()
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setEkliyor(true);
    try {
      await onEkle({ eksenKod: kod, eksenAd: ad, secenekler: [] });
      kapat();
    } catch {}
    setEkliyor(false);
  };

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={kapat} />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-arkaplan rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 min-w-0">
            {asama !== "kartlar" && (
              <Button variant="ghost" size="sm" onClick={() => setAsama("kartlar")} className="h-9 w-9 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h2 className="text-base md:text-lg font-semibold text-metin truncate">
              {asama === "kartlar" && t("urun.hazir-eksen-baslik")}
              {asama === "secenekler" && (seciliEksen?.ad ?? "") + " " + t("urun.hazir-secenek-alt-baslik")}
              {asama === "ozel" && t("urun.hazir-ozel-baslik")}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={kapat} className="h-9 w-9">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ─── Aşama 1: Hazır kart listesi ─── */}
        {asama === "kartlar" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <p className="text-sm text-metin-ikinci mb-4">{t("urun.hazir-eksen-aciklama")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hazirEksenler.map((eksen) => {
                  const Ikon = IKON_MAP[eksen.ikon] ?? Layers;
                  return (
                    <button
                      key={eksen.kod}
                      type="button"
                      onClick={() => kartSec(eksen)}
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-lg border border-kenarlik",
                        "text-left transition-colors min-h-[80px]",
                        "hover:border-birincil hover:bg-birincil/5 focus:outline-none focus:ring-2 focus:ring-birincil/30",
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-birincil/10 text-birincil shrink-0">
                        <Ikon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-metin text-[15px]">{eksen.ad}</div>
                        <div className="text-xs text-metin-pasif mt-0.5">{eksen.aciklama}</div>
                        <div className="text-[11px] text-metin-pasif mt-1 font-mono">
                          {eksen.secenekler.length} {t("urun.hazir-secenek-sayisi")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-kenarlik p-4 md:p-6">
              <Button variant="outline" className="w-full" onClick={() => setAsama("ozel")}>
                <Plus className="h-4 w-4" />
                {t("urun.hazir-ozel-ac")}
              </Button>
            </div>
          </>
        )}

        {/* ─── Aşama 2: Seçenek seçimi ─── */}
        {asama === "secenekler" && seciliEksen && (
          <>
            <div className="px-4 md:px-6 pt-4">
              <p className="text-sm text-metin-ikinci mb-3">
                {t("urun.hazir-secenek-yardim", { ad: seciliEksen.ad.toLowerCase() })}
              </p>
              {seciliEksen.secenekler.length > 12 && (
                <Input
                  placeholder={t("urun.hazir-secenek-ara")}
                  value={aramaMetni}
                  onChange={(e) => setAramaMetni(e.target.value)}
                  className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm mb-3"
                />
              )}
              <div className="flex gap-2 mb-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSeciliKodlar(new Set(seciliEksen.secenekler.map((s) => s.kod)))}
                  className="text-birincil hover:underline"
                >
                  {t("urun.hazir-tumunu-sec")}
                </button>
                <span className="text-metin-pasif">·</span>
                <button
                  type="button"
                  onClick={() => setSeciliKodlar(new Set())}
                  className="text-metin-pasif hover:text-metin hover:underline"
                >
                  {t("urun.hazir-hicbiri")}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {filtrelenmis.map((secenek) => {
                  const secili = seciliKodlar.has(secenek.kod);
                  return (
                    <button
                      key={secenek.kod}
                      type="button"
                      onClick={() => secenekToggle(secenek.kod)}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-md border text-sm text-left min-h-[44px]",
                        "transition-colors",
                        secili
                          ? "border-birincil bg-birincil/10 text-birincil font-medium"
                          : "border-kenarlik hover:border-metin-ikinci text-metin",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                          secili ? "bg-birincil border-birincil" : "border-kenarlik",
                        )}
                      >
                        {secili && <Check className="h-3 w-3 text-white" />}
                      </div>
                      {secenek.hexRenk && (
                        <span
                          className="inline-block w-4 h-4 rounded-full border border-kenarlik shrink-0"
                          style={{ backgroundColor: secenek.hexRenk }}
                        />
                      )}
                      <span className="flex-1 truncate">{secenek.ad}</span>
                    </button>
                  );
                })}
              </div>
              {filtrelenmis.length === 0 && (
                <div className="text-center py-8 text-sm text-metin-pasif">{t("genel.kayit-bulunamadi")}</div>
              )}
            </div>
            <div className="border-t border-kenarlik px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
              <div className="flex-1 text-sm text-metin-ikinci">
                {t("urun.hazir-secili-sayisi", { sayi: seciliKodlar.size })}
              </div>
              <Button
                onClick={hazirEkle}
                disabled={seciliKodlar.size === 0 || ekliyor}
                className="min-h-[44px] sm:min-h-[36px]"
              >
                {ekliyor && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("urun.hazir-ekle-btn")}
              </Button>
            </div>
          </>
        )}

        {/* ─── Aşama 3: Özel eksen ─── */}
        {asama === "ozel" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
              <p className="text-sm text-metin-ikinci">{t("urun.hazir-ozel-aciklama")}</p>
              <div>
                <label className="block text-[15px] sm:text-sm font-medium text-metin mb-1.5">
                  {t("urun.hazir-ozel-ad")} <span className="text-red-500">*</span>
                </label>
                <Input
                  autoFocus
                  placeholder={t("urun.hazir-ozel-placeholder")}
                  value={ozelAd}
                  onChange={(e) => setOzelAd(e.target.value)}
                  className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                  onKeyDown={(e) => e.key === "Enter" && ozelEkle()}
                />
                <p className="text-sm sm:text-xs text-metin-pasif mt-1.5">
                  {t("urun.hazir-ozel-ipucu")}
                </p>
              </div>
            </div>
            <div className="border-t border-kenarlik px-4 md:px-6 py-3 md:py-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAsama("kartlar")}>
                {t("genel.iptal")}
              </Button>
              <Button onClick={ozelEkle} disabled={!ozelAd.trim() || ekliyor}>
                {ekliyor && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("urun.hazir-ozel-ekle")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
