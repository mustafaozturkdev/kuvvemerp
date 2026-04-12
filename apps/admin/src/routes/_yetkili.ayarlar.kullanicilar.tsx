import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  UserCircle,
  Shield,
  Pencil,
  Power,
  X,
  Loader2,
  Store,
  Filter,
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

export const Route = createFileRoute("/_yetkili/ayarlar/kullanicilar")({
  component: KullanicilarSayfa,
});

interface Kullanici {
  id: string;
  publicId: string;
  email: string;
  ad: string;
  soyad: string;
  telefon: string | null;
  aktifMi: boolean;
  sonGirisTarihi: string | null;
  olusturmaTarihi: string;
  roller?: Array<{ rol: { kod: string; ad: string } }>;
  magazalar?: Array<{
    varsayilanMi: boolean;
    magaza: { id: string; kod: string; ad: string };
  }>;
}

interface Rol {
  id: string;
  kod: string;
  ad: string;
}

interface Magaza {
  id: string;
  kod: string;
  ad: string;
  aktifMi: boolean;
}

function KullanicilarSayfa() {
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [roller, setRoller] = useState<Rol[]>([]);
  const [magazalar, setMagazalar] = useState<Magaza[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<"hepsi" | "aktif" | "pasif">("hepsi");
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliKullanici, setSeciliKullanici] = useState<Kullanici | null>(null);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const [kRes, rRes, mRes] = await Promise.all([
        apiIstemci.get<Kullanici[]>("/kullanici"),
        apiIstemci.get<Rol[]>("/rol"),
        apiIstemci.get<Magaza[]>("/magaza"),
      ]);
      setKullanicilar(kRes.data);
      setRoller(rRes.data);
      setMagazalar(mRes.data.filter((m: Magaza) => m.aktifMi));
    } catch {
      toast.hata("Veriler yuklenemedi");
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const filtrelenmis = kullanicilar.filter((k) => {
    // Durum filtresi
    if (durumFiltre === "aktif" && !k.aktifMi) return false;
    if (durumFiltre === "pasif" && k.aktifMi) return false;
    // Arama
    if (!arama) return true;
    const q = arama.toLowerCase();
    return (
      k.ad.toLowerCase().includes(q) ||
      k.soyad.toLowerCase().includes(q) ||
      k.email.toLowerCase().includes(q) ||
      (k.telefon ?? "").includes(q)
    );
  });

  const aktiflikToggle = async (id: string) => {
    try {
      await apiIstemci.patch(`/kullanici/${id}/aktiflik`);
      toast.basarili("Kullanici durumu guncellendi");
      void yukle();
    } catch {
      toast.hata("Islem basarisiz");
    }
  };

  const aktifSayi = kullanicilar.filter((k) => k.aktifMi).length;
  const pasifSayi = kullanicilar.length - aktifSayi;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            Kullanicilar
          </h1>
          <p className="text-sm text-metin-ikinci">
            Sistem kullanicilarini, rollerini ve sube yetkilerini yonetin
          </p>
        </div>
        <Button
          onClick={() => {
            setSeciliKullanici(null);
            setDrawerAcik(true);
          }}
        >
          <Plus className="h-4 w-4" /> Yeni Kullanici
        </Button>
      </header>

      {/* Filtreler */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
          <Input
            placeholder="Ad, soyad, email veya telefon ara..."
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: "hepsi", etiket: `Hepsi (${kullanicilar.length})` },
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
              <UserCircle className="h-10 w-10 text-metin-pasif" />
              <p>{arama || durumFiltre !== "hepsi" ? "Sonuc bulunamadi" : "Henuz kullanici yok"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Soyad</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Subeler</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Son Giris</TableHead>
                  <TableHead className="w-[80px]">Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrelenmis.map((k) => (
                  <TableRow
                    key={k.publicId}
                    className="cursor-pointer hover:bg-yuzey-yukseltilmis"
                  >
                    <TableCell className="font-medium">
                      {k.ad} {k.soyad}
                    </TableCell>
                    <TableCell className="text-metin-ikinci">{k.email}</TableCell>
                    <TableCell className="text-metin-ikinci">
                      {k.telefon || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.roller?.map((r) => (
                          <Badge
                            key={r.rol.kod}
                            variant="outline"
                            className="text-xs"
                          >
                            {r.rol.ad}
                          </Badge>
                        )) ?? "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.magazalar && k.magazalar.length > 0
                          ? k.magazalar.map((m) => (
                              <Badge
                                key={m.magaza.kod}
                                variant={m.varsayilanMi ? "default" : "secondary"}
                                className="text-xs"
                              >
                                <Store className="h-3 w-3 mr-0.5" />
                                {m.magaza.ad}
                              </Badge>
                            ))
                          : <span className="text-metin-pasif text-xs">Atanmamis</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.aktifMi ? "default" : "secondary"}>
                        {k.aktifMi ? "Aktif" : "Pasif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm">
                      {k.sonGirisTarihi
                        ? new Date(k.sonGirisTarihi).toLocaleDateString("tr-TR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setSeciliKullanici(k);
                            setDrawerAcik(true);
                          }}
                          className="p-1.5 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
                          title="Duzenle"
                        >
                          <Pencil className="h-4 w-4 text-metin-ikinci" />
                        </button>
                        <button
                          onClick={() => aktiflikToggle(k.id)}
                          className="p-1.5 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
                          title={k.aktifMi ? "Pasif yap" : "Aktif yap"}
                        >
                          <Power
                            className={cn(
                              "h-4 w-4",
                              k.aktifMi ? "text-basarili" : "text-tehlike"
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
        <KullaniciDrawer
          kullanici={seciliKullanici}
          roller={roller}
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

// ─── Kullanıcı Ekle/Düzenle Drawer — PHP Parity ───

function KullaniciDrawer({
  kullanici,
  roller,
  magazalar,
  onKapat,
  onKaydet,
}: {
  kullanici: Kullanici | null;
  roller: Rol[];
  magazalar: Magaza[];
  onKapat: () => void;
  onKaydet: () => void;
}) {
  const duzenlemeMi = !!kullanici;
  const mevcutRoller = kullanici?.roller?.map((r) => r.rol.kod) ?? [];
  const mevcutMagazalar =
    kullanici?.magazalar?.map((m) => String(m.magaza.id)) ?? [];

  const [form, setForm] = useState({
    ad: kullanici?.ad ?? "",
    soyad: kullanici?.soyad ?? "",
    email: kullanici?.email ?? "",
    telefon: kullanici?.telefon ?? "",
    sifre: "",
    rolKodlari: mevcutRoller,
    magazaIdler: mevcutMagazalar,
  });
  const [kaydediyor, setKaydediyor] = useState(false);
  const [aktifTab, setAktifTab] = useState<"bilgi" | "subeler">("bilgi");

  // Telefon formatlama: sadece rakam, 90+ format
  const telefonFormatla = (deger: string) => {
    const temiz = deger.replace(/\D/g, "").slice(0, 12);
    return temiz;
  };

  const gonder = async () => {
    // Validasyonlar
    if (!form.ad || !form.soyad || !form.email) {
      toast.hata("Ad, soyad ve e-posta zorunludur");
      return;
    }
    if (!duzenlemeMi && !form.sifre) {
      toast.hata("Yeni kullanici icin sifre zorunludur");
      return;
    }
    if (form.sifre && form.sifre.length < 6) {
      toast.hata("Sifre en az 6 karakter olmali");
      return;
    }

    setKaydediyor(true);
    try {
      if (duzenlemeMi) {
        // Kullanici bilgileri guncelle
        await apiIstemci.patch(`/kullanici/${kullanici!.id}`, {
          ad: form.ad,
          soyad: form.soyad,
          email: form.email,
          telefon: form.telefon || null,
          rolKodlari: form.rolKodlari,
        });
        // Magaza atamasi guncelle
        await apiIstemci.put(`/kullanici/${kullanici!.id}/magazalar`, {
          magazaIdler: form.magazaIdler.map(Number),
        });
        toast.basarili("Kullanici guncellendi");
      } else {
        // Yeni kullanici olustur
        const res = await apiIstemci.post("/kullanici", {
          ad: form.ad,
          soyad: form.soyad,
          email: form.email,
          telefon: form.telefon || null,
          sifre: form.sifre,
          rolKodlari: form.rolKodlari,
        });
        // Magaza atamasi
        if (form.magazaIdler.length > 0) {
          await apiIstemci.put(`/kullanici/${res.data.id}/magazalar`, {
            magazaIdler: form.magazaIdler.map(Number),
          });
        }
        toast.basarili("Kullanici olusturuldu");
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

  const magazaToggle = (magazaId: string) => {
    setForm((prev) => ({
      ...prev,
      magazaIdler: prev.magazaIdler.includes(magazaId)
        ? prev.magazaIdler.filter((id) => id !== magazaId)
        : [...prev.magazaIdler, magazaId],
    }));
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
            {duzenlemeMi ? "Kullanici Duzenle" : "Yeni Kullanici"}
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
              { key: "bilgi", etiket: "Bilgiler & Roller", ikon: UserCircle },
              { key: "subeler", etiket: "Sube Yetkileri", ikon: Store },
            ] as const
          ).map((tab) => {
            const Ikon = tab.ikon;
            const aktif = aktifTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setAktifTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  aktif
                    ? "border-birincil text-birincil"
                    : "border-transparent text-metin-ikinci hover:text-metin"
                )}
              >
                <Ikon className="h-4 w-4" />
                {tab.etiket}
                {tab.key === "subeler" && form.magazaIdler.length > 0 && (
                  <Badge variant="default" className="text-xs ml-1 h-5 min-w-5 px-1.5">
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Ad <span className="text-tehlike">*</span>
                    </label>
                    <Input
                      value={form.ad}
                      onChange={(e) => setForm({ ...form, ad: e.target.value })}
                      placeholder="Ad"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Soyad <span className="text-tehlike">*</span>
                    </label>
                    <Input
                      value={form.soyad}
                      onChange={(e) =>
                        setForm({ ...form, soyad: e.target.value })
                      }
                      placeholder="Soyad"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    E-posta <span className="text-tehlike">*</span>
                  </label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="ornek@kuvvem.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-metin mb-1 block">
                    Cep Telefonu
                  </label>
                  <Input
                    value={form.telefon}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        telefon: telefonFormatla(e.target.value),
                      })
                    }
                    placeholder="905XXXXXXXXX"
                  />
                  <p className="text-xs text-metin-pasif mt-0.5">
                    Ulke kodu dahil, sadece rakam (orn: 905321234567)
                  </p>
                </div>
                {!duzenlemeMi && (
                  <div>
                    <label className="text-sm font-medium text-metin mb-1 block">
                      Sifre <span className="text-tehlike">*</span>
                    </label>
                    <Input
                      type="password"
                      value={form.sifre}
                      onChange={(e) =>
                        setForm({ ...form, sifre: e.target.value })
                      }
                      placeholder="En az 6 karakter, buyuk/kucuk harf, rakam"
                    />
                  </div>
                )}
              </fieldset>

              {/* Roller */}
              {roller.length > 0 && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-metin border-b border-kenarlik pb-2 mb-3 w-full">
                    Roller
                  </legend>
                  <div className="space-y-2">
                    {roller.map((r) => (
                      <label
                        key={r.kod}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-kenarlik cursor-pointer hover:bg-yuzey-yukseltilmis transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-kenarlik accent-birincil"
                          checked={form.rolKodlari.includes(r.kod)}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              rolKodlari: e.target.checked
                                ? [...form.rolKodlari, r.kod]
                                : form.rolKodlari.filter((x) => x !== r.kod),
                            });
                          }}
                        />
                        <Shield className="h-4 w-4 text-metin-pasif" />
                        <span className="text-sm font-medium text-metin">
                          {r.ad}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          ) : (
            /* Sube Yetkileri Tab */
            <div className="space-y-3">
              <p className="text-sm text-metin-ikinci">
                Kullanicinin erisebilecegi subeleri secin. Ilk secilen sube
                varsayilan olarak atanir.
              </p>

              {magazalar.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-metin-ikinci">
                  <Store className="h-8 w-8 text-metin-pasif" />
                  <p className="text-sm">Henuz aktif sube yok</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Hepsini sec/kaldir */}
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
                      onClick={() =>
                        setForm({ ...form, magazaIdler: [] })
                      }
                    >
                      Hepsini Kaldir
                    </Button>
                  </div>

                  {magazalar.map((m, idx) => {
                    const secili = form.magazaIdler.includes(String(m.id));
                    const varsayilan =
                      secili && form.magazaIdler[0] === String(m.id);
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
                        {varsayilan && (
                          <Badge variant="default" className="text-xs">
                            Varsayilan
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
