import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Building2,
  Save,
  Loader2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Image,
  Printer,
  Receipt,
} from "lucide-react";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationSelect } from "@/components/ui/location-select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ImageUpload } from "@/components/ui/image-upload";

export const Route = createFileRoute("/_yetkili/ayarlar/firma/sirket")({
  component: SirketBilgileriSayfa,
});

interface FirmaForm {
  // Temel
  firmaAdi: string;
  kisaAd: string;
  sahipAdi: string;
  // Iletisim
  email: string;
  bildirimEmail: string;
  telefon: string;
  cep: string;
  faks: string;
  // Konum
  il: string;
  ilce: string;
  adres: string;
  // Vergi
  vergiDairesi: string;
  vergiNo: string;
  // Gorsel
  firmaLogoUrl: string;
  imzaUrl: string;
  teklifLogoUrl: string;
  markaRengi: string;
  // Fis & Teklif
  fisGenisligi: number;
  fisMesaji: string;
  teklifAciklama: string;
  // Bolgesel
  varsayilanParaBirimi: string;
  zamanDilimi: string;
  ulkeKodu: string;
  tarihFormati: string;
  saatFormati: string;
}

const PARA_BIRIMLERI = [
  { kod: "TRY", etiket: "Turk Lirasi (TRY)" },
  { kod: "USD", etiket: "ABD Dolari (USD)" },
  { kod: "EUR", etiket: "Euro (EUR)" },
  { kod: "GBP", etiket: "Sterlin (GBP)" },
];

const ZAMAN_DILIMLERI = [
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "Asia/Dubai",
];

const TARIH_FORMATLARI = ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"];

