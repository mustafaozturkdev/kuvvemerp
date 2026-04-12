import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Tema = "acik" | "koyu" | "sistem";

interface TemaDurum {
  tema: Tema;
  temaDegistir: (yeni: Tema) => void;
}

function sistemTercihi(): "acik" | "koyu" {
  if (typeof window === "undefined") return "acik";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "koyu" : "acik";
}

function uygula(tema: Tema) {
  if (typeof document === "undefined") return;
  const gercek = tema === "sistem" ? sistemTercihi() : tema;
  document.documentElement.dataset.tema = gercek === "koyu" ? "koyu" : "";
}

export const kullanTemaStore = create<TemaDurum>()(
  persist(
    (set) => ({
      tema: "sistem",
      temaDegistir: (yeni) => {
        set({ tema: yeni });
        uygula(yeni);
      },
    }),
    {
      name: "kuvvem-tema",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (durum) => {
        if (durum) uygula(durum.tema);
      },
    },
  ),
);

// İlk çalıştırma — persist hydrate olana kadar sistem'e göre varsayılan
if (typeof window !== "undefined") {
  uygula(kullanTemaStore.getState().tema);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (kullanTemaStore.getState().tema === "sistem") uygula("sistem");
  });
}
