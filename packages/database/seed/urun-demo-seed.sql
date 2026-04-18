-- Kuvvem v2 — Urun Demo Seed
-- Tarih: 2026-04-18
-- Aciklama: 3 ornek urun + varsayilan fiyat listesi + stok kayitlari.
--           Varyantli ornek API testi ile eklenecektir.
--           Idempotent: ON CONFLICT ile tekrar calisir.
--
-- NOT: urun tablosuna INSERT yapildiginda `trg_urun_default_varyant` trigger'i
--      otomatik bir default varyant olusturur (sku = urun.kod).
--      Seed bu trigger ile uyumlu calisir:
--      1) INSERT urun → trigger olusturur default varyant (sku = URN-XXXX)
--      2) INSERT urun_varyant ON CONFLICT (sku) DO UPDATE → detayli verileri ekler.

BEGIN;

-- ────────────────────────────────────────────────
-- 1) Varsayilan Fiyat Listesi
-- ────────────────────────────────────────────────

INSERT INTO fiyat_listesi (
    kod, ad, aciklama, para_birimi_kod, fiyatlar_kdv_dahil_mi, tip,
    varsayilan_mi, aktif_mi
) VALUES (
    'VARSAYILAN',
    'Varsayilan Fiyat Listesi',
    'Tum musteriler icin ana satis fiyat listesi',
    'TRY',
    true,
    'sabit',
    true,
    true
) ON CONFLICT (kod) DO NOTHING;

-- ────────────────────────────────────────────────
-- 2) Demo Urun verileri (idempotent DO block)
-- ────────────────────────────────────────────────

DO $$
DECLARE
    fl_id         BIGINT;
    v_birim_adet  BIGINT;
    v_kdv_20      BIGINT;
    v_kdv_10      BIGINT;
    v_magaza_id   BIGINT;
    v_kategori_giyim       BIGINT;
    v_kategori_elektronik  BIGINT;
    v_kategori_gida        BIGINT;
    v_marka_nike  BIGINT;
    v_marka_apple BIGINT;
    v_urun_id     BIGINT;
    v_varyant_id  BIGINT;
