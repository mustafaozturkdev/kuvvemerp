import { createRootRouteWithContext, Outlet, ScrollRestoration, Link } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { Home, AlertTriangle, FileQuestion, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KomutPaleti } from "@/components/komut-paleti/KomutPaleti";
import { OnaySaglayici } from "@/components/ortak/OnayDialog";
import { Button } from "@/components/ui/button";

const TanStackRouterDevtools =
  import.meta.env.PROD
    ? () => null
    : lazy(() =>
        import("@tanstack/react-router-devtools").then((mod) => ({
          default: mod.TanStackRouterDevtools,
        })).catch(() => ({ default: () => null })),
      );

interface YonlendiriciContext {
  queryClient: QueryClient;
}

function SayfaBulunamadi() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-arkaplan text-metin">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-birincil-zemin">
          <FileQuestion className="h-10 w-10 text-birincil" />
        </div>
        <h1 className="mt-6 text-6xl font-bold tracking-tight text-metin">{t("hata-sayfa.404-baslik")}</h1>
        <p className="mt-2 text-lg font-medium text-metin-ikinci">
          {t("hata-sayfa.404-mesaj")}
        </p>
        <p className="mt-1 text-sm text-metin-pasif">
          {t("hata-sayfa.404-aciklama")}
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4" /> {t("genel.ana-sayfa")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            {t("genel.geri-don")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HataSayfasi({ error, reset }: { error: any; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-arkaplan text-metin">
      <div className="flex max-w-lg flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--renk-tehlike)]/10">
          <AlertTriangle className="h-10 w-10 text-[color:var(--renk-tehlike)]" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-metin">
          {t("hata-sayfa.500-baslik")}
        </h1>
        <p className="mt-2 text-sm text-metin-ikinci">
          {t("hata-sayfa.500-aciklama")}
        </p>
        {import.meta.env.DEV && error?.message && (
          <pre className="mt-4 max-h-40 w-full overflow-auto rounded-lg border border-kenarlik bg-yuzey p-3 text-left text-xs text-metin-ikinci">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex gap-3">
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" /> {t("hata-sayfa.tekrar-dene")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">
              <Home className="h-4 w-4" /> {t("genel.ana-sayfa")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<YonlendiriciContext>()({
  component: KokLayout,
  notFoundComponent: SayfaBulunamadi,
  errorComponent: HataSayfasi,
});

function KokLayout() {
  return (
    <OnaySaglayici>
      <Outlet />
      <KomutPaleti />
      <ScrollRestoration />
      <Suspense fallback={null}>
        <TanStackRouterDevtools />
      </Suspense>
    </OnaySaglayici>
  );
}