function SirketBilgileriSayfa() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [form, setForm] = useState<FirmaForm>({
    firmaAdi: "",
    kisaAd: "",
    sahipAdi: "",
    email: "",
    bildirimEmail: "",
    telefon: "",
    cep: "",
    faks: "",
    il: "",
    ilce: "",
    adres: "",
    vergiDairesi: "",
    vergiNo: "",
    firmaLogoUrl: "",
    imzaUrl: "",
    teklifLogoUrl: "",
    markaRengi: "",
    fisGenisligi: 80,
    fisMesaji: "",
    teklifAciklama: "",
    varsayilanParaBirimi: "TRY",
    zamanDilimi: "Europe/Istanbul",
    ulkeKodu: "TR",
    tarihFormati: "DD.MM.YYYY",
    saatFormati: "HH:mm",
  });

  useEffect(() => {
    const yukle = async () => {
      try {
        const res = await apiIstemci.get("/ayar");
        const d = res.data as any;
        setForm({
          firmaAdi: d.firmaAdi ?? "",
          kisaAd: d.kisaAd ?? "",
          sahipAdi: d.sahipAdi ?? "",
          email: d.email ?? "",
          bildirimEmail: d.bildirimEmail ?? "",
          telefon: d.telefon ?? "",
          cep: d.cep ?? "",
          faks: d.faks ?? "",
          il: d.il ?? "",
          ilce: d.ilce ?? "",
          adres: d.adres ?? "",
          vergiDairesi: d.vergiDairesi ?? "",
          vergiNo: d.vergiNo ?? "",
          firmaLogoUrl: d.firmaLogoUrl ?? "",
          imzaUrl: d.imzaUrl ?? "",
          teklifLogoUrl: d.teklifLogoUrl ?? "",
          markaRengi: d.markaRengi ?? "",
          fisGenisligi: d.fisGenisligi ?? 80,
          fisMesaji: d.fisMesaji ?? "",
          teklifAciklama: d.teklifAciklama ?? "",
          varsayilanParaBirimi: d.varsayilanParaBirimi ?? "TRY",
          zamanDilimi: d.zamanDilimi ?? "Europe/Istanbul",
          ulkeKodu: d.ulkeKodu ?? "TR",
          tarihFormati: d.tarihFormati ?? "DD.MM.YYYY",
          saatFormati: d.saatFormati ?? "HH:mm",
        });
      } catch {
        toast.hata("Sistem ayarlari yuklenemedi");
      }
      setYukleniyor(false);
    };
    void yukle();
  }, []);

  const kaydet = async () => {
    setKaydediyor(true);
    try {
      await apiIstemci.put("/ayar", {
        firmaAdi: form.firmaAdi,
        kisaAd: form.kisaAd || null,
        sahipAdi: form.sahipAdi || null,
        email: form.email || null,
        bildirimEmail: form.bildirimEmail || null,
        telefon: form.telefon || null,
        cep: form.cep || null,
        faks: form.faks || null,
        il: form.il || null,
        ilce: form.ilce || null,
        adres: form.adres || null,
        vergiDairesi: form.vergiDairesi || null,
        vergiNo: form.vergiNo || null,
        firmaLogoUrl: form.firmaLogoUrl || null,
        imzaUrl: form.imzaUrl || null,
        teklifLogoUrl: form.teklifLogoUrl || null,
        markaRengi: form.markaRengi || null,
        fisGenisligi: form.fisGenisligi || null,
        fisMesaji: form.fisMesaji || null,
        teklifAciklama: form.teklifAciklama || null,
        varsayilanParaBirimi: form.varsayilanParaBirimi,
        zamanDilimi: form.zamanDilimi,
        ulkeKodu: form.ulkeKodu,
        tarihFormati: form.tarihFormati,
        saatFormati: form.saatFormati,
      });
      toast.basarili("Sirket bilgileri kaydedildi");
    } catch {
      toast.hata("Kayit basarisiz");
    }
    setKaydediyor(false);
  };

  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
      </div>
    );
  }

  const selectClass = cn(
    "w-full h-10 rounded-lg border border-kenarlik bg-yuzey px-3 text-sm text-metin",
    "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil"
  );

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            Sirket Bilgileri
          </h1>
          <p className="text-sm text-metin-ikinci">
            Firma bilgileri, iletisim, vergi, gorsel ve belge ayarlari
          </p>
        </div>
        <Button onClick={kaydet} disabled={kaydediyor}>
          {kaydediyor ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Kaydet
        </Button>
      </header>

      {/* 1. Firma Bilgileri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-metin-pasif" />
            Firma Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Firma Adi / Unvan</label>
              <Input value={form.firmaAdi} onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })} placeholder="Kuvvem Yazilim Ltd. Sti." />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Kisa Ad</label>
              <Input value={form.kisaAd} onChange={(e) => setForm({ ...form, kisaAd: e.target.value })} placeholder="Kuvvem" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-metin mb-1 block">Firma Sahibi Adi Soyadi</label>
            <Input value={form.sahipAdi} onChange={(e) => setForm({ ...form, sahipAdi: e.target.value })} placeholder="Mustafa Ozturk" />
          </div>
        </CardContent>
      </Card>

      {/* 2. Iletisim */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-metin-pasif" />
            Iletisim
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">E-posta</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@firma.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Bildirim E-posta</label>
              <Input type="email" value={form.bildirimEmail} onChange={(e) => setForm({ ...form, bildirimEmail: e.target.value })} placeholder="bildirim@firma.com" />
              <p className="text-xs text-metin-pasif mt-0.5">Siparis, fatura vb. bildirimlerin gidecegi adres</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Telefon</label>
              <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="0212 XXX XX XX" />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Cep Telefonu</label>
              <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} placeholder="05XX XXX XX XX" />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Faks</label>
              <Input value={form.faks} onChange={(e) => setForm({ ...form, faks: e.target.value })} placeholder="0212 XXX XX XX" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Adres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-metin-pasif" />
            Adres
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LocationSelect
            il={form.il}
            ilce={form.ilce}
            onIlChange={(il) => setForm({ ...form, il, ilce: "" })}
            onIlceChange={(ilce) => setForm({ ...form, ilce })}
          />
          <div>
            <label className="text-sm font-medium text-metin mb-1 block">Acik Adres</label>
            <textarea
              value={form.adres}
              onChange={(e) => setForm({ ...form, adres: e.target.value })}
              placeholder="Mahalle, cadde, sokak, no..."
              rows={2}
              className={cn(
                "w-full rounded-lg border border-kenarlik bg-yuzey px-3 py-2 text-sm text-metin",
                "placeholder:text-metin-pasif focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil resize-none"
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Vergi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-metin-pasif" />
            Vergi Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Vergi Dairesi</label>
              <Input value={form.vergiDairesi} onChange={(e) => setForm({ ...form, vergiDairesi: e.target.value })} placeholder="Kadikoy V.D." />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Vergi Numarasi</label>
              <Input value={form.vergiNo} onChange={(e) => setForm({ ...form, vergiNo: e.target.value })} placeholder="1234567890" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Gorsel Kimlik */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5 text-metin-pasif" />
            Gorsel Kimlik
          </CardTitle>
          <CardDescription>Logo, imza ve marka rengi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <ImageUpload
              value={form.firmaLogoUrl}
              onChange={(url) => setForm({ ...form, firmaLogoUrl: url ?? "" })}
              endpoint="/upload/logo"
              label="Firma Logo"
              placeholder="Logo yukle (max 800px)"
              maxWidth={160}
              maxHeight={100}
            />
            <ImageUpload
              value={form.imzaUrl}
              onChange={(url) => setForm({ ...form, imzaUrl: url ?? "" })}
              endpoint="/upload/imza"
              label="Imza"
              placeholder="Imza yukle (max 400x200)"
              maxWidth={160}
              maxHeight={80}
            />
            <ImageUpload
              value={form.teklifLogoUrl}
              onChange={(url) => setForm({ ...form, teklifLogoUrl: url ?? "" })}
              endpoint="/upload/logo"
              label="Teklif Logo"
              placeholder="Teklif logosu yukle"
              maxWidth={160}
              maxHeight={100}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-metin mb-1 block">Marka Rengi</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.markaRengi || "#6366f1"}
                onChange={(e) => setForm({ ...form, markaRengi: e.target.value })}
                className="h-10 w-10 rounded-lg border border-kenarlik cursor-pointer"
              />
              <Input value={form.markaRengi} onChange={(e) => setForm({ ...form, markaRengi: e.target.value })} placeholder="#6366f1" className="max-w-[140px]" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. Fis Ayarlari */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-metin-pasif" />
            Fis Ayarlari
          </CardTitle>
          <CardDescription>Termal yazici fis genisligi ve alt mesaj</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-metin mb-1 block">
              Fis Genisligi (mm)
            </label>
            <Input
              type="number"
              min={40}
              max={120}
              value={form.fisGenisligi}
              onChange={(e) => setForm({ ...form, fisGenisligi: parseInt(e.target.value) || 80 })}
              className="max-w-[120px]"
            />
            <p className="text-xs text-metin-pasif mt-0.5">Termal yazici kagit genisligi (40-120 mm)</p>
          </div>
          <div>
            <label className="text-sm font-medium text-metin mb-2 block">
              Fis Alt Mesaji
            </label>
            <RichTextEditor
              value={form.fisMesaji}
              onChange={(html) => setForm({ ...form, fisMesaji: html })}
              placeholder="Fis alt kismine yazilacak mesaj (iade kosullari, tesekkur notu vb.)..."
              minHeight="120px"
            />
          </div>
        </CardContent>
      </Card>

      {/* 7. Teklif Ayarlari */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-metin-pasif" />
            Teklif Ayarlari
          </CardTitle>
          <CardDescription>Teklif belgesi alt aciklama metni</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium text-metin mb-2 block">
              Teklif Aciklama / Kosullar
            </label>
            <RichTextEditor
              value={form.teklifAciklama}
              onChange={(html) => setForm({ ...form, teklifAciklama: html })}
              placeholder="Teklif belgesinin alt kismina yazilacak aciklama, odeme kosullari, teslimat sartlari vb..."
              minHeight="180px"
            />
          </div>
        </CardContent>
      </Card>

      {/* 8. Bolgesel Ayarlar */}
      <Card>
        <CardHeader>
          <CardTitle>Bolgesel Ayarlar</CardTitle>
          <CardDescription>Para birimi, saat dilimi ve tarih formati</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Para Birimi</label>
              <select value={form.varsayilanParaBirimi} onChange={(e) => setForm({ ...form, varsayilanParaBirimi: e.target.value })} className={selectClass}>
                {PARA_BIRIMLERI.map((p) => (<option key={p.kod} value={p.kod}>{p.etiket}</option>))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Ulke Kodu</label>
              <Input value={form.ulkeKodu} onChange={(e) => setForm({ ...form, ulkeKodu: e.target.value.toUpperCase() })} placeholder="TR" maxLength={2} className="max-w-[100px]" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Zaman Dilimi</label>
              <select value={form.zamanDilimi} onChange={(e) => setForm({ ...form, zamanDilimi: e.target.value })} className={selectClass}>
                {ZAMAN_DILIMLERI.map((z) => (<option key={z} value={z}>{z}</option>))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Tarih Formati</label>
              <select value={form.tarihFormati} onChange={(e) => setForm({ ...form, tarihFormati: e.target.value })} className={selectClass}>
                {TARIH_FORMATLARI.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-metin mb-1 block">Saat Formati</label>
            <div className="flex gap-3">
              {["HH:mm", "hh:mm A"].map((sf) => (
                <Button key={sf} variant={form.saatFormati === sf ? "default" : "outline"} size="sm" onClick={() => setForm({ ...form, saatFormati: sf })}>
                  {sf === "HH:mm" ? "24 Saat" : "12 Saat"}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