BEGIN
    -- Referans ID'leri
    SELECT id INTO fl_id        FROM fiyat_listesi WHERE kod = 'VARSAYILAN';
    SELECT id INTO v_birim_adet FROM birim WHERE kod = 'adet';
    SELECT id INTO v_kdv_20     FROM vergi_orani WHERE kod = 'TR_KDV_STANDART' AND oran = 20 LIMIT 1;
    SELECT id INTO v_kdv_10     FROM vergi_orani WHERE kod = 'TR_KDV_INDIRIMLI_10' LIMIT 1;
    SELECT id INTO v_magaza_id  FROM magaza ORDER BY id LIMIT 1;
    SELECT id INTO v_kategori_giyim      FROM kategori WHERE ad = 'Giyim'      LIMIT 1;
    SELECT id INTO v_kategori_elektronik FROM kategori WHERE ad = 'Elektronik' LIMIT 1;
    SELECT id INTO v_kategori_gida       FROM kategori WHERE ad = 'Gıda'       LIMIT 1;
    SELECT id INTO v_marka_nike  FROM marka WHERE ad = 'Nike'  LIMIT 1;
    SELECT id INTO v_marka_apple FROM marka WHERE ad = 'Apple' LIMIT 1;

    -- ═══════════════════════════════════════════
    -- URUN 1: Erkek Klasik Gomlek Beyaz
    -- ═══════════════════════════════════════════
    INSERT INTO urun (
        kod, ad, aciklama, kisa_aciklama,
        kategori_id, marka_id, tip, ana_birim_id,
        vergi_orani_id, fiyatlar_kdv_dahil_mi, stok_takibi,
        eticaret_aktif, eticaret_satilik_mi, aktif_mi,
        seo_url, seo_baslik, seo_aciklama, seo_anahtar_kelimeler,
        fatura_kalem_adi, takma_adi, muhasebe_kodu, sira,
        desi1, desi2, vitrinde_goster, vitrin_sira, yeni_urun,
        b2b_aktif, b2b_satilik_mi, ucretsiz_kargo,
        tahmini_teslim_suresi_gun
    ) VALUES (
        'URN-1001',
        'Erkek Klasik Gomlek Beyaz',
        'Yuksek kaliteli pamuklu kumastan uretilmis slim fit erkek klasik gomlek. Is ve ozel davetler icin idealdir.',
        'Slim fit pamuk erkek gomlek',
        v_kategori_giyim, v_marka_nike, 'fiziksel', v_birim_adet,
        v_kdv_20, true, true,
        true, true, true,
        'erkek-klasik-gomlek-beyaz', 'Erkek Klasik Gomlek Beyaz - Nike',
        'Pamuk kumas, slim fit, klasik gomlek. Hizli kargo, kolay iade.',
        ARRAY['gomlek','erkek','klasik','pamuk','beyaz'],
        'Erkek Gomlek Beyaz M', 'Gomlek', '153.01.001', 1,
        1.500, 1.200, true, 1, true,
        true, true, false,
        2
    ) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad
      RETURNING id INTO v_urun_id;

    -- Trigger default varyanti olusturdu (sku=URN-1001); detay verileri UPDATE ile ekle
    INSERT INTO urun_varyant (
        urun_id, sku, barkod, eksen_kombinasyon, para_birimi_kod,
        birim_id, vergi_orani_id,
        agirlik_gr, en_cm, boy_cm, yukseklik_cm,
        kritik_stok, minimum_stok, varsayilan_mi,
        alis_fiyati, son_alis_fiyati, piyasa_fiyati, satilabilir_son_fiyat,
        kar_marji, fiyat_degisiklik_tarihi
    ) VALUES (
        v_urun_id, 'URN-1001', '8690001000001', '{}'::jsonb, 'TRY',
        v_birim_adet, v_kdv_20,
        300, 70, 50, 2,
        5, 10, true,
        250.00, 245.00, 499.90, 350.00,
        50.00, CURRENT_DATE - INTERVAL '30 day'
    ) ON CONFLICT (sku) DO UPDATE SET
        barkod                  = EXCLUDED.barkod,
        vergi_orani_id          = EXCLUDED.vergi_orani_id,
        agirlik_gr              = EXCLUDED.agirlik_gr,
        en_cm                   = EXCLUDED.en_cm,
        boy_cm                  = EXCLUDED.boy_cm,
        yukseklik_cm            = EXCLUDED.yukseklik_cm,
        kritik_stok             = EXCLUDED.kritik_stok,
        minimum_stok            = EXCLUDED.minimum_stok,
        alis_fiyati             = EXCLUDED.alis_fiyati,
        son_alis_fiyati         = EXCLUDED.son_alis_fiyati,
        piyasa_fiyati           = EXCLUDED.piyasa_fiyati,
        satilabilir_son_fiyat   = EXCLUDED.satilabilir_son_fiyat,
        kar_marji               = EXCLUDED.kar_marji,
        fiyat_degisiklik_tarihi = EXCLUDED.fiyat_degisiklik_tarihi
      RETURNING id INTO v_varyant_id;

    INSERT INTO fiyat_listesi_varyant (fiyat_listesi_id, urun_varyant_id, fiyat, liste_fiyati, minimum_miktar)
    VALUES (fl_id, v_varyant_id, 459.90, 599.90, 1)
    ON CONFLICT (fiyat_listesi_id, urun_varyant_id, minimum_miktar) DO UPDATE SET fiyat = EXCLUDED.fiyat;

    INSERT INTO urun_stok (
        urun_varyant_id, magaza_id, mevcut_miktar, rezerve_miktar, yolda_gelen_miktar,
        ortalama_maliyet, son_alis_fiyati, son_alis_para_birimi, son_alis_tarihi,
        son_giris_tarihi
    ) VALUES (
        v_varyant_id, v_magaza_id, 48, 0, 0,
        245.00, 245.00, 'TRY', CURRENT_DATE - INTERVAL '7 day',
        CURRENT_DATE - INTERVAL '7 day'
    ) ON CONFLICT (urun_varyant_id, magaza_id) DO UPDATE SET mevcut_miktar = EXCLUDED.mevcut_miktar;

    -- ═══════════════════════════════════════════
    -- URUN 2: Bluetooth Kulaklik Pro
    -- ═══════════════════════════════════════════
    INSERT INTO urun (
        kod, ad, aciklama, kisa_aciklama,
        kategori_id, marka_id, tip, ana_birim_id,
        vergi_orani_id, fiyatlar_kdv_dahil_mi, stok_takibi,
        eticaret_aktif, eticaret_satilik_mi, aktif_mi,
        seo_url, seo_baslik, seo_aciklama, seo_anahtar_kelimeler,
        fatura_kalem_adi, takma_adi, muhasebe_kodu, sira,
        desi1, desi2, vitrinde_goster, vitrin_sira, yeni_urun, firsat_urun,
        b2b_aktif, ucretsiz_kargo, garanti_ay,
        tahmini_teslim_suresi_gun
    ) VALUES (
        'URN-1002',
        'Bluetooth Kulaklik Pro - Siyah',
        'Aktif gurultu onleyici, 30 saat pil omru, hizli sarj ozellikleri. Premium ses kalitesi.',
        'ANC Bluetooth kulaklik',
        v_kategori_elektronik, v_marka_apple, 'fiziksel', v_birim_adet,
        v_kdv_20, true, true,
        true, true, true,
        'bluetooth-kulaklik-pro-siyah', 'Bluetooth Kulaklik Pro - Apple',
        'Aktif gurultu onleyici, 30 saat pil, hizli sarj. 2 yil garanti.',
        ARRAY['kulaklik','bluetooth','anc','kablosuz','apple'],
        'Bluetooth Kulaklik Pro', 'Kulaklik', '153.02.010', 2,
        0.800, 0.500, true, 2, true, true,
        false, true, 24,
        3
    ) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad
      RETURNING id INTO v_urun_id;

    INSERT INTO urun_varyant (
        urun_id, sku, barkod, eksen_kombinasyon, para_birimi_kod,
        birim_id, vergi_orani_id,
        agirlik_gr, en_cm, boy_cm, yukseklik_cm,
        kritik_stok, varsayilan_mi,
        alis_fiyati, son_alis_fiyati, piyasa_fiyati, satilabilir_son_fiyat,
        kar_marji, fiyat_degisiklik_tarihi
    ) VALUES (
        v_urun_id, 'URN-1002', '8690001000018', '{}'::jsonb, 'TRY',
        v_birim_adet, v_kdv_20,
        250, 18, 18, 6,
        3, true,
        850.00, 825.00, 1799.00, 1100.00,
        52.00, CURRENT_DATE - INTERVAL '14 day'
    ) ON CONFLICT (sku) DO UPDATE SET
        barkod                  = EXCLUDED.barkod,
        vergi_orani_id          = EXCLUDED.vergi_orani_id,
        agirlik_gr              = EXCLUDED.agirlik_gr,
        en_cm                   = EXCLUDED.en_cm,
        boy_cm                  = EXCLUDED.boy_cm,
        yukseklik_cm            = EXCLUDED.yukseklik_cm,
        kritik_stok             = EXCLUDED.kritik_stok,
        alis_fiyati             = EXCLUDED.alis_fiyati,
        son_alis_fiyati         = EXCLUDED.son_alis_fiyati,
        piyasa_fiyati           = EXCLUDED.piyasa_fiyati,
        satilabilir_son_fiyat   = EXCLUDED.satilabilir_son_fiyat,
        kar_marji               = EXCLUDED.kar_marji,
        fiyat_degisiklik_tarihi = EXCLUDED.fiyat_degisiklik_tarihi
      RETURNING id INTO v_varyant_id;

    INSERT INTO fiyat_listesi_varyant (fiyat_listesi_id, urun_varyant_id, fiyat, liste_fiyati, minimum_miktar)
    VALUES (fl_id, v_varyant_id, 1299.00, 1799.00, 1)
    ON CONFLICT (fiyat_listesi_id, urun_varyant_id, minimum_miktar) DO UPDATE SET fiyat = EXCLUDED.fiyat;

    INSERT INTO urun_stok (
        urun_varyant_id, magaza_id, mevcut_miktar, rezerve_miktar, yolda_gelen_miktar,
        ortalama_maliyet, son_alis_fiyati, son_alis_para_birimi, son_alis_tarihi,
        son_giris_tarihi
    ) VALUES (
        v_varyant_id, v_magaza_id, 12, 2, 0,
        825.00, 825.00, 'TRY', CURRENT_DATE - INTERVAL '14 day',
        CURRENT_DATE - INTERVAL '14 day'
    ) ON CONFLICT (urun_varyant_id, magaza_id) DO UPDATE SET mevcut_miktar = EXCLUDED.mevcut_miktar;

    -- ═══════════════════════════════════════════
    -- URUN 3: Turk Cayi Premium 1 KG (indirimli KDV %10)
    -- ═══════════════════════════════════════════
    INSERT INTO urun (
        kod, ad, aciklama, kisa_aciklama,
        kategori_id, tip, ana_birim_id,
        vergi_orani_id, fiyatlar_kdv_dahil_mi, stok_takibi,
        eticaret_aktif, eticaret_satilik_mi, aktif_mi,
        seo_url, seo_baslik, seo_aciklama, seo_anahtar_kelimeler,
        fatura_kalem_adi, takma_adi, muhasebe_kodu, sira,
        desi1, desi2, vitrinde_goster, vitrin_sira,
        b2b_aktif, ucretsiz_kargo, tahmini_teslim_suresi_gun
    ) VALUES (
        'URN-1003',
        'Turk Cayi Premium 1 KG',
        'Rize dag bahcelerinden toplanan, elek sistemiyle elenmis premium Turk cayi. Koyu demleme ideal.',
        'Premium Turk cayi 1 kg',
        v_kategori_gida, 'fiziksel', v_birim_adet,
        v_kdv_10, true, true,
        true, true, true,
        'turk-cayi-premium-1-kg', 'Turk Cayi Premium 1 KG',
        'Rize kaynagindan premium dokme Turk cayi.',
        ARRAY['cay','turk-cayi','rize','dokme','premium'],
        'Turk Cayi 1KG', 'Cay', '153.03.005', 3,
        1.200, 1.000, false, 0,
        true, false, 1
    ) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad
      RETURNING id INTO v_urun_id;

    INSERT INTO urun_varyant (
        urun_id, sku, barkod, eksen_kombinasyon, para_birimi_kod,
        birim_id, vergi_orani_id,
        agirlik_gr, kritik_stok, varsayilan_mi,
        alis_fiyati, son_alis_fiyati, piyasa_fiyati, satilabilir_son_fiyat,
        kar_marji, fiyat_degisiklik_tarihi
    ) VALUES (
        v_urun_id, 'URN-1003', '8690001000025', '{}'::jsonb, 'TRY',
        v_birim_adet, v_kdv_10,
        1000, 20, true,
        85.00, 82.00, 149.90, 110.00,
        40.00, CURRENT_DATE - INTERVAL '3 day'
    ) ON CONFLICT (sku) DO UPDATE SET
        barkod                  = EXCLUDED.barkod,
        vergi_orani_id          = EXCLUDED.vergi_orani_id,
        agirlik_gr              = EXCLUDED.agirlik_gr,
        kritik_stok             = EXCLUDED.kritik_stok,
        alis_fiyati             = EXCLUDED.alis_fiyati,
        son_alis_fiyati         = EXCLUDED.son_alis_fiyati,
        piyasa_fiyati           = EXCLUDED.piyasa_fiyati,
        satilabilir_son_fiyat   = EXCLUDED.satilabilir_son_fiyat,
        kar_marji               = EXCLUDED.kar_marji,
        fiyat_degisiklik_tarihi = EXCLUDED.fiyat_degisiklik_tarihi
      RETURNING id INTO v_varyant_id;

    INSERT INTO fiyat_listesi_varyant (fiyat_listesi_id, urun_varyant_id, fiyat, liste_fiyati, minimum_miktar)
    VALUES (fl_id, v_varyant_id, 119.00, 149.90, 1)
    ON CONFLICT (fiyat_listesi_id, urun_varyant_id, minimum_miktar) DO UPDATE SET fiyat = EXCLUDED.fiyat;

    INSERT INTO urun_stok (
        urun_varyant_id, magaza_id, mevcut_miktar, rezerve_miktar, yolda_gelen_miktar,
        ortalama_maliyet, son_alis_fiyati, son_alis_para_birimi, son_alis_tarihi,
        son_giris_tarihi
    ) VALUES (
        v_varyant_id, v_magaza_id, 150, 0, 50,
        82.00, 82.00, 'TRY', CURRENT_DATE - INTERVAL '3 day',
        CURRENT_DATE - INTERVAL '3 day'
    ) ON CONFLICT (urun_varyant_id, magaza_id) DO UPDATE SET mevcut_miktar = EXCLUDED.mevcut_miktar;
