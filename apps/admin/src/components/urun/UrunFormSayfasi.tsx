import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ArrowLeft, Info, Banknote, Package, Store, FileText, MoreHorizontal, AlertCircle, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { useFormHatalari } from "@/hooks/use-form-hatalari";
import { useOnay } from "@/components/ortak/OnayDialog";
import { FormAlani } from "@/components/ortak/FormAlani";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { cn } from "@/lib/utils";
import { slugOlustur } from "@/lib/slug";
import { KategoriSelect } from "@/components/urun/KategoriSelect";
import { SerpOnizleme } from "@/components/urun/SerpOnizleme";
import { ResimGalerisi } from "@/components/urun/ResimGalerisi";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface Secim {
  id: string;
  ad: string;
  kod?: string;
  oran?: number | string;
}

interface KategoriSecimVeri {
  id: string;
  ad: string;
  ustKategoriId?: string | null;
  seviye?: number;
}

interface UrunFormVeri {
  kod: string;
  ad: string;
  tip: string;
  kategoriId: string;
  markaId: string;
  markaModelId: string;
  anaBirimId: string;
  vergiOraniId: string;
  fiyatlarKdvDahilMi: boolean;
  paraBirimiKod: string;
  faturaKalemAdi: string;
  takmaAdi: string;
  muhasebeKodu: string;
  gtipKodu: string;
  barkod: string;
  alisFiyati: string;
  sonAlisFiyati: string;
  piyasaFiyati: string;
  satilabilirSonFiyat: string;
  satisFiyati: string;
  karMarji: string;
  stokTakibi: boolean;
  seriNoTakibi: boolean;
  lotTakibi: boolean;
  kritikStok: string;
  minimumStok: string;
  agirlikGr: string;
  enCm: string;
  boyCm: string;
  yukseklikCm: string;
  desi1: string;
  desi2: string;
  eticaretAktif: boolean;
  eticaretSatilikMi: boolean;
  b2bAktif: boolean;
  b2bSatilikMi: boolean;
  pazaryeriAktif: boolean;
  vitrindeGoster: boolean;
  vitrinSira: string;
  yeniUrun: boolean;
  firsatUrun: boolean;
  ucretsizKargo: boolean;
  primVarYok: boolean;
  tahminiTeslimSuresiGun: string;
  garantiAy: string;
  iskontoUygulanirMi: boolean;
  puanKazandirirMi: boolean;
  minimumSatisMiktar: string;
  sepetIndirimEticaret: string;
  sepetIndirimB2b: string;
  aciklama: string;
  kisaAciklama: string;
  icerikAciklama: string;
  kargoIadeMetin: string;
  seoUrl: string;
  seoBaslik: string;
  seoAciklama: string;
  seoAnahtarKelimeler: string;
  mensheiUlkeKodu: string;
  uretici: string;
  uretimTarihi: string;
  dataSheetUrl: string;
  ozelAlan1: string;
  ozelAlan2: string;
  ozelAlan3: string;
  ozelAlan4: string;
  ozelAlan5: string;
  abonelikAktif: boolean;
  aktifMi: boolean;
  ekKategoriIds: string[];
}

const BOS_FORM: UrunFormVeri = {
  kod: "", ad: "", tip: "fiziksel", kategoriId: "", markaId: "", markaModelId: "",
  anaBirimId: "", vergiOraniId: "", fiyatlarKdvDahilMi: true, paraBirimiKod: "TRY",
  faturaKalemAdi: "", takmaAdi: "", muhasebeKodu: "", gtipKodu: "",
  barkod: "",
  alisFiyati: "", sonAlisFiyati: "", piyasaFiyati: "", satilabilirSonFiyat: "",
  satisFiyati: "", karMarji: "",
  stokTakibi: true, seriNoTakibi: false, lotTakibi: false,
  kritikStok: "0", minimumStok: "0",
  agirlikGr: "", enCm: "", boyCm: "", yukseklikCm: "", desi1: "0", desi2: "0",
  eticaretAktif: false, eticaretSatilikMi: true, b2bAktif: false, b2bSatilikMi: true, pazaryeriAktif: false,
  vitrindeGoster: false, vitrinSira: "0", yeniUrun: false, firsatUrun: false,
  ucretsizKargo: false, primVarYok: false, tahminiTeslimSuresiGun: "0", garantiAy: "",
  iskontoUygulanirMi: true, puanKazandirirMi: true, minimumSatisMiktar: "1",
  sepetIndirimEticaret: "", sepetIndirimB2b: "",
  aciklama: "", kisaAciklama: "", icerikAciklama: "", kargoIadeMetin: "",
  seoUrl: "", seoBaslik: "", seoAciklama: "", seoAnahtarKelimeler: "",
  mensheiUlkeKodu: "", uretici: "", uretimTarihi: "", dataSheetUrl: "",
  ozelAlan1: "", ozelAlan2: "", ozelAlan3: "", ozelAlan4: "", ozelAlan5: "",
  abonelikAktif: false, aktifMi: true,
  ekKategoriIds: [],
};

type Tab = "temel" | "fiyat" | "fiziksel" | "kanallar" | "icerik" | "resim" | "ek";

interface UrunFormSayfasiOzellik {
  urunId?: string;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function UrunFormSayfasi({ urunId }: UrunFormSayfasiOzellik) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onay = useOnay();
  const duzenlemeModu = Boolean(urunId);

