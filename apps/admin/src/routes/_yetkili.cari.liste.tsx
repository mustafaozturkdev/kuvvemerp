import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Filter,
  Pencil,
  Power,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { CariFormDrawer } from "@/components/cari/CariFormDrawer";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/cari/liste")({
  component: CariListe,
});

interface CariIletisim {
  id: string;
  tip: string;
  deger: string;
}

interface Cari {
  id: string;
  kod: string;
  tip: string;
  kisiTipi: string;
  ad: string | null;
  soyad: string | null;
  unvan: string | null;
  kisaAd: string | null;
  aktifMi: boolean;
  paraBirimiKod: string;
  iskontoOrani: string;
  vadeGun: number;
  sektor: string | null;
  olusturmaTarihi: string;
  cariGrup: { id: string; ad: string; kod: string } | null;
  iletisimler: CariIletisim[];
}

interface CariGrupSecim {
  id: string;
  ad: string;
}

interface CariCevap {
  veriler: Cari[];
  meta: { toplam: number; sayfa: number; boyut: number };
}

const TIP_ETIKET: Record<string, string> = {
  musteri: "cari.tip-musteri",
  tedarikci: "cari.tip-tedarikci",
  her_ikisi: "cari.tip-her-ikisi",
  personel: "cari.tip-personel",
  diger: "cari.tip-diger",
};

