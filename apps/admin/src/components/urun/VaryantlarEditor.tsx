import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  AlertTriangle,
  Star,
  StarOff,
  Package,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { FormAlani } from "@/components/ortak/FormAlani";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface Secenek {
  id: string;
  eksenId: string;
  degerKod: string;
  degerAd: string;
  hexRenk: string | null;
  sira: number;
  aktifMi: boolean;
}

interface Eksen {
  id: string;
  eksenKod: string;
  eksenAd: string;
  sira: number;
  secenekler: Secenek[];
}

interface Varyant {
  id: string;
  sku: string;
  barkod: string | null;
  varyantAd: string | null;
  varsayilanMi: boolean;
  eksenKombinasyon: Record<string, string>;
  alisFiyati: string | null;
  satilabilirSonFiyat: string | null;
  kritikStok: string | null;
  sira: number;
  aktifMi: boolean;
  silindiMi: boolean;
}

interface VaryantlarEditorOzellik {
  urunId: string | null;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function VaryantlarEditor({ urunId }: VaryantlarEditorOzellik) {
  const { t } = useTranslation();
  const onay = useOnay();

  const [eksenler, setEksenler] = useState<Eksen[]>([]);
  const [varyantlar, setVaryantlar] = useState<Varyant[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemde, setIslemde] = useState<string | null>(null);

  // Yeni eksen formu
  const [yeniEksenAcik, setYeniEksenAcik] = useState(false);
  const [yeniEksenAd, setYeniEksenAd] = useState("");

  // Yeni seçenek formu
  const [secenekAcikEksenId, setSecenekAcikEksenId] = useState<string | null>(null);
  const [yeniSecenekAd, setYeniSecenekAd] = useState("");
  const [yeniSecenekRenk, setYeniSecenekRenk] = useState("");

  const yukle = useCallback(async () => {
    if (!urunId) return;
    setYukleniyor(true);
    try {
      const [eksenRes, urunRes] = await Promise.all([
        apiIstemci.get<Eksen[]>(`/urun/${urunId}/eksen`),
        apiIstemci.get<{ varyantlar: Varyant[] }>(`/urun/${urunId}`),
      ]);
      setEksenler(eksenRes.data);
      const vayrantListesi = (urunRes.data.varyantlar ?? []).filter((v: Varyant) => !v.silindiMi);
      setVaryantlar(vayrantListesi);
    } catch {
      toast.hata(t("urun.varyant-yuklenemedi"));
    }
    setYukleniyor(false);
  }, [urunId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // ─── Yeni ürün modu ───
  if (!urunId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-kenarlik rounded-lg">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
        <h3 className="font-medium text-metin">{t("urun.varyant-once-kaydet-baslik")}</h3>
        <p className="text-sm text-metin-ikinci mt-1 max-w-md">
          {t("urun.varyant-once-kaydet")}
        </p>
      </div>
    );
  }

  // ─── Slug helper: "Kırmızı" → "kirmizi" ───
  const kodUret = (ad: string) =>
    ad
      .toLowerCase()
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  // ─── Eksen ekle ───
  const eksenEkle = async () => {
    if (!yeniEksenAd.trim()) return;
    setIslemde("eksen-ekle");
    try {
      await apiIstemci.post(`/urun/${urunId}/eksen`, {
        eksenAd: yeniEksenAd.trim(),
        eksenKod: kodUret(yeniEksenAd.trim()),
        sira: eksenler.length,
      });
      toast.basarili(t("urun.eksen-eklendi"));
      setYeniEksenAd("");
      setYeniEksenAcik(false);
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setIslemde(null);
  };

  const eksenSil = async (eksen: Eksen) => {
    const tamam = await onay.goster({
      baslik: t("urun.eksen-sil-baslik"),
      mesaj: t("urun.eksen-sil-mesaj", { ad: eksen.eksenAd }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    setIslemde(eksen.id);
    try {
      await apiIstemci.delete(`/urun/${urunId}/eksen/${eksen.id}`);
      toast.basarili(t("urun.eksen-silindi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
    setIslemde(null);
  };

  // ─── Seçenek ekle ───
  const secenekEkle = async (eksenId: string) => {
    if (!yeniSecenekAd.trim()) return;
    setIslemde(`secenek-${eksenId}`);
    try {
      const eksen = eksenler.find((e) => e.id === eksenId)!;
      await apiIstemci.post(`/urun/${urunId}/eksen/${eksenId}/secenek`, {
        degerAd: yeniSecenekAd.trim(),
        degerKod: kodUret(yeniSecenekAd.trim()),
        hexRenk: yeniSecenekRenk.trim() || null,
        sira: eksen.secenekler.length,
        aktifMi: true,
      });
      toast.basarili(t("urun.secenek-eklendi"));
      setYeniSecenekAd("");
      setYeniSecenekRenk("");
      setSecenekAcikEksenId(null);
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setIslemde(null);
  };

  const secenekSil = async (eksen: Eksen, secenek: Secenek) => {
    const tamam = await onay.goster({
      baslik: t("urun.secenek-sil-baslik"),
      mesaj: t("urun.secenek-sil-mesaj", { ad: secenek.degerAd }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    setIslemde(secenek.id);
    try {
      await apiIstemci.delete(`/urun/${urunId}/eksen/${eksen.id}/secenek/${secenek.id}`);
      toast.basarili(t("urun.secenek-silindi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
    setIslemde(null);
  };

  // ─── Matris oluştur ───
  const matrisOlustur = async () => {
    if (eksenler.length === 0) {
      toast.hata(t("urun.eksen-eklemelisin"));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("urun.matris-olustur-baslik"),
      mesaj: t("urun.matris-olustur-mesaj"),
      varyant: "bilgi",
      onayMetni: t("urun.matris-olustur-evet"),
    });
    if (!tamam) return;
    setIslemde("matris");
    try {
      const res = await apiIstemci.post<{ eklenen: number; toplam: number; mesaj?: string }>(
        `/urun/${urunId}/varyant-matris`,
      );
      if (res.data.eklenen === 0) {
        toast.bilgi(res.data.mesaj ?? t("urun.matris-zaten-var"));
      } else {
        toast.basarili(t("urun.matris-olusturuldu", { sayi: res.data.eklenen }));
      }
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setIslemde(null);
  };

  // ─── Varyant: varsayılan yap / sil ───
  const varsayilanYap = async (varyant: Varyant) => {
    setIslemde(varyant.id);
    try {
      await apiIstemci.patch(`/urun/${urunId}/varyant/${varyant.id}`, { varsayilanMi: true });
      toast.basarili(t("urun.varsayilan-atandi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
    setIslemde(null);
  };

  const varyantSil = async (varyant: Varyant) => {
    const tamam = await onay.goster({
      baslik: t("urun.varyant-sil-baslik"),
      mesaj: t("urun.varyant-sil-mesaj", { sku: varyant.sku }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    setIslemde(varyant.id);
    try {
      await apiIstemci.delete(`/urun/${urunId}/varyant/${varyant.id}`);
      toast.basarili(t("urun.varyant-silindi"));
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setIslemde(null);
  };

  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
      </div>
    );
  }

  const toplamKombinasyon = eksenler.reduce(
    (t, e) => t * Math.max(e.secenekler.filter((s) => s.aktifMi).length, 1),
    1,
  );

  return (
    <div className="space-y-6">
      {/* ══════ Matris eylem alanı ══════ */}
      {eksenler.length > 0 && (
        <div className="rounded-lg border border-birincil/30 bg-birincil/5 p-4 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-birincil mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-metin">{t("urun.matris-baslik")}</p>
              <p className="text-sm text-metin-ikinci mt-0.5">
                {t("urun.matris-aciklama", { sayi: toplamKombinasyon })}
              </p>
            </div>
          </div>
          <Button
            onClick={matrisOlustur}
            disabled={islemde !== null || toplamKombinasyon === 1}
            className="shrink-0"
          >
            {islemde === "matris" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t("urun.matris-olustur")}
          </Button>
        </div>
      )}

      {/* ══════ EKSEN LİSTESİ ══════ */}
      <FormAlani.Bolum
        baslik={t("urun.bolum-eksenler")}
        altyazi={t("urun.bolum-eksenler-altyazi")}
      >
        {eksenler.length === 0 && !yeniEksenAcik && (
          <div className="text-center py-6 text-sm text-metin-pasif border-2 border-dashed border-kenarlik rounded-lg">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>{t("urun.eksen-yok")}</p>
            <p className="text-xs mt-1">{t("urun.eksen-yok-ipucu")}</p>
          </div>
        )}

        {eksenler.map((eksen) => (
          <div
            key={eksen.id}
            className="rounded-lg border border-kenarlik p-4 space-y-3 bg-yuzey/30"
          >
            {/* Eksen başlık */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-semibold text-metin text-[15px] sm:text-base">{eksen.eksenAd}</h4>
                <p className="text-xs text-metin-pasif font-mono">{eksen.eksenKod}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => eksenSil(eksen)}
                disabled={islemde === eksen.id}
                className="shrink-0"
                title={t("genel.sil")}
              >
                {islemde === eksen.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-metin-pasif hover:text-red-500" />
                )}
              </Button>
            </div>

            {/* Seçenek listesi */}
            <div className="flex flex-wrap gap-2">
              {eksen.secenekler.map((secenek) => (
                <Badge
                  key={secenek.id}
                  variant="outline"
                  className="gap-2 text-sm py-1 px-2.5 group"
                >
                  {secenek.hexRenk && (
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-kenarlik shrink-0"
                      style={{ backgroundColor: secenek.hexRenk }}
                    />
                  )}
                  <span>{secenek.degerAd}</span>
                  <button
                    type="button"
                    onClick={() => secenekSil(eksen, secenek)}
                    disabled={islemde === secenek.id}
                    className="text-metin-pasif hover:text-red-500 transition-colors"
                    title={t("genel.sil")}
                  >
                    {islemde === secenek.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
              {eksen.secenekler.length === 0 && (
                <span className="text-sm text-metin-pasif italic">
                  {t("urun.secenek-yok-kisa")}
                </span>
              )}
            </div>

            {/* Seçenek ekle form */}
            {secenekAcikEksenId === eksen.id ? (
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Input
                  autoFocus
                  placeholder={t("urun.secenek-ad-placeholder")}
                  value={yeniSecenekAd}
                  onChange={(e) => setYeniSecenekAd(e.target.value)}
                  className="flex-1 min-h-[44px] sm:min-h-[36px]"
                  onKeyDown={(e) => e.key === "Enter" && secenekEkle(eksen.id)}
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={yeniSecenekRenk || "#888888"}
                    onChange={(e) => setYeniSecenekRenk(e.target.value)}
                    className="h-11 sm:h-9 w-14 rounded-md border border-kenarlik cursor-pointer"
                    title={t("urun.secenek-renk")}
                  />
                  <Button
                    onClick={() => secenekEkle(eksen.id)}
                    disabled={!yeniSecenekAd.trim() || islemde !== null}
                    size="sm"
                  >
                    {islemde === `secenek-${eksen.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("genel.ekle")
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSecenekAcikEksenId(null);
                      setYeniSecenekAd("");
                      setYeniSecenekRenk("");
                    }}
                  >
                    {t("genel.iptal")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSecenekAcikEksenId(eksen.id);
                  setYeniSecenekAd("");
                  setYeniSecenekRenk("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("urun.secenek-ekle")}
              </Button>
            )}
          </div>
        ))}

        {/* Yeni eksen formu */}
        {yeniEksenAcik ? (
          <div className="flex flex-col sm:flex-row gap-2 border-2 border-dashed border-birincil/50 rounded-lg p-3 bg-birincil/5">
            <Input
              autoFocus
              placeholder={t("urun.eksen-ad-placeholder")}
              value={yeniEksenAd}
              onChange={(e) => setYeniEksenAd(e.target.value)}
              className="flex-1 min-h-[44px] sm:min-h-[36px]"
              onKeyDown={(e) => e.key === "Enter" && eksenEkle()}
            />
            <div className="flex gap-2">
              <Button onClick={eksenEkle} disabled={!yeniEksenAd.trim() || islemde !== null}>
                {islemde === "eksen-ekle" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("genel.ekle")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setYeniEksenAcik(false);
                  setYeniEksenAd("");
                }}
              >
                {t("genel.iptal")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setYeniEksenAcik(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            {t("urun.eksen-ekle")}
          </Button>
        )}
      </FormAlani.Bolum>

      {/* ══════ VARYANT LİSTESİ ══════ */}
      <FormAlani.Bolum
        baslik={t("urun.bolum-varyantlar", { sayi: varyantlar.length })}
        altyazi={t("urun.bolum-varyantlar-altyazi")}
      >
        {varyantlar.length === 0 ? (
          <div className="text-center py-6 text-sm text-metin-pasif border-2 border-dashed border-kenarlik rounded-lg">
            <Tag className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>{t("urun.varyant-yok")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {varyantlar.map((v) => {
              const kombinasyonEtiket = Object.entries(v.eksenKombinasyon ?? {}).map(
                ([k, val]) => `${k}: ${val}`,
              );
              return (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3",
                    v.varsayilanMi ? "border-birincil bg-birincil/5" : "border-kenarlik",
                  )}
                >
                  {/* Varyant bilgisi */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.varsayilanMi && (
                        <Badge className="bg-birincil text-white text-[10px]">
                          <Star className="h-2.5 w-2.5" />
                          {t("urun.varsayilan")}
                        </Badge>
                      )}
                      <span className="font-mono text-sm text-metin">{v.sku}</span>
                      {v.barkod && (
                        <span className="text-xs text-metin-pasif font-mono">· {v.barkod}</span>
                      )}
                    </div>
                    {kombinasyonEtiket.length > 0 && (
                      <div className="text-sm text-metin-ikinci mt-0.5 flex flex-wrap gap-1">
                        {kombinasyonEtiket.map((e, i) => (
                          <span key={i} className="bg-yuzey px-2 py-0.5 rounded text-xs">
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Aksiyon butonları */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!v.varsayilanMi && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => varsayilanYap(v)}
                        disabled={islemde === v.id}
                        title={t("urun.varsayilan-yap")}
                      >
                        {islemde === v.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => varyantSil(v)}
                      disabled={islemde === v.id}
                      title={t("genel.sil")}
                    >
                      {islemde === v.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-metin-pasif hover:text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormAlani.Bolum>
    </div>
  );
}
