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

// ── Tipler ────────────────────────────────────────────

interface CariGrupSecim {
  id: string;
  kod: string;
  ad: string;
}

interface CariFormVeri {
  kod: string;
  tip: string;
  kisiTipi: string;
  cariGrupId: string;
  ad: string;
  soyad: string;
  unvan: string;
  kisaAd: string;
  yetkiliAdSoyad: string;
  yetkiliGorev: string;
  vergiNo: string;
  vergiNoTipi: string;
  paraBirimiKod: string;
  iskontoOrani: string;
  vadeGun: string;
  sektor: string;
  kvkkOnayMi: boolean;
  pazarlamaEmailOnay: boolean;
  pazarlamaSmsOnay: boolean;
  // İlk iletişimler (drawer'dan kaydedilir, ayrı endpoint'e gider)
  cep: string;
  tel: string;
  email: string;
}

const BOS_FORM: CariFormVeri = {
  kod: "",
  tip: "musteri",
  kisiTipi: "tuzel",
  cariGrupId: "",
  ad: "",
  soyad: "",
  unvan: "",
  kisaAd: "",
  yetkiliAdSoyad: "",
  yetkiliGorev: "",
  vergiNo: "",
  vergiNoTipi: "VKN",
  paraBirimiKod: "TRY",
  iskontoOrani: "0",
  vadeGun: "0",
  sektor: "",
  kvkkOnayMi: false,
  pazarlamaEmailOnay: false,
  pazarlamaSmsOnay: false,
  cep: "",
  tel: "",
  email: "",
};

// Etiketler i18n key olarak saklanır, render sırasında t() ile çözülür
const TIP_SECENEKLER = [
  { deger: "musteri", etiketKey: "cari.tip-musteri" },
  { deger: "tedarikci", etiketKey: "cari.tip-tedarikci" },
  { deger: "her_ikisi", etiketKey: "cari.tip-her-ikisi" },
  { deger: "personel", etiketKey: "cari.tip-personel" },
  { deger: "diger", etiketKey: "cari.tip-diger" },
];

const KISI_TIPI_SECENEKLER = [
  { deger: "tuzel", etiketKey: "cari.kisi-tipi-tuzel" },
  { deger: "gercek", etiketKey: "cari.kisi-tipi-gercek" },
];

const VERGI_TIPI_SECENEKLER = [
  { deger: "VKN", etiket: "VKN" },
  { deger: "TCKN", etiket: "TCKN" },
  { deger: "YKN", etiket: "YKN" },
  { deger: "DIGER", etiket: "Diğer" },
];

const DOVIZ_SECENEKLER = [
  { deger: "TRY", etiket: "TL (₺)" },
  { deger: "USD", etiket: "USD ($)" },
  { deger: "EUR", etiket: "EUR (€)" },
];

// ── Props ────────────────────────────────────────────

interface CariFormDrawerOzellik {
  acik: boolean;
  kapat: () => void;
  cariId?: string | null;
  varsayilanTip?: string;
  onKaydet?: () => void;
}