const TIP_RENK: Record<string, string> = {
  musteri: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  tedarikci: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  her_ikisi: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  personel: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  diger: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const SAYFA_BOYUT = 20;

function CariListe() {
  const { t } = useTranslation();
  const onay = useOnay();
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(1);
  const [arama, setArama] = useState("");
  const [aramaGecikme, setAramaGecikme] = useState("");
  const [tipFiltre, setTipFiltre] = useState<string>("");
  const [grupFiltre, setGrupFiltre] = useState<string>("");
  const [durumFiltre, setDurumFiltre] = useState<string>("true");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gruplar, setGruplar] = useState<CariGrupSecim[]>([]);

  // Drawer state
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [duzenlenecekCariId, setDuzenlenecekCariId] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const params: Record<string, string | number> = {
        sayfa,
        boyut: SAYFA_BOYUT,
      };
      if (aramaGecikme) params.arama = aramaGecikme;
      if (tipFiltre) params.tip = tipFiltre;
      if (grupFiltre) params.grupId = Number(grupFiltre);
      if (durumFiltre) params.aktifMi = durumFiltre;

      const res = await apiIstemci.get<CariCevap>("/cari", { params });
      setCariler(res.data.veriler);
      setToplam(res.data.meta.toplam);
    } catch {
      toast.hata(t("cari.yuklenemedi"));
    }
    setYukleniyor(false);
  }, [sayfa, aramaGecikme, tipFiltre, grupFiltre, durumFiltre]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Grupları yükle
  useEffect(() => {
    apiIstemci
      .get<CariGrupSecim[]>("/cari-grup", { params: { aktifMi: "true" } })
      .then((res) => setGruplar(res.data))
      .catch(() => {});
  }, []);

  // Debounce arama
  useEffect(() => {
    const zamanlayici = setTimeout(() => {
      setAramaGecikme(arama);
      setSayfa(1);
    }, 400);
    return () => clearTimeout(zamanlayici);
  }, [arama]);

  const toplamSayfa = Math.ceil(toplam / SAYFA_BOYUT);

  const cariAd = (c: Cari) =>
    c.unvan ?? [c.ad, c.soyad].filter(Boolean).join(" ") ?? c.kod;

  const cariIletisim = (c: Cari, tip: string) =>
    c.iletisimler?.find((i) => i.tip === tip)?.deger ?? "";

  const aktiflikDegistir = async (c: Cari) => {
    if (c.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: cariAd(c) }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/cari/${c.id}/aktiflik`);
      toast.basarili(`${cariAd(c)} ${c.aktifMi ? t("genel.pasife-al").toLowerCase() : t("genel.aktif-et").toLowerCase()}`);
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("cari.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">
            {yukleniyor ? "..." : t("cari.toplam-kayit", { sayi: toplam })}
          </p>
        </div>
        <Button
          onClick={() => {
            setDuzenlenecekCariId(null);
            setDrawerAcik(true);
          }}
        >
          <Plus />
          {t("cari.yeni-ekle")}
        </Button>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="sr-only">{t("cari.liste-baslik")}</CardTitle>
            {/* Arama */}
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
              <Input
                placeholder={t("cari.arama-placeholder")}
                className="pl-9"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
              />
            </div>
            {/* Tip filtre */}
            <div className="flex gap-1.5">
              {["", "musteri", "tedarikci", "her_ikisi"].map((tip) => (
                <Button
                  key={tip}
                  variant={tipFiltre === tip ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setTipFiltre(tip); setSayfa(1); }}
                >
                  {tip === "" ? t("genel.hepsi") : t(TIP_ETIKET[tip])}
                </Button>
              ))}
            </div>
            {/* Grup filtre */}
            {gruplar.length > 0 && (
              <select
                value={grupFiltre}
                onChange={(e) => { setGrupFiltre(e.target.value); setSayfa(1); }}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
              >
                <option value="">{t("cari.tum-gruplar")}</option>
                {gruplar.map((g) => (
                  <option key={g.id} value={g.id}>{g.ad}</option>
                ))}
              </select>
            )}
            {/* Durum filtre */}
            <select
              value={durumFiltre}
              onChange={(e) => { setDurumFiltre(e.target.value); setSayfa(1); }}
              className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
            >
              <option value="">{t("genel.hepsi")}</option>
              <option value="true">{t("genel.aktif")}</option>
              <option value="false">{t("genel.pasif")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : cariler.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">{t("genel.kayit-bulunamadi")}</p>
              <p className="text-sm mt-1">
                {aramaGecikme ? `"${aramaGecikme}" ${t("genel.kayit-bulunamadi").toLowerCase()}` : t("cari-grup.grup-yok")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cari.kod")}</TableHead>
                  <TableHead>{t("cari.unvan")}</TableHead>
                  <TableHead>{t("cari.tip")}</TableHead>
                  <TableHead>{t("cari.grup")}</TableHead>
                  <TableHead>{t("cari.telefon")}</TableHead>
                  <TableHead>{t("cari.email")}</TableHead>
                  <TableHead>{t("cari.sektor")}</TableHead>
                  <TableHead>{t("genel.durum")}</TableHead>
                  <TableHead className="text-right">{t("genel.islem")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cariler.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="font-mono text-metin-ikinci text-xs">
                      {c.kod}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/cari/$cariId"
                        params={{ cariId: c.id }}
                        className="flex items-center gap-3"
                      >
                        <Avatar adSoyad={cariAd(c)} boyut="sm" />
                        <div>
                          <div className="font-medium text-metin group-hover:text-birincil">
                            {cariAd(c)}
                          </div>
                          {c.kisaAd && (
                            <div className="text-[12px] text-metin-ikinci">{c.kisaAd}</div>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-[11px] font-medium", TIP_RENK[c.tip] ?? TIP_RENK.diger)}
                      >
                        {t(TIP_ETIKET[c.tip] ?? c.tip)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm">
                      {c.cariGrup?.ad ?? "-"}
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm">
                      {cariIletisim(c, "cep") || cariIletisim(c, "telefon") || "-"}
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm">
                      {cariIletisim(c, "email") || "-"}
                    </TableCell>
                    <TableCell className="text-metin-ikinci text-sm">
                      {c.sektor ?? "-"}
                    </TableCell>
                    <TableCell>
                      <DurumRozet durum={c.aktifMi ? "aktif" : "pasif"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            setDuzenlenecekCariId(c.id);
                            setDrawerAcik(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            aktiflikDegistir(c);
                          }}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {toplamSayfa > 1 && (
            <div className="flex items-center justify-between border-t border-kenarlik px-4 py-3">
              <p className="text-sm text-metin-ikinci">
                {(sayfa - 1) * SAYFA_BOYUT + 1}-{Math.min(sayfa * SAYFA_BOYUT, toplam)} / {toplam}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={sayfa === 1} onClick={() => setSayfa((s) => s - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={sayfa === toplamSayfa} onClick={() => setSayfa((s) => s + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cari Form Drawer */}
      <CariFormDrawer
        acik={drawerAcik}
        kapat={() => setDrawerAcik(false)}
        cariId={duzenlenecekCariId}
        onKaydet={() => void yukle()}
      />
    </div>
  );
}
