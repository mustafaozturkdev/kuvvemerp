/**
 * HesapFormDrawer — Ödeme Aracı ekleme/düzenleme drawer'ı.
 *
 * 3 bölüm:
 * 1. Temel Bilgiler (kod, ad, tip, grup, döviz, başlangıç bakiyesi, vs.)
 * 2. Tip Bazlı Ayrıntılar (dinamik — tipe göre banka/POS/KK/kasa alanları)
 * 3. Mağaza/Şube Kullanımı (çoklu seçim)
 */
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
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────

interface HesapGrupSecim {
  id: string;
  kod: string;
  ad: string;
  renk: string | null;
}

interface MagazaSecim {
  id: string;
  kod: string;
  ad: string;
  aktifMi: boolean;
}

interface FormVeri {
  kod: string;
  ad: string;
  tip: string;
  grupId: string;
  paraBirimiKod: string;
  baslangicBakiye: string;
  varsayilanMi: boolean;
  sira: string;
  negatifBakiyeIzin: boolean;
  limitTutar: string;

  // Mağazalar
  magazaIdler: string[];
  varsayilanMagazaId: string;

  // Banka alanları
  bankaAdi: string;
  sube: string;
  hesapNo: string;
  iban: string;
  swiftKod: string;

  // POS
  posSaglayici: string;
  posTerminalId: string;
  posKomisyonOrani: string;
  posBlokeliGun: string;
  posNetHesapId: string;
  posAltTipi: "fiziksel" | "sanal";
  cihazMarkasi: string;
  cihazSeriNo: string;
  posEntegrasyonTipi: "manuel" | "api";
  posKomisyonTipi: "yuzde" | "sabit";

  // Kredi kartı
  kartSonDortHane: string;
  ekstreKesimGunu: string;
  sonOdemeGunu: string;
  kartSahibi: string;

  // Kasa
  kasaMinBakiye: string;
  kasaMaxBakiye: string;
  sayimZorunlu: boolean;

  // Çek/Senet portföy
  otomatikUyari: boolean;
  vadeUyariGun: string;
}

const BOS_FORM: FormVeri = {
  kod: "",
  ad: "",
  tip: "kasa",
  grupId: "",
  paraBirimiKod: "TRY",
  baslangicBakiye: "0",
  varsayilanMi: false,
  sira: "0",
  negatifBakiyeIzin: false,
  limitTutar: "",
  magazaIdler: [],
  varsayilanMagazaId: "",
  bankaAdi: "",
  sube: "",
  hesapNo: "",
  iban: "",
  swiftKod: "",
  posSaglayici: "",
  posTerminalId: "",
  posKomisyonOrani: "0",
  posBlokeliGun: "0",
  posNetHesapId: "",
  posAltTipi: "sanal",
  cihazMarkasi: "",
  cihazSeriNo: "",
  posEntegrasyonTipi: "manuel",
  posKomisyonTipi: "yuzde",
  kartSonDortHane: "",
  ekstreKesimGunu: "",
  sonOdemeGunu: "",
  kartSahibi: "",
  kasaMinBakiye: "",
  kasaMaxBakiye: "",
  sayimZorunlu: false,
  otomatikUyari: true,
  vadeUyariGun: "7",
};

const TIPLER = [
  "kasa",
  "banka",
  "pos",
  "kredi_karti",
  "e_cuzdan",
  "cek_portfoy",
  "senet_portfoy",
  "pazaryeri_alacak",
  "diger",
] as const;

const DOVIZ_SECENEK = [
  { deger: "TRY", etiket: "TL (₺)" },
  { deger: "USD", etiket: "USD ($)" },
  { deger: "EUR", etiket: "EUR (€)" },
  { deger: "GBP", etiket: "GBP (£)" },
];

interface HesapFormDrawerOzellik {
  acik: boolean;
  kapat: () => void;
  hesapId?: string | null;
  gruplar: HesapGrupSecim[];
  onKaydet?: () => void;
}