export function CariFormDrawer({
  acik,
  kapat,
  cariId,
  varsayilanTip,
  onKaydet,
}: CariFormDrawerOzellik) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CariFormVeri>({ ...BOS_FORM });
  const [gruplar, setGruplar] = useState<CariGrupSecim[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const duzenlemeModu = Boolean(cariId);
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

  // Grupları yükle
  useEffect(() => {
    if (!acik) return;
    apiIstemci
      .get<CariGrupSecim[]>("/cari-grup", { params: { aktifMi: "true" } })
      .then((res) => setGruplar(res.data))
      .catch(() => {});
  }, [acik]);

  // Düzenleme: mevcut veriyi yükle
  useEffect(() => {
    if (!acik) return;
    hataTemizleHepsi();
    if (!cariId) {
      const bosForm = { ...BOS_FORM, tip: varsayilanTip ?? "musteri" };
      setForm(bosForm);
      baslangicAyarla(bosForm);
      return;
    }
    setYukleniyor(true);
    apiIstemci
      .get(`/cari/${cariId}`)
      .then((res) => {
        const c = res.data as Record<string, any>;
        // İletişim bilgilerini ayıkla
        const iletisimler = (c.iletisimler ?? []) as Array<{ tip: string; deger: string }>;
        const cep = iletisimler.find((i) => i.tip === "cep")?.deger ?? "";
        const tel = iletisimler.find((i) => i.tip === "telefon")?.deger ?? "";
        const email = iletisimler.find((i) => i.tip === "email")?.deger ?? "";

        const yeniForm: CariFormVeri = {
          kod: c.kod ?? "",
          tip: c.tip ?? "musteri",
          kisiTipi: c.kisiTipi ?? "tuzel",
          cariGrupId: c.cariGrupId?.toString() ?? "",
          ad: c.ad ?? "",
          soyad: c.soyad ?? "",
          unvan: c.unvan ?? "",
          kisaAd: c.kisaAd ?? "",
          yetkiliAdSoyad: c.yetkiliAdSoyad ?? "",
          yetkiliGorev: c.yetkiliGorev ?? "",
          vergiNo: c.vergiNo ?? "",
          vergiNoTipi: c.vergiNoTipi ?? "VKN",
          paraBirimiKod: c.paraBirimiKod ?? "TRY",
          iskontoOrani: c.iskontoOrani?.toString() ?? "0",
          vadeGun: c.vadeGun?.toString() ?? "0",
          sektor: c.sektor ?? "",
          kvkkOnayMi: c.kvkkOnayMi ?? false,
          pazarlamaEmailOnay: c.pazarlamaEmailOnay ?? false,
          pazarlamaSmsOnay: c.pazarlamaSmsOnay ?? false,
          cep,
          tel,
          email,
        };
        setForm(yeniForm);
        baslangicAyarla(yeniForm);
      })
      .catch(() => toast.hata(t("cari.bilgi-yuklenemedi")))
      .finally(() => setYukleniyor(false));
  }, [acik, cariId, varsayilanTip]);

  const alan = (anahtar: keyof CariFormVeri, deger: string | boolean) => {
    setForm((f) => ({ ...f, [anahtar]: deger }));
    if (hatalar[anahtar as string]) hataTemizle(anahtar as string);
  };

  const kaydet = async () => {
    // Inline validation
    hataTemizleHepsi();
    let gecerli = true;
    if (form.kisiTipi === "gercek") {
      if (!form.ad.trim()) {
        hataAyarla("ad", t("genel.zorunlu-alan"));
        gecerli = false;
      }
      if (!form.soyad.trim()) {
        hataAyarla("soyad", t("genel.zorunlu-alan"));
        gecerli = false;
      }
    }
    if (form.kisiTipi === "tuzel" && !form.unvan.trim()) {
      hataAyarla("unvan", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    // Email format kontrolü
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      hataAyarla("email", "Geçerli bir e-posta adresi girin");
      gecerli = false;
    }
    if (!gecerli) return;

    setKaydediyor(true);
    try {
      const gonder: Record<string, unknown> = {
        tip: form.tip,
        kisiTipi: form.kisiTipi,
        cariGrupId: form.cariGrupId ? Number(form.cariGrupId) : null,
        ad: form.ad.trim() || null,
        soyad: form.soyad.trim() || null,
        unvan: form.unvan.trim() || null,
        kisaAd: form.kisaAd.trim() || null,
        yetkiliAdSoyad: form.yetkiliAdSoyad.trim() || null,
        yetkiliGorev: form.yetkiliGorev.trim() || null,
        vergiNo: form.vergiNo.trim() || null,
        vergiNoTipi: form.vergiNo.trim() ? form.vergiNoTipi : null,
        paraBirimiKod: form.paraBirimiKod,
        iskontoOrani: Number(form.iskontoOrani) || 0,
        vadeGun: Number(form.vadeGun) || 0,
        sektor: form.sektor.trim() || null,
        kvkkOnayMi: form.kvkkOnayMi,
        pazarlamaEmailOnay: form.pazarlamaEmailOnay,
        pazarlamaSmsOnay: form.pazarlamaSmsOnay,
      };

      let yeniCariId: string;

      if (duzenlemeModu) {
        await apiIstemci.patch(`/cari/${cariId}`, gonder);
        yeniCariId = cariId!;
        toast.basarili(t("cari.guncellendi"));
      } else {
        const res = await apiIstemci.post("/cari", gonder);
        yeniCariId = (res.data as { id: string }).id;
        toast.basarili(t("cari.olusturuldu"));
      }

      // İletişim bilgilerini kaydet (yeni cari veya düzenlemede)
      const iletisimler = [
        { tip: "cep", deger: form.cep.trim() },
        { tip: "telefon", deger: form.tel.trim() },
        { tip: "email", deger: form.email.trim() },
      ].filter((i) => i.deger);

      if (!duzenlemeModu && iletisimler.length > 0) {
        await Promise.all(
          iletisimler.map((il) =>
            apiIstemci.post(`/cari/${yeniCariId}/iletisim`, {
              tip: il.tip,
              deger: il.deger,
              varsayilanMi: true,
            }),
          ),
        );
      }

      sifirla();
      kapat();
      onKaydet?.();
    } catch (err: any) {
      const mesaj = err?.response?.data?.mesaj ?? err?.response?.data?.message ?? t("cari.kayit-basarisiz");
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={guvenlikapat} />
      <div ref={drawerRef} className="relative w-full max-w-lg bg-arkaplan shadow-xl flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <h2 className="text-lg font-semibold text-metin">
            {duzenlemeModu ? t("cari.duzenle") : t("cari.yeni-kayit")}
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
            {/* Temel Bilgiler */}
            <FormAlani.Bolum baslik={t("cari.temel-bilgiler")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Secim
                  etiket={t("cari.tip")}
                  zorunlu
                  deger={form.tip}
                  secenekler={TIP_SECENEKLER.map((s) => ({ deger: s.deger, etiket: t(s.etiketKey) }))}
                  onChange={(v) => alan("tip", v)}
                  yardim="Müşteri = sizden alış yapan, Tedarikçi = size satış yapan"
                />
                <FormAlani.Secim
                  etiket={t("cari.kisi-tipi")}
                  zorunlu
                  deger={form.kisiTipi}
                  secenekler={KISI_TIPI_SECENEKLER.map((s) => ({ deger: s.deger, etiket: t(s.etiketKey) }))}
                  onChange={(v) => alan("kisiTipi", v)}
                />
              </div>
              {duzenlemeModu && (
                <FormAlani.Metin
                  etiket={t("cari.kod")}
                  deger={form.kod}
                  onChange={(v) => alan("kod", v)}
                  placeholder={t("genel.otomatik")}
                  hata={hatalar.kod}
                  yardim={t("genel.kod-yardim-kilitli")}
                  readOnly
                />
              )}
              {form.kisiTipi === "gercek" ? (
                <div className="grid grid-cols-2 gap-3">
                  <FormAlani.Metin
                    etiket={t("genel.ad")}
                    zorunlu
                    deger={form.ad}
                    onChange={(v) => alan("ad", v)}
                    hata={hatalar.ad}
                  />
                  <FormAlani.Metin
                    etiket={t("cari.kisa-ad")}
                    zorunlu
                    deger={form.soyad}
                    onChange={(v) => alan("soyad", v)}
                    hata={hatalar.soyad}
                  />
                </div>
              ) : (
                <FormAlani.Metin
                  etiket={t("cari.unvan")}
                  zorunlu
                  deger={form.unvan}
                  onChange={(v) => alan("unvan", v)}
                  placeholder="Acme Tekstil Ltd. Şti."
                  hata={hatalar.unvan}
                  yardim="Resmi ticari ünvan"
                />
              )}
              <FormAlani.Metin
                etiket={t("cari.kisa-ad")}
                deger={form.kisaAd}
                onChange={(v) => alan("kisaAd", v)}
                placeholder="Listelerde gösterilecek kısa ad"
                yardim="Uzun ünvanı kısa göstermek için"
              />
              <FormAlani.Secim
                etiket={t("cari.grup")}
                deger={form.cariGrupId}
                secenekler={[
                  { deger: "", etiket: t("cari.grup-sec") },
                  ...gruplar.map((g) => ({ deger: g.id, etiket: g.ad })),
                ]}
                onChange={(v) => alan("cariGrupId", v)}
              />
            </FormAlani.Bolum>

            {/* Yetkili Bilgileri */}
            {form.kisiTipi === "tuzel" && (
              <FormAlani.Bolum baslik={t("cari.yetkili")}>
                <FormAlani.Metin
                  etiket={t("cari.yetkili-ad-soyad")}
                  deger={form.yetkiliAdSoyad}
                  onChange={(v) => alan("yetkiliAdSoyad", v)}
                />
                <FormAlani.Metin
                  etiket={t("cari.yetkili-gorev")}
                  deger={form.yetkiliGorev}
                  onChange={(v) => alan("yetkiliGorev", v)}
                  placeholder="Genel Müdür, Muhasebe Sorumlusu..."
                />
              </FormAlani.Bolum>
            )}

            {/* Vergi Bilgileri */}
            <FormAlani.Bolum baslik={t("cari.vergi-bilgileri")}>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormAlani.Metin
                    etiket={form.vergiNoTipi === "TCKN" ? t("cari.tc-kimlik-no") : t("cari.vergi-no")}
                    deger={form.vergiNo}
                    onChange={(v) => alan("vergiNo", v.replace(/\D/g, ""))}
                    placeholder={form.vergiNoTipi === "TCKN" ? "11 haneli" : "10 haneli"}
                    maxLength={form.vergiNoTipi === "TCKN" ? 11 : 11}
                    yardim={form.vergiNoTipi === "TCKN" ? "T.C. Kimlik No (11 hane)" : "Vergi Kimlik No (10 hane)"}
                  />
                </div>
                <FormAlani.Secim
                  etiket="Tip"
                  deger={form.vergiNoTipi}
                  secenekler={VERGI_TIPI_SECENEKLER}
                  onChange={(v) => alan("vergiNoTipi", v)}
                />
              </div>
            </FormAlani.Bolum>

            {/* İletişim */}
            <FormAlani.Bolum baslik={t("cari.iletisim-bilgileri")}>
              <div className="grid grid-cols-2 gap-3">
                <FormAlani.Metin
                  etiket={t("cari.cep")}
                  deger={form.cep}
                  onChange={(v) => alan("cep", v)}
                  placeholder="05XX XXX XX XX"
                  type="tel"
                />
                <FormAlani.Metin
                  etiket={t("cari.telefon")}
                  deger={form.tel}
                  onChange={(v) => alan("tel", v)}
                  placeholder="0XXX XXX XX XX"
                  type="tel"
                />
              </div>
              <FormAlani.Eposta
                etiket={t("cari.email")}
                deger={form.email}
                onChange={(v) => alan("email", v)}
                placeholder="info@firma.com"
                hata={hatalar.email}
              />
            </FormAlani.Bolum>

            {/* Ticari Bilgiler */}
            <FormAlani.Bolum baslik={t("cari.ticari-bilgiler")}>
              <div className="grid grid-cols-3 gap-3">
                <FormAlani.Secim
                  etiket={t("cari.doviz")}
                  deger={form.paraBirimiKod}
                  secenekler={DOVIZ_SECENEKLER}
                  onChange={(v) => alan("paraBirimiKod", v)}
                  yardim="Bu cariyle yapılacak işlemlerin para birimi"
                />
                <FormAlani.Sayi
                  etiket={t("cari.iskonto")}
                  deger={form.iskontoOrani}
                  onChange={(v) => alan("iskontoOrani", v)}
                  step={0.01}
                  min={0}
                  max={100}
                  yardim="Otomatik uygulanacak iskonto yüzdesi"
                />
                <FormAlani.Sayi
                  etiket={t("cari.vade-gun")}
                  deger={form.vadeGun}
                  onChange={(v) => alan("vadeGun", v)}
                  min={0}
                  yardim="Standart ödeme vadesi (gün)"
                />
              </div>
              <FormAlani.Metin
                etiket={t("cari.sektor")}
                deger={form.sektor}
                onChange={(v) => alan("sektor", v)}
                placeholder="Tekstil, Gıda, İnşaat..."
              />
            </FormAlani.Bolum>

            {/* İzinler */}
            <FormAlani.Bolum baslik={t("cari.onay-izinler")} altyazi="KVKK ve pazarlama tercihleri">
              <FormAlani.Onay
                etiket={t("cari.kvkk-onay")}
                aciklama="Müşteri kişisel verisinin işlenmesi için onay verdi"
                deger={form.kvkkOnayMi}
                onChange={(v) => alan("kvkkOnayMi", v)}
              />
              <FormAlani.Onay
                etiket={t("cari.email-pazarlama")}
                deger={form.pazarlamaEmailOnay}
                onChange={(v) => alan("pazarlamaEmailOnay", v)}
              />
              <FormAlani.Onay
                etiket={t("cari.sms-pazarlama")}
                deger={form.pazarlamaSmsOnay}
                onChange={(v) => alan("pazarlamaSmsOnay", v)}
              />
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

