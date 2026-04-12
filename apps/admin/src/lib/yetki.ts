import { kullanAuthStore } from "./auth-store";

/**
 * Yetki kontrol helper'ları.
 * Backend'den gelen izinler string array: ["siparis.olustur", "cari.goruntule", ...]
 * Wildcard destekli: "siparis.*"
 */

export function yetkiVarMi(izin: string): boolean {
  const kullanici = kullanAuthStore.getState().kullanici;
  if (!kullanici) return false;
  const izinler = kullanici.izinler ?? [];
  if (izinler.includes("*")) return true;
  if (izinler.includes(izin)) return true;
  // Wildcard: "siparis.*" kontrolü
  const [modul] = izin.split(".");
  return izinler.includes(`${modul}.*`);
}

export function herhangiBirYetki(izinler: string[]): boolean {
  return izinler.some(yetkiVarMi);
}

export function tumYetkilerVar(izinler: string[]): boolean {
  return izinler.every(yetkiVarMi);
}
