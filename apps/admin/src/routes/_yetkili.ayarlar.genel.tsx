import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Monitor, Languages, Key, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kullanTema } from "@/hooks/use-tema";
import { kullanKullanici } from "@/hooks/use-kullanici";
import { apiIstemci } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import type { Tema } from "@/lib/tema-store";

export const Route = createFileRoute("/_yetkili/ayarlar/genel")({
  component: AyarlarSayfa,
});

function AyarlarSayfa() {
  const { t, i18n } = useTranslation();
  const { tema, temaDegistir } = kullanTema();
  const { kullanici } = kullanKullanici();

  const temalar: { deger: Tema; etiket: string; ikon: typeof Sun }[] = [
    { deger: "acik", etiket: "Açık", ikon: Sun },
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
          Kullanıcı ve görünüm tercihleri
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
          <CardTitle>Görünüm</CardTitle>
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

      <SifreDegistirKarti />
    </div>
  );
}

// ─── Şifre Değiştir ───

function SifreDegistirKarti() {
  const [form, setForm] = useState({ eskiSifre: "", yeniSifre: "", yeniSifreTekrar: "" });
  const [kaydediyor, setKaydediyor] = useState(false);

  const gonder = async () => {
    if (form.yeniSifre !== form.yeniSifreTekrar) {
      toast.hata("Yeni şifreler eşleşmedi");
      return;
    }
    if (form.yeniSifre.length < 6) {
      toast.hata("Şifre en az 6 karakter olmalı");
      return;
    }
    setKaydediyor(true);
    try {
      await apiIstemci.post("/kullanici/sifre-degistir", {
        eskiSifre: form.eskiSifre,
        yeniSifre: form.yeniSifre,
      });
      toast.basarili("Şifre başarıyla değiştirildi");
      setForm({ eskiSifre: "", yeniSifre: "", yeniSifreTekrar: "" });
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? "Şifre değiştirme başarısız";
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5 text-metin-pasif" />
          Şifre Değiştir
        </CardTitle>
        <CardDescription>
          Hesap güvenliği için şifrenizi düzenli olarak değiştirin
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-sm">
        <div>
          <label className="text-sm font-medium text-metin mb-1 block">
            Mevcut Şifre
          </label>
          <Input
            type="password"
            value={form.eskiSifre}
            onChange={(e) => setForm({ ...form, eskiSifre: e.target.value })}
            placeholder="Mevcut şifreniz"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-metin mb-1 block">
            Yeni Şifre
          </label>
          <Input
            type="password"
            value={form.yeniSifre}
            onChange={(e) => setForm({ ...form, yeniSifre: e.target.value })}
            placeholder="En az 6 karakter, büyük/küçük harf, rakam"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-metin mb-1 block">
            Yeni Şifre (Tekrar)
          </label>
          <Input
            type="password"
            value={form.yeniSifreTekrar}
            onChange={(e) => setForm({ ...form, yeniSifreTekrar: e.target.value })}
            placeholder="Yeni şifrenizi tekrar girin"
          />
        </div>
        <Button onClick={gonder} disabled={kaydediyor || !form.eskiSifre || !form.yeniSifre}>
          {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
          Şifre Değiştir
        </Button>
      </CardContent>
    </Card>
  );
}
