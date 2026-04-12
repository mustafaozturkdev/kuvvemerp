import { create } from "zustand";
import { useEffect } from "react";

interface CmdKDurum {
  acik: boolean;
  deger: string;
  ac: () => void;
  kapat: () => void;
  degistir: (v: boolean) => void;
  degerAyarla: (d: string) => void;
  gecmisEkle: (komutId: string) => void;
  gecmis: string[];
}

const GECMIS_ANAHTAR = "kuvvem-komut-gecmis";

function gecmisYukle(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const ham = window.localStorage.getItem(GECMIS_ANAHTAR);
    if (!ham) return [];
    const liste = JSON.parse(ham);
    return Array.isArray(liste) ? liste.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export const kullanCmdKStore = create<CmdKDurum>((set, get) => ({
  acik: false,
  deger: "",
  gecmis: gecmisYukle(),
  ac: () => set({ acik: true }),
  kapat: () => set({ acik: false, deger: "" }),
  degistir: (v) => set({ acik: v, deger: v ? get().deger : "" }),
  degerAyarla: (d) => set({ deger: d }),
  gecmisEkle: (komutId) => {
    const mevcut = get().gecmis.filter((x) => x !== komutId);
    const yeni = [komutId, ...mevcut].slice(0, 10);
    set({ gecmis: yeni });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GECMIS_ANAHTAR, JSON.stringify(yeni));
      } catch {
        /* ignore */
      }
    }
  },
}));

/**
 * Global Cmd+K / Ctrl+K dinleyicisi. KokLayout'tan bir kere cagrilmali.
 */
export function kullanCmdKKisayol() {
  const degistir = kullanCmdKStore((s) => s.degistir);
  const acik = kullanCmdKStore((s) => s.acik);
  useEffect(() => {
    const dinleyici = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        degistir(!acik);
      }
      if (e.key === "Escape" && acik) {
        degistir(false);
      }
    };
    window.addEventListener("keydown", dinleyici);
    return () => window.removeEventListener("keydown", dinleyici);
  }, [acik, degistir]);
}
