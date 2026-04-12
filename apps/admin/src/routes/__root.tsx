import { createRootRouteWithContext, Outlet, ScrollRestoration } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { KomutPaleti } from "@/components/komut-paleti/KomutPaleti";

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

export const Route = createRootRouteWithContext<YonlendiriciContext>()({
  component: KokLayout,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-arkaplan text-metin">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-metin-ikinci">Sayfa bulunamadi</p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-arkaplan text-metin">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-tehlike">Bir hata olustu</h1>
        <p className="mt-2 text-sm text-metin-ikinci">{error.message}</p>
      </div>
    </div>
  ),
});

function KokLayout() {
  return (
    <>
      <Outlet />
      <KomutPaleti />
      <ScrollRestoration />
      <Suspense fallback={null}>
        <TanStackRouterDevtools />
      </Suspense>
    </>
  );
}
