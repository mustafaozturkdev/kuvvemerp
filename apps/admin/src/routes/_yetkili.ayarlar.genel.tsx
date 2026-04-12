import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Monitor, Languages } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { kullanTema } from "@/hooks/use-tema";
import { kullanKullanici } from "@/hooks/use-kullanici";
import type { Tema } from "@/lib/tema-store";

export const Route = createFileRoute("/_yetkili/ayarlar/genel")({
  component: AyarlarSayfa,
});

function AyarlarSayfa() {
  const { t, i18n } = useTranslation();
  const { tema, temaDegistir } = kullanTema();
  const { kullanici } = kullanKullanici();

  const temalar: { deger: Tema; etiket: string; ikon: typeof Sun }[] = [
    { deger: "acik", etiket: "Acik", ikon: Sun },
    { deger: "koyu", etiket: "Koyu", ikon: Moon },
    { deger: "sistem", etiket: "Sistem", ikon: Monitor },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-metin">
          {t("menu.ayarlar")}
        </h1>
        <p className="text-sm text-metin-ikinci">
          Kullanici ve gorunum tercihleri
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Temel hesap bilgileri</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between border-b border-kenarlik py-2">
            <span className="text-metin-ikinci">Ad Soyad</span>
            <span className="font-medium">{kullanici?.adSoyad ?? "-"}</span>
          </div>
          <div className="flex justify-between border-b border-kenarlik py-2">
            <span className="text-metin-ikinci">E-posta</span>
            <span className="font-medium">{kullanici?.email ?? "-"}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-metin-ikinci">Rol</span>
            <span className="font-medium">{kullanici?.rol ?? "-"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gorunum</CardTitle>
          <CardDescription>Tema tercihi</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {temalar.map((t2) => {
            const Ikon = t2.ikon;
            const aktif = tema === t2.deger;
            return (
              <Button
                key={t2.deger}
                variant={aktif ? "default" : "outline"}
                onClick={() => temaDegistir(t2.deger)}
              >
                <Ikon />
                {t2.etiket}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dil</CardTitle>
          <CardDescription>Uygulama dili</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["tr", "en"] as const).map((dil) => (
            <Button
              key={dil}
              variant={i18n.language === dil ? "default" : "outline"}
              onClick={() => void i18n.changeLanguage(dil)}
            >
              <Languages />
              {dil.toUpperCase()}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
