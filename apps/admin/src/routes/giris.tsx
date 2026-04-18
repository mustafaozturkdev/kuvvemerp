import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Loader2, Mail, Lock } from "lucide-react";
import { z } from "zod";
import { kullanAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { ZodForm } from "@/components/form/ZodForm";
import { toast } from "@/hooks/use-toast";

const girisSemasi = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  sifre: z.string().min(6, "Şifre en az 6 karakter olmalı"),
  beniHatirla: z.boolean().optional(),
});

type GirisDeger = z.infer<typeof girisSemasi>;

export const Route = createFileRoute("/giris")({
  beforeLoad: () => {
    const token = kullanAuthStore.getState().accessToken;
    if (token) {
      throw redirect({ to: "/" });
    }
  },
  component: GirisSayfa,
});

function GirisSayfa() {
  const { t } = useTranslation();
  const yonlendir = useNavigate();
  const giris = kullanAuthStore((s) => s.giris);
  const yukleniyor = kullanAuthStore((s) => s.yukleniyor);

  const gonder = async (veri: GirisDeger) => {
    try {
      await giris(veri.email, veri.sifre);
      toast.basarili(t("genel.basarili"));
      void yonlendir({ to: "/" });
    } catch {
      toast.hata(t("giris.hatali-bilgi"));
    }
  };

  return (
    <div className="flex min-h-screen bg-arkaplan">
      {/* Sol panel — brand (lg+) */}
      <div
        className="relative hidden flex-1 overflow-hidden lg:block"
        style={{
          background:
            "radial-gradient(120% 80% at 20% 0%, var(--renk-birincil) 0%, var(--renk-birincil-hover) 45%, oklch(0.22 0.10 260) 100%)",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_100%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative z-10 flex h-full flex-col p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-xl font-bold backdrop-blur-sm">
              K
            </div>
            <div>
              <div className="text-lg font-semibold">Kuvvem</div>
              <div className="text-xs uppercase tracking-wider opacity-70">
                ERP v2
              </div>
            </div>
          </div>
          <div className="my-auto max-w-md">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              {t("giris.baslik")}
            </h1>
            <p className="mt-4 text-base leading-relaxed opacity-80">
              {t("giris.slogan")}
            </p>
          </div>
          <div className="flex items-center justify-between text-xs opacity-60">
            <span>© {new Date().getFullYear()} Kuvvem</span>
            <span>v2.0</span>
          </div>
        </div>
      </div>

      {/* Sag panel — form */}
      <div className="flex w-full items-center justify-center px-6 lg:w-[480px]">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-metin">
            {t("giris.baslik")}
          </h2>
          <p className="mt-1 text-sm text-metin-ikinci">{t("giris.altyazi")}</p>

          <ZodForm
            sema={girisSemasi}
            defaultValues={{ email: "", sifre: "", beniHatirla: false }}
            onGonder={gonder}
            className="mt-8 flex flex-col gap-4"
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giris.email")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
                          <Input
                            type="email"
                            autoComplete="email"
                            placeholder="ornek@kuvvem.com"
                            className="pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sifre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giris.sifre")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
                          <Input
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between text-[13px]">
                  <label className="flex cursor-pointer items-center gap-2 text-metin-ikinci">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-kenarlik accent-[color:var(--renk-birincil)]"
                      {...form.register("beniHatirla")}
                    />
                    {t("giris.beni-hatirla")}
                  </label>
                  <a
                    href="#"
                    className="text-birincil hover:underline"
                  >
                    {t("giris.sifremi-unuttum")}
                  </a>
                </div>

                <Button type="submit" size="lg" disabled={yukleniyor} className="mt-2">
                  {yukleniyor && <Loader2 className="animate-spin" />}
                  {t("giris.giris-yap")}
                </Button>
              </>
            )}
          </ZodForm>
        </div>
      </div>
    </div>
  );
}
