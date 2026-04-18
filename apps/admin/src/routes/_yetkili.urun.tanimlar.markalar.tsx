import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
  Loader2,
  Tag,
  Globe,
  ShoppingBag,
  Building2,
  Search,
  Layers,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/urun/tanimlar/markalar")({
  component: MarkalarSayfa,
});

interface Marka {
  id: number;
  kod: string;
  ad: string;
  aciklama: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  webSitesi: string | null;
  ulkeKodu: string | null;
  seoBaslik: string | null;
  seoAciklama: string | null;
  seoAnahtarKelimeler: string[];
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  eticaretAktif: boolean;
  b2bAktif: boolean;
  aktifMi: boolean;
  sira: number;
  _count?: { urunler: number; modeller: number };
}

interface MarkaModel {
  id: number;
  markaId: number;
  kod: string | null;
  ad: string;
  aciklama: string | null;
  gorselUrl: string | null;
  uretimYili: number | null;
  sira: number;
  aktifMi: boolean;
  _count?: { urunler: number };
}

type Sekme = "temel" | "gorsel" | "seo" | "yayin" | "modeller";

const BOS_FORM = {
  kod: "",
  ad: "",
  aciklama: "",
  logoUrl: "",
  bannerUrl: "",
  webSitesi: "",
  ulkeKodu: "",
  seoBaslik: "",
  seoAciklama: "",
  seoAnahtarKelimeler: "",
  ogImageUrl: "",
  canonicalUrl: "",
  eticaretAktif: false,
  b2bAktif: false,
  sira: "0",
};

