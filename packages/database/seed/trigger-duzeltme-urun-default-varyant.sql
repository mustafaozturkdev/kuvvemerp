-- Kuvvem v2 — trg_urun_default_varyant trigger duzeltmesi
-- Tarih: 2026-04-18
-- Sorun: Trigger 'sistem_ayar' tablosundan 'anahtar=ana_para_birimi' ile 'deger'
--        kolonunu okumaya calisiyor, ama tablo tek satir + kolon bazli tasarimda
--        (anahtar-deger degil). 'varsayilan_para_birimi' kolonu var.
-- Cozum: Trigger gerçek sistem_ayar semasini kullanacak sekilde duzeltilir.

CREATE OR REPLACE FUNCTION public.trg_urun_default_varyant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_ana_para char(3);
BEGIN
    -- Ana para birimini sistem_ayar tablosundan oku (fallback: 'TRY')
    SELECT COALESCE(
        (SELECT varsayilan_para_birimi FROM sistem_ayar LIMIT 1),
        'TRY'::char(3)
    ) INTO v_ana_para;

    INSERT INTO urun_varyant (
        urun_id, sku, varyant_ad, varsayilan_mi, eksen_kombinasyon,
        para_birimi_kod, birim_id, olusturan_kullanici_id
    ) VALUES (
        NEW.id,
        NEW.kod,           -- default SKU = urun kodu
        NEW.ad,            -- default varyantAd = urun adi
        true,              -- varsayilan varyant
        '{}'::jsonb,       -- eksen kombinasyonu bos
        v_ana_para,
        NEW.ana_birim_id,
        NEW.olusturan_kullanici_id
    )
    -- Seed dosyalarinin idempotent olabilmesi icin: ayni urun_id+sku varsa atla
    ON CONFLICT (sku) DO NOTHING;

    RETURN NEW;
END;
$function$;

-- Dogrulama
SELECT 'Trigger guncellendi' AS bilgi, proname AS fonksiyon
FROM pg_proc
WHERE proname = 'trg_urun_default_varyant';
