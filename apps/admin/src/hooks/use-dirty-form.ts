/**
 * useDirtyForm — Formda değişiklik olup olmadığını takip eder.
 *
 * Başlangıç değeri JSON olarak saklanır, mevcut form değerine kıyaslanır.
 * `dirty` = form başlangıçtan değiştirildi mi?
 *
 * Kullanım:
 *   const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
 *
 *   // Form yüklendiğinde / açıldığında:
 *   useEffect(() => {
 *     if (acik) baslangicAyarla(yeniForm);
 *   }, [acik, hesapId]);
 *
 *   // Kayıt başarılı sonrası:
 *   sifirla();
 */
import { useState, useMemo, useCallback } from "react";

export function useDirtyForm<T>(mevcut: T) {
  const [baslangic, setBaslangic] = useState<string>(() => JSON.stringify(mevcut));

  const dirty = useMemo(() => {
    return JSON.stringify(mevcut) !== baslangic;
  }, [mevcut, baslangic]);

  const baslangicAyarla = useCallback((yeniBaslangic: T) => {
    setBaslangic(JSON.stringify(yeniBaslangic));
  }, []);

  const sifirla = useCallback(() => {
    setBaslangic(JSON.stringify(mevcut));
  }, [mevcut]);

  return { dirty, baslangicAyarla, sifirla };
}
