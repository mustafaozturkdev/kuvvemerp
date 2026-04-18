import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Store, PackageOpen, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────

interface Varyant {
  id: string;
  sku: string;
  varyantAd: string | null;
  varsayilanMi: boolean;
  eksenKombinasyon: Record<string, string>;
  paraBirimiKod: string;
  alisFiyati: string | null;
}

interface Magaza {
  id: string;
  ad: string;
}

interface Stok {
  urunVaryantId: string;
  magazaId: string;
  mevcutMiktar: string;
}

interface StokOzet {
  varyantlar: Varyant[];
  magazalar: Magaza[];
  stoklar: Stok[];
}

interface DevirKalemi {
  urunVaryantId: string;
  magazaId: string;
  miktar: string;       // controlled input
  birimMaliyet: string; // controlled input
  stokVar: boolean;     // disabled olacak mı (mevcut stok > 0 ise)
  mevcutMiktar: number; // bilgi
}

interface DevirWizardModalOzellik {
  acik: boolean;
  kapat: () => void;
  urunId: string;
  onKaydet: () => void;
}

type Asama = "bilgi" | "giris" | "onay";

function varyantAd(v: Varyant): string {
  const komb = Object.values(v.eksenKombinasyon ?? {});
  if (komb.length > 0) return komb.join(" / ");
  return v.varyantAd ?? v.sku;
}

// ────────────────────────────────────────────────────────────

