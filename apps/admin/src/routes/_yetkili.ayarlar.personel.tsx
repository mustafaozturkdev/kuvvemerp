import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  UserCircle,
  Pencil,
  Power,
  X,
  Loader2,
  Store,
  Wallet,
  Banknote,
  Users,
} from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/ayarlar/personel")({
  component: PersonelSayfa,
});

// ─── Tipler ───

interface PersonelMagaza {
  magaza: { id: string; kod: string; ad: string };
}

interface Personel {
  id: string;
  publicId: string;
  adiSoyadi: string;
  tc: string | null;
  unvan: string | null;
  cep: string | null;
  mailAdresi: string | null;
  iseGiris: string | null;
  istenCikis: string | null;
  maas: string;
  maasGunu: number;
  iban: string | null;
  aktifMi: boolean;
  olusturmaTarihi: string;
  magazalar: PersonelMagaza[];
  bakiye?: string;
  odemeler?: PersonelOdeme[];
}

interface PersonelOdeme {
  id: string;
  publicId: string;
  tip: string;
  tutar: string;
  aciklama: string | null;
  tarih: string;
  olusturmaTarihi: string;
}

interface Magaza {
  id: string;
  kod: string;
  ad: string;
  aktifMi: boolean;
}

// ─── Ana Sayfa ───

