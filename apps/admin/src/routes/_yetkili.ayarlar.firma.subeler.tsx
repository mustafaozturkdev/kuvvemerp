import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Store,
  MapPin,
  Phone,
  Mail,
  X,
  Loader2,
  Instagram,
  FileText,
  Globe,
} from "lucide-react";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationSelect } from "@/components/ui/location-select";

export const Route = createFileRoute("/_yetkili/ayarlar/firma/subeler")({
  component: SubelerSayfa,
});

interface Magaza {
  id: string;
  publicId: string;
  kod: string;
  ad: string;
  tip: string;
  ilAdi: string | null;
  ilceAdi: string | null;
  adres: string | null;
  telefon: string | null;
  cep: string | null;
  email: string | null;
  ip: string | null;
  instagram: string | null;
  eFaturaOnEk: string | null;
  eArsivOnEk: string | null;
  paraBirimiKod: string;
  aktifMi: boolean;
  perakendeSatis: boolean;
  eticaretSatis: boolean;
  pazaryeriSatis: boolean;
  b2bSatis: boolean;
  _count?: { kullanicilar: number };
}

const SUBE_TIPLERI = [
  { kod: "merkez", etiket: "Merkez" },
  { kod: "sube", etiket: "Sube" },
  { kod: "depo", etiket: "Depo" },
  { kod: "sanal", etiket: "Sanal Magaza" },
];

