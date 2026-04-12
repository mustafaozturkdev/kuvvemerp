import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { kullanAuthStore } from "./auth-store";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export const apiIstemci = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

apiIstemci.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = kullanAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const magazaId = kullanAuthStore.getState().aktifMagazaId;
  if (magazaId && config.headers) {
    config.headers["X-Magaza-Id"] = String(magazaId);
  }
  return config;
});

let yenilemeMesgul: Promise<boolean> | null = null;

apiIstemci.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const orijinalIstek = error.config as (InternalAxiosRequestConfig & { _yeniden?: boolean }) | undefined;

    if (error.response?.status === 401 && orijinalIstek && !orijinalIstek._yeniden) {
      orijinalIstek._yeniden = true;

      yenilemeMesgul ??= kullanAuthStore.getState().yenile();
      const yenilendi = await yenilemeMesgul;
      yenilemeMesgul = null;

      if (yenilendi) {
        return apiIstemci.request(orijinalIstek);
      }
      kullanAuthStore.getState().cikis();
    }

    return Promise.reject(error);
  },
);

/**
 * API cevap zarfı — backend kontratı.
 * { veri, meta, hata }
 */
export interface ApiCevap<T> {
  veri: T;
  meta?: { toplam?: number; sayfa?: number; boyut?: number };
  hata: null | { kod: string; mesaj: string };
}
