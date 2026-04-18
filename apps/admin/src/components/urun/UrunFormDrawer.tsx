import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { useFormHatalari } from "@/hooks/use-form-hatalari";
import { useOnay } from "@/components/ortak/OnayDialog";
import { FormAlani } from "@/components/ortak/FormAlani";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface Secim {
  id: string;
  ad: string;
  kod?: string;
  oran?: number | string;
}

interface UrunFormVeri {
  // Temel
  kod: string;
  ad: string;
  tip: string;
  kategoriId: string;
  markaId: string;
  markaModelId: string;
  anaBirimId: string;
  vergiOraniId: string;
  fiyatlarKdvDahilMi: boolean;
  // İsim
  faturaKalemAdi: string;
  takmaAdi: string;
  muhasebeKodu: string;
  gtipKodu: string;
  // Varyant / Barkod
  barkod: string;
  // Fiyatlandırma (default varyant)
  alisFiyati: string;
  sonAlisFiyati: string;
  piyasaFiyati: string;
  satilabilirSonFiyat: string;
  satisFiyati: string;
  karMarji: string;
  // Stok
  stokTakibi: boolean;
  seriNoTakibi: boolean;
  lotTakibi: boolean;
  kritikStok: string;
  minimumStok: string;
  // Fiziksel
  agirlikGr: string;
  enCm: string;
  boyCm: string;
  yukseklikCm: string;
  desi1: string;
  desi2: string;
  // Kanallar
  eticaretAktif: boolean;
  eticaretSatilikMi: boolean;
  b2bAktif: boolean;
  b2bSatilikMi: boolean;
  pazaryeriAktif: boolean;
  // Vitrin / Pazarlama
  vitrindeGoster: boolean;
  vitrinSira: string;
  yeniUrun: boolean;
  firsatUrun: boolean;
  ucretsizKargo: boolean;
  primVarYok: boolean;
  tahminiTeslimSuresiGun: string;
  garantiAy: string;
  // Sepet
  iskontoUygulanirMi: boolean;
  puanKazandirirMi: boolean;
  minimumSatisMiktar: string;
  sepetIndirimEticaret: string;
  sepetIndirimB2b: string;
  // İçerik (HTML)
  aciklama: string;
  kisaAciklama: string;
  icerikAciklama: string;
  kargoIadeMetin: string;
  // SEO
  seoUrl: string;
  seoBaslik: string;
  seoAciklama: string;
  seoAnahtarKelimeler: string; // virgulle ayrilir, submit'te split
  // Ek Bilgi
  mensheiUlkeKodu: string;
  uretici: string;
  uretimTarihi: string;
  dataSheetUrl: string;
  // Özel Alanlar (entegrasyon)
  ozelAlan1: string;
  ozelAlan2: string;
  ozelAlan3: string;
  ozelAlan4: string;
  ozelAlan5: string;
  // Abonelik
  abonelikAktif: boolean;
  aktifMi: boolean;
}

const BOS_FORM: UrunFormVeri = {
  kod: "",
  ad: "",
  tip: "fiziksel",
  kategoriId: "",
  markaId: "",
  markaModelId: "",
  anaBirimId: "",
  vergiOraniId: "",
  fiyatlarKdvDahilMi: true,
  faturaKalemAdi: "",
  takmaAdi: "",
  muhasebeKodu: "",
  gtipKodu: "",
  barkod: "",
  alisFiyati: "",
  sonAlisFiyati: "",
  piyasaFiyati: "",
  satilabilirSonFiyat: "",
  satisFiyati: "",
  karMarji: "",
  stokTakibi: true,
  seriNoTakibi: false,
  lotTakibi: false,
  kritikStok: "0",
  minimumStok: "0",
  agirlikGr: "",
  enCm: "",
  boyCm: "",
  yukseklikCm: "",
  desi1: "0",
  desi2: "0",
  eticaretAktif: false,
  eticaretSatilikMi: true,
  b2bAktif: false,
  b2bSatilikMi: true,
  pazaryeriAktif: false,
  vitrindeGoster: false,
  vitrinSira: "0",
  yeniUrun: false,
  firsatUrun: false,
  ucretsizKargo: false,
  primVarYok: false,
  tahminiTeslimSuresiGun: "0",
  garantiAy: "",
  iskontoUygulanirMi: true,
  puanKazandirirMi: true,
  minimumSatisMiktar: "1",
  sepetIndirimEticaret: "",
  sepetIndirimB2b: "",
  aciklama: "",
  kisaAciklama: "",
  icerikAciklama: "",
  kargoIadeMetin: "",
  seoUrl: "",
  seoBaslik: "",
  seoAciklama: "",
  seoAnahtarKelimeler: "",
  mensheiUlkeKodu: "",
  uretici: "",
  uretimTarihi: "",
  dataSheetUrl: "",
  ozelAlan1: "",
  ozelAlan2: "",
  ozelAlan3: "",
  ozelAlan4: "",
  ozelAlan5: "",
  abonelikAktif: false,
  aktifMi: true,
};

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface UrunFormDrawerOzellik {
  acik: boolean;
  kapat: () => void;
  urunId?: string | null;
  onKaydet?: () => void;
}

