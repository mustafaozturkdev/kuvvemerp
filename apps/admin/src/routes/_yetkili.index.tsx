import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserCheck,
  ShieldCheck,
  Activity,
  Plus,
  Package,
  FileText,
  BarChart3,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { apiIstemci } from "@/lib/api-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/")({
  component: Dashboard,
});

interface DashboardIstatistik {
  cariSayisi: number;
  aktifCariSayisi: number;
  kullaniciSayisi: number;
  aktifKullaniciSayisi: number;
  sonYediGunOturum: number;
}

interface KpiKart {
  anahtar: string;
  etiket: string;
  deger: number;
  aciklama: string;
  ikon: LucideIcon;
  renk: string;
}

function Dashboard() {
  const { t } = useTranslation();
  const [istatistik, setIstatistik] = useState<DashboardIstatistik | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const yukle = async () => {
      try {
        const res = await apiIstemci.get<DashboardIstatistik>(
          "/dashboard/istatistik",
        );
        setIstatistik(res.data);
      } catch {
        toast.hata(t("dashboard.istatistik-yuklenemedi"));
      }
      setYukleniyor(false);
    };
    void yukle();
  }, []);

  const kartlar: KpiKart[] = istatistik
    ? [
        {
          anahtar: "cari",
          etiket: t("dashboard.toplam-cari"),
          deger: istatistik.cariSayisi,
          aciklama: `${istatistik.aktifCariSayisi} aktif`,
          ikon: Users,
          renk: "text-blue-600 dark:text-blue-400",
        },
        {
          anahtar: "kullanici",
          etiket: t("dashboard.kullanicilar"),
          deger: istatistik.kullaniciSayisi,
          aciklama: `${istatistik.aktifKullaniciSayisi} aktif`,
          ikon: UserCheck,
          renk: "text-green-600 dark:text-green-400",
        },
        {
          anahtar: "oturum",
          etiket: t("dashboard.son-7-gun-giris"),
          deger: istatistik.sonYediGunOturum,
          aciklama: "oturum açıldı",
          ikon: Activity,
          renk: "text-purple-600 dark:text-purple-400",
        },
        {
          anahtar: "aktif-cari",
          etiket: t("dashboard.aktif-cariler"),
          deger: istatistik.aktifCariSayisi,
          aciklama: `${istatistik.cariSayisi > 0 ? Math.round((istatistik.aktifCariSayisi / istatistik.cariSayisi) * 100) : 0}% oran`,
          ikon: ShieldCheck,
          renk: "text-amber-600 dark:text-amber-400",
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-metin">
          {t("dashboard.baslik")}
        </h1>
        <p className="text-sm text-metin-ikinci">{t("dashboard.altyazi")}</p>
      </header>

      {/* KPI kartlari */}
      {yukleniyor ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-metin-pasif" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : istatistik ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kartlar.map((kpi) => {
            const Ikon = kpi.ikon;
            return (
              <Card key={kpi.anahtar} className="overflow-hidden">
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardDescription className="text-[11px] font-semibold uppercase tracking-wider">
                    {kpi.etiket}
                  </CardDescription>
                  <Ikon className={cn("h-4 w-4", kpi.renk)} />
                </CardHeader>
                <CardContent>
                  <div className="text-[28px] font-semibold leading-none tracking-tight text-metin">
                    {kpi.deger.toLocaleString("tr-TR")}
                  </div>
                  <p className="mt-2 text-[12px] text-metin-ikinci">
                    {kpi.aciklama}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-metin-ikinci">
            <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{t("dashboard.istatistik-yuklenemedi")}</p>
          </CardContent>
        </Card>
      )}

      {/* Hizli eylemler */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.hizli-eylemler")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/cari/liste">
              <Users /> {t("dashboard.cariler")}
            </Link>
          </Button>
          <Button variant="outline">
            <Plus /> {t("dashboard.yeni-satis")}
          </Button>
          <Button variant="outline">
            <Package /> {t("dashboard.yeni-urun")}
          </Button>
          <Button variant="outline">
            <FileText /> {t("dashboard.fatura-kes")}
          </Button>
          <Button variant="outline">
            <BarChart3 /> {t("dashboard.gun-sonu")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
