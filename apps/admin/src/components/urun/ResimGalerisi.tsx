import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Trash2, Star, StarOff, Loader2, ArrowUp, ArrowDown, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface VaryantBilgi {
  id: string;
  sku: string;
  varyantAd: string | null;
  eksenKombinasyon: Record<string, string>;
}

interface UrunResim {
  id: string;
  url: string;
  altText: string | null;
  baslik: string | null;
  sira: number;
  anaResimMi: boolean;
  urunVaryantId: string | null;
  urunVaryant: VaryantBilgi | null;
}

// Varyant için görsel etiket: "Kırmızı / S" veya SKU
function varyantEtiketi(v: VaryantBilgi): string {
  const komb = Object.values(v.eksenKombinasyon ?? {});
  if (komb.length > 0) return komb.join(" / ");
  return v.varyantAd ?? v.sku;
}

interface ResimGalerisiOzellik {
  urunId: string | null; // null ise yeni urun — kaydet sonrasi resim eklenir
  urunAdi: string;
}

const MAX_BOYUT_MB = 5;
const KABUL_EDILEN = "image/jpeg,image/png,image/gif,image/webp";

// Resim URL — backend relative donuyor (/uploads/...). Vite proxy veya
// aynı origin uzerinden servis edilir, bu yuzden olduğu gibi kullanılır.
function resimUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return url;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function ResimGalerisi({ urunId, urunAdi }: ResimGalerisiOzellik) {
  const { t } = useTranslation();
  const onay = useOnay();
  const [resimler, setResimler] = useState<UrunResim[]>([]);
  const [varyantlar, setVaryantlar] = useState<VaryantBilgi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemDe, setIslemDe] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Upload için seçilen varyant (boş = tüm ürün)
  const [yuklemeVaryantId, setYuklemeVaryantId] = useState<string>("");
  // Filtre için seçilen varyant (boş = hepsini göster)
  const [filtreVaryantId, setFiltreVaryantId] = useState<string>("");

  const yukle = useCallback(async () => {
    if (!urunId) return;
    setYukleniyor(true);
    try {
      const [resRes, urunRes] = await Promise.all([
        apiIstemci.get<UrunResim[]>(`/urun/${urunId}/resim`),
        apiIstemci.get<{ varyantlar: Array<VaryantBilgi & { silindiMi: boolean }> }>(`/urun/${urunId}`),
      ]);
      setResimler(resRes.data);
      const varyantListesi = (urunRes.data.varyantlar ?? []).filter(
        (v) => !v.silindiMi,
      );
      setVaryantlar(varyantListesi);
    } catch {
      toast.hata(t("urun.resim-yuklenemedi"));
    }
    setYukleniyor(false);
  }, [urunId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const dosyaYukle = async (dosya: File) => {
    if (!urunId) {
      toast.hata(t("urun.resim-once-kaydet"));
      return;
    }
    if (dosya.size > MAX_BOYUT_MB * 1024 * 1024) {
      toast.hata(t("urun.resim-cok-buyuk", { max: MAX_BOYUT_MB }));
      return;
    }
    if (!KABUL_EDILEN.includes(dosya.type)) {
      toast.hata(t("urun.resim-gecersiz-tip"));
      return;
    }

    setIslemDe("yukleme");
    try {
      const formData = new FormData();
      formData.append("file", dosya);
      formData.append("altText", urunAdi);
      if (yuklemeVaryantId) formData.append("varyantId", yuklemeVaryantId);
      await apiIstemci.post(`/urun/${urunId}/resim`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.basarili(t("urun.resim-yuklendi"));
      await yukle();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? t("urun.resim-yukleme-hatasi");
      toast.hata(mesaj);
    }
    setIslemDe(null);
  };

  const secildi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      void dosyaYukle(files[i]);
    }
    e.target.value = "";
  };

  const surukleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      void dosyaYukle(files[i]);
    }
  };

  const anaYap = async (resimId: string) => {
    if (!urunId) return;
    setIslemDe(resimId);
    try {
      await apiIstemci.patch(`/urun/${urunId}/resim/${resimId}/ana`);
      toast.basarili(t("urun.resim-ana-yapildi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
    setIslemDe(null);
  };

  const sil = async (resim: UrunResim) => {
    if (!urunId) return;
    const tamam = await onay.goster({
      baslik: t("urun.resim-sil-baslik"),
      mesaj: resim.anaResimMi ? t("urun.resim-sil-ana-uyari") : t("urun.resim-sil-mesaj"),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    setIslemDe(resim.id);
    try {
      await apiIstemci.delete(`/urun/${urunId}/resim/${resim.id}`);
      toast.basarili(t("urun.resim-silindi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
    setIslemDe(null);
  };

  const sirala = async (index: number, yon: "yukari" | "asagi") => {
    if (!urunId) return;
    const yeniSira = yon === "yukari" ? index - 1 : index + 1;
    if (yeniSira < 0 || yeniSira >= resimler.length) return;
    const kopya = [...resimler];
    [kopya[index], kopya[yeniSira]] = [kopya[yeniSira], kopya[index]];
    setResimler(kopya); // optimistik guncelleme
    try {
      await apiIstemci.patch(`/urun/${urunId}/resim-siralama`, {
        resimIds: kopya.map((r) => Number(r.id)),
      });
    } catch {
      toast.hata(t("genel.hata"));
      await yukle(); // revert
    }
  };

  // ─── Yeni urun modu — henuz resim eklenemez ───
  if (!urunId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-kenarlik rounded-lg">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
        <h3 className="font-medium text-metin">{t("urun.resim-once-kaydet-baslik")}</h3>
        <p className="text-sm text-metin-ikinci mt-1 max-w-md">{t("urun.resim-once-kaydet")}</p>
      </div>
    );
  }

  // Filtrelenmis resimler
  const gorunenResimler = filtreVaryantId
    ? resimler.filter((r) => {
        if (filtreVaryantId === "__genel") return !r.urunVaryantId;
        return String(r.urunVaryantId) === filtreVaryantId;
      })
    : resimler;

  return (
    <div className="space-y-4">
      {/* ─── Varyant seçimi: hangi varyanta yükleniyor ─── */}
      {varyantlar.length > 0 && (
        <div className="rounded-lg border border-kenarlik bg-yuzey/30 p-3 sm:p-4">
          <label className="block text-[15px] sm:text-sm font-medium text-metin mb-2">
            {t("urun.resim-yukleme-hedef")}
          </label>
          <select
            value={yuklemeVaryantId}
            onChange={(e) => setYuklemeVaryantId(e.target.value)}
            className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2.5 sm:py-2 text-base sm:text-sm text-metin min-h-[44px] sm:min-h-[36px]"
          >
            <option value="">{t("urun.resim-hedef-tum-urun")}</option>
            {varyantlar.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku} — {varyantEtiketi(v)}
              </option>
            ))}
          </select>
          <p className="text-sm sm:text-xs text-metin-pasif mt-1.5">
            {yuklemeVaryantId
              ? t("urun.resim-hedef-varyant-yardim")
              : t("urun.resim-hedef-genel-yardim")}
          </p>
        </div>
      )}

      {/* ─── Upload alanı ─── */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={surukleDrop}
        className="border-2 border-dashed border-kenarlik rounded-lg p-8 text-center hover:border-birincil transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={KABUL_EDILEN}
          multiple
          className="hidden"
          onChange={secildi}
        />
        <Upload className="h-10 w-10 text-metin-pasif mx-auto mb-3" />
        <p className="font-medium text-metin">{t("urun.resim-yukle-baslik")}</p>
        <p className="text-sm text-metin-ikinci mt-1">
          {t("urun.resim-yukle-aciklama", { max: MAX_BOYUT_MB })}
        </p>
        <p className="text-[11px] text-metin-pasif mt-2">{t("urun.resim-yukle-ipucu")}</p>
      </div>

      {/* ─── Filtre — varyantlar varsa ─── */}
      {varyantlar.length > 0 && resimler.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-metin-pasif">{t("urun.resim-filtre")}:</span>
          <button
            type="button"
            onClick={() => setFiltreVaryantId("")}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs border transition-colors",
              !filtreVaryantId
                ? "bg-birincil/10 border-birincil text-birincil font-medium"
                : "border-kenarlik text-metin-ikinci hover:bg-yuzey",
            )}
          >
            {t("urun.resim-filtre-tumu")} ({resimler.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltreVaryantId("__genel")}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs border transition-colors",
              filtreVaryantId === "__genel"
                ? "bg-birincil/10 border-birincil text-birincil font-medium"
                : "border-kenarlik text-metin-ikinci hover:bg-yuzey",
            )}
          >
            {t("urun.resim-filtre-genel")} ({resimler.filter((r) => !r.urunVaryantId).length})
          </button>
          {varyantlar.map((v) => {
            const sayi = resimler.filter((r) => String(r.urunVaryantId) === v.id).length;
            if (sayi === 0) return null;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setFiltreVaryantId(v.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs border transition-colors",
                  filtreVaryantId === v.id
                    ? "bg-birincil/10 border-birincil text-birincil font-medium"
                    : "border-kenarlik text-metin-ikinci hover:bg-yuzey",
                )}
              >
                {varyantEtiketi(v)} ({sayi})
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Yukleniyor durumu ─── */}
      {islemDe === "yukleme" && (
        <div className="flex items-center gap-2 text-sm text-metin-ikinci">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("urun.resim-yukleniyor")}
        </div>
      )}

      {/* ─── Resim grid ─── */}
      {yukleniyor ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
        </div>
      ) : gorunenResimler.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-metin-pasif">
          <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">{filtreVaryantId ? t("urun.resim-filtre-bos") : t("urun.resim-yok")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {gorunenResimler.map((resim, index) => (
            <div
              key={resim.id}
              className={cn(
                "relative group rounded-lg border overflow-hidden bg-yuzey",
                resim.anaResimMi ? "border-birincil ring-2 ring-birincil/20" : "border-kenarlik",
              )}
            >
              {/* Ana resim işareti */}
              {resim.anaResimMi && (
                <Badge className="absolute top-2 left-2 z-10 bg-birincil text-white text-[10px]">
                  <Star className="h-3 w-3" /> {t("urun.resim-ana")}
                </Badge>
              )}

              {/* Varyant rozeti — varsayılan varyant yoksa "Genel" */}
              <Badge
                variant="outline"
                className={cn(
                  "absolute top-2 right-2 z-10 text-[10px] backdrop-blur-sm",
                  resim.urunVaryant
                    ? "bg-white/80 dark:bg-black/60 text-metin border-kenarlik"
                    : "bg-white/60 dark:bg-black/40 text-metin-pasif border-kenarlik italic",
                )}
              >
                {resim.urunVaryant ? varyantEtiketi(resim.urunVaryant) : t("urun.resim-filtre-genel")}
              </Badge>

              {/* Resim */}
              <div className="aspect-square bg-arkaplan">
                <img
                  src={resimUrl(resim.url)}
                  alt={resim.altText ?? ""}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Aksiyon overlay — mobilde her zaman görünür, md+ hover */}
              <div className="absolute inset-0 bg-black/30 md:bg-black/0 md:group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100">
                <div className="flex flex-wrap gap-1 justify-center max-w-full p-1">
                  {!resim.anaResimMi && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={islemDe === resim.id}
                      onClick={() => anaYap(resim.id)}
                      title={t("urun.resim-ana-yap")}
                    >
                      {islemDe === resim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StarOff className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={islemDe !== null || index === 0}
                    onClick={() => sirala(index, "yukari")}
                    title={t("urun.resim-yukari")}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={islemDe !== null || index === resimler.length - 1}
                    onClick={() => sirala(index, "asagi")}
                    title={t("urun.resim-asagi")}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={islemDe === resim.id}
                    onClick={() => sil(resim)}
                    title={t("genel.sil")}
                  >
                    {islemDe === resim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Alt bilgi */}
              <div className="px-2 py-1.5 text-[11px] text-metin-pasif font-mono truncate border-t border-kenarlik">
                {resim.url.split("/").pop()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
