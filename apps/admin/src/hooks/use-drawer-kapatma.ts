/**
 * useDrawerKapatma — Drawer/Modal kapatma davranışını standartlaştırır.
 *
 * - ESC tuşuna basınca kapat (meşgul değilken)
 * - Meşgul ise (kaydediyor/yukleniyor) kapatmayı engelle
 * - Body scroll'u kilitler (açıkken arka plan scroll olmasın)
 * - İlk focus edilebilir input'a auto-focus
 * - `dirty=true` ise kapatmadan önce onay iste (kaybedilecek değişiklikler)
 *
 * Kullanım (basit):
 *   const { guvenlikapat, drawerRef } = useDrawerKapatma({
 *     acik,
 *     kapat,
 *     mesgul: kaydediyor || yukleniyor,
 *   });
 *
 * Kullanım (dirty kontrolü ile):
 *   const onay = useOnay();
 *   const { dirty, sifirla } = useDirtyForm(form);
 *   const { guvenlikapat, drawerRef } = useDrawerKapatma({
 *     acik,
 *     kapat,
 *     mesgul: kaydediyor,
 *     dirty,
 *     onay,
 *   });
 */
import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface OnayInterface {
  goster: (opts: {
    baslik?: string;
    mesaj: string;
    varyant?: "bilgi" | "uyari" | "tehlike";
    onayMetni?: string;
    iptalMetni?: string;
  }) => Promise<boolean>;
}

interface UseDrawerKapatmaOzellik {
  acik: boolean;
  kapat: () => void;
  mesgul?: boolean;
  dirty?: boolean;
  onay?: OnayInterface;
}

export function useDrawerKapatma({
  acik,
  kapat,
  mesgul = false,
  dirty = false,
  onay,
}: UseDrawerKapatmaOzellik) {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);

  const guvenlikapat = useCallback(async () => {
    if (mesgul) return;
    if (dirty && onay) {
      const tamam = await onay.goster({
        baslik: t("genel.unsaved-baslik"),
        mesaj: t("genel.unsaved-mesaj"),
        varyant: "uyari",
        onayMetni: t("genel.devam-et"),
        iptalMetni: t("genel.vazgec"),
      });
      if (!tamam) return;
    }
    kapat();
  }, [mesgul, dirty, onay, kapat, t]);

  // ESC tuşu
  useEffect(() => {
    if (!acik) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void guvenlikapat();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [acik, guvenlikapat]);

  // Body scroll kilit
  useEffect(() => {
    if (!acik) return;
    const eskiOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = eskiOverflow;
    };
  }, [acik]);

  // İlk input'a auto-focus
  useEffect(() => {
    if (!acik) return;
    const zamanlayici = setTimeout(() => {
      const oge = drawerRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])',
      );
      oge?.focus();
    }, 150);
    return () => clearTimeout(zamanlayici);
  }, [acik]);

  return { guvenlikapat, drawerRef };
}