  const [form, setForm] = useState<UrunFormVeri>({ ...BOS_FORM });
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [aktifTab, setAktifTab] = useState<Tab>("temel");

  const [kategoriler, setKategoriler] = useState<KategoriSecimVeri[]>([]);
  const [markalar, setMarkalar] = useState<Secim[]>([]);
  const [markaModelleri, setMarkaModelleri] = useState<Secim[]>([]);
  const [birimler, setBirimler] = useState<Secim[]>([]);
  const [vergiOranlari, setVergiOranlari] = useState<Secim[]>([]);

  // Slug manuel olarak düzenlendi mi? True ise ad değişince otomatik override yapılmaz.
  const [slugManuelMi, setSlugManuelMi] = useState(false);

  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
  const { hatalar, hataAyarla, hataTemizle, temizle: hataTemizleHepsi } = useFormHatalari();

  // ─── Dropdown kaynakları ───
  useEffect(() => {
    const sorgu = { params: { boyut: 200 } };
    Promise.all([
      apiIstemci.get("/kategori", sorgu).catch(() => ({ data: [] })),
      apiIstemci.get("/marka", sorgu).catch(() => ({ data: [] })),
      apiIstemci.get("/birim", sorgu).catch(() => ({ data: [] })),
      apiIstemci.get("/vergi-orani", sorgu).catch(() => ({ data: [] })),
    ]).then(([k, m, b, v]) => {
      const liste = (x: any): Secim[] => Array.isArray(x) ? x : (x.veriler ?? []);
      setKategoriler(liste(k.data));
      setMarkalar(liste(m.data));
      setBirimler(liste(b.data));
      setVergiOranlari(liste(v.data));
    });
  }, []);

  useEffect(() => {
    if (!form.markaId) { setMarkaModelleri([]); return; }
    apiIstemci
      .get("/marka-model", { params: { markaId: form.markaId, aktifMi: "true", boyut: 200 } })
      .then((res: any) => {
        const liste: Secim[] = Array.isArray(res.data) ? res.data : (res.data.veriler ?? []);
        setMarkaModelleri(liste);
      })
      .catch(() => setMarkaModelleri([]));
  }, [form.markaId]);