function MarkalarSayfa() {
  const { t } = useTranslation();
  const onay = useOnay();

  const [markalar, setMarkalar] = useState<Marka[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");

  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliMarka, setSeciliMarka] = useState<Marka | null>(null);
  const [aktifSekme, setAktifSekme] = useState<Sekme>("temel");

  const [form, setForm] = useState({ ...BOS_FORM });
  const [kaydediyor, setKaydediyor] = useState(false);
  const [kodDuzenle, setKodDuzenle] = useState(false);

  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
  const { guvenlikapat, drawerRef } = useDrawerKapatma({
    acik: drawerAcik,
    kapat: () => setDrawerAcik(false),
    mesgul: kaydediyor,
    dirty,
    onay,
  });

  // ─── Modeller (drawer altpanel) ──────────────────────
  const [modeller, setModeller] = useState<MarkaModel[]>([]);
  const [modelYukleniyor, setModelYukleniyor] = useState(false);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const q = new URLSearchParams();
      if (arama.trim()) q.set("arama", arama.trim());
      const res = await apiIstemci.get<{ veriler: Marka[] }>(
        `/marka${q.toString() ? `?${q}` : ""}`,
      );
      setMarkalar((res.data as any).veriler ?? (res.data as any) ?? []);
    } catch {
      toast.hata(t("marka.yuklenemedi"));
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    if (!q) return markalar;
    return markalar.filter(
      (m) =>
        m.kod.toLocaleLowerCase("tr-TR").includes(q) ||
        m.ad.toLocaleLowerCase("tr-TR").includes(q) ||
        (m.ulkeKodu ?? "").toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [markalar, arama]);

  const modelleriYukle = async (markaId: number) => {
    setModelYukleniyor(true);
    try {
      const res = await apiIstemci.get<MarkaModel[]>(
        `/marka-model?markaId=${markaId}`,
      );
      setModeller(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.hata(t("marka-model.yuklenemedi"));
    }
    setModelYukleniyor(false);
  };

  const yeniDrawer = () => {
    setSeciliMarka(null);
    setForm({ ...BOS_FORM });
    baslangicAyarla({ ...BOS_FORM });
    setAktifSekme("temel");
    setKodDuzenle(false);
    setModeller([]);
    setDrawerAcik(true);
  };

  const duzenle = async (m: Marka) => {
    setSeciliMarka(m);
    const yeniForm = {
      kod: m.kod,
      ad: m.ad,
      aciklama: m.aciklama ?? "",
      logoUrl: m.logoUrl ?? "",
      bannerUrl: m.bannerUrl ?? "",
      webSitesi: m.webSitesi ?? "",
      ulkeKodu: m.ulkeKodu ?? "",
      seoBaslik: m.seoBaslik ?? "",
      seoAciklama: m.seoAciklama ?? "",
      seoAnahtarKelimeler: (m.seoAnahtarKelimeler ?? []).join(", "),
      ogImageUrl: m.ogImageUrl ?? "",
      canonicalUrl: m.canonicalUrl ?? "",
      eticaretAktif: m.eticaretAktif,
      b2bAktif: m.b2bAktif,
      sira: String(m.sira ?? 0),
    };
    setForm(yeniForm);
    baslangicAyarla(yeniForm);
    setAktifSekme("temel");
    setKodDuzenle(false);
    setDrawerAcik(true);
    void modelleriYukle(m.id);
  };

  const formuDogrula = (): string | null => {
    if (!form.ad.trim()) return t("marka.ad") + " " + t("genel.zorunlu-alan");
    if (form.ulkeKodu && form.ulkeKodu.length !== 2) return "ISO-2";
    return null;
  };

  const kaydet = async () => {
    const hata = formuDogrula();
    if (hata) {
      toast.hata(hata);
      return;
    }
    setKaydediyor(true);
    try {
      const anahtarlar = form.seoAnahtarKelimeler
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const veri: any = {
        ad: form.ad.trim(),
        aciklama: form.aciklama.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        webSitesi: form.webSitesi.trim() || null,
        ulkeKodu: form.ulkeKodu.trim().toUpperCase() || null,
        seoBaslik: form.seoBaslik.trim() || null,
        seoAciklama: form.seoAciklama.trim() || null,
        seoAnahtarKelimeler: anahtarlar,
        ogImageUrl: form.ogImageUrl.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        eticaretAktif: form.eticaretAktif,
        b2bAktif: form.b2bAktif,
        sira: Number(form.sira) || 0,
      };
      if (seciliMarka && kodDuzenle && form.kod.trim()) {
        veri.kod = form.kod.trim();
      }
      if (seciliMarka) {
        await apiIstemci.patch(`/marka/${seciliMarka.id}`, veri);
        toast.basarili(t("marka.guncellendi"));
      } else {
        await apiIstemci.post("/marka", veri);
        toast.basarili(t("marka.olusturuldu"));
      }
      sifirla();
      setDrawerAcik(false);
      await yukle();
    } catch (err: any) {
      const mesaj = err?.response?.data?.message;
      if (typeof mesaj === "string" && mesaj.toLowerCase().includes("unique")) {
        toast.hata(t("marka.kod-benzersiz"));
      } else {
        toast.hata(mesaj || t("genel.hata"));
      }
    }
    setKaydediyor(false);
  };

  const aktiflikDegistir = async (m: Marka) => {
    if (m.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: m.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/marka/${m.id}/aktiflik`);
      toast.basarili(t("marka.aktiflik-degistirildi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const silMarka = async (m: Marka) => {
    if ((m._count?.urunler ?? 0) > 0) {
      toast.hata(t("marka.silme-engeli", { sayi: m._count!.urunler }));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: m.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/marka/${m.id}`);
      toast.basarili(t("marka.silindi"));
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.message || t("genel.hata"));
    }
  };

  // ─── Model CRUD ──────────────────────────────────────
  const [modelDrawer, setModelDrawer] = useState<{
    acik: boolean;
    model: MarkaModel | null;
  }>({ acik: false, model: null });
  const [modelForm, setModelForm] = useState({
    kod: "",
    ad: "",
    aciklama: "",
    uretimYili: "",
    sira: "0",
  });
  const [modelKaydediyor, setModelKaydediyor] = useState(false);

  const modelYeni = () => {
    setModelForm({ kod: "", ad: "", aciklama: "", uretimYili: "", sira: "0" });
    setModelDrawer({ acik: true, model: null });
  };

  const modelDuzenle = (m: MarkaModel) => {
    setModelForm({
      kod: m.kod ?? "",
      ad: m.ad,
      aciklama: m.aciklama ?? "",
      uretimYili: m.uretimYili?.toString() ?? "",
      sira: String(m.sira ?? 0),
    });
    setModelDrawer({ acik: true, model: m });
  };

  const modelKaydet = async () => {
    if (!modelForm.ad.trim()) {
      toast.hata(t("genel.zorunlu-alan"));
      return;
    }
    if (!seciliMarka) return;
    setModelKaydediyor(true);
    try {
      const veri: any = {
        kod: modelForm.kod.trim() || null,
        ad: modelForm.ad.trim(),
        aciklama: modelForm.aciklama.trim() || null,
        uretimYili: modelForm.uretimYili ? Number(modelForm.uretimYili) : null,
        sira: Number(modelForm.sira) || 0,
      };
      if (modelDrawer.model) {
        await apiIstemci.patch(`/marka-model/${modelDrawer.model.id}`, veri);
        toast.basarili(t("marka-model.guncellendi"));
      } else {
        veri.markaId = seciliMarka.id;
        await apiIstemci.post("/marka-model", veri);
        toast.basarili(t("marka-model.olusturuldu"));
      }
      setModelDrawer({ acik: false, model: null });
      await modelleriYukle(seciliMarka.id);
    } catch (err: any) {
      const mesaj = err?.response?.data?.message;
      if (typeof mesaj === "string" && mesaj.toLowerCase().includes("unique")) {
        toast.hata(t("marka-model.ad-benzersiz"));
      } else {
        toast.hata(mesaj || t("genel.hata"));
      }
    }
    setModelKaydediyor(false);
  };

  const modelSil = async (m: MarkaModel) => {
    if ((m._count?.urunler ?? 0) > 0) {
      toast.hata(t("marka-model.silme-engeli", { sayi: m._count!.urunler }));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: m.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam || !seciliMarka) return;
    try {
      await apiIstemci.delete(`/marka-model/${m.id}`);
      toast.basarili(t("marka-model.silindi"));
      await modelleriYukle(seciliMarka.id);
    } catch (err: any) {
      toast.hata(err?.response?.data?.message || t("genel.hata"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("marka.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">{t("marka.altyazi")}</p>
        </div>
        <Button onClick={yeniDrawer}>
          <Plus /> {t("marka.yeni-ekle")}
        </Button>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-metin-pasif" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={t("marka.arama-placeholder")}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="shrink-0">
          {t("marka.toplam-kayit", { sayi: filtrelenmis.length })}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : filtrelenmis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
              <Tag className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">{t("marka.liste-bos")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>{t("marka.kod")}</TableHead>
                  <TableHead>{t("marka.ad")}</TableHead>
                  <TableHead>{t("marka.ulke-kodu")}</TableHead>
                  <TableHead className="text-center">
                    {t("marka.modeller")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("marka.yayin-kanallari")}
                  </TableHead>
                  <TableHead>{t("genel.durum")}</TableHead>
                  <TableHead className="text-right">
                    {t("genel.islem")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrelenmis.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.logoUrl}
                          alt={m.ad}
                          className="h-10 w-10 rounded object-contain bg-yuzey"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-yuzey flex items-center justify-center">
                          <Tag className="h-4 w-4 text-metin-pasif" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-metin-ikinci text-sm">
                      {m.kod}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{m.ad}</div>
                      {m.webSitesi && (
                        <div className="text-xs text-metin-ikinci flex items-center gap-1 mt-0.5">
                          <Globe className="h-3 w-3" />
                          {m.webSitesi}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.ulkeKodu ? (
                        <Badge variant="outline">{m.ulkeKodu}</Badge>
                      ) : (
                        <span className="text-metin-pasif">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        <Layers className="h-3 w-3 mr-1" />
                        {m._count?.modeller ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {m.eticaretAktif && (
                          <Badge
                            variant="secondary"
                            className="gap-1"
                            title="E-ticaret"
                          >
                            <ShoppingBag className="h-3 w-3" />
                          </Badge>
                        )}
                        {m.b2bAktif && (
                          <Badge
                            variant="secondary"
                            className="gap-1"
                            title="B2B"
                          >
                            <Building2 className="h-3 w-3" />
                          </Badge>
                        )}
                        {!m.eticaretAktif && !m.b2bAktif && (
                          <span className="text-metin-pasif text-xs">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DurumRozet durum={m.aktifMi ? "aktif" : "pasif"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duzenle(m)}
                          title={t("genel.duzenle")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => aktiflikDegistir(m)}
                          title={
                            m.aktifMi
                              ? t("genel.pasife-al")
                              : t("genel.aktif-et")
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => silMarka(m)}
                          title={t("genel.sil")}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-tehlike" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drawer */}
      {drawerAcik && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={guvenlikapat}
          />
          <div
            ref={drawerRef}
            className="relative w-full max-w-2xl bg-arkaplan shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
              <h2 className="text-lg font-semibold text-metin">
                {seciliMarka ? t("marka.duzenle") : t("marka.yeni-kayit")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={guvenlikapat}
                disabled={kaydediyor}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Tab nav */}
            <div className="flex border-b border-kenarlik px-6 overflow-x-auto">
              {(
                [
                  { key: "temel", label: t("marka.temel-bilgiler") },
                  { key: "gorsel", label: t("marka.gorseller") },
                  { key: "seo", label: t("marka.seo-og") },
                  { key: "yayin", label: t("marka.yayin-kanallari") },
                  ...(seciliMarka
                    ? [{ key: "modeller" as Sekme, label: t("marka.modeller") }]
                    : []),
                ] as { key: Sekme; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAktifSekme(s.key)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                    aktifSekme === s.key
                      ? "border-birincil text-birincil"
                      : "border-transparent text-metin-ikinci hover:text-metin",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {aktifSekme === "temel" && (
                <>
                  {seciliMarka && (
                    <div>
                      <label className="text-sm font-medium text-metin flex items-center justify-between">
                        <span>{t("marka.kod")}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setKodDuzenle((v) => !v)}
                        >
                          {kodDuzenle ? t("genel.kilitle") : t("genel.degistir")}
                        </Button>
                      </label>
                      <Input
                        value={form.kod}
                        onChange={(e) =>
                          setForm({ ...form, kod: e.target.value })
                        }
                        readOnly={!kodDuzenle}
                        className={cn(
                          "font-mono",
                          !kodDuzenle && "bg-yuzey cursor-not-allowed",
                        )}
                      />
                      <p className="text-xs text-metin-ikinci mt-1">
                        {kodDuzenle
                          ? t("genel.kod-yardim-duzenle")
                          : t("genel.kod-yardim-kilitli")}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.ulke-kodu")}
                    </label>
                    <Input
                      value={form.ulkeKodu}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ulkeKodu: e.target.value.toUpperCase().slice(0, 2),
                        })
                      }
                      placeholder="TR"
                      maxLength={2}
                      className="max-w-[200px]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.ad")} *
                    </label>
                    <Input
                      value={form.ad}
                      onChange={(e) => setForm({ ...form, ad: e.target.value })}
                      placeholder="Nike"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.aciklama")}
                    </label>
                    <textarea
                      value={form.aciklama}
                      onChange={(e) =>
                        setForm({ ...form, aciklama: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin placeholder:text-metin-pasif focus:outline-none focus:ring-2 focus:ring-birincil"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-metin">
                        {t("marka.web-sitesi")}
                      </label>
                      <Input
                        value={form.webSitesi}
                        onChange={(e) =>
                          setForm({ ...form, webSitesi: e.target.value })
                        }
                        placeholder="https://nike.com"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-metin">
                        {t("genel.siralama")}
                      </label>
                      <Input
                        type="number"
                        value={form.sira}
                        onChange={(e) =>
                          setForm({ ...form, sira: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {aktifSekme === "gorsel" && (
                <>
                  <ImageUpload
                    value={form.logoUrl}
                    onChange={(url) =>
                      setForm({ ...form, logoUrl: url ?? "" })
                    }
                    endpoint="/upload/marka"
                    label={t("marka.logo")}
                    placeholder={t("resim.placeholder")}
                  />
                  <ImageUpload
                    value={form.bannerUrl}
                    onChange={(url) =>
                      setForm({ ...form, bannerUrl: url ?? "" })
                    }
                    endpoint="/upload/marka"
                    label={t("marka.banner")}
                    placeholder={t("resim.placeholder")}
                  />
                </>
              )}

              {aktifSekme === "seo" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.seo-baslik")}
                    </label>
                    <Input
                      value={form.seoBaslik}
                      onChange={(e) =>
                        setForm({ ...form, seoBaslik: e.target.value })
                      }
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.seo-aciklama")}
                    </label>
                    <textarea
                      value={form.seoAciklama}
                      onChange={(e) =>
                        setForm({ ...form, seoAciklama: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin placeholder:text-metin-pasif focus:outline-none focus:ring-2 focus:ring-birincil"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.seo-anahtar-kelimeler")}
                    </label>
                    <Input
                      value={form.seoAnahtarKelimeler}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          seoAnahtarKelimeler: e.target.value,
                        })
                      }
                      placeholder={t("marka.seo-anahtar-placeholder")}
                    />
                  </div>
                  <ImageUpload
                    value={form.ogImageUrl}
                    onChange={(url) =>
                      setForm({ ...form, ogImageUrl: url ?? "" })
                    }
                    endpoint="/upload/marka"
                    label={t("marka.og-image")}
                  />
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("marka.canonical-url")}
                    </label>
                    <Input
                      value={form.canonicalUrl}
                      onChange={(e) =>
                        setForm({ ...form, canonicalUrl: e.target.value })
                      }
                      placeholder="https://site.com/marka/nike"
                    />
                  </div>
                </>
              )}

              {aktifSekme === "yayin" && (
                <>
                  <label className="flex items-center gap-3 rounded-md border border-kenarlik p-3 cursor-pointer hover:bg-yuzey">
                    <input
                      type="checkbox"
                      checked={form.eticaretAktif}
                      onChange={(e) =>
                        setForm({ ...form, eticaretAktif: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <ShoppingBag className="h-4 w-4 text-metin-ikinci" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-metin">
                        {t("marka.eticaret-aktif")}
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-md border border-kenarlik p-3 cursor-pointer hover:bg-yuzey">
                    <input
                      type="checkbox"
                      checked={form.b2bAktif}
                      onChange={(e) =>
                        setForm({ ...form, b2bAktif: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <Building2 className="h-4 w-4 text-metin-ikinci" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-metin">
                        {t("marka.b2b-aktif")}
                      </div>
                    </div>
                  </label>
                </>
              )}

              {aktifSekme === "modeller" && seciliMarka && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-metin-ikinci">
                      {t("marka.model-sayisi", { sayi: modeller.length })}
                    </p>
                    <Button size="sm" onClick={modelYeni}>
                      <Plus className="h-4 w-4" />
                      {t("marka-model.yeni-ekle")}
                    </Button>
                  </div>
                  {modelYukleniyor ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-metin-pasif" />
                    </div>
                  ) : modeller.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-metin-ikinci">
                      <Layers className="h-10 w-10 mb-2 opacity-30" />
                      <p className="text-sm">{t("marka-model.liste-bos")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {modeller.map((mm) => (
                        <div
                          key={mm.id}
                          className="flex items-center gap-3 rounded-md border border-kenarlik p-3 hover:bg-yuzey"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-metin truncate">
                              {mm.ad}
                            </div>
                            <div className="text-xs text-metin-ikinci flex items-center gap-2">
                              {mm.kod && (
                                <span className="font-mono">{mm.kod}</span>
                              )}
                              {mm.uretimYili && (
                                <span>· {mm.uretimYili}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => modelDuzenle(mm)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => modelSil(mm)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-tehlike" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
              <Button
                className="flex-1"
                onClick={kaydet}
                disabled={kaydediyor}
              >
                {kaydediyor && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                {seciliMarka ? t("genel.guncelle") : t("genel.kaydet")}
              </Button>
              <Button
                variant="outline"
                onClick={guvenlikapat}
                disabled={kaydediyor}
              >
                {t("genel.iptal")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Model sub-drawer */}
      {modelDrawer.acik && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() =>
              !modelKaydediyor && setModelDrawer({ acik: false, model: null })
            }
          />
          <div className="relative w-full max-w-md bg-arkaplan shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
              <h3 className="text-base font-semibold text-metin">
                {modelDrawer.model
                  ? t("marka-model.duzenle")
                  : t("marka-model.yeni-kayit")}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  !modelKaydediyor &&
                  setModelDrawer({ acik: false, model: null })
                }
                disabled={modelKaydediyor}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-metin">
                    {t("marka-model.kod")}
                  </label>
                  <Input
                    value={modelForm.kod}
                    onChange={(e) =>
                      setModelForm({ ...modelForm, kod: e.target.value })
                    }
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-metin">
                    {t("marka-model.uretim-yili")}
                  </label>
                  <Input
                    type="number"
                    min={1900}
                    max={2100}
                    value={modelForm.uretimYili}
                    onChange={(e) =>
                      setModelForm({
                        ...modelForm,
                        uretimYili: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-metin">
                  {t("marka-model.ad")} *
                </label>
                <Input
                  value={modelForm.ad}
                  onChange={(e) =>
                    setModelForm({ ...modelForm, ad: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin">
                  {t("marka-model.aciklama")}
                </label>
                <textarea
                  value={modelForm.aciklama}
                  onChange={(e) =>
                    setModelForm({ ...modelForm, aciklama: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin focus:outline-none focus:ring-2 focus:ring-birincil"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin">
                  {t("marka-model.siralama")}
                </label>
                <Input
                  type="number"
                  value={modelForm.sira}
                  onChange={(e) =>
                    setModelForm({ ...modelForm, sira: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
              <Button
                className="flex-1"
                onClick={modelKaydet}
                disabled={modelKaydediyor}
              >
                {modelKaydediyor && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                {modelDrawer.model ? t("genel.guncelle") : t("genel.kaydet")}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  !modelKaydediyor &&
                  setModelDrawer({ acik: false, model: null })
                }
                disabled={modelKaydediyor}
              >
                {t("genel.iptal")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