function SubelerSayfa() {
  const [subeler, setSubeler] = useState<Magaza[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliSube, setSeciliSube] = useState<Magaza | null>(null);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<Magaza[]>("/magaza");
      setSubeler(res.data);
    } catch {
      toast.hata("Subeler yuklenemedi");
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const filtrelenmis = subeler.filter((s) => {
    const q = arama.toLowerCase();
    return (
      s.ad.toLowerCase().includes(q) ||
      s.kod.toLowerCase().includes(q) ||
      (s.adres ?? "").toLowerCase().includes(q) ||
      (s.ilAdi ?? "").toLowerCase().includes(q) ||
      (s.ilceAdi ?? "").toLowerCase().includes(q)
    );
  });

  const tipEtiket = (tip: string) =>
    SUBE_TIPLERI.find((t) => t.kod === tip)?.etiket ?? tip;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            Subeler
          </h1>
          <p className="text-sm text-metin-ikinci">
            Sube, depo ve sanal magazalarinizi yonetin
          </p>
        </div>
        <Button
          onClick={() => {
            setSeciliSube(null);
            setDrawerAcik(true);
          }}
        >
          <Plus className="h-4 w-4" /> Yeni Sube
        </Button>
      </header>

      {/* Arama */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
        <Input
          placeholder="Sube adi, kodu, il veya ilce ara..."
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Kartlar */}
      {yukleniyor ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
        </div>
      ) : filtrelenmis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-metin-ikinci">
            <Store className="h-10 w-10 text-metin-pasif" />
            <p>{arama ? "Sonuc bulunamadi" : "Henuz sube yok"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrelenmis.map((s) => (
            <Card
              key={s.publicId}
              className={cn(
                "relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-birincil/30",
                !s.aktifMi && "opacity-60"
              )}
              onClick={() => {
                setSeciliSube(s);
                setDrawerAcik(true);
              }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        s.aktifMi
                          ? "bg-birincil-zemin text-birincil"
                          : "bg-yuzey-yukseltilmis text-metin-pasif"
                      )}
                    >
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-metin">{s.ad}</p>
                      <code className="text-xs text-metin-ikinci">{s.kod}</code>
                    </div>
                  </div>
                  <Badge
                    variant={s.aktifMi ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {s.aktifMi ? "Aktif" : "Pasif"}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-sm text-metin-ikinci">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs">
                      {tipEtiket(s.tip)}
                    </Badge>
                    {s.perakendeSatis && (
                      <Badge variant="outline" className="text-xs">Perakende</Badge>
                    )}
                    {s.eticaretSatis && (
                      <Badge variant="outline" className="text-xs">E-Ticaret</Badge>
                    )}
                    {s.pazaryeriSatis && (
                      <Badge variant="outline" className="text-xs">Pazaryeri</Badge>
                    )}
                    {s.b2bSatis && (
                      <Badge variant="outline" className="text-xs">B2B</Badge>
                    )}
                  </div>
                  {(s.ilAdi || s.ilceAdi) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {[s.ilAdi, s.ilceAdi].filter(Boolean).join(" / ")}
                      </span>
                    </div>
                  )}
                  {s.adres && (
                    <div className="flex items-start gap-2">
                      <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{s.adres}</span>
                    </div>
                  )}
                  {(s.telefon || s.cep) && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{[s.telefon, s.cep].filter(Boolean).join(" | ")}</span>
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span>{s.email}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerAcik && (
        <SubeDrawer
          sube={seciliSube}
          onKapat={() => setDrawerAcik(false)}
          onKaydet={() => {
            setDrawerAcik(false);
            void yukle();
          }}
        />
      )}
    </div>
  );
}

// ─── Şube Ekle/Düzenle Drawer — PHP Parity ───

function SubeDrawer({
  sube,
  onKapat,
  onKaydet,
}: {
  sube: Magaza | null;
  onKapat: () => void;
  onKaydet: () => void;
}) {
  const duzenlemeMi = !!sube;

  const [form, setForm] = useState({
    kod: sube?.kod ?? "",
    ad: sube?.ad ?? "",
    tip: sube?.tip ?? "sube",
    ilAdi: sube?.ilAdi ?? "",
    ilceAdi: sube?.ilceAdi ?? "",
    adres: sube?.adres ?? "",
    telefon: sube?.telefon ?? "",
    cep: sube?.cep ?? "",
    email: sube?.email ?? "",
    ip: sube?.ip ?? "",
    instagram: sube?.instagram ?? "",
    eFaturaOnEk: sube?.eFaturaOnEk ?? "",
    eArsivOnEk: sube?.eArsivOnEk ?? "",
    paraBirimiKod: sube?.paraBirimiKod ?? "TRY",
  });
  const [kaydediyor, setKaydediyor] = useState(false);

  const gonder = async () => {
    if (!form.kod || !form.ad) {
      toast.hata("Sube kodu ve adi zorunludur");
      return;
    }
    setKaydediyor(true);
    try {
      const veri = {
        kod: form.kod,
        ad: form.ad,
        tip: form.tip,
        ilAdi: form.ilAdi || null,
        ilceAdi: form.ilceAdi || null,
        adres: form.adres || null,
        telefon: form.telefon || null,
        cep: form.cep || null,
        email: form.email || null,
        ip: form.ip || null,
        instagram: form.instagram || null,
        eFaturaOnEk: form.eFaturaOnEk || null,
        eArsivOnEk: form.eArsivOnEk || null,
        paraBirimiKod: form.paraBirimiKod,
      };
      if (duzenlemeMi) {
        await apiIstemci.patch(`/magaza/${sube!.id}`, veri);
        toast.basarili("Sube guncellendi");
      } else {
        await apiIstemci.post("/magaza", veri);
        toast.basarili("Sube olusturuldu");
      }
      onKaydet();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? "Kayit basarisiz";
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onKapat}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg border-l border-kenarlik bg-yuzey shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <h2 className="text-lg font-semibold text-metin">
            {duzenlemeMi ? "Sube Duzenle" : "Yeni Sube"}
          </h2>
          <button
            onClick={onKapat}
            className="p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
          >
            <X className="h-5 w-5 text-metin-ikinci" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Temel Bilgiler */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
              Temel Bilgiler
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Sube Kodu <span className="text-tehlike">*</span>
                </label>
                <Input
                  value={form.kod}
                  onChange={(e) => setForm({ ...form, kod: e.target.value })}
                  placeholder="IST01"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Tip
                </label>
                <select
                  value={form.tip}
                  onChange={(e) => setForm({ ...form, tip: e.target.value })}
                  className={cn(
                    "w-full h-10 rounded-lg border border-kenarlik bg-yuzey px-3 text-sm text-metin",
                    "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil"
                  )}
                >
                  {SUBE_TIPLERI.map((t) => (
                    <option key={t.kod} value={t.kod}>
                      {t.etiket}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">
                Sube Adi <span className="text-tehlike">*</span>
              </label>
              <Input
                value={form.ad}
                onChange={(e) => setForm({ ...form, ad: e.target.value })}
                placeholder="Istanbul Merkez"
              />
            </div>
          </fieldset>

          {/* Konum */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
              Konum
            </legend>
            <LocationSelect
              il={form.ilAdi}
              ilce={form.ilceAdi}
              onIlChange={(il) => setForm({ ...form, ilAdi: il, ilceAdi: "" })}
              onIlceChange={(ilce) => setForm({ ...form, ilceAdi: ilce })}
            />
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">
                Adres
              </label>
              <textarea
                value={form.adres}
                onChange={(e) => setForm({ ...form, adres: e.target.value })}
                placeholder="Acik adres..."
                rows={2}
                className={cn(
                  "w-full rounded-lg border border-kenarlik bg-yuzey px-3 py-2 text-sm text-metin",
                  "placeholder:text-metin-pasif focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil",
                  "resize-none"
                )}
              />
            </div>
          </fieldset>

          {/* Iletisim */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
              Iletisim
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Telefon
                </label>
                <Input
                  value={form.telefon}
                  onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                  placeholder="0212 XXX XX XX"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Cep Telefonu
                </label>
                <Input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  placeholder="05XX XXX XX XX"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  E-posta
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="sube@firma.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Instagram
                </label>
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-metin-pasif" />
                  <Input
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    placeholder="@magaza"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Teknik Ayarlar */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
              Teknik Ayarlar
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  IP Adresi
                </label>
                <Input
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  placeholder="192.168.1.x"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  Para Birimi
                </label>
                <select
                  value={form.paraBirimiKod}
                  onChange={(e) => setForm({ ...form, paraBirimiKod: e.target.value })}
                  className={cn(
                    "w-full h-10 rounded-lg border border-kenarlik bg-yuzey px-3 text-sm text-metin",
                    "focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil"
                  )}
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  E-Fatura On Ek
                </label>
                <Input
                  value={form.eFaturaOnEk}
                  onChange={(e) =>
                    setForm({ ...form, eFaturaOnEk: e.target.value.toUpperCase().slice(0, 3) })
                  }
                  placeholder="ABC"
                  maxLength={3}
                />
                <p className="text-xs text-metin-pasif mt-0.5">Max 3 karakter</p>
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">
                  E-Arsiv On Ek
                </label>
                <Input
                  value={form.eArsivOnEk}
                  onChange={(e) =>
                    setForm({ ...form, eArsivOnEk: e.target.value.toUpperCase().slice(0, 3) })
                  }
                  placeholder="XYZ"
                  maxLength={3}
                />
                <p className="text-xs text-metin-pasif mt-0.5">Max 3 karakter</p>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={onKapat} className="flex-1">
            Vazgec
          </Button>
          <Button onClick={gonder} disabled={kaydediyor} className="flex-1">
            {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
            {duzenlemeMi ? "Kaydet" : "Olustur"}
          </Button>
        </div>
      </div>
    </>
  );
}
