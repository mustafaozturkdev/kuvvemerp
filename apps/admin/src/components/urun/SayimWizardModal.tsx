import { useState, useEffect, useMemo } from "react";
import { X, Loader2, CheckCircle2, Store, ClipboardCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface Varyant {
  id: string;
  sku: string;
  varyantAd: string | null;
  varsayilanMi: boolean;
  eksenKombinasyon: Record<string, string>;
  paraBirimiKod: string;
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

interface StokOzetCevap {
  varyantlar: Varyant[];
  magazalar: Magaza[];
  stoklar: Stok[];
}

interface SayimKalemi {
  urunVaryantId: string;
  sistemMiktar: number;
  sayilanMiktar: string; // input (controlled)
}

interface SayimSonucu {
  kayitliKalem: number;
  farkliKalem: number;
  toplamArtis: number;
  toplamAzalis: number;
}

interface SayimWizardModalOzellik {
  acik: boolean;
  kapat: () => void;
  urunId: string;
  onKaydet: () => void;
}

type Asama = "magaza" | "sayim" | "onay";

// ────────────────────────────────────────────────────────────
// Yardımcı
// ────────────────────────────────────────────────────────────

function varyantAd(v: Varyant): string {
  const komb = Object.values(v.eksenKombinasyon ?? {});
  if (komb.length > 0) return komb.join(" / ");
  return v.varyantAd ?? v.sku;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function SayimWizardModal({ acik, kapat, urunId, onKaydet }: SayimWizardModalOzellik) {
  const { t, i18n } = useTranslation();
  const onay = useOnay();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  const [asama, setAsama] = useState<Asama>("magaza");
  const [ozet, setOzet] = useState<StokOzetCevap | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);

  const [seciliMagazaId, setSeciliMagazaId] = useState<string>("");
  const [kalemler, setKalemler] = useState<SayimKalemi[]>([]);
  const [aciklama, setAciklama] = useState("");

  // Modal açılınca stok özeti yükle
  useEffect(() => {
    if (!acik) return;
    setYukleniyor(true);
    apiIstemci
      .get<StokOzetCevap>(`/urun/${urunId}/stok`)
      .then((res) => setOzet(res.data))
      .catch(() => toast.hata(t("urun.stok-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, urunId]);

  // Modal kapanınca reset
  useEffect(() => {
    if (!acik) {
      setAsama("magaza");
      setSeciliMagazaId("");
      setKalemler([]);
      setAciklama("");
    }
  }, [acik]);

  // Mağaza seçilince: o mağazadaki varyant stoklarını kalem olarak hazırla
  const magazaSec = (magazaId: string) => {
    if (!ozet) return;
    setSeciliMagazaId(magazaId);
    const hazir: SayimKalemi[] = ozet.varyantlar.map((v) => {
      const stok = ozet.stoklar.find(
        (s) => s.urunVaryantId === v.id && s.magazaId === magazaId,
      );
      const sistem = stok ? Number(stok.mevcutMiktar) : 0;
      return {
        urunVaryantId: v.id,
        sistemMiktar: sistem,
        sayilanMiktar: String(sistem), // default: sistemle aynı (fark=0)
      };
    });
    setKalemler(hazir);
    setAsama("sayim");
  };

  const kalemDegistir = (varyantId: string, deger: string) => {
    setKalemler((mev) =>
      mev.map((k) => (k.urunVaryantId === varyantId ? { ...k, sayilanMiktar: deger } : k)),
    );
  };

  const tumunuSistemeEsitle = () => {
    setKalemler((mev) => mev.map((k) => ({ ...k, sayilanMiktar: String(k.sistemMiktar) })));
  };

  const tumunuSifirla = () => {
    setKalemler((mev) => mev.map((k) => ({ ...k, sayilanMiktar: "0" })));
  };

  const seciliMagazaAd = useMemo(
    () => ozet?.magazalar.find((m) => m.id === seciliMagazaId)?.ad ?? "—",
    [ozet, seciliMagazaId],
  );

  const varyantBilgi = (varyantId: string) =>
    ozet?.varyantlar.find((v) => v.id === varyantId);

  const kalemFark = (k: SayimKalemi) => {
    const sayilan = Number(k.sayilanMiktar);
    return isNaN(sayilan) ? 0 : sayilan - k.sistemMiktar;
  };

  const farkliKalemler = useMemo(
    () => kalemler.filter((k) => kalemFark(k) !== 0),
    [kalemler],
  );

  const toplamArtis = useMemo(
    () => farkliKalemler.reduce((t, k) => (kalemFark(k) > 0 ? t + kalemFark(k) : t), 0),
    [farkliKalemler],
  );
  const toplamAzalis = useMemo(
    () => farkliKalemler.reduce((t, k) => (kalemFark(k) < 0 ? t + Math.abs(kalemFark(k)) : t), 0),
    [farkliKalemler],
  );

  const kaydet = async () => {
    // Negatif veya NaN kontrolü
    const hataliKalem = kalemler.find((k) => {
      const n = Number(k.sayilanMiktar);
      return isNaN(n) || n < 0;
    });
    if (hataliKalem) {
      toast.hata(t("urun.sayim-gecersiz-sayi"));
      return;
    }

    const tamam = await onay.goster({
      baslik: t("urun.sayim-onay-baslik"),
      mesaj:
        farkliKalemler.length === 0
          ? t("urun.sayim-onay-fark-yok")
          : t("urun.sayim-onay-mesaj", {
              fark: farkliKalemler.length,
              artis: sayiFormat.format(toplamArtis),
              azalis: sayiFormat.format(toplamAzalis),
            }),
      varyant: farkliKalemler.length > 0 ? "uyari" : "bilgi",
      onayMetni: t("urun.sayim-onay-btn"),
    });
    if (!tamam) return;

    setKaydediyor(true);
    try {
      const res = await apiIstemci.post<SayimSonucu>(`/urun/${urunId}/stok/sayim`, {
        magazaId: Number(seciliMagazaId),
        aciklama: aciklama.trim() || null,
        kalemler: kalemler.map((k) => ({
          urunVaryantId: Number(k.urunVaryantId),
          sayilanMiktar: Number(k.sayilanMiktar),
        })),
      });
      toast.basarili(
        t("urun.sayim-basarili", {
          toplam: res.data.kayitliKalem,
          fark: res.data.farkliKalem,
        }),
      );
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
      <div className="relative w-full sm:max-w-3xl h-full sm:max-h-[90vh] sm:h-auto bg-arkaplan sm:rounded-lg shadow-xl flex flex-col">
        {/* Başlık + Asama göstergesi */}
        <div className="flex items-center justify-between border-b border-kenarlik px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 min-w-0">
            {asama !== "magaza" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAsama(asama === "onay" ? "sayim" : "magaza")}
                className="h-10 w-10 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-birincil" />
              <div>
                <h2 className="text-base md:text-lg font-semibold text-metin">{t("urun.sayim-baslik")}</h2>
                <p className="text-xs text-metin-pasif">
                  {asama === "magaza" && t("urun.sayim-adim-1")}
                  {asama === "sayim" && t("urun.sayim-adim-2", { magaza: seciliMagazaAd })}
                  {asama === "onay" && t("urun.sayim-adim-3")}
                </p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={kapat} className="h-10 w-10 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* İçerik */}
        {yukleniyor ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
          </div>
        ) : (
          <>
            {/* ─── Aşama 1: Mağaza Seç ─── */}
            {asama === "magaza" && ozet && (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
                <p className="text-sm text-metin-ikinci">{t("urun.sayim-magaza-sec-aciklama")}</p>
                {ozet.magazalar.length === 0 ? (
                  <div className="text-center py-8 text-metin-pasif">{t("urun.magaza-yok")}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ozet.magazalar.map((m) => {
                      const magazaStok = ozet.stoklar
                        .filter((s) => s.magazaId === m.id)
                        .reduce((t, s) => t + Number(s.mevcutMiktar), 0);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => magazaSec(m.id)}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-lg border text-left transition-colors min-h-[72px]",
                            "hover:border-birincil hover:bg-birincil/5",
                            seciliMagazaId === m.id
                              ? "border-birincil bg-birincil/10"
                              : "border-kenarlik",
                          )}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-birincil/10 text-birincil shrink-0">
                            <Store className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-metin">{m.ad}</div>
                            <div className="text-xs text-metin-pasif mt-0.5 tabular-nums">
                              {t("urun.sayim-mevcut-stok", { miktar: sayiFormat.format(magazaStok) })}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-metin-pasif shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── Aşama 2: Sayım Girişi ─── */}
            {asama === "sayim" && ozet && (
              <>
                <div className="px-4 md:px-6 pt-3 pb-2 bg-yuzey/30 border-b border-kenarlik">
                  <p className="text-sm text-metin-ikinci">{t("urun.sayim-giris-aciklama")}</p>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    <button
                      type="button"
                      onClick={tumunuSistemeEsitle}
                      className="text-birincil hover:underline"
                    >
                      {t("urun.sayim-tumu-sisteme")}
                    </button>
                    <span className="text-metin-pasif">·</span>
                    <button
                      type="button"
                      onClick={tumunuSifirla}
                      className="text-metin-pasif hover:text-red-600 hover:underline"
                    >
                      {t("urun.sayim-tumu-sifir")}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                  <div className="space-y-2">
                    {kalemler.map((k) => {
                      const v = varyantBilgi(k.urunVaryantId);
                      if (!v) return null;
                      const fark = kalemFark(k);
                      return (
                        <div
                          key={k.urunVaryantId}
                          className={cn(
                            "p-3 rounded-lg border",
                            fark !== 0 ? "border-amber-500/40 bg-amber-500/5" : "border-kenarlik",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
                            <div className="min-w-0 flex-1 w-full">
                              <div className="flex items-center gap-2 flex-wrap">
                                {v.varsayilanMi && (
                                  <Badge className="bg-birincil text-white text-[10px]">
                                    {t("urun.varsayilan")}
                                  </Badge>
                                )}
                                <span className="font-mono text-sm text-metin">{v.sku}</span>
                                <span className="text-sm text-metin-ikinci">— {varyantAd(v)}</span>
                              </div>
                              <div className="text-xs text-metin-pasif mt-1">
                                {t("urun.sayim-sistem")}: <span className="tabular-nums font-medium">{sayiFormat.format(k.sistemMiktar)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                              <div className="flex-1 sm:w-40">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min="0"
                                  value={k.sayilanMiktar}
                                  onChange={(e) => kalemDegistir(k.urunVaryantId, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  className="text-right text-base sm:text-sm tabular-nums min-h-[44px] sm:min-h-[36px]"
                                  placeholder={t("urun.sayim-fiziksel-sayi")}
                                />
                              </div>
                              {fark !== 0 && (
                                <div
                                  className={cn(
                                    "w-20 text-right tabular-nums font-medium text-sm shrink-0",
                                    fark > 0 ? "text-green-600" : "text-red-600",
                                  )}
                                >
                                  {fark > 0 ? "+" : ""}
                                  {sayiFormat.format(fark)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Alt özet + ileri */}
                <div className="border-t border-kenarlik p-4 md:p-6 space-y-3">
                  {farkliKalemler.length > 0 ? (
                    <div className="text-sm text-metin-ikinci space-y-1">
                      <div>
                        {t("urun.sayim-fark-ozet", { sayi: farkliKalemler.length })}
                      </div>
                      <div className="flex gap-4 text-xs tabular-nums">
                        {toplamArtis > 0 && (
                          <span className="text-green-600">
                            +{sayiFormat.format(toplamArtis)} {t("urun.sayim-artis")}
                          </span>
                        )}
                        {toplamAzalis > 0 && (
                          <span className="text-red-600">
                            -{sayiFormat.format(toplamAzalis)} {t("urun.sayim-azalis")}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-metin-pasif flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {t("urun.sayim-fark-yok")}
                    </div>
                  )}
                  <Button
                    onClick={() => setAsama("onay")}
                    disabled={kalemler.length === 0}
                    className="w-full min-h-[44px] sm:min-h-[36px]"
                  >
                    {t("urun.sayim-sonraki")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ─── Aşama 3: Onay ─── */}
            {asama === "onay" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                  <div className="rounded-lg border border-kenarlik p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Store className="h-4 w-4 text-metin-pasif" />
                      <span className="text-metin-pasif">{t("urun.stok-magaza")}:</span>
                      <span className="font-medium text-metin">{seciliMagazaAd}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-3 border-t border-kenarlik">
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-metin">
                          {kalemler.length}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.sayim-toplam-kalem")}</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-amber-600">
                          {farkliKalemler.length}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.sayim-farkli-kalem")}</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-green-600">
                          +{sayiFormat.format(toplamArtis)}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.sayim-artis")}</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-red-600">
                          -{sayiFormat.format(toplamAzalis)}
                        </div>
                        <div className="text-xs text-metin-pasif">{t("urun.sayim-azalis")}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[15px] sm:text-sm font-medium text-metin mb-1.5">
                      {t("urun.sayim-aciklama")}
                    </label>
                    <Input
                      value={aciklama}
                      onChange={(e) => setAciklama(e.target.value)}
                      placeholder={t("urun.sayim-aciklama-placeholder")}
                      className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                    />
                    <p className="text-xs text-metin-pasif mt-1">{t("urun.sayim-aciklama-yardim")}</p>
                  </div>

                  {/* Farklı kalemlerin önizlemesi */}
                  {farkliKalemler.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="text-sm font-medium text-metin mb-2">
                        {t("urun.sayim-degisiklikler")}
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {farkliKalemler.map((k) => {
                          const v = varyantBilgi(k.urunVaryantId);
                          const fark = kalemFark(k);
                          return (
                            <div
                              key={k.urunVaryantId}
                              className="flex items-center justify-between text-sm gap-2 tabular-nums"
                            >
                              <span className="text-metin-ikinci truncate">
                                {v ? varyantAd(v) : k.urunVaryantId}
                              </span>
                              <span className="text-xs text-metin-pasif whitespace-nowrap">
                                {sayiFormat.format(k.sistemMiktar)} → {sayiFormat.format(Number(k.sayilanMiktar))}
                              </span>
                              <span
                                className={cn(
                                  "font-medium whitespace-nowrap w-16 text-right",
                                  fark > 0 ? "text-green-600" : "text-red-600",
                                )}
                              >
                                {fark > 0 ? "+" : ""}
                                {sayiFormat.format(fark)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAsama("sayim")}
                    disabled={kaydediyor}
                    className="sm:order-1"
                  >
                    {t("genel.geri")}
                  </Button>
                  <Button
                    onClick={kaydet}
                    disabled={kaydediyor}
                    className="flex-1 min-h-[44px] sm:min-h-[36px] sm:order-2"
                  >
                    {kaydediyor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("urun.sayim-kaydet")}
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
