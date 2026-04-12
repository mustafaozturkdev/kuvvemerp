import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import "@/lib/tema-store";
import { routeTree } from "./routeTree.gen";
import { KuvvemToaster } from "@/components/ui/sonner";
import "@/styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const kokEleman = document.getElementById("root");
if (!kokEleman) {
  throw new Error("#root elementi bulunamadi");
}

ReactDOM.createRoot(kokEleman).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <KuvvemToaster />
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
