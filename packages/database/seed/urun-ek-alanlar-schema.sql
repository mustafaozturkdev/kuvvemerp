-- Kuvvem v2 — Urun + UrunVaryant PHP Parity ek alanlari
-- Tarih: 2026-04-18
-- Aciklama: Urun tablosuna ticari bayraklar, ozel alanlar, muhasebe;
--           UrunVaryant tablosuna fiyat bilgileri eklenir.

BEGIN;

-- ────────────────────────────────────────────────
-- 1) URUN tablosuna PHP parity ek alanlari
-- ────────────────────────────────────────────────

ALTER TABLE urun
    -- Ticari metin alanlari
    ADD COLUMN IF NOT EXISTS fatura_kalem_adi        varchar(300),
    ADD COLUMN IF NOT EXISTS takma_adi               varchar(200),
    ADD COLUMN IF NOT EXISTS data_sheet_url          text,
    ADD COLUMN IF NOT EXISTS icerik_aciklama         text,
    ADD COLUMN IF NOT EXISTS kargo_iade_metin        text,
    -- Entegrasyon eslemesi icin 5 genel amacli ozel alan (PHP OzelAlan1..5)
    ADD COLUMN IF NOT EXISTS ozel_alan1              varchar(500),
    ADD COLUMN IF NOT EXISTS ozel_alan2              varchar(500),
    ADD COLUMN IF NOT EXISTS ozel_alan3              varchar(500),
    ADD COLUMN IF NOT EXISTS ozel_alan4              varchar(500),
    ADD COLUMN IF NOT EXISTS ozel_alan5              varchar(500),
    -- Muhasebe / liste siralama
    ADD COLUMN IF NOT EXISTS muhasebe_kodu           varchar(50),
    ADD COLUMN IF NOT EXISTS sira                    int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS uretim_tarihi           date,
    ADD COLUMN IF NOT EXISTS tahmini_teslim_suresi_gun int NOT NULL DEFAULT 0,
    -- Fiziksel (kargo desi hesabi)
    ADD COLUMN IF NOT EXISTS desi1                   numeric(10,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS desi2                   numeric(10,3) NOT NULL DEFAULT 0,
    -- Vitrin / pazarlama bayraklari
    ADD COLUMN IF NOT EXISTS vitrinde_goster         boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vitrin_sira             int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS firsat_urun             boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS yeni_urun               boolean NOT NULL DEFAULT false,
    -- B2B kanali (e-ticaretAktif'in b2b esdegeri)
    ADD COLUMN IF NOT EXISTS b2b_aktif               boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS b2b_satilik_mi          boolean NOT NULL DEFAULT true,
    -- Kargo / satis politikalari
    ADD COLUMN IF NOT EXISTS ucretsiz_kargo          boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS prim_var_yok            boolean NOT NULL DEFAULT false,
    -- Sepet indirimleri (kanal bazli)
    ADD COLUMN IF NOT EXISTS sepet_indirim_eticaret  numeric(5,2),
    ADD COLUMN IF NOT EXISTS sepet_indirim_b2b       numeric(5,2),
    -- Abonelik urunleri
    ADD COLUMN IF NOT EXISTS abonelik_aktif          boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS abonelik_data           jsonb;

-- Filtrelemede hiz icin partial index'ler (sadece ilgili bayrak acik olanlari kapsar)
CREATE INDEX IF NOT EXISTS idx_urun_vitrin
    ON urun(vitrin_sira)
    WHERE silindi_mi = false AND vitrinde_goster = true;

CREATE INDEX IF NOT EXISTS idx_urun_firsat
    ON urun(id)
    WHERE silindi_mi = false AND firsat_urun = true;

CREATE INDEX IF NOT EXISTS idx_urun_yeni
    ON urun(id)
    WHERE silindi_mi = false AND yeni_urun = true;

CREATE INDEX IF NOT EXISTS idx_urun_b2b
    ON urun(id)
    WHERE silindi_mi = false AND b2b_aktif = true;

-- Liste sayfalarinda "sira" kolonu sik kullanilir
CREATE INDEX IF NOT EXISTS idx_urun_sira
    ON urun(sira, ad)
    WHERE silindi_mi = false;

-- ────────────────────────────────────────────────
-- 2) URUN_VARYANT tablosuna fiyat alanlari
-- ────────────────────────────────────────────────

ALTER TABLE urun_varyant
    -- Varyantin varsayilan alis fiyati
    ADD COLUMN IF NOT EXISTS alis_fiyati             numeric(15,4),
    -- Son fiilen yapilan alis (alis faturalarindan cache)
    ADD COLUMN IF NOT EXISTS son_alis_fiyati         numeric(15,4),
    -- Piyasa karsilastirma fiyati (info)
    ADD COLUMN IF NOT EXISTS piyasa_fiyati           numeric(15,4),
    -- Kasiyere uyari: bu fiyatin altinda indirim yaparsa sistem uyari gosterir.
    -- Blokaj degil, sadece bilgi/uyari (firma sahibinin belirledigi alt sinir).
    ADD COLUMN IF NOT EXISTS satilabilir_son_fiyat   numeric(15,4),
    -- Kar marji (%)
    ADD COLUMN IF NOT EXISTS kar_marji               numeric(5,2),
    -- Son fiyat guncelleme tarihi
    ADD COLUMN IF NOT EXISTS fiyat_degisiklik_tarihi date;

COMMIT;

-- ────────────────────────────────────────────────
-- Dogrulama ozeti
-- ────────────────────────────────────────────────
SELECT 'urun yeni kolonlar:' AS bilgi, COUNT(*)::text AS deger
FROM information_schema.columns
WHERE table_name = 'urun' AND column_name IN (
    'fatura_kalem_adi','takma_adi','data_sheet_url','icerik_aciklama','kargo_iade_metin',
    'ozel_alan1','ozel_alan2','ozel_alan3','ozel_alan4','ozel_alan5',
    'muhasebe_kodu','sira','uretim_tarihi','tahmini_teslim_suresi_gun',
    'desi1','desi2',
    'vitrinde_goster','vitrin_sira','firsat_urun','yeni_urun',
    'b2b_aktif','b2b_satilik_mi',
    'ucretsiz_kargo','prim_var_yok',
    'sepet_indirim_eticaret','sepet_indirim_b2b',
    'abonelik_aktif','abonelik_data'
)
UNION ALL
SELECT 'urun_varyant yeni kolonlar:', COUNT(*)::text
FROM information_schema.columns
WHERE table_name = 'urun_varyant' AND column_name IN (
    'alis_fiyati','son_alis_fiyati','piyasa_fiyati','satilabilir_son_fiyat',
    'kar_marji','fiyat_degisiklik_tarihi'
)
UNION ALL
SELECT 'Olmasi beklenen urun kolonu:', '28'
UNION ALL
SELECT 'Olmasi beklenen urun_varyant kolonu:', '6';
