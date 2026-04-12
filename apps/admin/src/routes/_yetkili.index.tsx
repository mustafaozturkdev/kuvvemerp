import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  Plus,
  FileText,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { DurumRozet, type DurumAnahtar } from "@/components/ortak/DurumRozet";
import { TarihGosterim } from "@/components/ortak/TarihGosterim";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/")({
  component: Dashboard,
});

interface Kpi {
  anahtar: string;
  etiket: string;
  deger: number;
  paraBirimi?: string;
  yuzdeFark: number;
  ikon: LucideIcon;
}

const ORNEK_KPI: Kpi[] = [
  {
    anahtar: "ciro",
    etiket: "dashboard.bugunku-ciro",
    deger: 148_350.75,
    paraBirimi: "TRY",
    yuzdeFark: 12.4,
    ikon: DollarSign,
  },
  {
    anahtar: "siparis",
    etiket: "dashboard.siparis-sayisi",
    deger: 87,
    yuzdeFark: 4.2,
    ikon: ShoppingCart,
  },
  {
    anahtar: "yeni-musteri",
    etiket: "dashboard.yeni-musteri",
    deger: 12,
    yuzdeFark: -8.1,
    ikon: Users,
  },
  {
    anahtar: "acik-siparis",
    etiket: "dashboard.acik-siparis",
    deger: 23,
    yuzdeFark: 0,
    ikon: Package,
  },
];

interface SonSiparis {
  id: string;
  no: string;
  musteri: string;
  tutar: number;
  durum: DurumAnahtar;
  tarih: string;
}

const ORNEK_SIPARIS: SonSiparis[] = [
  { id: "1", no: "SIP-2041", musteri: "Acme Tekstil Ltd.", tutar: 12450, durum: "tamamlandi", tarih: "2026-04-10T10:14:00Z" },
  { id: "2", no: "SIP-2040", musteri: "Mavi Deniz A.S.", tutar: 3250.50, durum: "beklemede", tarih: "2026-04-10T09:58:00Z" },
  { id: "3", no: "SIP-2039", musteri: "Demir Insaat", tutar: 28700, durum: "onaylandi", tarih: "2026-04-10T08:42:00Z" },
  { id: "4", no: "SIP-2038", musteri: "Gunes Market", tutar: 1875.25, durum: "gonderildi", tarih: "2026-04-09T17:20:00Z" },
  { id: "5", no: "SIP-2037", musteri: "Yildiz Elektronik", tutar: 9600, durum: "tamamlandi", tarih: "2026-04-09T16:05:00Z" },
];

function Dashboard() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-metin">
          {t("dashboard.baslik")}
        </h1>
        <p className="text-sm text-metin-ikinci">{t("dashboard.altyazi")}</p>
      </header>

      {/* KPI kartlari */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ORNEK_KPI.map((kpi) => {
          const Ikon = kpi.ikon;
          const artiyor = kpi.yuzdeFark > 0;
          const azaliyor = kpi.yuzdeFark < 0;
          return (
            <Card key={kpi.anahtar} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-[11px] font-semibold uppercase tracking-wider">
                  {t(kpi.etiket)}
                </CardDescription>
                <Ikon className="h-4 w-4 text-metin-ikinci" />
              </CardHeader>
              <CardContent>
                <div className="text-[28px] font-semibold leading-none tracking-tight text-metin">
                  {kpi.paraBirimi ? (
                    <ParaTutar tutar={kpi.deger} paraBirimi={kpi.paraBirimi} />
                  ) : (
                    kpi.deger.toLocaleString("tr-TR")
                  )}
                </div>
                <div
                  className={cn(
                    "mt-2 flex items-center gap-1 text-[12px] font-medium",
                    artiyor && "text-[color:var(--renk-basarili)]",
                    azaliyor && "text-[color:var(--renk-tehlike)]",
                    !artiyor && !azaliyor && "text-metin-ikinci",
                  )}
                >
                  {artiyor && <TrendingUp className="h-3.5 w-3.5" />}
                  {azaliyor && <TrendingDown className="h-3.5 w-3.5" />}
                  <span>
                    {kpi.yuzdeFark > 0 ? "+" : ""}
                    {kpi.yuzdeFark.toFixed(1)}%
                  </span>
                  <span className="text-metin-pasif">
                    {t("dashboard.gun-oncesine-gore")}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Hizli eylemler */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.hizli-eylemler")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Plus /> Yeni Satis
          </Button>
          <Button variant="outline">
            <Users /> Yeni Musteri
          </Button>
          <Button variant="outline">
            <Package /> Yeni Urun
          </Button>
          <Button variant="outline">
            <FileText /> Fatura Kes
          </Button>
          <Button variant="outline">
            <BarChart3 /> Gun Sonu
          </Button>
        </CardContent>
      </Card>

      {/* Son siparisler */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.son-siparisler")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Siparis No</TableHead>
                <TableHead>Musteri</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ORNEK_SIPARIS.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-birincil">{s.no}</TableCell>
                  <TableCell className="font-medium">{s.musteri}</TableCell>
                  <TableCell className="text-right">
                    <ParaTutar tutar={s.tutar} paraBirimi="TRY" />
                  </TableCell>
                  <TableCell>
                    <DurumRozet durum={s.durum} />
                  </TableCell>
                  <TableCell>
                    <TarihGosterim tarih={s.tarih} goreceli />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
