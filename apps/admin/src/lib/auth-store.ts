import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Kullanici {
  id: number;
  publicId: string;
  adSoyad: string;
  email: string;
  rol: string;
  izinler: string[];
  avatarUrl?: string | null;
  aktifMagazaId?: number | null;
  magazalar?: Array<{ id: number; ad: string }>;
}

export interface AuthDurum {
  accessToken: string | null;
  refreshToken: string | null;
  kullanici: Kullanici | null;
  aktifMagazaId: number | null;
  yukleniyor: boolean;
  giris: (email: string, sifre: string) => Promise<void>;
  cikis: () => void;
  yenile: () => Promise<boolean>;
  kullaniciAyarla: (k: Kullanici | null) => void;
  magazaSec: (magazaId: number | null) => void;
}

/**
 * Zustand auth store — persist ile localStorage'e yazar.
 * Hook ismi `kullanAuthStore`, component içinden `const u = kullanAuthStore((s) => s.kullanici)` gibi çağrılır.
 */
export const kullanAuthStore = create<AuthDurum>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      kullanici: null,
      aktifMagazaId: null,
      yukleniyor: false,

      giris: async (email: string, sifre: string) => {
        set({ yukleniyor: true });
        try {
          // Lazy import → circular import'u önle
          const { apiIstemci } = await import("./api-client");
          const cevap = await apiIstemci.post<{
            veri: { accessToken: string; refreshToken: string; kullanici: Kullanici };
          }>("/auth/giris", { email, sifre });

          const { accessToken, refreshToken, kullanici } = cevap.data.veri;
          set({
            accessToken,
            refreshToken,
            kullanici,
            aktifMagazaId: kullanici.aktifMagazaId ?? null,
            yukleniyor: false,
          });
        } catch (hata) {
          set({ yukleniyor: false });
          throw hata;
        }
      },

      cikis: () => {
        set({
          accessToken: null,
          refreshToken: null,
          kullanici: null,
          aktifMagazaId: null,
        });
      },

      yenile: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const { apiIstemci } = await import("./api-client");
          const cevap = await apiIstemci.post<{
            veri: { accessToken: string; refreshToken: string };
          }>("/auth/yenile", { refreshToken });
          set({
            accessToken: cevap.data.veri.accessToken,
            refreshToken: cevap.data.veri.refreshToken,
          });
          return true;
        } catch {
          return false;
        }
      },

      kullaniciAyarla: (k) => set({ kullanici: k }),
      magazaSec: (magazaId) => set({ aktifMagazaId: magazaId }),
    }),
    {
      name: "kuvvem-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (durum) => ({
        accessToken: durum.accessToken,
        refreshToken: durum.refreshToken,
        kullanici: durum.kullanici,
        aktifMagazaId: durum.aktifMagazaId,
      }),
    },
  ),
);
