import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Shield,
  Users,
  Pencil,
  X,
  Loader2,
  Lock,
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/ayarlar/roller")({
  component: RollerSayfa,
});

interface Rol {
  id: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  sistemRoluMu: boolean;
  olusturmaTarihi: string;
  _count?: { kullanicilar: number };
}

function RollerSayfa() {
  const { t } = useTranslation();
  const [roller, setRoller] = useState<Rol[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliRol, setSeciliRol] = useState<Rol | null>(null);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<Rol[]>("/rol");
      setRoller(res.data);
    } catch {
      toast.hata("Roller yüklenemedi");
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const filtrelenmis = roller.filter((r) => {
    const q = arama.toLowerCase();
    return (
      r.ad.toLowerCase().includes(q) ||
      r.kod.toLowerCase().includes(q) ||
      (r.aciklama ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            Roller
          </h1>
          <p className="text-sm text-metin-ikinci">
            Sistem rollerini ve yetkilerini yönetin
          </p>
        </div>
        <Button
          onClick={() => {
            setSeciliRol(null);
            setDrawerAcik(true);
          }}
        >
          <Plus className="h-4 w-4" /> Yeni Rol
        </Button>
      </header>

      {/* Arama */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
        <Input
          placeholder="Rol adı veya kodu ara..."
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
              <Shield className="h-10 w-10 text-metin-pasif" />
              <p>{arama ? "Sonuç bulunamadı" : "Henüz rol yok"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol Adı</TableHead>
                  <TableHead>Kod</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead className="w-[80px]">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrelenmis.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-yuzey-yukseltilmis"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-metin-pasif" />
                        {r.ad}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-yuzey-yukseltilmis px-1.5 py-0.5 text-xs">
                        {r.kod}
                      </code>
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm max-w-[200px] truncate">
                      {r.aciklama || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-metin-pasif" />
                        <span>{r._count?.kullanicilar ?? 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.sistemRoluMu ? (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Lock className="h-3 w-3" /> Sistem
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Özel
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => {
                          setSeciliRol(r);
                          setDrawerAcik(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
                        title={t("genel.duzenle")}
                      >
                        <Pencil className="h-4 w-4 text-metin-ikinci" />
                      </button>
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
        <RolDrawer
          rol={seciliRol}
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

// ─── Yetki tipi ───

interface Yetki {
  id: string;
  kod: string;
  modul: string;
  eylem: string;
  ad: string;
  aciklama: string | null;
  riskliMi: boolean;
}

// ─── Rol Ekle/Düzenle Drawer — Yetki Matrisi Dahil ───

function RolDrawer({
  rol,
  onKapat,
  onKaydet,
}: {
  rol: Rol | null;
  onKapat: () => void;
  onKaydet: () => void;
}) {
  const duzenlemeMi = !!rol;
  const sistemRolu = rol?.sistemRoluMu ?? false;

  const [form, setForm] = useState({
    kod: rol?.kod ?? "",
    ad: rol?.ad ?? "",
    aciklama: rol?.aciklama ?? "",
  });
  const [kaydediyor, setKaydediyor] = useState(false);
  const [aktifTab, setAktifTab] = useState<"bilgi" | "yetkiler">("bilgi");

  // Yetki matrisi state
  const [yetkiGruplari, setYetkiGruplari] = useState<Record<string, Yetki[]>>({});
  const [seciliYetkiIdler, setSeciliYetkiIdler] = useState<Set<string>>(new Set());
  const [yetkiYukleniyor, setYetkiYukleniyor] = useState(false);

  // Yetkileri yukle (sadece duzenleme modunda)
  useEffect(() => {
    if (!duzenlemeMi) return;
    const yukle = async () => {
      setYetkiYukleniyor(true);
      try {
        const [grRes, ryRes] = await Promise.all([
          apiIstemci.get<Record<string, Yetki[]>>("/yetki/gruplu"),
          apiIstemci.get<Array<{ yetkiId: string }>>(`/yetki/rol/${rol!.id}`),
        ]);
        setYetkiGruplari(grRes.data);
        setSeciliYetkiIdler(new Set(ryRes.data.map((r) => String(r.yetkiId))));
      } catch {
        toast.hata("Yetkiler yüklenemedi");
      }
      setYetkiYukleniyor(false);
    };
    void yukle();
  }, [duzenlemeMi, rol]);

  const yetkiToggle = (yetkiId: string) => {
    setSeciliYetkiIdler((prev) => {
      const yeni = new Set(prev);
      if (yeni.has(yetkiId)) yeni.delete(yetkiId);
      else yeni.add(yetkiId);
      return yeni;
    });
  };

  const modulTumunuSec = (yetkiler: Yetki[]) => {
    setSeciliYetkiIdler((prev) => {
      const yeni = new Set(prev);
      const tumSecili = yetkiler.every((y) => yeni.has(String(y.id)));
      yetkiler.forEach((y) => {
        if (tumSecili) yeni.delete(String(y.id));
        else yeni.add(String(y.id));
      });
      return yeni;
    });
  };

  const gonder = async () => {
    if (!form.kod && !duzenlemeMi) {
      toast.hata("Rol kodu zorunludur");
      return;
    }
    setKaydediyor(true);
    try {
      if (duzenlemeMi) {
        const veri = sistemRolu
          ? { aciklama: form.aciklama }
          : { kod: form.kod, ad: form.ad, aciklama: form.aciklama || null };
        await apiIstemci.patch(`/rol/${rol!.id}`, veri);
        // Yetkileri kaydet
        await apiIstemci.put(`/yetki/rol/${rol!.id}`, {
          yetkiIdler: Array.from(seciliYetkiIdler).map(Number),
        });
        toast.basarili("Rol güncellendi");
      } else {
        await apiIstemci.post("/rol", {
          kod: form.kod,
          ad: form.ad,
          aciklama: form.aciklama || null,
        });
        toast.basarili("Rol oluşturuldu");
      }
      onKaydet();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? "Kayıt başarısız";
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  const MODUL_ETIKETLERI: Record<string, string> = {
    sistem: "Sistem",
    kullanici: "Kullanıcı",
    rol: "Rol & Yetki",
    magaza: "Şube / Mağaza",
    cari: "Cari Hesap",
    urun: "Ürün",
    stok: "Stok",
    siparis: "Sipariş",
    fatura: "Fatura",
    teklif: "Teklif",
    finans: "Finans",
    muhasebe: "Muhasebe",
    rapor: "Rapor",
    eticaret: "E-Ticaret",
    pazaryeri: "Pazaryeri",
    crm: "CRM",
    demirbas: "Demirbaş",
    personel: "Personel",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onKapat}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-xl border-l border-kenarlik bg-yuzey shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <h2 className="text-lg font-semibold text-metin">
            {duzenlemeMi ? "Rol Düzenle" : "Yeni Rol"}
          </h2>
          <button
            onClick={onKapat}
            className="p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors"
          >
            <X className="h-5 w-5 text-metin-ikinci" />
          </button>
        </div>

        {/* Tab Header */}
        {duzenlemeMi && (
          <div className="flex border-b border-kenarlik px-6">
            {(
              [
                { key: "bilgi", etiket: "Rol Bilgileri" },
                { key: "yetkiler", etiket: "Yetki Matrisi" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setAktifTab(tab.key)}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  aktifTab === tab.key
                    ? "border-birincil text-birincil"
                    : "border-transparent text-metin-ikinci hover:text-metin"
                )}
              >
                {tab.etiket}
                {tab.key === "yetkiler" && seciliYetkiIdler.size > 0 && (
                  <Badge variant="default" className="text-xs ml-1.5 h-5 min-w-5 px-1.5">
                    {seciliYetkiIdler.size}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {aktifTab === "bilgi" ? (
            <div className="space-y-4">
              {sistemRolu && (
                <div className="rounded-lg bg-uyari-zemin border border-uyari/30 p-3 text-sm text-uyari">
                  <Lock className="inline h-3.5 w-3.5 mr-1.5" />
                  Sistem rollerinin sadece açıklaması düzenlenebilir.
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">Rol Kodu</label>
                <Input
                  value={form.kod}
                  onChange={(e) => setForm({ ...form, kod: e.target.value })}
                  placeholder="örnek: satis_sorumlusu"
                  disabled={sistemRolu || duzenlemeMi}
                />
                <p className="text-xs text-metin-pasif mt-1">Benzersiz, snake_case</p>
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">Rol Adı</label>
                <Input
                  value={form.ad}
                  onChange={(e) => setForm({ ...form, ad: e.target.value })}
                  placeholder="örnek: Satış Sorumlusu"
                  disabled={sistemRolu}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin mb-1 block">Açıklama</label>
                <textarea
                  value={form.aciklama}
                  onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                  placeholder="Bu rolün amacı ve sorumluluk alanı..."
                  rows={3}
                  className={cn(
                    "w-full rounded-lg border border-kenarlik bg-yuzey px-3 py-2 text-sm text-metin",
                    "placeholder:text-metin-pasif focus:outline-none focus:ring-2 focus:ring-birincil/30 focus:border-birincil",
                    "resize-none"
                  )}
                />
              </div>
            </div>
          ) : (
            /* Yetki Matrisi */
            <div className="space-y-4">
              {yetkiYukleniyor ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
                </div>
              ) : Object.keys(yetkiGruplari).length === 0 ? (
                <div className="text-center py-8 text-metin-ikinci text-sm">
                  <p>Henüz yetki tanımlanmamış.</p>
                  <p className="text-xs mt-1">yetki-seed.sql dosyasını çalıştırın.</p>
                </div>
              ) : (
                Object.entries(yetkiGruplari).map(([modul, yetkiler]) => {
                  const modulSeciliSayi = yetkiler.filter((y) =>
                    seciliYetkiIdler.has(String(y.id))
                  ).length;
                  const tumSecili = modulSeciliSayi === yetkiler.length;

                  return (
                    <div
                      key={modul}
                      className="border border-kenarlik rounded-lg overflow-hidden"
                    >
                      {/* Modul baslik */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-yuzey-yukseltilmis">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-kenarlik accent-birincil"
                            checked={tumSecili}
                            onChange={() => modulTumunuSec(yetkiler)}
                          />
                          <span className="text-sm font-semibold text-metin">
                            {MODUL_ETIKETLERI[modul] ?? modul}
                          </span>
                        </label>
                        <Badge variant="outline" className="text-xs">
                          {modulSeciliSayi}/{yetkiler.length}
                        </Badge>
                      </div>
                      {/* Yetkiler */}
                      <div className="divide-y divide-kenarlik">
                        {yetkiler.map((y) => {
                          const secili = seciliYetkiIdler.has(String(y.id));
                          return (
                            <label
                              key={y.id}
                              className={cn(
                                "flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                secili ? "bg-birincil-zemin/50" : "hover:bg-yuzey-yukseltilmis"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 mt-0.5 rounded border-kenarlik accent-birincil"
                                checked={secili}
                                onChange={() => yetkiToggle(String(y.id))}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-metin">
                                    {y.ad}
                                  </span>
                                  {y.riskliMi && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                      Riskli
                                    </Badge>
                                  )}
                                </div>
                                {y.aciklama && (
                                  <p className="text-xs text-metin-ikinci mt-0.5">
                                    {y.aciklama}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={onKapat} className="flex-1">
            Vazgeç
          </Button>
          <Button onClick={gonder} disabled={kaydediyor} className="flex-1">
            {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
            {duzenlemeMi ? "Kaydet" : "Oluştur"}
          </Button>
        </div>
      </div>
    </>
  );
}
