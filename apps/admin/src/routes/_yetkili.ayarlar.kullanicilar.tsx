import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  UserCircle,
  Shield,
  MoreHorizontal,
  Pencil,
  Power,
  X,
  Loader2,
} from "lucide-react";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

interface Rol {
  id: string;
  kod: string;
  ad: string;
}

function KullanicilarSayfa() {
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [roller, setRoller] = useState<Rol[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliKullanici, setSeciliKullanici] = useState<Kullanici | null>(null);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const [kRes, rRes] = await Promise.all([
        apiIstemci.get<Kullanici[]>("/kullanici"),
        apiIstemci.get<Rol[]>("/rol"),
      ]);
      setKullanicilar(kRes.data);
      setRoller(rRes.data);
    } catch {
      toast.hata("Kullanicilar yuklenemedi");
    }
    setYukleniyor(false);
  };

  useEffect(() => { void yukle(); }, []);

  const filtrelenmis = kullanicilar.filter((k) => {
    const q = arama.toLowerCase();
    return (
      k.ad.toLowerCase().includes(q) ||
      k.soyad.toLowerCase().includes(q) ||
      k.email.toLowerCase().includes(q)
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">Kullanicilar</h1>
          <p className="text-sm text-metin-ikinci">Sistem kullanicilarini yonetin</p>
        </div>
        <Button onClick={() => { setSeciliKullanici(null); setDrawerAcik(true); }}>
          <Plus className="h-4 w-4" /> Yeni Kullanici
        </Button>
      </header>

      {/* Arama */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
        <Input
          placeholder="Ad, soyad veya email ara..."
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="pl-9"
        />
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
              <p>{arama ? "Sonuc bulunamadi" : "Henuz kullanici yok"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Soyad</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Son Giris</TableHead>
                  <TableHead className="w-[80px]">Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrelenmis.map((k) => (
                  <TableRow key={k.publicId} className="cursor-pointer hover:bg-yuzey-yukseltilmis">
                    <TableCell className="font-medium">{k.ad} {k.soyad}</TableCell>
                    <TableCell className="text-metin-ikinci">{k.email}</TableCell>
                    <TableCell className="text-metin-ikinci">{k.telefon || "-"}</TableCell>
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
                          onClick={() => { setSeciliKullanici(k); setDrawerAcik(true); }}
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
                          <Power className={cn("h-4 w-4", k.aktifMi ? "text-basarili" : "text-tehlike")} />
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
          onKapat={() => setDrawerAcik(false)}
          onKaydet={() => { setDrawerAcik(false); void yukle(); }}
        />
      )}
    </div>
  );
}

// ─── Kullanıcı Ekle/Düzenle Drawer ───

function KullaniciDrawer({
  kullanici,
  roller,
  onKapat,
  onKaydet,
}: {
  kullanici: Kullanici | null;
  roller: Rol[];
  onKapat: () => void;
  onKaydet: () => void;
}) {
  const duzenlemeMi = !!kullanici;
  const [form, setForm] = useState({
    ad: kullanici?.ad ?? "",
    soyad: kullanici?.soyad ?? "",
    email: kullanici?.email ?? "",
    telefon: kullanici?.telefon ?? "",
    sifre: "",
    rolKodlari: [] as string[],
  });
  const [kaydediyor, setKaydediyor] = useState(false);

  const gonder = async () => {
    setKaydediyor(true);
    try {
      if (duzenlemeMi) {
        await apiIstemci.patch(`/kullanici/${kullanici!.id}`, {
          ad: form.ad,
          soyad: form.soyad,
          email: form.email,
          telefon: form.telefon || null,
        });
        toast.basarili("Kullanici guncellendi");
      } else {
        await apiIstemci.post("/kullanici", {
          ad: form.ad,
          soyad: form.soyad,
          email: form.email,
          telefon: form.telefon || null,
          sifre: form.sifre,
          rolKodlari: form.rolKodlari,
        });
        toast.basarili("Kullanici olusturuldu");
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
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onKapat} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-kenarlik bg-yuzey shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <h2 className="text-lg font-semibold text-metin">
            {duzenlemeMi ? "Kullanici Duzenle" : "Yeni Kullanici"}
          </h2>
          <button onClick={onKapat} className="p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors">
            <X className="h-5 w-5 text-metin-ikinci" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Ad</label>
              <Input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="Ad" />
            </div>
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Soyad</label>
              <Input value={form.soyad} onChange={(e) => setForm({ ...form, soyad: e.target.value })} placeholder="Soyad" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-metin mb-1 block">E-posta</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ornek@kuvvem.com" />
          </div>

          <div>
            <label className="text-sm font-medium text-metin mb-1 block">Telefon</label>
            <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="05XX XXX XX XX" />
          </div>

          {!duzenlemeMi && (
            <div>
              <label className="text-sm font-medium text-metin mb-1 block">Sifre</label>
              <Input type="password" value={form.sifre} onChange={(e) => setForm({ ...form, sifre: e.target.value })} placeholder="En az 10 karakter" />
              <p className="text-xs text-metin-pasif mt-1">Min 10 karakter</p>
            </div>
          )}

          {!duzenlemeMi && roller.length > 0 && (
            <div>
              <label className="text-sm font-medium text-metin mb-2 block">Roller</label>
              <div className="space-y-2">
                {roller.map((r) => (
                  <label key={r.kod} className="flex items-center gap-2 text-sm cursor-pointer">
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
                    <Shield className="h-3.5 w-3.5 text-metin-pasif" />
                    <span>{r.ad}</span>
                  </label>
                ))}
              </div>
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
