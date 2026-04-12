import { kullanAuthStore } from "@/lib/auth-store";

/**
 * Aktif kullanici bilgisi + auth aksiyonlari.
 * Auth store'un seciminden turetilmis helper.
 */
export function kullanKullanici() {
  const kullanici = kullanAuthStore((s) => s.kullanici);
  const aktifMagazaId = kullanAuthStore((s) => s.aktifMagazaId);
  const yukleniyor = kullanAuthStore((s) => s.yukleniyor);
  const cikis = kullanAuthStore((s) => s.cikis);
  const magazaSec = kullanAuthStore((s) => s.magazaSec);

  return {
    kullanici,
    aktifMagazaId,
    yukleniyor,
    girisYapilmis: Boolean(kullanici),
    cikis,
    magazaSec,
  };
}
