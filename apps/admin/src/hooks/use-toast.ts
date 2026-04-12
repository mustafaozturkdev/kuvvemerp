import { toast as sonnerToast } from "sonner";

/**
 * Toast helper — sonner wrapper.
 * Kuvvem v2 standardi: toast.basarili(...), toast.hata(...) ornek API.
 */
export const toast = {
  basarili: (mesaj: string, aciklama?: string) =>
    sonnerToast.success(mesaj, { description: aciklama }),
  hata: (mesaj: string, aciklama?: string) =>
    sonnerToast.error(mesaj, { description: aciklama }),
  bilgi: (mesaj: string, aciklama?: string) =>
    sonnerToast.info(mesaj, { description: aciklama }),
  uyari: (mesaj: string, aciklama?: string) =>
    sonnerToast.warning(mesaj, { description: aciklama }),
  yukleniyor: (mesaj: string) => sonnerToast.loading(mesaj),
  kapat: (id?: string | number) => sonnerToast.dismiss(id),
};

export function kullanToast() {
  return toast;
}