export function HesapFormDrawer({
  acik,
  kapat,
  hesapId,
  gruplar,
  onKaydet,
}: HesapFormDrawerOzellik) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormVeri>({ ...BOS_FORM });
  const [magazalar, setMagazalar] = useState<MagazaSecim[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [kodDuzenle, setKodDuzenle] = useState(false);
  const duzenlemeModu = Boolean(hesapId);
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

  // Mağaza listesi yükle
  useEffect(() => {
    if (!acik) return;
    apiIstemci
      .get<MagazaSecim[]>("/magaza")
      .then((res) => setMagazalar(res.data.filter((m) => m.aktifMi)))
      .catch(() => {});
  }, [acik]);

  // Düzenleme: mevcut veriyi yükle
  useEffect(() => {
    if (!acik) return;
    hataTemizleHepsi();
    if (!hesapId) {
      const bosForm = { ...BOS_FORM };
      setForm(bosForm);
      baslangicAyarla(bosForm);
      return;
    }
    setYukleniyor(true);
    apiIstemci
      .get(`/hesap/${hesapId}`)
      .then((res) => {
        const h = res.data as Record<string, any>;
        const magazalar = h.magazalar ?? { magazaIdler: [], varsayilanMagazaId: null };
        const ayarlar = (h.ayarlar ?? {}) as Record<string, any>;

        const yeniForm: FormVeri = {
          kod: h.kod ?? "",
          ad: h.ad ?? "",
          tip: h.tip ?? "kasa",
          grupId: h.grupId?.toString() ?? "",
          paraBirimiKod: h.paraBirimiKod ?? "TRY",
          baslangicBakiye: String(h.baslangicBakiye ?? "0"),
          varsayilanMi: h.varsayilanMi ?? false,
          sira: String(h.sira ?? 0),
          negatifBakiyeIzin: h.negatifBakiyeIzin ?? false,
          limitTutar: h.limitTutar != null ? String(h.limitTutar) : "",
          magazaIdler: (magazalar.magazaIdler ?? []).map(String),
          varsayilanMagazaId: magazalar.varsayilanMagazaId?.toString() ?? "",
          bankaAdi: h.bankaAdi ?? "",
          sube: h.sube ?? "",
          hesapNo: h.hesapNo ?? "",
          iban: h.iban ?? "",
          swiftKod: h.swiftKod ?? "",
          posSaglayici: h.posSaglayici ?? "",
          posTerminalId: h.posTerminalId ?? "",
          posKomisyonOrani: String(h.posKomisyonOrani ?? "0"),
          posBlokeliGun: String(h.posBlokeliGun ?? 0),
          posNetHesapId: h.posNetHesapId?.toString() ?? "",
          posAltTipi: ayarlar.posAltTipi ?? "sanal",
          cihazMarkasi: ayarlar.cihazMarkasi ?? "",
          cihazSeriNo: ayarlar.cihazSeriNo ?? "",
          posEntegrasyonTipi: ayarlar.entegrasyonTipi ?? "manuel",
          posKomisyonTipi: ayarlar.komisyonTipi ?? "yuzde",
          kartSonDortHane: ayarlar.kartSonDortHane ?? "",
          ekstreKesimGunu: ayarlar.ekstreKesimGunu?.toString() ?? "",
          sonOdemeGunu: ayarlar.sonOdemeGunu?.toString() ?? "",
          kartSahibi: ayarlar.kartSahibi ?? "",
          kasaMinBakiye: ayarlar.minBakiye?.toString() ?? "",
          kasaMaxBakiye: ayarlar.maxBakiye?.toString() ?? "",
          sayimZorunlu: ayarlar.sayimZorunlu ?? false,
          otomatikUyari: ayarlar.otomatikUyari ?? true,
          vadeUyariGun: ayarlar.vadeUyariGun?.toString() ?? "7",
        };
        setForm(yeniForm);
        baslangicAyarla(yeniForm);
      })
      .catch(() => toast.hata(t("odeme-araci.yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, hesapId, t]);

  const alan = <K extends keyof FormVeri>(anahtar: K, deger: FormVeri[K]) => {
    setForm((f) => ({ ...f, [anahtar]: deger }));
    if (hatalar[anahtar as string]) hataTemizle(anahtar as string);
  };

  // Mağaza seç/kaldır
  const magazaToggle = (id: string) => {
    setForm((f) => {
      const mevcut = f.magazaIdler.includes(id);
      const yeni = mevcut ? f.magazaIdler.filter((x) => x !== id) : [...f.magazaIdler, id];
      let varsayilan = f.varsayilanMagazaId;
      if (mevcut && varsayilan === id) {
        // Silinen varsayılandı, ilkini varsayılan yap
        varsayilan = yeni[0] ?? "";
      }
      if (!mevcut && !varsayilan) {
        varsayilan = id;
      }
      return { ...f, magazaIdler: yeni, varsayilanMagazaId: varsayilan };
    });
  };

  const magazaHepsi = () => {
    const hepsi = magazalar.map((m) => m.id);
    setForm((f) => ({
      ...f,
      magazaIdler: hepsi,
      varsayilanMagazaId: f.varsayilanMagazaId || (hepsi[0] ?? ""),
    }));
  };

  const magazaHicbiri = () => {
    setForm((f) => ({ ...f, magazaIdler: [], varsayilanMagazaId: "" }));
  };

  const kaydet = async () => {
    // Inline validation
    hataTemizleHepsi();
    let gecerli = true;
    if (!form.ad.trim()) {
      hataAyarla("ad", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    // Tip bazlı zorunlu alanlar
    if (form.tip === "banka" && !form.iban.trim() && !form.hesapNo.trim()) {
      hataAyarla("iban", t("genel.zorunlu-alan"));
      hataAyarla("hesapNo", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    if (form.tip === "pos" && !form.posSaglayici.trim()) {
      hataAyarla("posSaglayici", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    if (form.tip === "kredi_karti" && !form.bankaAdi.trim()) {
      hataAyarla("bankaAdi", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    if (!gecerli) return;

    setKaydediyor(true);
    try {
      // Tip bazlı ayarlar JSON'ı hazırla
      let ayarlar: Record<string, unknown> | null = null;
      if (form.tip === "pos") {
        ayarlar = {
          posAltTipi: form.posAltTipi,
          cihazMarkasi: form.cihazMarkasi || null,
          cihazSeriNo: form.cihazSeriNo || null,
          entegrasyonTipi: form.posEntegrasyonTipi,
          komisyonTipi: form.posKomisyonTipi,
        };
      } else if (form.tip === "kredi_karti") {
        ayarlar = {
          kartSonDortHane: form.kartSonDortHane || null,
          ekstreKesimGunu: form.ekstreKesimGunu ? Number(form.ekstreKesimGunu) : null,
          sonOdemeGunu: form.sonOdemeGunu ? Number(form.sonOdemeGunu) : null,
          kartSahibi: form.kartSahibi || null,
        };
      } else if (form.tip === "kasa") {
        ayarlar = {
          minBakiye: form.kasaMinBakiye ? Number(form.kasaMinBakiye) : null,
          maxBakiye: form.kasaMaxBakiye ? Number(form.kasaMaxBakiye) : null,
          sayimZorunlu: form.sayimZorunlu,
        };
      } else if (form.tip === "cek_portfoy" || form.tip === "senet_portfoy") {
        ayarlar = {
          otomatikUyari: form.otomatikUyari,
          vadeUyariGun: Number(form.vadeUyariGun) || 7,
        };
      }

      const gonder: Record<string, unknown> = {
        kod: form.kod.trim(),
        ad: form.ad.trim(),
        tip: form.tip,
        grupId: form.grupId ? Number(form.grupId) : null,
        paraBirimiKod: form.paraBirimiKod,
        baslangicBakiye: Number(form.baslangicBakiye) || 0,
        varsayilanMi: form.varsayilanMi,
        sira: Number(form.sira) || 0,
        negatifBakiyeIzin: form.negatifBakiyeIzin,
        limitTutar: form.limitTutar ? Number(form.limitTutar) : null,
        magazalar: {
          magazaIdler: form.magazaIdler.map(Number),
          varsayilanMagazaId: form.varsayilanMagazaId ? Number(form.varsayilanMagazaId) : null,
        },
        ayarlar,

        // Banka
        bankaAdi: form.bankaAdi.trim() || null,
        sube: form.sube.trim() || null,
        hesapNo: form.hesapNo.trim() || null,
        iban: form.iban.trim() || null,
        swiftKod: form.swiftKod.trim() || null,

        // POS
        posSaglayici: form.posSaglayici.trim() || null,
        posTerminalId: form.posTerminalId.trim() || null,
        posKomisyonOrani: Number(form.posKomisyonOrani) || 0,
        posBlokeliGun: Number(form.posBlokeliGun) || 0,
        posNetHesapId: form.posNetHesapId ? Number(form.posNetHesapId) : null,
      };

      if (duzenlemeModu) {
        await apiIstemci.patch(`/hesap/${hesapId}`, gonder);
        toast.basarili(t("odeme-araci.guncellendi"));
      } else {
        await apiIstemci.post("/hesap", gonder);
        toast.basarili(t("odeme-araci.kayit-basarili"));
      }

      sifirla();
      kapat();
      onKaydet?.();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("genel.hata");
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={guvenlikapat} />
      <div ref={drawerRef} className="relative w-full max-w-xl bg-arkaplan shadow-xl flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <h2 className="text-lg font-semibold text-metin">
            {duzenlemeModu ? t("odeme-araci.duzenle") : t("odeme-araci.yeni-kayit")}
          </h2>
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
            <FormAlani.Bolum baslik={t("odeme-araci.temel-bilgiler")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Secim
                  etiket={t("odeme-araci.tip")}
                  zorunlu
                  deger={form.tip}
                  secenekler={TIPLER.map((x) => ({ deger: x, etiket: t(`odeme-araci-tip.${x}`) }))}
                  onChange={(v) => alan("tip", v)}
                  yardim={t(`odeme-araci-tip-tanim.${form.tip}`)}
                />
                <FormAlani.Secim
                  etiket={t("odeme-araci.doviz")}
                  zorunlu
                  deger={form.paraBirimiKod}
                  secenekler={DOVIZ_SECENEK}
                  onChange={(v) => alan("paraBirimiKod", v)}
                />
              </div>
              {duzenlemeModu && (
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <FormAlani.Metin
                    etiket={t("odeme-araci.kod")}
                    deger={form.kod}
                    onChange={(v) => alan("kod", v)}
                    placeholder={t("genel.otomatik")}
                    hata={hatalar.kod}
                    yardim={kodDuzenle ? t("genel.kod-yardim-duzenle") : t("genel.kod-yardim-kilitli")}
                    readOnly={!kodDuzenle}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setKodDuzenle((v) => !v)}
                    className="mb-0.5"
                  >
                    {kodDuzenle ? t("genel.kilitle") : t("genel.degistir")}
                  </Button>
                </div>
              )}
              <FormAlani.Metin
                etiket={t("odeme-araci.ad")}
                zorunlu
                deger={form.ad}
                onChange={(v) => alan("ad", v)}
                placeholder="Ana Kasa (TL)"
                hata={hatalar.ad}
              />
              <FormAlani.Secim
                etiket={t("odeme-araci.grup")}
                deger={form.grupId}
                secenekler={[
                  { deger: "", etiket: t("odeme-araci.grup-sec") },
                  ...gruplar.map((g) => ({ deger: g.id, etiket: g.ad })),
                ]}
                onChange={(v) => alan("grupId", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Sayi
                  etiket={t("odeme-araci.baslangic-bakiye")}
                  deger={form.baslangicBakiye}
                  onChange={(v) => alan("baslangicBakiye", v)}
                  step={0.01}
                  yardim="Hesabın açılış bakiyesi (devir)"
                />
                <FormAlani.Sayi
                  etiket={t("odeme-araci.siralama")}
                  deger={form.sira}
                  onChange={(v) => alan("sira", v)}
                />
              </div>
              <FormAlani.Onay
                etiket={t("odeme-araci.varsayilan-mi")}
                aciklama={t("odeme-araci.varsayilan-aciklama")}
                deger={form.varsayilanMi}
                onChange={(v) => alan("varsayilanMi", v)}
              />
              <FormAlani.Onay
                etiket={t("odeme-araci.negatif-bakiye-izin")}
                aciklama="İşlemler bakiyeyi negatife çekebilir (örn: kredi kartı, çek portföyü)"
                deger={form.negatifBakiyeIzin}
                onChange={(v) => alan("negatifBakiyeIzin", v)}
              />
              {(form.tip === "kredi_karti" || form.negatifBakiyeIzin) && (
                <FormAlani.Sayi
                  etiket={t("odeme-araci.limit-tutar")}
                  deger={form.limitTutar}
                  onChange={(v) => alan("limitTutar", v)}
                  step={0.01}
                  yardim="Negatif bakiye için maksimum limit"
                />
              )}
            </FormAlani.Bolum>

            {/* 2) Tip bazlı alanlar */}
            {(form.tip === "banka" || form.tip === "pos" || form.tip === "kredi_karti") && (
              <FormAlani.Bolum baslik={t("odeme-araci.banka-bilgileri")}>
                <FormAlani.Metin
                  etiket={t("odeme-araci.banka-adi")}
                  zorunlu={form.tip === "kredi_karti"}
                  deger={form.bankaAdi}
                  onChange={(v) => alan("bankaAdi", v)}
                  placeholder="Garanti BBVA"
                  hata={hatalar.bankaAdi}
                />
                {form.tip === "banka" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FormAlani.Metin etiket={t("odeme-araci.sube")} deger={form.sube} onChange={(v) => alan("sube", v)} />
                      <FormAlani.Metin
                        etiket={t("odeme-araci.hesap-no")}
                        deger={form.hesapNo}
                        onChange={(v) => alan("hesapNo", v)}
                        hata={hatalar.hesapNo}
                      />
                    </div>
                    <FormAlani.Metin
                      etiket={t("odeme-araci.iban")}
                      deger={form.iban}
                      onChange={(v) => alan("iban", v.toUpperCase())}
                      placeholder="TR00 0000 0000 0000 0000 0000 00"
                      maxLength={34}
                      hata={hatalar.iban}
                      yardim="TR ile başlayan 26 karakter (boşluksuz)"
                    />
                    <FormAlani.Metin
                      etiket={t("odeme-araci.swift-kod")}
                      deger={form.swiftKod}
                      onChange={(v) => alan("swiftKod", v.toUpperCase())}
                      yardim="Uluslararası transfer için (örn: TGBATRIS)"
                    />
                  </>
                )}
              </FormAlani.Bolum>
            )}

            {form.tip === "pos" && (
              <FormAlani.Bolum baslik={t("odeme-araci.pos-bilgileri")}>
                <FormAlani.Secim
                  etiket={t("odeme-araci.pos-alt-tipi")}
                  deger={form.posAltTipi}
                  secenekler={[
                    { deger: "fiziksel", etiket: t("odeme-araci.pos-alt-fiziksel") },
                    { deger: "sanal", etiket: t("odeme-araci.pos-alt-sanal") },
                  ]}
                  onChange={(v) => alan("posAltTipi", v as "fiziksel" | "sanal")}
                />
                <FormAlani.Metin
                  etiket={t("odeme-araci.pos-saglayici")}
                  zorunlu
                  deger={form.posSaglayici}
                  onChange={(v) => alan("posSaglayici", v)}
                  placeholder="iyzico, param, stripe..."
                  hata={hatalar.posSaglayici}
                  yardim="POS hizmeti veren firma"
                />
                {form.posAltTipi === "fiziksel" && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormAlani.Metin etiket={t("odeme-araci.pos-cihaz-markasi")} deger={form.cihazMarkasi} onChange={(v) => alan("cihazMarkasi", v)} placeholder="PAVO, INGENICO" />
                    <FormAlani.Metin etiket={t("odeme-araci.pos-cihaz-seri-no")} deger={form.cihazSeriNo} onChange={(v) => alan("cihazSeriNo", v)} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <FormAlani.Secim
                    etiket={t("odeme-araci.pos-entegrasyon-tipi")}
                    deger={form.posEntegrasyonTipi}
                    secenekler={[
                      { deger: "manuel", etiket: t("odeme-araci.pos-entegrasyon-manuel") },
                      { deger: "api", etiket: t("odeme-araci.pos-entegrasyon-api") },
                    ]}
                    onChange={(v) => alan("posEntegrasyonTipi", v as "manuel" | "api")}
                  />
                  <FormAlani.Metin etiket={t("odeme-araci.pos-terminal-id")} deger={form.posTerminalId} onChange={(v) => alan("posTerminalId", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.pos-komisyon-orani")}
                    deger={form.posKomisyonOrani}
                    onChange={(v) => alan("posKomisyonOrani", v)}
                    step={0.01}
                    min={0}
                    max={100}
                    yardim="Yüzde olarak (örn: 2.49)"
                  />
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.pos-blokeli-gun")}
                    deger={form.posBlokeliGun}
                    onChange={(v) => alan("posBlokeliGun", v)}
                    min={0}
                    yardim="Para hesaba düşene kadar geçen gün"
                  />
                </div>
              </FormAlani.Bolum>
            )}

            {form.tip === "kredi_karti" && (
              <FormAlani.Bolum baslik={t("odeme-araci.kredi-karti-bilgileri")}>
                <FormAlani.Metin
                  etiket={t("odeme-araci.kart-sahibi")}
                  deger={form.kartSahibi}
                  onChange={(v) => alan("kartSahibi", v)}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormAlani.Metin
                    etiket={t("odeme-araci.kart-son-dort-hane")}
                    deger={form.kartSonDortHane}
                    onChange={(v) => alan("kartSonDortHane", v.replace(/\D/g, "").slice(0, 4))}
                    placeholder="4567"
                    maxLength={4}
                    yardim="Güvenlik için sadece son 4 hane"
                  />
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.ekstre-kesim-gunu")}
                    deger={form.ekstreKesimGunu}
                    onChange={(v) => alan("ekstreKesimGunu", v)}
                    min={1}
                    max={31}
                  />
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.son-odeme-gunu")}
                    deger={form.sonOdemeGunu}
                    onChange={(v) => alan("sonOdemeGunu", v)}
                    min={1}
                    max={31}
                  />
                </div>
              </FormAlani.Bolum>
            )}

            {form.tip === "kasa" && (
              <FormAlani.Bolum baslik={t("odeme-araci.kasa-bilgileri")}>
                <div className="grid grid-cols-2 gap-3">
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.min-bakiye")}
                    deger={form.kasaMinBakiye}
                    onChange={(v) => alan("kasaMinBakiye", v)}
                    step={0.01}
                    yardim="Bu seviyenin altına düşerse uyarı"
                  />
                  <FormAlani.Sayi
                    etiket={t("odeme-araci.max-bakiye")}
                    deger={form.kasaMaxBakiye}
                    onChange={(v) => alan("kasaMaxBakiye", v)}
                    step={0.01}
                    yardim="Bu seviyenin üstüne çıkarsa uyarı"
                  />
                </div>
                <FormAlani.Onay
                  etiket={t("odeme-araci.sayim-zorunlu")}
                  aciklama="Gün sonu kasa sayımı zorunlu olsun"
                  deger={form.sayimZorunlu}
                  onChange={(v) => alan("sayimZorunlu", v)}
                />
              </FormAlani.Bolum>
            )}

            {(form.tip === "cek_portfoy" || form.tip === "senet_portfoy") && (
              <FormAlani.Bolum baslik={t("odeme-araci.cek-senet-ayarlari")}>
                <FormAlani.Onay
                  etiket={t("odeme-araci.otomatik-uyari")}
                  aciklama="Vade tarihine yaklaşan çek/senetler için bildirim"
                  deger={form.otomatikUyari}
                  onChange={(v) => alan("otomatikUyari", v)}
                />
                <FormAlani.Sayi
                  etiket={t("odeme-araci.vade-uyari-gun")}
                  deger={form.vadeUyariGun}
                  onChange={(v) => alan("vadeUyariGun", v)}
                  min={0}
                  yardim="Vadeden kaç gün önce uyarı verilsin"
                />
              </FormAlani.Bolum>
            )}

            {/* 3) Mağaza / Şube */}
            <FormAlani.Bolum baslik={t("odeme-araci.magazalar-baslik")} altyazi={t("odeme-araci.magazalar-aciklama")}>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={magazaHepsi}>
                  {t("odeme-araci.hepsini-sec")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={magazaHicbiri}>
                  {t("odeme-araci.hicbirini-sec")}
                </Button>
              </div>
              {magazalar.length === 0 ? (
                <p className="text-sm text-metin-pasif py-4 text-center">
                  {t("genel.kayit-bulunamadi")}
                </p>
              ) : (
                <div className="space-y-2">
                  {magazalar.map((m) => {
                    const secili = form.magazaIdler.includes(m.id);
                    const varsayilan = secili && form.varsayilanMagazaId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-3 transition-colors",
                          secili
                            ? "border-birincil bg-birincil-zemin/30"
                            : "border-kenarlik bg-arkaplan hover:bg-yuzey",
                        )}
                      >
                        <label className="flex items-center gap-3 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={secili}
                            onChange={() => magazaToggle(m.id)}
                            className="h-4 w-4 rounded border-kenarlik text-birincil focus:ring-birincil/30"
                          />
                          <div>
                            <div className="text-sm font-medium text-metin">{m.ad}</div>
                            <div className="text-xs font-mono text-metin-pasif">{m.kod}</div>
                          </div>
                        </label>
                        {secili && (
                          <label className="flex items-center gap-1.5 text-xs text-metin-ikinci cursor-pointer">
                            <input
                              type="radio"
                              name="varsayilanMagaza"
                              checked={varsayilan}
                              onChange={() => alan("varsayilanMagazaId", m.id)}
                              className="h-3.5 w-3.5"
                            />
                            {t("odeme-araci.varsayilan-magaza")}
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </FormAlani.Bolum>
          </div>
        )}

        {/* Alt butonlar */}
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

