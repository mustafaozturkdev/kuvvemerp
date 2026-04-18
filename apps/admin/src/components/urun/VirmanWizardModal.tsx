import { useState, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
  Store,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Truck,
  AlertTriangle,
} from "lucide-react";
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

interface Kalem {
  urunVaryantId: string;
  miktar: string; // controlled
}

interface VirmanWizardModalOzellik {
  acik: boolean;
  kapat: () => void;
  urunId: string;
  onKaydet: () => void;
}

type Asama = "magaza" | "miktar" | "onay";

function varyantAd(v: Varyant): string {
  const komb = Object.values(v.eksenKombinasyon ?? {});
  if (komb.length > 0) return komb.join(" / ");
  return v.varyantAd ?? v.sku;
}

// ────────────────────────────────────────────────────────────

export function VirmanWizardModal({ acik, kapat, urunId, onKaydet }: VirmanWizardModalOzellik) {
  const { t, i18n } = useTranslation();
  const onay = useOnay();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  const [asama, setAsama] = useState<Asama>("magaza");
  const [ozet, setOzet] = useState<StokOzet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);

  const [kaynakId, setKaynakId] = useState("");
  const [hedefId, setHedefId] = useState("");
  const [kalemler, setKalemler] = useState<Kalem[]>([]);
  const [aciklama, setAciklama] = useState("");
  const [kargoFirma, setKargoFirma] = useState("");
  const [kargoTakipNo, setKargoTakipNo] = useState("");
  const [aracPlaka, setAracPlaka] = useState("");

  useEffect(() => {
    if (!acik) return;
    setYukleniyor(true);
    apiIstemci
      .get<StokOzet>(`/urun/${urunId}/stok`)
      .then((res) => setOzet(res.data))
      .catch(() => toast.hata(t("urun.stok-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, urunId]);

  useEffect(() => {
    if (!acik) {
      setAsama("magaza");
      setKaynakId("");
      setHedefId("");
      setKalemler([]);
      setAciklama("");
      setKargoFirma("");
      setKargoTakipNo("");
      setAracPlaka("");
    }
  }, [acik]);

  const kaynakStok = (varyantId: string) => {
    const s = ozet?.stoklar.find(
      (x) => x.urunVaryantId === varyantId && x.magazaId === kaynakId,
    );
    return s ? Number(s.mevcutMiktar) : 0;
  };

  const magazaAd = (id: string) => ozet?.magazalar.find((m) => m.id === id)?.ad ?? "—";

  const magazaStok = (magazaId: string) =>
    ozet?.stoklar
      .filter((s) => s.magazaId === magazaId)
      .reduce((t, s) => t + Number(s.mevcutMiktar), 0) ?? 0;

  const miktaradim = () => {
    // Kaynak+hedef seçilince kalem listesi hazırla — kaynak stoğu olan varyantlar
    if (!ozet) return;
    const hazir: Kalem[] = ozet.varyantlar
      .filter((v) => kaynakStok(v.id) > 0)
      .map((v) => ({ urunVaryantId: v.id, miktar: "" }));
    setKalemler(hazir);
    setAsama("miktar");
  };

  const kalemDegistir = (varyantId: string, deger: string) => {
    setKalemler((mev) =>
      mev.map((k) => (k.urunVaryantId === varyantId ? { ...k, miktar: deger } : k)),
    );
  };

  const tumStokGonder = () => {
    setKalemler((mev) =>
      mev.map((k) => ({ ...k, miktar: String(kaynakStok(k.urunVaryantId)) })),
    );
  };

  const doldurulmus = useMemo(
    () => kalemler.filter((k) => Number(k.miktar) > 0),
    [kalemler],
  );

  const yetersiz = useMemo(
    () => doldurulmus.filter((k) => Number(k.miktar) > kaynakStok(k.urunVaryantId)),
    [doldurulmus, kaynakId, ozet],
  );

  const toplamMiktar = useMemo(
    () => doldurulmus.reduce((t, k) => t + Number(k.miktar), 0),
    [doldurulmus],
  );

  const varyantBilgi = (id: string) => ozet?.varyantlar.find((v) => v.id === id);

  const kaydet = async () => {
    if (doldurulmus.length === 0) {
      toast.hata(t("urun.virman-bos"));
      return;
    }
    if (yetersiz.length > 0) {
      toast.hata(t("urun.virman-yetersiz"));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("urun.virman-onay-baslik"),
      mesaj: t("urun.virman-onay-mesaj", {
        sayi: doldurulmus.length,
        miktar: sayiFormat.format(toplamMiktar),
        kaynak: magazaAd(kaynakId),
        hedef: magazaAd(hedefId),
      }),
      varyant: "uyari",
      onayMetni: t("urun.virman-onay-btn"),
    });
    if (!tamam) return;

    setKaydediyor(true);
    try {
      await apiIstemci.post(`/urun/${urunId}/transfer`, {
        kaynakMagazaId: Number(kaynakId),
        hedefMagazaId: Number(hedefId),
        aciklama: aciklama.trim() || null,
        kargoFirma: kargoFirma.trim() || null,
        kargoTakipNo: kargoTakipNo.trim() || null,
        aracPlaka: aracPlaka.trim() || null,
        kalemler: doldurulmus.map((k) => ({
          urunVaryantId: Number(k.urunVaryantId),
          miktar: Number(k.miktar),
        })),
      });
      toast.basarili(t("urun.virman-basarili"));
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 min-w-0">
            {asama !== "magaza" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAsama(asama === "onay" ? "miktar" : "magaza")}
                className="h-10 w-10 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-birincil" />
              <div>
                <h2 className="text-base md:text-lg font-semibold text-metin">{t("urun.virman-baslik")}</h2>
                <p className="text-xs text-metin-pasif">
                  {asama === "magaza" && t("urun.virman-adim-1")}
                  {asama === "miktar" && t("urun.virman-adim-2")}
                  {asama === "onay" && t("urun.virman-adim-3")}
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
            {/* ─── Aşama 1: Mağaza Seç ─── */}
            {asama === "magaza" && ozet && (
              <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                  <div>
                    <label className="block text-[15px] sm:text-sm font-medium text-metin mb-2">
                      {t("urun.virman-kaynak")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ozet.magazalar.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setKaynakId(m.id);
                            if (hedefId === m.id) setHedefId("");
                          }}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors min-h-[56px]",
                            kaynakId === m.id
                              ? "border-birincil bg-birincil/10"
                              : "border-kenarlik hover:border-metin-ikinci",
                          )}
                        >
                          <Store className="h-4 w-4 text-metin-pasif shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-metin text-sm truncate">{m.ad}</div>
                            <div className="text-xs text-metin-pasif tabular-nums">
                              {sayiFormat.format(magazaStok(m.id))} {t("urun.virman-adet")}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {kaynakId && (
                    <div>
                      <label className="block text-[15px] sm:text-sm font-medium text-metin mb-2">
                        {t("urun.virman-hedef")}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ozet.magazalar
                          .filter((m) => m.id !== kaynakId)
                          .map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setHedefId(m.id)}
                              className={cn(
                                "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors min-h-[56px]",
                                hedefId === m.id
                                  ? "border-birincil bg-birincil/10"
                                  : "border-kenarlik hover:border-metin-ikinci",
                              )}
                            >
                              <Store className="h-4 w-4 text-metin-pasif shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-metin text-sm truncate">{m.ad}</div>
                                <div className="text-xs text-metin-pasif tabular-nums">
                                  {sayiFormat.format(magazaStok(m.id))} {t("urun.virman-adet")}
                                </div>
                              </div>
                            </button>
                          ))}
                      </div>
                      {ozet.magazalar.filter((m) => m.id !== kaynakId).length === 0 && (
                        <p className="text-sm text-metin-pasif mt-2">
                          {t("urun.virman-tek-magaza")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6">
                  <Button
                    onClick={miktaradim}
                    disabled={!kaynakId || !hedefId}
                    className="w-full min-h-[44px] sm:min-h-[36px]"
                  >
                    {t("urun.virman-sonraki")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ─── Aşama 2: Miktar Girişi ─── */}
            {asama === "miktar" && ozet && (
              <>
                <div className="px-4 md:px-6 pt-3 pb-2 bg-yuzey/30 border-b border-kenarlik">
                  <p className="text-sm text-metin-ikinci">
                    <strong className="text-metin">{magazaAd(kaynakId)}</strong>
                    <span className="mx-2">→</span>
                    <strong className="text-metin">{magazaAd(hedefId)}</strong>
                  </p>
                  <p className="text-xs text-metin-pasif mt-0.5">{t("urun.virman-miktar-aciklama")}</p>
                  <button
                    type="button"
                    onClick={tumStokGonder}
                    className="text-xs text-birincil hover:underline mt-1"
                  >
                    {t("urun.virman-tum-stok")}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                  {kalemler.length === 0 ? (
                    <div className="text-center py-8 text-metin-pasif">
                      <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{t("urun.virman-kaynak-bos")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {kalemler.map((k) => {
                        const v = varyantBilgi(k.urunVaryantId);
                        if (!v) return null;
                        const kaynak = kaynakStok(v.id);
                        const istenen = Number(k.miktar);
                        const fazlaIstenmis = istenen > kaynak;
                        return (
                          <div
                            key={k.urunVaryantId}
                            className={cn(
                              "p-3 rounded-lg border",
                              fazlaIstenmis
                                ? "border-red-500/40 bg-red-500/5"
                                : istenen > 0
                                  ? "border-birincil/40 bg-birincil/5"
                                  : "border-kenarlik",
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
                                <div className="text-xs text-metin-pasif mt-1 tabular-nums">
                                  {t("urun.virman-kaynak-stok")}:{" "}
                                  <span className="font-medium">{sayiFormat.format(kaynak)}</span>
                                </div>
                              </div>
                              <div className="w-full sm:w-40 shrink-0">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min="0"
                                  max={kaynak}
                                  value={k.miktar}
                                  onChange={(e) => kalemDegistir(k.urunVaryantId, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder={t("urun.virman-gonderilecek")}
                                  className="text-right text-base sm:text-sm tabular-nums min-h-[44px] sm:min-h-[36px]"
                                />
                                {fazlaIstenmis && (
                                  <p className="text-xs text-red-600 mt-1">
                                    {t("urun.virman-max", { max: sayiFormat.format(kaynak) })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6 space-y-3">
                  {doldurulmus.length > 0 && (
                    <div className="text-sm text-metin-ikinci tabular-nums">
                      {t("urun.virman-toplam", {
                        sayi: doldurulmus.length,
                        miktar: sayiFormat.format(toplamMiktar),
                      })}
                    </div>
                  )}
                  <Button
                    onClick={() => setAsama("onay")}
                    disabled={doldurulmus.length === 0 || yetersiz.length > 0}
                    className="w-full min-h-[44px] sm:min-h-[36px]"
                  >
                    {t("urun.virman-sonraki")}
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
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-metin-pasif">{t("urun.virman-kaynak")}</div>
                        <div className="font-medium text-metin truncate">{magazaAd(kaynakId)}</div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-metin-pasif" />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-xs text-metin-pasif">{t("urun.virman-hedef")}</div>
                        <div className="font-medium text-metin truncate">{magazaAd(hedefId)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-3 border-t border-kenarlik text-sm text-metin-ikinci tabular-nums">
                      <span>{t("urun.virman-kalem-sayi")}: <strong className="text-metin">{doldurulmus.length}</strong></span>
                      <span>{t("urun.virman-toplam-miktar")}: <strong className="text-metin">{sayiFormat.format(toplamMiktar)}</strong></span>
                    </div>
                  </div>

                  {/* Opsiyonel kargo bilgileri */}
                  <details className="rounded-lg border border-kenarlik">
                    <summary className="p-3 cursor-pointer text-sm text-metin-ikinci hover:bg-yuzey/50">
                      {t("urun.virman-kargo-bilgi")}
                    </summary>
                    <div className="p-3 pt-0 space-y-2 border-t border-kenarlik">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-metin-pasif mb-1">{t("urun.virman-kargo-firma")}</label>
                          <Input
                            value={kargoFirma}
                            onChange={(e) => setKargoFirma(e.target.value)}
                            className="min-h-[44px] sm:min-h-[36px]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-metin-pasif mb-1">{t("urun.virman-kargo-takip")}</label>
                          <Input
                            value={kargoTakipNo}
                            onChange={(e) => setKargoTakipNo(e.target.value)}
                            className="min-h-[44px] sm:min-h-[36px]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-metin-pasif mb-1">{t("urun.virman-arac-plaka")}</label>
                        <Input
                          value={aracPlaka}
                          onChange={(e) => setAracPlaka(e.target.value)}
                          className="min-h-[44px] sm:min-h-[36px] uppercase"
                        />
                      </div>
                    </div>
                  </details>

                  <div>
                    <label className="block text-[15px] sm:text-sm font-medium text-metin mb-1.5">
                      {t("urun.virman-aciklama")}
                    </label>
                    <Input
                      value={aciklama}
                      onChange={(e) => setAciklama(e.target.value)}
                      placeholder={t("urun.virman-aciklama-ph")}
                      className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                    />
                  </div>

                  {/* Kalem önizleme */}
                  <div className="rounded-lg border border-kenarlik divide-y divide-kenarlik max-h-[200px] overflow-y-auto">
                    {doldurulmus.map((k) => {
                      const v = varyantBilgi(k.urunVaryantId);
                      return (
                        <div key={k.urunVaryantId} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                          <span className="truncate">{v ? varyantAd(v) : k.urunVaryantId}</span>
                          <span className="font-medium tabular-nums text-metin whitespace-nowrap">
                            {sayiFormat.format(Number(k.miktar))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-kenarlik p-4 md:p-6 flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setAsama("miktar")} disabled={kaydediyor}>
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
                    {t("urun.virman-gonder")}
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