  // ─── Düzenleme: mevcut veriyi yükle ───
  useEffect(() => {
    if (!urunId) {
      setForm({ ...BOS_FORM });
      baslangicAyarla({ ...BOS_FORM });
      setSlugManuelMi(false);
      return;
    }
    setYukleniyor(true);
    apiIstemci
      .get(`/urun/${urunId}`)
      .then((res: any) => {
        const u = res.data as Record<string, any>;
        const v = (u.varyantlar?.[0] ?? {}) as Record<string, any>;
        const fl = (v.fiyatListeVaryantlar ?? []).find((x: any) => x.fiyatListesi?.varsayilanMi);
        const asStr = (x: unknown) => (x === null || x === undefined ? "" : String(x));

        const yeni: UrunFormVeri = {
          kod: asStr(u.kod), ad: asStr(u.ad), tip: asStr(u.tip) || "fiziksel",
          kategoriId: asStr(u.kategoriId), markaId: asStr(u.markaId), markaModelId: asStr(u.markaModelId),
          anaBirimId: asStr(u.anaBirimId), vergiOraniId: asStr(u.vergiOraniId),
          fiyatlarKdvDahilMi: Boolean(u.fiyatlarKdvDahilMi),
          paraBirimiKod: asStr(v.paraBirimiKod) || "TRY",
          faturaKalemAdi: asStr(u.faturaKalemAdi), takmaAdi: asStr(u.takmaAdi),
          muhasebeKodu: asStr(u.muhasebeKodu), gtipKodu: asStr(u.gtipKodu),
          barkod: asStr(v.barkod),
          alisFiyati: asStr(v.alisFiyati), sonAlisFiyati: asStr(v.sonAlisFiyati),
          piyasaFiyati: asStr(v.piyasaFiyati), satilabilirSonFiyat: asStr(v.satilabilirSonFiyat),
          satisFiyati: fl ? asStr(fl.fiyat) : "", karMarji: asStr(v.karMarji),
          stokTakibi: Boolean(u.stokTakibi), seriNoTakibi: Boolean(u.seriNoTakibi), lotTakibi: Boolean(u.lotTakibi),
          kritikStok: asStr(v.kritikStok) || "0", minimumStok: asStr(v.minimumStok) || "0",
          agirlikGr: asStr(v.agirlikGr), enCm: asStr(v.enCm), boyCm: asStr(v.boyCm), yukseklikCm: asStr(v.yukseklikCm),
          desi1: asStr(u.desi1) || "0", desi2: asStr(u.desi2) || "0",
          eticaretAktif: Boolean(u.eticaretAktif), eticaretSatilikMi: Boolean(u.eticaretSatilikMi),
          b2bAktif: Boolean(u.b2bAktif), b2bSatilikMi: Boolean(u.b2bSatilikMi),
          pazaryeriAktif: Boolean(u.pazaryeriAktif),
          vitrindeGoster: Boolean(u.vitrindeGoster), vitrinSira: asStr(u.vitrinSira) || "0",
          yeniUrun: Boolean(u.yeniUrun), firsatUrun: Boolean(u.firsatUrun),
          ucretsizKargo: Boolean(u.ucretsizKargo), primVarYok: Boolean(u.primVarYok),
          tahminiTeslimSuresiGun: asStr(u.tahminiTeslimSuresiGun) || "0", garantiAy: asStr(u.garantiAy),
          iskontoUygulanirMi: Boolean(u.iskontoUygulanirMi), puanKazandirirMi: Boolean(u.puanKazandirirMi),
          minimumSatisMiktar: asStr(u.minimumSatisMiktar) || "1",
          sepetIndirimEticaret: asStr(u.sepetIndirimEticaret), sepetIndirimB2b: asStr(u.sepetIndirimB2b),
          aciklama: asStr(u.aciklama), kisaAciklama: asStr(u.kisaAciklama),
          icerikAciklama: asStr(u.icerikAciklama), kargoIadeMetin: asStr(u.kargoIadeMetin),
          seoUrl: asStr(u.seoUrl), seoBaslik: asStr(u.seoBaslik), seoAciklama: asStr(u.seoAciklama),
          seoAnahtarKelimeler: Array.isArray(u.seoAnahtarKelimeler) ? u.seoAnahtarKelimeler.join(", ") : "",
          mensheiUlkeKodu: asStr(u.mensheiUlkeKodu), uretici: asStr(u.uretici),
          uretimTarihi: u.uretimTarihi ? String(u.uretimTarihi).substring(0, 10) : "",
          dataSheetUrl: asStr(u.dataSheetUrl),
          ozelAlan1: asStr(u.ozelAlan1), ozelAlan2: asStr(u.ozelAlan2), ozelAlan3: asStr(u.ozelAlan3),
          ozelAlan4: asStr(u.ozelAlan4), ozelAlan5: asStr(u.ozelAlan5),
          abonelikAktif: Boolean(u.abonelikAktif), aktifMi: Boolean(u.aktifMi),
          ekKategoriIds: Array.isArray(u.ekKategoriler)
            ? u.ekKategoriler.map((ek: any) => String(ek.kategoriId))
            : [],
        };
        setForm(yeni);
        baslangicAyarla(yeni);
        // Düzenleme modunda: slug varsa "manuel girilmiş" kabul et (otomatik override yapma)
        setSlugManuelMi(Boolean(u.seoUrl));
      })
      .catch(() => toast.hata(t("urun.bilgi-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [urunId]);

  const alan = (anahtar: keyof UrunFormVeri, deger: string | boolean | string[]) => {
    setForm((f) => {
      const yeni = { ...f, [anahtar]: deger };
      // Ad değiştikçe slug otomatik üret (kullanıcı manuel değiştirmedi ise)
      if (anahtar === "ad" && !slugManuelMi && typeof deger === "string") {
        yeni.seoUrl = slugOlustur(deger);
      }
      return yeni;
    });
    if (hatalar[anahtar as string]) hataTemizle(anahtar as string);
  };

  // Slug alanı için özel handler — değişince "manuel girildi" işaretle
  const slugDegistir = (deger: string) => {
    setSlugManuelMi(Boolean(deger.trim()));
    setForm((f) => ({ ...f, seoUrl: deger }));
  };

  // ─── Kaydet ───
  const kaydet = async () => {
    hataTemizleHepsi();
    let gecerli = true;
    if (!form.ad.trim()) { hataAyarla("ad", t("genel.zorunlu-alan")); gecerli = false; }
    if (!form.anaBirimId) { hataAyarla("anaBirimId", t("genel.zorunlu-alan")); gecerli = false; }
    if (!form.vergiOraniId) { hataAyarla("vergiOraniId", t("genel.zorunlu-alan")); gecerli = false; }

    if (!gecerli) {
      setAktifTab("temel"); // Zorunlu alanlar temel tab'da
      toast.hata(t("genel.zorunlu-alanlari-doldurun"));
      return;
    }

    setKaydediyor(true);
    try {
      const sayi = (s: string) => (s.trim() === "" ? undefined : Number(s));
      const nStr = (s: string) => (s.trim() === "" ? null : s.trim());

      const gonder: Record<string, unknown> = {
        ad: form.ad.trim(), tip: form.tip,
        anaBirimId: Number(form.anaBirimId), vergiOraniId: Number(form.vergiOraniId),
        fiyatlarKdvDahilMi: form.fiyatlarKdvDahilMi,
        paraBirimiKod: form.paraBirimiKod,
        kod: form.kod.trim() || undefined,
        kategoriId: form.kategoriId ? Number(form.kategoriId) : null,
        markaId: form.markaId ? Number(form.markaId) : null,
        markaModelId: form.markaModelId ? Number(form.markaModelId) : null,
        faturaKalemAdi: nStr(form.faturaKalemAdi), takmaAdi: nStr(form.takmaAdi),
        muhasebeKodu: nStr(form.muhasebeKodu), gtipKodu: nStr(form.gtipKodu),
        barkod: nStr(form.barkod),
        alisFiyati: sayi(form.alisFiyati), sonAlisFiyati: sayi(form.sonAlisFiyati),
        piyasaFiyati: sayi(form.piyasaFiyati), satilabilirSonFiyat: sayi(form.satilabilirSonFiyat),
        satisFiyati: sayi(form.satisFiyati), karMarji: sayi(form.karMarji),
        stokTakibi: form.stokTakibi, seriNoTakibi: form.seriNoTakibi, lotTakibi: form.lotTakibi,
        kritikStok: sayi(form.kritikStok) ?? 0, minimumStok: sayi(form.minimumStok) ?? 0,
        agirlikGr: sayi(form.agirlikGr), enCm: sayi(form.enCm), boyCm: sayi(form.boyCm),
        yukseklikCm: sayi(form.yukseklikCm),
        desi1: sayi(form.desi1) ?? 0, desi2: sayi(form.desi2) ?? 0,
        eticaretAktif: form.eticaretAktif, eticaretSatilikMi: form.eticaretSatilikMi,
        b2bAktif: form.b2bAktif, b2bSatilikMi: form.b2bSatilikMi, pazaryeriAktif: form.pazaryeriAktif,
        vitrindeGoster: form.vitrindeGoster, vitrinSira: sayi(form.vitrinSira) ?? 0,
        yeniUrun: form.yeniUrun, firsatUrun: form.firsatUrun,
        ucretsizKargo: form.ucretsizKargo, primVarYok: form.primVarYok,
        tahminiTeslimSuresiGun: sayi(form.tahminiTeslimSuresiGun) ?? 0,
        garantiAy: sayi(form.garantiAy),
        iskontoUygulanirMi: form.iskontoUygulanirMi, puanKazandirirMi: form.puanKazandirirMi,
        minimumSatisMiktar: sayi(form.minimumSatisMiktar) ?? 1,
        sepetIndirimEticaret: sayi(form.sepetIndirimEticaret), sepetIndirimB2b: sayi(form.sepetIndirimB2b),
        aciklama: nStr(form.aciklama), kisaAciklama: nStr(form.kisaAciklama),
        icerikAciklama: nStr(form.icerikAciklama), kargoIadeMetin: nStr(form.kargoIadeMetin),
        seoUrl: nStr(form.seoUrl), seoBaslik: nStr(form.seoBaslik), seoAciklama: nStr(form.seoAciklama),
        seoAnahtarKelimeler: form.seoAnahtarKelimeler
          ? form.seoAnahtarKelimeler.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        mensheiUlkeKodu: nStr(form.mensheiUlkeKodu), uretici: nStr(form.uretici),
        uretimTarihi: form.uretimTarihi || null,
        ozelAlan1: nStr(form.ozelAlan1), ozelAlan2: nStr(form.ozelAlan2), ozelAlan3: nStr(form.ozelAlan3),
        ozelAlan4: nStr(form.ozelAlan4), ozelAlan5: nStr(form.ozelAlan5),
        abonelikAktif: form.abonelikAktif,
        ekKategoriIds: form.ekKategoriIds.map((id) => Number(id)),
      };

      if (duzenlemeModu) {
        gonder.aktifMi = form.aktifMi;
        await apiIstemci.patch(`/urun/${urunId}`, gonder);
        toast.basarili(t("urun.guncellendi"));
      } else {
        await apiIstemci.post("/urun", gonder);
        toast.basarili(t("urun.olusturuldu"));
      }

      sifirla();
      navigate({ to: "/urun/liste" });
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("urun.kayit-basarisiz");
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  const geriDon = async () => {
    if (dirty && !kaydediyor) {
      const tamam = await onay.goster({
        baslik: t("genel.dirty-baslik"),
        mesaj: t("genel.dirty-mesaj"),
        varyant: "uyari",
        onayMetni: t("genel.cikis-yap"),
      });
      if (!tamam) return;
    }
    navigate({ to: "/urun/liste" });
  };

  // ─── Seçenek listeleri ───
  const markaSec = [{ deger: "", etiket: t("urun.marka-sec") }, ...markalar.map((m) => ({ deger: m.id, etiket: m.ad }))];
  const markaModelSec = [{ deger: "", etiket: t("urun.model-sec") }, ...markaModelleri.map((m) => ({ deger: m.id, etiket: m.ad }))];
  const birimSec = birimler.map((b) => ({ deger: b.id, etiket: `${b.ad}${b.kod ? ` (${b.kod})` : ""}` }));
  const vergiSec = vergiOranlari.map((v) => ({ deger: v.id, etiket: `${v.ad} — %${Number(v.oran ?? 0).toFixed(0)}` }));
  const tipSec = [
    { deger: "fiziksel", etiket: t("urun.tip-fiziksel") },
    { deger: "dijital", etiket: t("urun.tip-dijital") },
    { deger: "hizmet", etiket: t("urun.tip-hizmet") },
  ];

  const tabZorunluEksik: Record<Tab, boolean> = {
    temel: Boolean(hatalar.ad || hatalar.anaBirimId || hatalar.vergiOraniId),
    fiyat: false, fiziksel: false, kanallar: false, icerik: false, resim: false, ek: false,
  };

  const tablar: { id: Tab; label: string; ikon: React.ReactNode }[] = [
    { id: "temel", label: t("urun.tab-temel"), ikon: <Info className="h-4 w-4" /> },
    { id: "fiyat", label: t("urun.tab-fiyat-stok"), ikon: <Banknote className="h-4 w-4" /> },
    { id: "fiziksel", label: t("urun.tab-fiziksel"), ikon: <Package className="h-4 w-4" /> },
    { id: "kanallar", label: t("urun.tab-kanallar"), ikon: <Store className="h-4 w-4" /> },
    { id: "icerik", label: t("urun.tab-icerik-seo"), ikon: <FileText className="h-4 w-4" /> },
    { id: "resim", label: t("urun.tab-resim"), ikon: <ImageIcon className="h-4 w-4" /> },
    { id: "ek", label: t("urun.tab-ek"), ikon: <MoreHorizontal className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {/* ─── Sticky Başlık — mobilde compact ─── */}
      <header className="flex items-center justify-between gap-2 md:gap-4 bg-arkaplan border-b border-kenarlik -mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={geriDon} className="shrink-0" title={t("genel.geri")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">{t("genel.geri")}</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-semibold tracking-tight text-metin truncate">
              {duzenlemeModu ? t("urun.duzenle") : t("urun.yeni-kayit")}
            </h1>
            {duzenlemeModu && form.kod && (
              <p className="text-[11px] md:text-xs text-metin-pasif font-mono truncate">{form.kod}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {dirty && (
            <span className="hidden lg:inline text-xs text-metin-pasif italic">{t("genel.kaydedilmemis-degisiklik")}</span>
          )}
          <Button variant="outline" size="sm" onClick={geriDon} disabled={kaydediyor} className="hidden md:inline-flex">
            {t("genel.iptal")}
          </Button>
          <Button size="sm" onClick={kaydet} disabled={kaydediyor || yukleniyor}>
            {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
            {duzenlemeModu ? t("genel.guncelle") : t("genel.kaydet")}
          </Button>
        </div>
      </header>

      {yukleniyor ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 md:gap-6 flex-1">
          {/* ─── Tab Nav — mobilde yatay scroll, md+ sol sidebar ─── */}
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 md:mx-0 px-4 md:px-0 pb-1 md:pb-0 md:sticky md:top-20 md:self-start border-b md:border-b-0 border-kenarlik">
            {tablar.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAktifTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 md:gap-2.5 px-3 py-2 md:py-2 rounded-md text-sm whitespace-nowrap md:whitespace-normal text-left transition-colors shrink-0 md:shrink",
                  aktifTab === tab.id
                    ? "bg-birincil/10 text-birincil font-medium"
                    : "text-metin-ikinci hover:bg-yuzey hover:text-metin",
                )}
              >
                {tab.ikon}
                <span className="md:flex-1">{tab.label}</span>
                {tabZorunluEksik[tab.id] && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
              </button>
            ))}
          </nav>

          {/* ─── İçerik ─── */}
          <Card className="p-4 md:p-6 space-y-6">
            {/* ══════ TAB 1: TEMEL ══════ */}
            {aktifTab === "temel" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-temel")}>
                  <FormAlani.Metin
                    etiket={t("urun.ad")}
                    zorunlu
                    deger={form.ad}
                    onChange={(v) => alan("ad", v)}
                    placeholder={t("urun.ad-placeholder")}
                    hata={hatalar.ad}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Metin
                      etiket={t("urun.kod")}
                      deger={form.kod}
                      onChange={(v) => alan("kod", v)}
                      placeholder={duzenlemeModu ? "" : t("genel.otomatik")}
                      yardim={duzenlemeModu ? t("genel.kod-yardim-kilitli") : t("urun.kod-yardim")}
                      readOnly={duzenlemeModu}
                    />
                    <FormAlani.Secim
                      etiket={t("urun.tip-label")}
                      deger={form.tip}
                      secenekler={tipSec}
                      onChange={(v) => alan("tip", v)}
                      yardim={t("urun.tip-yardim")}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <KategoriSelect
                      mod="tekli"
                      etiket={t("urun.kategori")}
                      yardim={t("urun.kategori-ana-yardim")}
                      kategoriler={kategoriler}
                      deger={form.kategoriId}
                      onChange={(v) => alan("kategoriId", v)}
                    />
                    <FormAlani.Secim etiket={t("urun.marka")} deger={form.markaId} secenekler={markaSec} onChange={(v) => { alan("markaId", v); alan("markaModelId", ""); }} />
                  </div>
                  <KategoriSelect
                    mod="coklu"
                    etiket={t("urun.ek-kategoriler")}
                    yardim={t("urun.ek-kategoriler-yardim")}
                    kategoriler={kategoriler}
                    degerler={form.ekKategoriIds}
                    onChange={(v) => alan("ekKategoriIds", v)}
                    exclude={form.kategoriId ? [form.kategoriId] : []}
                    maxSecim={10}
                  />
                  {/* kategoriSec artik kullanilmiyor; hiyerarsik KategoriSelect geldi */}
                  {markaModelleri.length > 0 && (
                    <FormAlani.Secim etiket={t("urun.model")} deger={form.markaModelId} secenekler={markaModelSec} onChange={(v) => alan("markaModelId", v)} />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Secim etiket={t("urun.birim")} zorunlu deger={form.anaBirimId} secenekler={[{ deger: "", etiket: t("urun.birim-sec") }, ...birimSec]} onChange={(v) => alan("anaBirimId", v)} hata={hatalar.anaBirimId} />
                    <FormAlani.Secim etiket={t("urun.vergi-orani")} zorunlu deger={form.vergiOraniId} secenekler={[{ deger: "", etiket: t("urun.vergi-sec") }, ...vergiSec]} onChange={(v) => alan("vergiOraniId", v)} hata={hatalar.vergiOraniId} />
                  </div>
                  <FormAlani.Onay etiket={t("urun.fiyatlar-kdv-dahil")} aciklama={t("urun.fiyatlar-kdv-dahil-aciklama")} deger={form.fiyatlarKdvDahilMi} onChange={(v) => alan("fiyatlarKdvDahilMi", v)} />
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-isim-kod")} altyazi={t("urun.bolum-isim-altyazi")}>
                  <FormAlani.Metin etiket={t("urun.fatura-kalem-adi")} deger={form.faturaKalemAdi} onChange={(v) => alan("faturaKalemAdi", v)} placeholder={form.ad} yardim={t("urun.fatura-kalem-yardim")} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Metin etiket={t("urun.takma-ad")} deger={form.takmaAdi} onChange={(v) => alan("takmaAdi", v)} yardim={t("urun.takma-ad-yardim")} />
                    <FormAlani.Metin etiket={t("urun.muhasebe-kodu")} deger={form.muhasebeKodu} onChange={(v) => alan("muhasebeKodu", v)} placeholder="153.01.001" />
                  </div>
                  <FormAlani.Metin etiket={t("urun.gtip-kodu")} deger={form.gtipKodu} onChange={(v) => alan("gtipKodu", v)} placeholder="6203.12.00" yardim={t("urun.gtip-yardim")} />
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-barkod")} altyazi={t("urun.bolum-barkod-altyazi")}>
                  <FormAlani.Metin etiket={t("urun.barkod")} deger={form.barkod} onChange={(v) => alan("barkod", v)} placeholder="8690000000000" yardim={t("urun.barkod-yardim")} />
                </FormAlani.Bolum>
              </>
            )}

            {/* ══════ TAB 2: FİYAT & STOK ══════ */}
            {aktifTab === "fiyat" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-fiyat")} altyazi={t("urun.bolum-fiyat-altyazi")}>
                  <FormAlani.Secim
                    etiket={t("urun.para-birimi")}
                    deger={form.paraBirimiKod}
                    secenekler={[
                      { deger: "TRY", etiket: t("urun.para-try") },
                      { deger: "USD", etiket: t("urun.para-usd") },
                      { deger: "EUR", etiket: t("urun.para-eur") },
                      { deger: "GBP", etiket: t("urun.para-gbp") },
                    ]}
                    onChange={(v) => alan("paraBirimiKod", v)}
                    yardim={t("urun.para-birimi-yardim")}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={`${t("urun.alis-fiyati")} (${form.paraBirimiKod})`} deger={form.alisFiyati} onChange={(v) => alan("alisFiyati", v)} step={0.01} min={0} placeholder="0.00" />
                    <FormAlani.Sayi etiket={`${t("urun.son-alis-fiyati")} (${form.paraBirimiKod})`} deger={form.sonAlisFiyati} onChange={(v) => alan("sonAlisFiyati", v)} step={0.01} min={0} yardim={t("urun.son-alis-yardim")} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={`${t("urun.piyasa-fiyati")} (${form.paraBirimiKod})`} deger={form.piyasaFiyati} onChange={(v) => alan("piyasaFiyati", v)} step={0.01} min={0} yardim={t("urun.piyasa-yardim")} />
                    <FormAlani.Sayi etiket={`${t("urun.satis-fiyati")} (${form.paraBirimiKod})`} deger={form.satisFiyati} onChange={(v) => alan("satisFiyati", v)} step={0.01} min={0} yardim={t("urun.satis-yardim")} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={`${t("urun.satilabilir-son-fiyat")} (${form.paraBirimiKod})`} deger={form.satilabilirSonFiyat} onChange={(v) => alan("satilabilirSonFiyat", v)} step={0.01} min={0} yardim={t("urun.satilabilir-son-fiyat-yardim")} />
                    <FormAlani.Sayi etiket={t("urun.kar-marji")} deger={form.karMarji} onChange={(v) => alan("karMarji", v)} step={0.01} placeholder="%" yardim={t("urun.kar-marji-yardim")} />
                  </div>
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-stok")}>
                  <FormAlani.Onay etiket={t("urun.stok-takibi")} aciklama={t("urun.stok-takibi-aciklama")} deger={form.stokTakibi} onChange={(v) => alan("stokTakibi", v)} />
                  {form.stokTakibi && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormAlani.Sayi etiket={t("urun.kritik-stok")} deger={form.kritikStok} onChange={(v) => alan("kritikStok", v)} step={1} min={0} yardim={t("urun.kritik-stok-yardim")} />
                        <FormAlani.Sayi etiket={t("urun.minimum-stok")} deger={form.minimumStok} onChange={(v) => alan("minimumStok", v)} step={1} min={0} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormAlani.Onay etiket={t("urun.seri-no-takibi")} deger={form.seriNoTakibi} onChange={(v) => alan("seriNoTakibi", v)} />
                        <FormAlani.Onay etiket={t("urun.lot-takibi")} deger={form.lotTakibi} onChange={(v) => alan("lotTakibi", v)} />
                      </div>
                    </>
                  )}
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-sepet")} altyazi={t("urun.bolum-sepet-altyazi")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Onay etiket={t("urun.iskonto-uygulanir")} deger={form.iskontoUygulanirMi} onChange={(v) => alan("iskontoUygulanirMi", v)} />
                    <FormAlani.Onay etiket={t("urun.puan-kazandirir")} deger={form.puanKazandirirMi} onChange={(v) => alan("puanKazandirirMi", v)} />
                  </div>
                  <FormAlani.Sayi etiket={t("urun.minimum-satis-miktar")} deger={form.minimumSatisMiktar} onChange={(v) => alan("minimumSatisMiktar", v)} step={0.01} min={0.01} yardim={t("urun.minimum-satis-yardim")} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={t("urun.sepet-indirim-eticaret")} deger={form.sepetIndirimEticaret} onChange={(v) => alan("sepetIndirimEticaret", v)} step={0.01} min={0} max={100} placeholder="%" />
                    <FormAlani.Sayi etiket={t("urun.sepet-indirim-b2b")} deger={form.sepetIndirimB2b} onChange={(v) => alan("sepetIndirimB2b", v)} step={0.01} min={0} max={100} placeholder="%" />
                  </div>
                </FormAlani.Bolum>
              </>
            )}

            {/* ══════ TAB 3: FİZİKSEL & KARGO ══════ */}
            {aktifTab === "fiziksel" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-fiziksel")} altyazi={t("urun.bolum-fiziksel-altyazi")}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <FormAlani.Sayi etiket={t("urun.agirlik-gr")} deger={form.agirlikGr} onChange={(v) => alan("agirlikGr", v)} step={1} min={0} />
                    <FormAlani.Sayi etiket={t("urun.en-cm")} deger={form.enCm} onChange={(v) => alan("enCm", v)} step={0.1} min={0} />
                    <FormAlani.Sayi etiket={t("urun.boy-cm")} deger={form.boyCm} onChange={(v) => alan("boyCm", v)} step={0.1} min={0} />
                    <FormAlani.Sayi etiket={t("urun.yukseklik-cm")} deger={form.yukseklikCm} onChange={(v) => alan("yukseklikCm", v)} step={0.1} min={0} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={t("urun.desi1")} deger={form.desi1} onChange={(v) => alan("desi1", v)} step={0.01} min={0} yardim={t("urun.desi-yardim")} />
                    <FormAlani.Sayi etiket={t("urun.desi2")} deger={form.desi2} onChange={(v) => alan("desi2", v)} step={0.01} min={0} />
                  </div>
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-kargo")}>
                  <FormAlani.Onay etiket={t("urun.ucretsiz-kargo")} deger={form.ucretsizKargo} onChange={(v) => alan("ucretsizKargo", v)} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Sayi etiket={t("urun.tahmini-teslim-gun")} deger={form.tahminiTeslimSuresiGun} onChange={(v) => alan("tahminiTeslimSuresiGun", v)} step={1} min={0} />
                    <FormAlani.Sayi etiket={t("urun.garanti-ay")} deger={form.garantiAy} onChange={(v) => alan("garantiAy", v)} step={1} min={0} placeholder={t("urun.garanti-yok")} />
                  </div>
                </FormAlani.Bolum>
              </>
            )}

            {/* ══════ TAB 4: KANALLAR ══════ */}
            {aktifTab === "kanallar" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-kanallar")} altyazi={t("urun.bolum-kanallar-altyazi")}>
                  <FormAlani.Onay etiket={t("urun.eticaret-aktif")} aciklama={t("urun.eticaret-aciklama")} deger={form.eticaretAktif} onChange={(v) => alan("eticaretAktif", v)} />
                  {form.eticaretAktif && (
                    <FormAlani.Onay etiket={t("urun.eticaret-satilik")} aciklama={t("urun.eticaret-satilik-aciklama")} deger={form.eticaretSatilikMi} onChange={(v) => alan("eticaretSatilikMi", v)} />
                  )}
                  <FormAlani.Onay etiket={t("urun.b2b-aktif")} aciklama={t("urun.b2b-aciklama")} deger={form.b2bAktif} onChange={(v) => alan("b2bAktif", v)} />
                  {form.b2bAktif && (
                    <FormAlani.Onay etiket={t("urun.b2b-satilik")} aciklama={t("urun.b2b-satilik-aciklama")} deger={form.b2bSatilikMi} onChange={(v) => alan("b2bSatilikMi", v)} />
                  )}
                  <FormAlani.Onay etiket={t("urun.pazaryeri-aktif")} aciklama={t("urun.pazaryeri-aciklama")} deger={form.pazaryeriAktif} onChange={(v) => alan("pazaryeriAktif", v)} />
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-vitrin")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Onay etiket={t("urun.vitrinde-goster")} deger={form.vitrindeGoster} onChange={(v) => alan("vitrindeGoster", v)} />
                    <FormAlani.Sayi etiket={t("urun.vitrin-sira")} deger={form.vitrinSira} onChange={(v) => alan("vitrinSira", v)} step={1} min={0} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Onay etiket={t("urun.yeni-urun")} deger={form.yeniUrun} onChange={(v) => alan("yeniUrun", v)} />
                    <FormAlani.Onay etiket={t("urun.firsat-urun")} deger={form.firsatUrun} onChange={(v) => alan("firsatUrun", v)} />
                  </div>
                  <FormAlani.Onay etiket={t("urun.prim-var-yok")} aciklama={t("urun.prim-aciklama")} deger={form.primVarYok} onChange={(v) => alan("primVarYok", v)} />
                </FormAlani.Bolum>
              </>
            )}

            {/* ══════ TAB 5: İÇERİK & SEO ══════ */}
            {aktifTab === "icerik" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-icerik")}>
                  <FormAlani.Metin etiket={t("urun.kisa-aciklama")} deger={form.kisaAciklama} onChange={(v) => alan("kisaAciklama", v)} placeholder={t("urun.kisa-aciklama-placeholder")} maxLength={500} />
                  <div>
                    <label className="block text-sm font-medium text-metin mb-1.5">{t("urun.aciklama")}</label>
                    <RichTextEditor value={form.aciklama} onChange={(html) => setForm((f) => ({ ...f, aciklama: html }))} placeholder={t("urun.aciklama-placeholder")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-metin mb-1.5">{t("urun.icerik-aciklama")}</label>
                    <RichTextEditor value={form.icerikAciklama} onChange={(html) => setForm((f) => ({ ...f, icerikAciklama: html }))} placeholder={t("urun.icerik-aciklama-placeholder")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-metin mb-1.5">{t("urun.kargo-iade-metin")}</label>
                    <RichTextEditor value={form.kargoIadeMetin} onChange={(html) => setForm((f) => ({ ...f, kargoIadeMetin: html }))} placeholder={t("urun.kargo-iade-placeholder")} />
                  </div>
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-seo")} altyazi={t("urun.bolum-seo-altyazi")}>
                  <FormAlani.Metin
                    etiket={t("urun.seo-url")}
                    deger={form.seoUrl}
                    onChange={slugDegistir}
                    placeholder={slugOlustur(form.ad) || "urun-adi-slug"}
                    yardim={slugManuelMi ? t("urun.seo-url-manuel-yardim") : t("urun.seo-url-yardim")}
                  />
                  <FormAlani.Metin etiket={t("urun.seo-baslik")} deger={form.seoBaslik} onChange={(v) => alan("seoBaslik", v)} maxLength={60} placeholder={form.ad} />
                  <FormAlani.UzunMetin etiket={t("urun.seo-aciklama")} deger={form.seoAciklama} onChange={(v) => alan("seoAciklama", v)} maxLength={160} placeholder={form.kisaAciklama} />
                  <FormAlani.Metin etiket={t("urun.seo-anahtar-kelimeler")} deger={form.seoAnahtarKelimeler} onChange={(v) => alan("seoAnahtarKelimeler", v)} placeholder={t("urun.seo-anahtar-placeholder")} yardim={t("urun.seo-anahtar-yardim")} />

                  {/* Google arama onizlemesi — canli */}
                  <SerpOnizleme
                    baslik={form.seoBaslik || form.ad}
                    aciklama={form.seoAciklama || form.kisaAciklama}
                    slug={form.seoUrl || slugOlustur(form.ad)}
                    urunId={urunId}
                  />
                </FormAlani.Bolum>
              </>
            )}

            {/* ══════ TAB 6: RESİMLER ══════ */}
            {aktifTab === "resim" && (
              <FormAlani.Bolum baslik={t("urun.bolum-resimler")} altyazi={t("urun.bolum-resimler-altyazi")}>
                <ResimGalerisi urunId={urunId ?? null} urunAdi={form.ad} />
              </FormAlani.Bolum>
            )}

            {/* ══════ TAB 7: EK BİLGİLER & ÖZEL ══════ */}
            {aktifTab === "ek" && (
              <>
                <FormAlani.Bolum baslik={t("urun.bolum-ek-bilgi")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Metin etiket={t("urun.menshei-ulke")} deger={form.mensheiUlkeKodu} onChange={(v) => alan("mensheiUlkeKodu", v.toUpperCase())} placeholder="TR" maxLength={2} yardim={t("urun.menshei-yardim")} />
                    <FormAlani.Metin etiket={t("urun.uretici")} deger={form.uretici} onChange={(v) => alan("uretici", v)} />
                  </div>
                  <FormAlani.Metin etiket={t("urun.uretim-tarihi")} deger={form.uretimTarihi} onChange={(v) => alan("uretimTarihi", v)} type="date" />
                  <FormAlani.Metin etiket={t("urun.data-sheet-url")} deger={form.dataSheetUrl} onChange={(v) => alan("dataSheetUrl", v)} placeholder="https://..." yardim={t("urun.data-sheet-yardim")} />
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-ozel-alanlar")} altyazi={t("urun.bolum-ozel-altyazi")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 1 })} deger={form.ozelAlan1} onChange={(v) => alan("ozelAlan1", v)} />
                    <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 2 })} deger={form.ozelAlan2} onChange={(v) => alan("ozelAlan2", v)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 3 })} deger={form.ozelAlan3} onChange={(v) => alan("ozelAlan3", v)} />
                    <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 4 })} deger={form.ozelAlan4} onChange={(v) => alan("ozelAlan4", v)} />
                  </div>
                  <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 5 })} deger={form.ozelAlan5} onChange={(v) => alan("ozelAlan5", v)} />
                </FormAlani.Bolum>

                <FormAlani.Bolum baslik={t("urun.bolum-diger")}>
                  <FormAlani.Onay etiket={t("urun.abonelik-aktif")} aciklama={t("urun.abonelik-aciklama")} deger={form.abonelikAktif} onChange={(v) => alan("abonelikAktif", v)} />
                  {duzenlemeModu && (
                    <FormAlani.Onay etiket={t("urun.aktif")} aciklama={t("urun.aktif-aciklama")} deger={form.aktifMi} onChange={(v) => alan("aktifMi", v)} />
                  )}
                </FormAlani.Bolum>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