export function DevirWizardModal({ acik, kapat, urunId, onKaydet }: DevirWizardModalOzellik) {
  const { t, i18n } = useTranslation();
  const onay = useOnay();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  const [asama, setAsama] = useState<Asama>("bilgi");
  const [ozet, setOzet] = useState<StokOzet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);

  const [kalemler, setKalemler] = useState<DevirKalemi[]>([]);
  const [aciklama, setAciklama] = useState("");

  useEffect(() => {
    if (!acik) return;
    setYukleniyor(true);
    apiIstemci
      .get<StokOzet>(`/urun/${urunId}/stok`)
      .then((res) => {
        setOzet(res.data);
        // Tüm varyant × mağaza kombinasyonlarını hazırla
        const hazir: DevirKalemi[] = [];
        for (const v of res.data.varyantlar) {
          for (const m of res.data.magazalar) {
            const stok = res.data.stoklar.find(
              (s) => s.urunVaryantId === v.id && s.magazaId === m.id,
            );
            const mevcut = stok ? Number(stok.mevcutMiktar) : 0;
            hazir.push({
              urunVaryantId: v.id,
              magazaId: m.id,
              miktar: "",
              birimMaliyet: v.alisFiyati ?? "",
              stokVar: mevcut > 0,
              mevcutMiktar: mevcut,
            });
          }
        }
        setKalemler(hazir);
      })
      .catch(() => toast.hata(t("urun.stok-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, urunId]);

  useEffect(() => {
    if (!acik) {
      setAsama("bilgi");
      setKalemler([]);
      setAciklama("");
    }
  }, [acik]);

  const kalemDegistir = (i: number, alan: "miktar" | "birimMaliyet", deger: string) => {
    setKalemler((mev) => mev.map((k, idx) => (idx === i ? { ...k, [alan]: deger } : k)));
  };

  const doldurulmus = useMemo(() => {
    return kalemler.filter((k) => {
      if (k.stokVar) return false;
      const m = Number(k.miktar);
      return !isNaN(m) && m > 0;
    });
  }, [kalemler]);

  const toplamMiktar = useMemo(
    () => doldurulmus.reduce((t, k) => t + Number(k.miktar), 0),
    [doldurulmus],
  );

  const toplamDeger = useMemo(
    () =>
      doldurulmus.reduce((t, k) => {
        const maliyet = Number(k.birimMaliyet || 0);
        return t + maliyet * Number(k.miktar);
      }, 0),
    [doldurulmus],
  );

  const varyantBilgi = (id: string) => ozet?.varyantlar.find((v) => v.id === id);
  const magazaAd = (id: string) => ozet?.magazalar.find((m) => m.id === id)?.ad ?? "—";

  const kaydet = async () => {
    if (doldurulmus.length === 0) {
      toast.hata(t("urun.devir-bos"));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("urun.devir-onay-baslik"),
      mesaj: t("urun.devir-onay-mesaj", {
        sayi: doldurulmus.length,
        miktar: sayiFormat.format(toplamMiktar),
      }),
      varyant: "uyari",
      onayMetni: t("urun.devir-onay-btn"),
    });
    if (!tamam) return;

    setKaydediyor(true);
    try {
      await apiIstemci.post(`/urun/${urunId}/stok/devir`, {
        aciklama: aciklama.trim() || null,
        kalemler: doldurulmus.map((k) => ({
          urunVaryantId: Number(k.urunVaryantId),
          magazaId: Number(k.magazaId),
          miktar: Number(k.miktar),
          birimMaliyet: k.birimMaliyet ? Number(k.birimMaliyet) : null,
        })),
      });
      toast.basarili(t("urun.devir-basarili", { sayi: doldurulmus.length }));
      onKaydet();
      kapat();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setKaydediyor(false);
  };

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={kapat} />
      <div className="relative w-full sm:max-w-4xl h-full sm:max-h-[90vh] sm:h-auto bg-arkaplan sm:rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 min-w-0">
            {asama !== "bilgi" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAsama(asama === "onay" ? "giris" : "bilgi")}
                className="h-10 w-10 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-birincil" />
              <div>
                <h2 className="text-base md:text-lg font-semibold text-metin">{t("urun.devir-baslik")}</h2>
                <p className="text-xs text-metin-pasif">
                  {asama === "bilgi" && t("urun.devir-adim-1")}
                  {asama === "giris" && t("urun.devir-adim-2")}
                  {asama === "onay" && t("urun.devir-adim-3")}
                </p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={kapat} className="h-10 w-10 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {yukleniyor ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
          </div>
        ) : (
          <>
            {/* ─── Aşama 1: Bilgi ─── */}
            {asama === "bilgi" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-metin-ikinci">
                      <p className="font-medium text-metin mb-1">{t("urun.devir-uyari-baslik")}</p>
                      <p>{t("urun.devir-uyari-1")}</p>
                      <p className="mt-2">{t("urun.devir-uyari-2")}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-metin-ikinci">
                    <p>{t("urun.devir-ne-zaman-baslik")}</p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                      <li>{t("urun.devir-ne-zaman-1")}</li>
                      <li>{t("urun.devir-ne-zaman-2")}</li>
                      <li>{t("urun.devir-ne-zaman-3")}</li>
                    </ul>
                  </div>
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6">
                  <Button
                    onClick={() => setAsama("giris")}
                    className="w-full min-h-[44px] sm:min-h-[36px]"
                  >
                    {t("urun.devir-devam")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ─── Aşama 2: Giriş ─── */}
            {asama === "giris" && ozet && (
              <>
                <div className="px-4 md:px-6 pt-3 pb-2 bg-yuzey/30 border-b border-kenarlik">
                  <p className="text-sm text-metin-ikinci">{t("urun.devir-giris-aciklama")}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                  {ozet.varyantlar.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg border border-kenarlik p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {v.varsayilanMi && (
                          <Badge className="bg-birincil text-white text-[10px]">
                            {t("urun.varsayilan")}
                          </Badge>
                        )}
                        <span className="font-mono text-sm text-metin">{v.sku}</span>
                        <span className="text-sm text-metin-ikinci">— {varyantAd(v)}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {ozet.magazalar.map((m) => {
                          const idx = kalemler.findIndex(
                            (k) => k.urunVaryantId === v.id && k.magazaId === m.id,
                          );
                          const k = kalemler[idx];
                          if (!k) return null;
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center p-2 rounded",
                                k.stokVar && "bg-yuzey/50 opacity-75",
                              )}
                            >
                              <div className="flex items-center gap-2 text-sm">
                                <Store className="h-3.5 w-3.5 text-metin-pasif" />
                                <span className="text-metin">{m.ad}</span>
                                {k.stokVar && (
                                  <Badge variant="secondary" className="text-[10px] ml-auto">
                                    {t("urun.devir-stok-mevcut")}: {sayiFormat.format(k.mevcutMiktar)}
                                  </Badge>
                                )}
                              </div>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                placeholder={t("urun.devir-miktar-ph")}
                                value={k.miktar}
                                onChange={(e) => kalemDegistir(idx, "miktar", e.target.value)}
                                onFocus={(e) => e.target.select()}
                                disabled={k.stokVar}
                                className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm tabular-nums text-right"
                              />
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                placeholder={`${t("urun.devir-birim-maliyet-ph")} (${v.paraBirimiKod})`}
                                value={k.birimMaliyet}
                                onChange={(e) => kalemDegistir(idx, "birimMaliyet", e.target.value)}
                                onFocus={(e) => e.target.select()}
                                disabled={k.stokVar}
                                className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm tabular-nums text-right"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6 space-y-3">
                  <div className="text-sm text-metin-ikinci flex flex-wrap gap-4 tabular-nums">
                    <span>
                      {t("urun.devir-toplam-kalem")}:{" "}
                      <strong className="text-metin">{doldurulmus.length}</strong>
                    </span>
                    <span>
                      {t("urun.devir-toplam-miktar")}:{" "}
                      <strong className="text-metin">{sayiFormat.format(toplamMiktar)}</strong>
                    </span>
                    {toplamDeger > 0 && (
                      <span>
                        {t("urun.devir-toplam-deger")}:{" "}
                        <strong className="text-metin">{sayiFormat.format(toplamDeger)}</strong>
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => setAsama("onay")}
                    disabled={doldurulmus.length === 0}
                    className="w-full min-h-[44px] sm:min-h-[36px]"
                  >
                    {t("urun.devir-sonraki")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ─── Aşama 3: Onay ─── */}
            {asama === "onay" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                  <div className="rounded-lg border border-kenarlik p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-metin">
                          {doldurulmus.length}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.devir-toplam-kalem")}</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-green-600">
                          +{sayiFormat.format(toplamMiktar)}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.devir-toplam-miktar")}</div>
                      </div>
                      {toplamDeger > 0 && (
                        <div className="col-span-2 sm:col-span-1">
                          <div className="text-2xl font-semibold tabular-nums text-metin">
                            {sayiFormat.format(toplamDeger)}
                          </div>
                          <div className="text-xs text-metin-pasif">{t("urun.devir-toplam-deger")}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[15px] sm:text-sm font-medium text-metin mb-1.5">
                      {t("urun.devir-aciklama")}
                    </label>
                    <Input
                      value={aciklama}
                      onChange={(e) => setAciklama(e.target.value)}
                      placeholder={t("urun.devir-aciklama-ph")}
                      className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                    />
                  </div>
                  <div className="rounded-lg border border-kenarlik divide-y divide-kenarlik max-h-[300px] overflow-y-auto">
                    {doldurulmus.map((k, i) => {
                      const v = varyantBilgi(k.urunVaryantId);
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{v ? varyantAd(v) : k.urunVaryantId}</div>
                            <div className="text-xs text-metin-pasif">{magazaAd(k.magazaId)}</div>
                          </div>
                          <div className="text-right tabular-nums shrink-0">
                            <div className="text-metin font-medium">
                              +{sayiFormat.format(Number(k.miktar))}
                            </div>
                            {k.birimMaliyet && (
                              <div className="text-xs text-metin-pasif">
                                @ {sayiFormat.format(Number(k.birimMaliyet))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6 flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setAsama("giris")} disabled={kaydediyor}>
                    {t("genel.geri")}
                  </Button>
                  <Button
                    onClick={kaydet}
                    disabled={kaydediyor}
                    className="flex-1 min-h-[44px] sm:min-h-[36px]"
                  >
                    {kaydediyor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("urun.devir-kaydet")}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
