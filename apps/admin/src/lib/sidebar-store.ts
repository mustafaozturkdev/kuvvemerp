import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarDurum {
  daraltilmis: boolean;
  geciciAcik: boolean;
  mobilAcik: boolean;
  daraltToggle: () => void;
  geciciGenislet: () => void;
  navigasyonSonrasi: () => void;
  mobilToggle: () => void;
  mobilKapat: () => void;
}

export const kullanSidebarStore = create<SidebarDurum>()(
  persist(
    (set, get) => ({
      daraltilmis: false,
      geciciAcik: false,
      mobilAcik: false,

      daraltToggle: () =>
        set((s) => ({ daraltilmis: !s.daraltilmis, geciciAcik: false })),

      geciciGenislet: () => {
        const { daraltilmis, geciciAcik } = get();
        if (daraltilmis && !geciciAcik) set({ geciciAcik: true });
      },

      navigasyonSonrasi: () => {
        if (get().geciciAcik) set({ geciciAcik: false });
      },

      mobilToggle: () => set((s) => ({ mobilAcik: !s.mobilAcik })),
      mobilKapat: () => set({ mobilAcik: false }),
    }),
    {
      name: "kuvvem-sidebar",
      partialize: (s) => ({ daraltilmis: s.daraltilmis }),
    },
  ),
);