END $$;

COMMIT;

-- ────────────────────────────────────────────────
-- Dogrulama
-- ────────────────────────────────────────────────
SELECT 'Fiyat listesi:'  AS bilgi, COUNT(*)::text AS deger FROM fiyat_listesi
UNION ALL
SELECT 'Urun toplam:',   COUNT(*)::text FROM urun WHERE silindi_mi = false
UNION ALL
SELECT 'Varyant toplam:', COUNT(*)::text FROM urun_varyant WHERE silindi_mi = false
UNION ALL
SELECT 'Fiyat kaydi:',   COUNT(*)::text FROM fiyat_listesi_varyant
UNION ALL
SELECT 'Stok kaydi:',    COUNT(*)::text FROM urun_stok;

SELECT u.kod, u.ad, k.ad AS kategori, m.ad AS marka, v.sku,
       v.alis_fiyati, v.satilabilir_son_fiyat,
       flv.fiyat AS satis_fiyati, us.mevcut_miktar AS stok
FROM urun u
JOIN urun_varyant v ON v.urun_id = u.id
LEFT JOIN kategori k ON k.id = u.kategori_id
LEFT JOIN marka m ON m.id = u.marka_id
LEFT JOIN fiyat_listesi_varyant flv ON flv.urun_varyant_id = v.id
LEFT JOIN urun_stok us ON us.urun_varyant_id = v.id
WHERE u.silindi_mi = false
ORDER BY u.kod;