export function UrunFormDrawer({ acik, kapat, urunId, onKaydet }: UrunFormDrawerOzellik) {
  const { t } = useTranslation();
  const [form, setForm] = useState<UrunFormVeri>({ ...BOS_FORM });
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);

  const [kategoriler, setKategoriler] = useState<Secim[]>([]);
  const [markalar, setMarkalar] = useState<Secim[]>([]);
  const [markaModelleri, setMarkaModelleri] = useState<Secim[]>([]);
  const [birimler, setBirimler] = useState<Secim[]>([]);
  const [vergiOranlari, setVergiOranlari] = useState<Secim[]>([]);

  const duzenlemeModu = Boolean(urunId);
  const onay = useOnay();
  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
  const { hatalar, hataAyarla, hataTemizle, temizle: hataTemizleHepsi } = useFormHatalari();
  const { guvenlikapat, drawerRef } = useDrawerKapatma({
    acik,
    kapat,
    mesgul: kaydediyor || yukleniyor,
    dirty,
    onay,
  });

  // ─── Dropdown kaynakları ───
  useEffect(() => {
    if (!acik) return;
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
  }, [acik]);

  // Marka seçilince modelleri yükle
  useEffect(() => {
    if (!form.markaId) {
      setMarkaModelleri([]);
      return;
    }
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
    if (!acik) return;
    hataTemizleHepsi();
    if (!urunId) {
      setForm({ ...BOS_FORM });
      baslangicAyarla({ ...BOS_FORM });
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
          kod: asStr(u.kod),
          ad: asStr(u.ad),
          tip: asStr(u.tip) || "fiziksel",
          kategoriId: asStr(u.kategoriId),
          markaId: asStr(u.markaId),
          markaModelId: asStr(u.markaModelId),
          anaBirimId: asStr(u.anaBirimId),
          vergiOraniId: asStr(u.vergiOraniId),
          fiyatlarKdvDahilMi: Boolean(u.fiyatlarKdvDahilMi),
          faturaKalemAdi: asStr(u.faturaKalemAdi),
          takmaAdi: asStr(u.takmaAdi),
          muhasebeKodu: asStr(u.muhasebeKodu),
          gtipKodu: asStr(u.gtipKodu),
          barkod: asStr(v.barkod),
          alisFiyati: asStr(v.alisFiyati),
          sonAlisFiyati: asStr(v.sonAlisFiyati),
          piyasaFiyati: asStr(v.piyasaFiyati),
          satilabilirSonFiyat: asStr(v.satilabilirSonFiyat),
          satisFiyati: fl ? asStr(fl.fiyat) : "",
          karMarji: asStr(v.karMarji),
          stokTakibi: Boolean(u.stokTakibi),
          seriNoTakibi: Boolean(u.seriNoTakibi),
          lotTakibi: Boolean(u.lotTakibi),
          kritikStok: asStr(v.kritikStok) || "0",
          minimumStok: asStr(v.minimumStok) || "0",
          agirlikGr: asStr(v.agirlikGr),
          enCm: asStr(v.enCm),
          boyCm: asStr(v.boyCm),
          yukseklikCm: asStr(v.yukseklikCm),
          desi1: asStr(u.desi1) || "0",
          desi2: asStr(u.desi2) || "0",
          eticaretAktif: Boolean(u.eticaretAktif),
          eticaretSatilikMi: Boolean(u.eticaretSatilikMi),
          b2bAktif: Boolean(u.b2bAktif),
          b2bSatilikMi: Boolean(u.b2bSatilikMi),
          pazaryeriAktif: Boolean(u.pazaryeriAktif),
          vitrindeGoster: Boolean(u.vitrindeGoster),
          vitrinSira: asStr(u.vitrinSira) || "0",
          yeniUrun: Boolean(u.yeniUrun),
          firsatUrun: Boolean(u.firsatUrun),
          ucretsizKargo: Boolean(u.ucretsizKargo),
          primVarYok: Boolean(u.primVarYok),
          tahminiTeslimSuresiGun: asStr(u.tahminiTeslimSuresiGun) || "0",
          garantiAy: asStr(u.garantiAy),
          iskontoUygulanirMi: Boolean(u.iskontoUygulanirMi),
          puanKazandirirMi: Boolean(u.puanKazandirirMi),
          minimumSatisMiktar: asStr(u.minimumSatisMiktar) || "1",
          sepetIndirimEticaret: asStr(u.sepetIndirimEticaret),
          sepetIndirimB2b: asStr(u.sepetIndirimB2b),
          aciklama: asStr(u.aciklama),
          kisaAciklama: asStr(u.kisaAciklama),
          icerikAciklama: asStr(u.icerikAciklama),
          kargoIadeMetin: asStr(u.kargoIadeMetin),
          seoUrl: asStr(u.seoUrl),
          seoBaslik: asStr(u.seoBaslik),
          seoAciklama: asStr(u.seoAciklama),
          seoAnahtarKelimeler: Array.isArray(u.seoAnahtarKelimeler)
            ? u.seoAnahtarKelimeler.join(", ")
            : "",
          mensheiUlkeKodu: asStr(u.mensheiUlkeKodu),
          uretici: asStr(u.uretici),
          uretimTarihi: u.uretimTarihi ? String(u.uretimTarihi).substring(0, 10) : "",
          dataSheetUrl: asStr(u.dataSheetUrl),
          ozelAlan1: asStr(u.ozelAlan1),
          ozelAlan2: asStr(u.ozelAlan2),
          ozelAlan3: asStr(u.ozelAlan3),
          ozelAlan4: asStr(u.ozelAlan4),
          ozelAlan5: asStr(u.ozelAlan5),
          abonelikAktif: Boolean(u.abonelikAktif),
          aktifMi: Boolean(u.aktifMi),
        };
        setForm(yeni);
        baslangicAyarla(yeni);
      })
      .catch(() => toast.hata(t("urun.bilgi-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, urunId]);

  const alan = (anahtar: keyof UrunFormVeri, deger: string | boolean) => {
    setForm((f) => ({ ...f, [anahtar]: deger }));
    if (hatalar[anahtar as string]) hataTemizle(anahtar as string);
  };

  // ─── Kaydet ───
  const kaydet = async () => {
    hataTemizleHepsi();
    let gecerli = true;

    if (!form.ad.trim()) { hataAyarla("ad", t("genel.zorunlu-alan")); gecerli = false; }
    if (!form.anaBirimId) { hataAyarla("anaBirimId", t("genel.zorunlu-alan")); gecerli = false; }
    if (!form.vergiOraniId) { hataAyarla("vergiOraniId", t("genel.zorunlu-alan")); gecerli = false; }

    if (!gecerli) {
      toast.hata(t("genel.zorunlu-alanlari-doldurun"));
      return;
    }

    setKaydediyor(true);
    try {
      const sayi = (s: string) => (s.trim() === "" ? undefined : Number(s));
      const nStr = (s: string) => (s.trim() === "" ? null : s.trim());

      const gonder: Record<string, unknown> = {
        // Temel
        ad: form.ad.trim(),
        tip: form.tip,
        anaBirimId: Number(form.anaBirimId),
        vergiOraniId: Number(form.vergiOraniId),
        fiyatlarKdvDahilMi: form.fiyatlarKdvDahilMi,
        // Kod (boşsa otomatik — API tarafında)
        kod: form.kod.trim() || undefined,
        // Optional FK
        kategoriId: form.kategoriId ? Number(form.kategoriId) : null,
        markaId: form.markaId ? Number(form.markaId) : null,
        markaModelId: form.markaModelId ? Number(form.markaModelId) : null,
        // İsim
        faturaKalemAdi: nStr(form.faturaKalemAdi),
        takmaAdi: nStr(form.takmaAdi),
        muhasebeKodu: nStr(form.muhasebeKodu),
        gtipKodu: nStr(form.gtipKodu),
        // Varyant / Barkod
        barkod: nStr(form.barkod),
        // Fiyat
        alisFiyati: sayi(form.alisFiyati),
        sonAlisFiyati: sayi(form.sonAlisFiyati),
        piyasaFiyati: sayi(form.piyasaFiyati),
        satilabilirSonFiyat: sayi(form.satilabilirSonFiyat),
        satisFiyati: sayi(form.satisFiyati),
        karMarji: sayi(form.karMarji),
        // Stok
        stokTakibi: form.stokTakibi,
        seriNoTakibi: form.seriNoTakibi,
        lotTakibi: form.lotTakibi,
        kritikStok: sayi(form.kritikStok) ?? 0,
        minimumStok: sayi(form.minimumStok) ?? 0,
        // Fiziksel
        agirlikGr: sayi(form.agirlikGr),
        enCm: sayi(form.enCm),
        boyCm: sayi(form.boyCm),
        yukseklikCm: sayi(form.yukseklikCm),
        desi1: sayi(form.desi1) ?? 0,
        desi2: sayi(form.desi2) ?? 0,
        // Kanallar
        eticaretAktif: form.eticaretAktif,
        eticaretSatilikMi: form.eticaretSatilikMi,
        b2bAktif: form.b2bAktif,
        b2bSatilikMi: form.b2bSatilikMi,
        pazaryeriAktif: form.pazaryeriAktif,
        // Vitrin
        vitrindeGoster: form.vitrindeGoster,
        vitrinSira: sayi(form.vitrinSira) ?? 0,
        yeniUrun: form.yeniUrun,
        firsatUrun: form.firsatUrun,
        ucretsizKargo: form.ucretsizKargo,
        primVarYok: form.primVarYok,
        tahminiTeslimSuresiGun: sayi(form.tahminiTeslimSuresiGun) ?? 0,
        garantiAy: sayi(form.garantiAy),
        // Sepet
        iskontoUygulanirMi: form.iskontoUygulanirMi,
        puanKazandirirMi: form.puanKazandirirMi,
        minimumSatisMiktar: sayi(form.minimumSatisMiktar) ?? 1,
        sepetIndirimEticaret: sayi(form.sepetIndirimEticaret),
        sepetIndirimB2b: sayi(form.sepetIndirimB2b),
        // İçerik
        aciklama: nStr(form.aciklama),
        kisaAciklama: nStr(form.kisaAciklama),
        icerikAciklama: nStr(form.icerikAciklama),
        kargoIadeMetin: nStr(form.kargoIadeMetin),
        // SEO
        seoUrl: nStr(form.seoUrl),
        seoBaslik: nStr(form.seoBaslik),
        seoAciklama: nStr(form.seoAciklama),
        seoAnahtarKelimeler: form.seoAnahtarKelimeler
          ? form.seoAnahtarKelimeler.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        // Ek
        mensheiUlkeKodu: nStr(form.mensheiUlkeKodu),
        uretici: nStr(form.uretici),
        uretimTarihi: form.uretimTarihi || null,
        // Özel
        ozelAlan1: nStr(form.ozelAlan1),
        ozelAlan2: nStr(form.ozelAlan2),
        ozelAlan3: nStr(form.ozelAlan3),
        ozelAlan4: nStr(form.ozelAlan4),
        ozelAlan5: nStr(form.ozelAlan5),
        // Abonelik
        abonelikAktif: form.abonelikAktif,
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
      kapat();
      onKaydet?.();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("urun.kayit-basarisiz");
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  if (!acik) return null;

  // Seçenek listeleri
  const kategoriSec = [{ deger: "", etiket: t("urun.kategori-sec") }, ...kategoriler.map((k) => ({ deger: k.id, etiket: k.ad }))];
  const markaSec = [{ deger: "", etiket: t("urun.marka-sec") }, ...markalar.map((m) => ({ deger: m.id, etiket: m.ad }))];
  const markaModelSec = [{ deger: "", etiket: t("urun.model-sec") }, ...markaModelleri.map((m) => ({ deger: m.id, etiket: m.ad }))];
  const birimSec = birimler.map((b) => ({ deger: b.id, etiket: `${b.ad}${b.kod ? ` (${b.kod})` : ""}` }));
  const vergiSec = vergiOranlari.map((v) => ({ deger: v.id, etiket: `${v.ad} — %${Number(v.oran ?? 0).toFixed(0)}` }));
  const tipSec = [
    { deger: "fiziksel", etiket: t("urun.tip-fiziksel") },
    { deger: "dijital", etiket: t("urun.tip-dijital") },
    { deger: "hizmet", etiket: t("urun.tip-hizmet") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={guvenlikapat} />
      <div ref={drawerRef} className="relative w-full max-w-4xl bg-arkaplan shadow-xl flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-metin">
              {duzenlemeModu ? t("urun.duzenle") : t("urun.yeni-kayit")}
            </h2>
            {duzenlemeModu && form.kod && (
              <p className="text-xs text-metin-pasif font-mono">{form.kod}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={guvenlikapat} disabled={kaydediyor}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {yukleniyor ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1) Temel Bilgiler */}
            <FormAlani.Bolum baslik={t("urun.bolum-temel")}>
              <FormAlani.Metin
                etiket={t("urun.ad")}
                zorunlu
                deger={form.ad}
                onChange={(v) => alan("ad", v)}
                placeholder={t("urun.ad-placeholder")}
                hata={hatalar.ad}
              />
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Secim
                  etiket={t("urun.kategori")}
                  deger={form.kategoriId}
                  secenekler={kategoriSec}
                  onChange={(v) => alan("kategoriId", v)}
                />
                <FormAlani.Secim
                  etiket={t("urun.marka")}
                  deger={form.markaId}
                  secenekler={markaSec}
                  onChange={(v) => { alan("markaId", v); alan("markaModelId", ""); }}
                />
              </div>
              {markaModelleri.length > 0 && (
                <FormAlani.Secim
                  etiket={t("urun.model")}
                  deger={form.markaModelId}
                  secenekler={markaModelSec}
                  onChange={(v) => alan("markaModelId", v)}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Secim
                  etiket={t("urun.birim")}
                  zorunlu
                  deger={form.anaBirimId}
                  secenekler={[{ deger: "", etiket: t("urun.birim-sec") }, ...birimSec]}
                  onChange={(v) => alan("anaBirimId", v)}
                  hata={hatalar.anaBirimId}
                />
                <FormAlani.Secim
                  etiket={t("urun.vergi-orani")}
                  zorunlu
                  deger={form.vergiOraniId}
                  secenekler={[{ deger: "", etiket: t("urun.vergi-sec") }, ...vergiSec]}
                  onChange={(v) => alan("vergiOraniId", v)}
                  hata={hatalar.vergiOraniId}
                />
              </div>
              <FormAlani.Onay
                etiket={t("urun.fiyatlar-kdv-dahil")}
                aciklama={t("urun.fiyatlar-kdv-dahil-aciklama")}
                deger={form.fiyatlarKdvDahilMi}
                onChange={(v) => alan("fiyatlarKdvDahilMi", v)}
              />
            </FormAlani.Bolum>

            {/* 2) İsimlendirme */}
            <FormAlani.Bolum baslik={t("urun.bolum-isim-kod")} altyazi={t("urun.bolum-isim-altyazi")}>
              <FormAlani.Metin
                etiket={t("urun.fatura-kalem-adi")}
                deger={form.faturaKalemAdi}
                onChange={(v) => alan("faturaKalemAdi", v)}
                placeholder={form.ad}
                yardim={t("urun.fatura-kalem-yardim")}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Metin
                  etiket={t("urun.takma-ad")}
                  deger={form.takmaAdi}
                  onChange={(v) => alan("takmaAdi", v)}
                  yardim={t("urun.takma-ad-yardim")}
                />
                <FormAlani.Metin
                  etiket={t("urun.muhasebe-kodu")}
                  deger={form.muhasebeKodu}
                  onChange={(v) => alan("muhasebeKodu", v)}
                  placeholder="153.01.001"
                />
              </div>
              <FormAlani.Metin
                etiket={t("urun.gtip-kodu")}
                deger={form.gtipKodu}
                onChange={(v) => alan("gtipKodu", v)}
                placeholder="6203.12.00"
                yardim={t("urun.gtip-yardim")}
              />
            </FormAlani.Bolum>

            {/* 3) Varyant & Barkod (tek varyantli uruner) */}
            <FormAlani.Bolum baslik={t("urun.bolum-barkod")} altyazi={t("urun.bolum-barkod-altyazi")}>
              <FormAlani.Metin
                etiket={t("urun.barkod")}
                deger={form.barkod}
                onChange={(v) => alan("barkod", v)}
                placeholder="8690000000000"
                yardim={t("urun.barkod-yardim")}
              />
            </FormAlani.Bolum>

            {/* 4) Fiyatlandırma */}
            <FormAlani.Bolum baslik={t("urun.bolum-fiyat")} altyazi={t("urun.bolum-fiyat-altyazi")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi
                  etiket={t("urun.alis-fiyati")}
                  deger={form.alisFiyati}
                  onChange={(v) => alan("alisFiyati", v)}
                  step={0.01}
                  min={0}
                  placeholder="0.00"
                />
                <FormAlani.Sayi
                  etiket={t("urun.son-alis-fiyati")}
                  deger={form.sonAlisFiyati}
                  onChange={(v) => alan("sonAlisFiyati", v)}
                  step={0.01}
                  min={0}
                  yardim={t("urun.son-alis-yardim")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi
                  etiket={t("urun.piyasa-fiyati")}
                  deger={form.piyasaFiyati}
                  onChange={(v) => alan("piyasaFiyati", v)}
                  step={0.01}
                  min={0}
                  yardim={t("urun.piyasa-yardim")}
                />
                <FormAlani.Sayi
                  etiket={t("urun.satis-fiyati")}
                  deger={form.satisFiyati}
                  onChange={(v) => alan("satisFiyati", v)}
                  step={0.01}
                  min={0}
                  yardim={t("urun.satis-yardim")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi
                  etiket={t("urun.satilabilir-son-fiyat")}
                  deger={form.satilabilirSonFiyat}
                  onChange={(v) => alan("satilabilirSonFiyat", v)}
                  step={0.01}
                  min={0}
                  yardim={t("urun.satilabilir-son-fiyat-yardim")}
                />
                <FormAlani.Sayi
                  etiket={t("urun.kar-marji")}
                  deger={form.karMarji}
                  onChange={(v) => alan("karMarji", v)}
                  step={0.01}
                  placeholder="%"
                  yardim={t("urun.kar-marji-yardim")}
                />
              </div>
            </FormAlani.Bolum>

            {/* 5) Stok */}
            <FormAlani.Bolum baslik={t("urun.bolum-stok")}>
              <FormAlani.Onay
                etiket={t("urun.stok-takibi")}
                aciklama={t("urun.stok-takibi-aciklama")}
                deger={form.stokTakibi}
                onChange={(v) => alan("stokTakibi", v)}
              />
              {form.stokTakibi && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormAlani.Sayi
                      etiket={t("urun.kritik-stok")}
                      deger={form.kritikStok}
                      onChange={(v) => alan("kritikStok", v)}
                      step={1}
                      min={0}
                      yardim={t("urun.kritik-stok-yardim")}
                    />
                    <FormAlani.Sayi
                      etiket={t("urun.minimum-stok")}
                      deger={form.minimumStok}
                      onChange={(v) => alan("minimumStok", v)}
                      step={1}
                      min={0}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormAlani.Onay
                      etiket={t("urun.seri-no-takibi")}
                      deger={form.seriNoTakibi}
                      onChange={(v) => alan("seriNoTakibi", v)}
                    />
                    <FormAlani.Onay
                      etiket={t("urun.lot-takibi")}
                      deger={form.lotTakibi}
                      onChange={(v) => alan("lotTakibi", v)}
                    />
                  </div>
                </>
              )}
            </FormAlani.Bolum>

            {/* 6) Fiziksel */}
            <FormAlani.Bolum baslik={t("urun.bolum-fiziksel")} altyazi={t("urun.bolum-fiziksel-altyazi")}>
              <div className="grid grid-cols-4 gap-3">
                <FormAlani.Sayi etiket={t("urun.agirlik-gr")} deger={form.agirlikGr} onChange={(v) => alan("agirlikGr", v)} step={1} min={0} />
                <FormAlani.Sayi etiket={t("urun.en-cm")} deger={form.enCm} onChange={(v) => alan("enCm", v)} step={0.1} min={0} />
                <FormAlani.Sayi etiket={t("urun.boy-cm")} deger={form.boyCm} onChange={(v) => alan("boyCm", v)} step={0.1} min={0} />
                <FormAlani.Sayi etiket={t("urun.yukseklik-cm")} deger={form.yukseklikCm} onChange={(v) => alan("yukseklikCm", v)} step={0.1} min={0} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi etiket={t("urun.desi1")} deger={form.desi1} onChange={(v) => alan("desi1", v)} step={0.01} min={0} yardim={t("urun.desi-yardim")} />
                <FormAlani.Sayi etiket={t("urun.desi2")} deger={form.desi2} onChange={(v) => alan("desi2", v)} step={0.01} min={0} />
              </div>
            </FormAlani.Bolum>

            {/* 7) Kanallar */}
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

            {/* 8) Vitrin & Pazarlama */}
            <FormAlani.Bolum baslik={t("urun.bolum-vitrin")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Onay etiket={t("urun.vitrinde-goster")} deger={form.vitrindeGoster} onChange={(v) => alan("vitrindeGoster", v)} />
                <FormAlani.Sayi etiket={t("urun.vitrin-sira")} deger={form.vitrinSira} onChange={(v) => alan("vitrinSira", v)} step={1} min={0} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Onay etiket={t("urun.yeni-urun")} deger={form.yeniUrun} onChange={(v) => alan("yeniUrun", v)} />
                <FormAlani.Onay etiket={t("urun.firsat-urun")} deger={form.firsatUrun} onChange={(v) => alan("firsatUrun", v)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormAlani.Onay etiket={t("urun.ucretsiz-kargo")} deger={form.ucretsizKargo} onChange={(v) => alan("ucretsizKargo", v)} />
                <FormAlani.Onay etiket={t("urun.prim-var-yok")} aciklama={t("urun.prim-aciklama")} deger={form.primVarYok} onChange={(v) => alan("primVarYok", v)} />
                <FormAlani.Sayi etiket={t("urun.tahmini-teslim-gun")} deger={form.tahminiTeslimSuresiGun} onChange={(v) => alan("tahminiTeslimSuresiGun", v)} step={1} min={0} />
              </div>
              <FormAlani.Sayi etiket={t("urun.garanti-ay")} deger={form.garantiAy} onChange={(v) => alan("garantiAy", v)} step={1} min={0} placeholder={t("urun.garanti-yok")} />
            </FormAlani.Bolum>

            {/* 9) Sepet / Satış */}
            <FormAlani.Bolum baslik={t("urun.bolum-sepet")} altyazi={t("urun.bolum-sepet-altyazi")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Onay etiket={t("urun.iskonto-uygulanir")} deger={form.iskontoUygulanirMi} onChange={(v) => alan("iskontoUygulanirMi", v)} />
                <FormAlani.Onay etiket={t("urun.puan-kazandirir")} deger={form.puanKazandirirMi} onChange={(v) => alan("puanKazandirirMi", v)} />
              </div>
              <FormAlani.Sayi etiket={t("urun.minimum-satis-miktar")} deger={form.minimumSatisMiktar} onChange={(v) => alan("minimumSatisMiktar", v)} step={0.01} min={0.01} yardim={t("urun.minimum-satis-yardim")} />
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi etiket={t("urun.sepet-indirim-eticaret")} deger={form.sepetIndirimEticaret} onChange={(v) => alan("sepetIndirimEticaret", v)} step={0.01} min={0} max={100} placeholder="%" />
                <FormAlani.Sayi etiket={t("urun.sepet-indirim-b2b")} deger={form.sepetIndirimB2b} onChange={(v) => alan("sepetIndirimB2b", v)} step={0.01} min={0} max={100} placeholder="%" />
              </div>
            </FormAlani.Bolum>

            {/* 10) İçerik */}
            <FormAlani.Bolum baslik={t("urun.bolum-icerik")}>
              <FormAlani.Metin
                etiket={t("urun.kisa-aciklama")}
                deger={form.kisaAciklama}
                onChange={(v) => alan("kisaAciklama", v)}
                placeholder={t("urun.kisa-aciklama-placeholder")}
                maxLength={500}
              />
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

            {/* 11) SEO */}
            <FormAlani.Bolum baslik={t("urun.bolum-seo")} altyazi={t("urun.bolum-seo-altyazi")}>
              <FormAlani.Metin etiket={t("urun.seo-url")} deger={form.seoUrl} onChange={(v) => alan("seoUrl", v)} placeholder="urun-adi-slug" yardim={t("urun.seo-url-yardim")} />
              <FormAlani.Metin etiket={t("urun.seo-baslik")} deger={form.seoBaslik} onChange={(v) => alan("seoBaslik", v)} maxLength={255} />
              <FormAlani.UzunMetin etiket={t("urun.seo-aciklama")} deger={form.seoAciklama} onChange={(v) => alan("seoAciklama", v)} maxLength={500} />
              <FormAlani.Metin etiket={t("urun.seo-anahtar-kelimeler")} deger={form.seoAnahtarKelimeler} onChange={(v) => alan("seoAnahtarKelimeler", v)} placeholder={t("urun.seo-anahtar-placeholder")} yardim={t("urun.seo-anahtar-yardim")} />
            </FormAlani.Bolum>

            {/* 12) Ek Bilgi */}
            <FormAlani.Bolum baslik={t("urun.bolum-ek-bilgi")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Metin etiket={t("urun.menshei-ulke")} deger={form.mensheiUlkeKodu} onChange={(v) => alan("mensheiUlkeKodu", v.toUpperCase())} placeholder="TR" maxLength={2} yardim={t("urun.menshei-yardim")} />
                <FormAlani.Metin etiket={t("urun.uretici")} deger={form.uretici} onChange={(v) => alan("uretici", v)} />
              </div>
              <FormAlani.Metin etiket={t("urun.uretim-tarihi")} deger={form.uretimTarihi} onChange={(v) => alan("uretimTarihi", v)} type="date" />
              <FormAlani.Metin etiket={t("urun.data-sheet-url")} deger={form.dataSheetUrl} onChange={(v) => alan("dataSheetUrl", v)} placeholder="https://..." yardim={t("urun.data-sheet-yardim")} />
            </FormAlani.Bolum>

            {/* 13) Özel Alanlar */}
            <FormAlani.Bolum baslik={t("urun.bolum-ozel-alanlar")} altyazi={t("urun.bolum-ozel-altyazi")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 1 })} deger={form.ozelAlan1} onChange={(v) => alan("ozelAlan1", v)} />
                <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 2 })} deger={form.ozelAlan2} onChange={(v) => alan("ozelAlan2", v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 3 })} deger={form.ozelAlan3} onChange={(v) => alan("ozelAlan3", v)} />
                <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 4 })} deger={form.ozelAlan4} onChange={(v) => alan("ozelAlan4", v)} />
              </div>
              <FormAlani.Metin etiket={t("urun.ozel-alan", { n: 5 })} deger={form.ozelAlan5} onChange={(v) => alan("ozelAlan5", v)} />
            </FormAlani.Bolum>

            {/* 14) Abonelik + Durum */}
            <FormAlani.Bolum baslik={t("urun.bolum-diger")}>
              <FormAlani.Onay etiket={t("urun.abonelik-aktif")} aciklama={t("urun.abonelik-aciklama")} deger={form.abonelikAktif} onChange={(v) => alan("abonelikAktif", v)} />
              {duzenlemeModu && (
                <FormAlani.Onay etiket={t("urun.aktif")} aciklama={t("urun.aktif-aciklama")} deger={form.aktifMi} onChange={(v) => alan("aktifMi", v)} />
              )}
            </FormAlani.Bolum>
          </div>
        )}

        {/* Alt Butonlar */}
        <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
          <Button className="flex-1" onClick={kaydet} disabled={kaydediyor || yukleniyor}>
            {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
            {duzenlemeModu ? t("genel.guncelle") : t("genel.kaydet")}
          </Button>
          <Button variant="outline" onClick={guvenlikapat} disabled={kaydediyor}>
            {t("genel.iptal")}
          </Button>
        </div>
      </div>
    </div>
  );
}
