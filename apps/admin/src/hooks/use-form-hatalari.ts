/**
 * useFormHatalari — Form validation hatalarını yönetir.
 *
 * Zod şeması veya manuel validator fonksiyonu ile çalışır.
 * Inline validation feedback için kullanılır (FormAlani ile uyumlu).
 *
 * Kullanım (Zod ile):
 *   const { hatalar, dogrula, hataAyarla, temizle } = useFormHatalari(MySchema);
 *   const sonuc = dogrula(form);  // boolean — geçerli mi?
 *   if (!sonuc) return; // hatalar otomatik set edildi
 *
 *   <FormAlani.Metin hata={hatalar.kod} ... />
 *
 * Kullanım (manuel):
 *   const { hatalar, hataAyarla, temizle } = useFormHatalari();
 *   if (!form.kod) hataAyarla("kod", "Kod zorunlu");
 */
import { useState, useCallback } from "react";
import type { ZodSchema } from "zod";

export type FormHatalari = Record<string, string>;

export function useFormHatalari<T = unknown>(sema?: ZodSchema<T>) {
  const [hatalar, setHatalar] = useState<FormHatalari>({});

  /**
   * Zod ile doğrula. Hatalı ise hatalar state'ini doldurur, false döner.
   * Geçerli ise true döner.
   */
  const dogrula = useCallback((veri: unknown): boolean => {
    if (!sema) {
      console.warn("useFormHatalari: dogrula() çağrıldı ama sema verilmedi");
      return true;
    }
    const sonuc = sema.safeParse(veri);
    if (sonuc.success) {
      setHatalar({});
      return true;
    }
    const yeniHatalar: FormHatalari = {};
    for (const issue of sonuc.error.issues) {
      const yol = issue.path.join(".");
      if (yol && !yeniHatalar[yol]) {
        yeniHatalar[yol] = issue.message;
      }
    }
    setHatalar(yeniHatalar);
    return false;
  }, [sema]);

  /**
   * Belirli bir alana manuel hata ata.
   */
  const hataAyarla = useCallback((alan: string, mesaj: string) => {
    setHatalar((eski) => ({ ...eski, [alan]: mesaj }));
  }, []);

  /**
   * Belirli bir alandan hatayı temizle (ör: kullanıcı düzeltirken).
   */
  const hataTemizle = useCallback((alan: string) => {
    setHatalar((eski) => {
      const yeni = { ...eski };
      delete yeni[alan];
      return yeni;
    });
  }, []);

  /**
   * Tüm hataları temizle (ör: drawer açılışı).
   */
  const temizle = useCallback(() => {
    setHatalar({});
  }, []);

  return { hatalar, dogrula, hataAyarla, hataTemizle, temizle };
}