function PersonelSayfa() {
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [magazalar, setMagazalar] = useState<Magaza[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<"hepsi" | "aktif" | "pasif">(
    "hepsi"
  );
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliPersonel, setSeciliPersonel] = useState<Personel | null>(null);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const [pRes, mRes] = await Promise.all([
        apiIstemci.get<Personel[]>("/personel"),
        apiIstemci.get<Magaza[]>("/magaza"),
      ]);
      setPersoneller(pRes.data);
      setMagazalar(mRes.data.filter((m: Magaza) => m.aktifMi));
    } catch {
      toast.hata("Veriler yuklenemedi");
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const filtrelenmis = personeller.filter((p) => {
    if (durumFiltre === "aktif" && !p.aktifMi) return false;
    if (durumFiltre === "pasif" && p.aktifMi) return false;
    if (!arama) return true;
    const q = arama.toLowerCase();
    return (
      p.adiSoyadi.toLowerCase().includes(q) ||
      (p.unvan ?? "").toLowerCase().includes(q) ||
      (p.cep ?? "").includes(q) ||
      (p.tc ?? "").includes(q)
    );
  });

  const aktiflikToggle = async (id: string) => {
    try {
      await apiIstemci.patch(`/personel/${id}/aktiflik`);
      toast.basarili("Personel durumu guncellendi");
      void yukle();
    } catch {
      toast.hata("Islem basarisiz");
    }
  };

  const detayAc = async (p: Personel) => {
    try {
      const res = await apiIstemci.get<Personel>(`/personel/${p.id}`);
      setSeciliPersonel(res.data);
      setDrawerAcik(true);
    } catch {
      toast.hata("Detay yuklenemedi");
    }
  };

  const aktifSayi = personeller.filter((p) => p.aktifMi).length;
  const pasifSayi = personeller.length - aktifSayi;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            Personel
          </h1>
          <p className="text-sm text-metin-ikinci">
            Personel kayitlarini, magaza atamalarini ve odeme hareketlerini
            yonetin
          </p>
        </div>
        <Button
          onClick={() => {
            setSeciliPersonel(null);
            setDrawerAcik(true);
          }}
        >
          <Plus className="h-4 w-4" /> Yeni Personel
        </Button>
      </header>

      {/* Filtreler */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
          <Input
            placeholder="Ad, unvan, telefon veya TC ara..."
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: "hepsi", etiket: `Hepsi (${personeller.length})` },
              { key: "aktif", etiket: `Aktif (${aktifSayi})` },
              { key: "pasif", etiket: `Pasif (${pasifSayi})` },
            ] as const
          ).map((f) => (
            <Button
              key={f.key}
              variant={durumFiltre === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setDurumFiltre(f.key)}
            >
              {f.etiket}
            </Button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : filtrelenmis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-metin-ikinci">
              <Users className="h-10 w-10 text-metin-pasif" />
              <p>
                {arama || durumFiltre !== "hepsi"
                  ? "Sonuc bulunamadi"
                  : "Henuz personel yok"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Soyad</TableHead>
                  <TableHead>Unvan</TableHead>
                  <TableHead>Magazalar</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Maas</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-[80px]">Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrelenmis.map((p) => (
                  <TableRow
                    key={p.publicId}
                    className="cursor-pointer hover:bg-yuzey-yukseltilmis"
                  >
                    <TableCell className="font-medium">{p.adiSoyadi}</TableCell>
                    <TableCell className="text-metin-ikinci">
                      {p.unvan || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.magazalar && p.magazalar.length > 0 ? (
                          p.magazalar.map((m) => (
                            <Badge
                              key={m.magaza.kod}
                              variant="secondary"
                              className="text-xs"
                            >
                              <Store className="h-3 w-3 mr-0.5" />
                              {m.magaza.ad}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-metin-pasif text-xs">
                            Atanmamis
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-metin-ikinci">
                      {p.cep || "-"}
                    </TableCell>
                    <TableCell className="text-metin-ikinci">
                      {Number(p.maas).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      TL
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.aktifMi ? "default" : "secondary"}>
                        {p.aktifMi ? "Aktif" : "Pasif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button
                          onClick={() => detayAc(p)}
                          className="p-1.5 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
                          title="Duzenle"
                        >
                          <Pencil className="h-4 w-4 text-metin-ikinci" />
                        </button>
                        <button
                          onClick={() => aktiflikToggle(p.id)}
                          className="p-1.5 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
                          title={p.aktifMi ? "Pasif yap" : "Aktif yap"}
                        >
                          <Power
                            className={cn(
                              "h-4 w-4",
                              p.aktifMi ? "text-basarili" : "text-tehlike"
                            )}
                          />
                        </button>
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
        <PersonelDrawer
          personel={seciliPersonel}
          magazalar={magazalar}
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

// ─── Personel Drawer ───

function PersonelDrawer({
  personel,
  magazalar,
  onKapat,
  onKaydet,
}: {
  personel: Personel | null;
  magazalar: Magaza[];
  onKapat: () => void;
  onKaydet: () => void;
}) {
  const duzenlemeMi = !!personel;
  const mevcutMagazalar =
    personel?.magazalar?.map((m) => String(m.magaza.id)) ?? [];

  const [form, setForm] = useState({
    adiSoyadi: personel?.adiSoyadi ?? "",
    tc: personel?.tc ?? "",
    unvan: personel?.unvan ?? "",
    cep: personel?.cep ?? "",
    mailAdresi: personel?.mailAdresi ?? "",
    iseGiris: personel?.iseGiris
      ? personel.iseGiris.substring(0, 10)
      : "",
    istenCikis: personel?.istenCikis
      ? personel.istenCikis.substring(0, 10)
      : "",
    maas: personel?.maas ? String(personel.maas) : "0",
    maasGunu: personel?.maasGunu ?? 1,
    iban: personel?.iban ?? "",
    magazaIdler: mevcutMagazalar,
  });
  const [kaydediyor, setKaydediyor] = useState(false);
  const [aktifTab, setAktifTab] = useState<"bilgi" | "magazalar" | "hareketler">("bilgi");

  // Hareket state
  const [hareketler, setHareketler] = useState<PersonelOdeme[]>(
    personel?.odemeler ?? []
  );
  const [yeniHareket, setYeniHareket] = useState({
    tip: "hakedis" as string,
    tutar: "",
    aciklama: "",
    tarih: new Date().toISOString().substring(0, 10),
  });
  const [hareketKaydediyor, setHareketKaydediyor] = useState(false);

  const telefonFormatla = (deger: string) => {
    return deger.replace(/\D/g, "").slice(0, 15);
  };

  const tcFormatla = (deger: string) => {
    return deger.replace(/\D/g, "").slice(0, 11);
  };

  const ibanFormatla = (deger: string) => {
    return deger.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 26);
  };

  const gonder = async () => {
    if (!form.adiSoyadi) {
      toast.hata("Ad soyad zorunludur");
      return;
    }

    setKaydediyor(true);
    try {
      const payload = {
        adiSoyadi: form.adiSoyadi,
        tc: form.tc || null,
        unvan: form.unvan || null,
        cep: form.cep || null,
        mailAdresi: form.mailAdresi || null,
        iseGiris: form.iseGiris || null,
        istenCikis: form.istenCikis || null,
        maas: Number(form.maas) || 0,
        maasGunu: form.maasGunu,
        iban: form.iban || null,
        magazaIdler: form.magazaIdler.map(Number),
      };

      if (duzenlemeMi) {
        await apiIstemci.patch(`/personel/${personel!.id}`, payload);
        toast.basarili("Personel guncellendi");
      } else {
        await apiIstemci.post("/personel", payload);
        toast.basarili("Personel olusturuldu");
      }
      onKaydet();
    } catch (err: any) {
      const mesaj =
        err?.response?.data?.hata?.mesaj ??
        err?.response?.data?.mesaj ??
        "Kayit basarisiz";
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  const hareketEkle = async () => {
    if (!yeniHareket.tutar || Number(yeniHareket.tutar) <= 0) {
      toast.hata("Tutar 0 dan buyuk olmalidir");
      return;
    }
    if (!yeniHareket.tarih) {
      toast.hata("Tarih zorunludur");
      return;
    }

    setHareketKaydediyor(true);
    try {
      await apiIstemci.post(`/personel/${personel!.id}/hareketler`, {
        tip: yeniHareket.tip,
        tutar: Number(yeniHareket.tutar),
        aciklama: yeniHareket.aciklama || null,
        tarih: yeniHareket.tarih,
      });
      toast.basarili("Hareket eklendi");
      // Hareketleri yenile
      const res = await apiIstemci.get<PersonelOdeme[]>(
        `/personel/${personel!.id}/hareketler`
      );
      setHareketler(res.data);
      setYeniHareket({
        tip: "hakedis",
        tutar: "",
        aciklama: "",
        tarih: new Date().toISOString().substring(0, 10),
      });
    } catch (err: any) {
      const mesaj =
        err?.response?.data?.hata?.mesaj ??
        err?.response?.data?.mesaj ??
        "Hareket eklenemedi";
      toast.hata(mesaj);
    }
    setHareketKaydediyor(false);
  };

  const magazaToggle = (magazaId: string) => {
    setForm((prev) => ({
      ...prev,
      magazaIdler: prev.magazaIdler.includes(magazaId)
        ? prev.magazaIdler.filter((id) => id !== magazaId)
        : [...prev.magazaIdler, magazaId],
    }));
  };

  // Bakiye hesapla
  const bakiyeHesapla = (): number => {
    let hakedis = 0;
    let odeme = 0;
    for (const h of hareketler) {
      const tutar = Number(h.tutar);
      if (h.tip === "hakedis") hakedis += tutar;
      else odeme += tutar;
    }
    return hakedis - odeme;
  };

  const tipEtiket: Record<string, string> = {
    hakedis: "Hakedis",
    odeme: "Odeme",
    mahsup: "Mahsup",
  };

  const tipRenk: Record<string, string> = {
    hakedis: "text-basarili",
    odeme: "text-tehlike",
    mahsup: "text-metin-ikinci",
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
            {duzenlemeMi ? "Personel Duzenle" : "Yeni Personel"}
          </h2>
          <button
            onClick={onKapat}
            className="p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
          >
            <X className="h-5 w-5 text-metin-ikinci" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-kenarlik px-6">
          {(
            [
              { key: "bilgi", etiket: "Bilgiler", ikon: UserCircle },
              { key: "magazalar", etiket: "Magazalar", ikon: Store },
              ...(duzenlemeMi
                ? [{ key: "hareketler" as const, etiket: "Hareketler", ikon: Wallet }]
                : []),
            ] as const
          ).map((tab) => {
            const Ikon = tab.ikon;
            const aktif = aktifTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setAktifTab(tab.key as typeof aktifTab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  aktif
                    ? "border-birincil text-birincil"
                    : "border-transparent text-metin-ikinci hover:text-metin"
                )}
              >
                <Ikon className="h-4 w-4" />
                {tab.etiket}
                {tab.key === "magazalar" && form.magazaIdler.length > 0 && (
                  <Badge
                    variant="default"
                    className="text-xs ml-1 h-5 min-w-5 px-1.5"
                  >
                    {form.magazaIdler.length}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {aktifTab === "bilgi" ? (
            <div className="space-y-5">
              {/* Kisisel */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
                  Kisisel Bilgiler
                </legend>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    Ad Soyad <span className="text-tehlike">*</span>
                  </label>
                  <Input
                    value={form.adiSoyadi}
                    onChange={(e) =>
                      setForm({ ...form, adiSoyadi: e.target.value })
                    }
                    placeholder="Ad Soyad"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      TC Kimlik No
                    </label>
                    <Input
                      value={form.tc}
                      onChange={(e) =>
                        setForm({ ...form, tc: tcFormatla(e.target.value) })
                      }
                      placeholder="11 haneli"
                      maxLength={11}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Unvan
                    </label>
                    <Input
                      value={form.unvan}
                      onChange={(e) =>
                        setForm({ ...form, unvan: e.target.value })
                      }
                      placeholder="Satis Danismani"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Cep Telefonu
                    </label>
                    <Input
                      value={form.cep}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cep: telefonFormatla(e.target.value),
                        })
                      }
                      placeholder="905XXXXXXXXX"
                    />
                    <p className="text-xs text-metin-pasif mt-0.5">
                      90+ format, sadece rakam
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      E-posta
                    </label>
                    <Input
                      type="email"
                      value={form.mailAdresi}
                      onChange={(e) =>
                        setForm({ ...form, mailAdresi: e.target.value })
                      }
                      placeholder="personel@ornek.com"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Is Bilgileri */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
                  Is Bilgileri
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Ise Giris Tarihi
                    </label>
                    <Input
                      type="date"
                      value={form.iseGiris}
                      onChange={(e) =>
                        setForm({ ...form, iseGiris: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Isten Cikis Tarihi
                    </label>
                    <Input
                      type="date"
                      value={form.istenCikis}
                      onChange={(e) =>
                        setForm({ ...form, istenCikis: e.target.value })
                      }
                    />
                  </div>
                </div>
              </fieldset>

              {/* Odeme Bilgileri */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
                  Odeme Bilgileri
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Maas (TL)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.maas}
                      onChange={(e) =>
                        setForm({ ...form, maas: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Maas Gunu
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={form.maasGunu}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maasGunu: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    IBAN
                  </label>
                  <Input
                    value={form.iban}
                    onChange={(e) =>
                      setForm({ ...form, iban: ibanFormatla(e.target.value) })
                    }
                    placeholder="TR + 24 hane"
                    maxLength={26}
                  />
                </div>
              </fieldset>
            </div>
          ) : aktifTab === "magazalar" ? (
            /* Magaza Atamalari */
            <div className="space-y-3">
              <p className="text-sm text-metin-ikinci">
                Personelin calisacagi magazalari secin.
              </p>

              {magazalar.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-metin-ikinci">
                  <Store className="h-8 w-8 text-metin-pasif" />
                  <p className="text-sm">Henuz aktif magaza yok</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          magazaIdler: magazalar.map((m) => String(m.id)),
                        })
                      }
                    >
                      Hepsini Sec
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setForm({ ...form, magazaIdler: [] })}
                    >
                      Hepsini Kaldir
                    </Button>
                  </div>

                  {magazalar.map((m) => {
                    const secili = form.magazaIdler.includes(String(m.id));
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          secili
                            ? "border-birincil/50 bg-birincil-zemin"
                            : "border-kenarlik hover:bg-yuzey-yukseltilmis"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-kenarlik accent-birincil"
                          checked={secili}
                          onChange={() => magazaToggle(String(m.id))}
                        />
                        <Store
                          className={cn(
                            "h-4 w-4",
                            secili ? "text-birincil" : "text-metin-pasif"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-metin">
                              {m.ad}
                            </span>
                            <code className="text-xs text-metin-ikinci">
                              {m.kod}
                            </code>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Hareketler Tab */
            <div className="space-y-5">
              {/* Bakiye */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-yuzey-yukseltilmis border border-kenarlik">
                <span className="text-sm font-medium text-metin">Bakiye</span>
                <span
                  className={cn(
                    "text-lg font-semibold",
                    bakiyeHesapla() >= 0 ? "text-basarili" : "text-tehlike"
                  )}
                >
                  {bakiyeHesapla().toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  TL
                </span>
              </div>

              {/* Yeni Hareket Formu */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
                  Yeni Hareket
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Tip
                    </label>
                    <select
                      value={yeniHareket.tip}
                      onChange={(e) =>
                        setYeniHareket({ ...yeniHareket, tip: e.target.value })
                      }
                      className="flex h-9 w-full rounded-md border border-kenarlik bg-yuzey px-3 py-1 text-sm text-metin"
                    >
                      <option value="hakedis">Hakedis</option>
                      <option value="odeme">Odeme</option>
                      <option value="mahsup">Mahsup</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Tutar (TL)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={yeniHareket.tutar}
                      onChange={(e) =>
                        setYeniHareket({
                          ...yeniHareket,
                          tutar: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    Tarih
                  </label>
                  <Input
                    type="date"
                    value={yeniHareket.tarih}
                    onChange={(e) =>
                      setYeniHareket({
                        ...yeniHareket,
                        tarih: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    Aciklama
                  </label>
                  <Input
                    value={yeniHareket.aciklama}
                    onChange={(e) =>
                      setYeniHareket({
                        ...yeniHareket,
                        aciklama: e.target.value,
                      })
                    }
                    placeholder="Aciklama (opsiyonel)"
                  />
                </div>
                <Button
                  onClick={hareketEkle}
                  disabled={hareketKaydediyor}
                  size="sm"
                  className="w-full"
                >
                  {hareketKaydediyor && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <Banknote className="h-4 w-4" />
                  Hareket Ekle
                </Button>
              </fieldset>

              {/* Hareket Listesi */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-metin">
                  Gecmis Hareketler
                </h3>
                {hareketler.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-metin-ikinci">
                    <Wallet className="h-8 w-8 text-metin-pasif" />
                    <p className="text-sm">Henuz hareket yok</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {hareketler.map((h) => (
                      <div
                        key={h.publicId}
                        className="flex items-center justify-between p-3 rounded-lg border border-kenarlik"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {tipEtiket[h.tip] ?? h.tip}
                            </Badge>
                            <span className="text-xs text-metin-pasif">
                              {new Date(h.tarih).toLocaleDateString("tr-TR")}
                            </span>
                          </div>
                          {h.aciklama && (
                            <p className="text-xs text-metin-ikinci mt-1 truncate">
                              {h.aciklama}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium ml-3 whitespace-nowrap",
                            tipRenk[h.tip] ?? "text-metin"
                          )}
                        >
                          {h.tip === "hakedis" ? "+" : "-"}
                          {Number(h.tutar).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          TL
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — sadece bilgi ve magaza tablarinda goster */}
        {aktifTab !== "hareketler" && (
          <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
            <Button variant="outline" onClick={onKapat} className="flex-1">
              Vazgec
            </Button>
            <Button onClick={gonder} disabled={kaydediyor} className="flex-1">
              {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
              {duzenlemeMi ? "Kaydet" : "Olustur"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
