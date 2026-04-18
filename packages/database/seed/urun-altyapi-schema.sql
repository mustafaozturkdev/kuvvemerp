-- Kuvvem v2 — Ürün Altyapısı Schema Güncellemesi
-- Marka (yeni kolonlar) + MarkaModel (yeni tablo) + Kategori (yeni kolonlar) + UrunKategori (N-N ara tablo)

BEGIN;

-- ────────────────────────────────────────────────
-- 1) MARKA tablosuna yeni kolonlar
-- ────────────────────────────────────────────────

ALTER TABLE marka
    ADD COLUMN IF NOT EXISTS banner_url text,
    ADD COLUMN IF NOT EXISTS seo_baslik varchar(255),
    ADD COLUMN IF NOT EXISTS seo_aciklama text,
    ADD COLUMN IF NOT EXISTS seo_anahtar_kelimeler text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS og_image_url text,
    ADD COLUMN IF NOT EXISTS canonical_url text,
    ADD COLUMN IF NOT EXISTS eticaret_aktif boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS b2b_aktif boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS silinme_tarihi timestamptz,
    ADD COLUMN IF NOT EXISTS silen_kullanici_id bigint REFERENCES kullanici(id),
    ADD COLUMN IF NOT EXISTS olusturan_kullanici_id bigint REFERENCES kullanici(id),
    ADD COLUMN IF NOT EXISTS guncelleyen_kullanici_id bigint REFERENCES kullanici(id);

-- ────────────────────────────────────────────────
-- 2) MARKA_MODEL tablosu (yeni)
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marka_model (
    id                      bigserial PRIMARY KEY,
    public_id               uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    marka_id                bigint NOT NULL REFERENCES marka(id) ON DELETE CASCADE,
    kod                     varchar(50),
    ad                      varchar(200) NOT NULL,
    aciklama                text,
    gorsel_url              text,
    uretim_yili             int,
    sira                    int NOT NULL DEFAULT 0,
    aktif_mi                boolean NOT NULL DEFAULT true,
    silindi_mi              boolean NOT NULL DEFAULT false,
    silinme_tarihi          timestamptz,
    silen_kullanici_id      bigint REFERENCES kullanici(id),
    olusturan_kullanici_id  bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi        timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (marka_id, ad)
);

CREATE INDEX IF NOT EXISTS idx_marka_model_marka ON marka_model(marka_id) WHERE silindi_mi = false;
CREATE INDEX IF NOT EXISTS idx_marka_model_aktif ON marka_model(aktif_mi) WHERE silindi_mi = false;

DROP TRIGGER IF EXISTS trg_marka_model_guncelleme ON marka_model;
CREATE TRIGGER trg_marka_model_guncelleme
    BEFORE UPDATE ON marka_model
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ────────────────────────────────────────────────
-- 3) KATEGORI tablosuna yeni kolonlar
-- ────────────────────────────────────────────────

ALTER TABLE kategori
    ADD COLUMN IF NOT EXISTS banner_url text,
    ADD COLUMN IF NOT EXISTS icerik text,
    ADD COLUMN IF NOT EXISTS og_image_url text,
    ADD COLUMN IF NOT EXISTS canonical_url text,
    ADD COLUMN IF NOT EXISTS b2b_aktif boolean NOT NULL DEFAULT false;

-- eticaret_aktif zaten var ama default değerini false yapalım (yeni kayıtlar için)
ALTER TABLE kategori ALTER COLUMN eticaret_aktif SET DEFAULT false;

-- ────────────────────────────────────────────────
-- 4) URUN tablosuna marka_model_id ekle
-- ────────────────────────────────────────────────

ALTER TABLE urun
    ADD COLUMN IF NOT EXISTS marka_model_id bigint REFERENCES marka_model(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_urun_marka_model ON urun(marka_model_id) WHERE silindi_mi = false;

-- ────────────────────────────────────────────────
-- 5) URUN_KATEGORI ara tablosu (N-N, ek kategoriler)
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS urun_kategori (
    id              bigserial PRIMARY KEY,
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    kategori_id     bigint NOT NULL REFERENCES kategori(id) ON DELETE CASCADE,
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_id, kategori_id)
);

CREATE INDEX IF NOT EXISTS idx_urun_kategori_urun ON urun_kategori(urun_id);
CREATE INDEX IF NOT EXISTS idx_urun_kategori_kategori ON urun_kategori(kategori_id);

-- ────────────────────────────────────────────────
-- 6) Tenant kullanıcısına izin ver
-- ────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON marka_model TO kuvvem_app;
GRANT USAGE, SELECT ON SEQUENCE marka_model_id_seq TO kuvvem_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON urun_kategori TO kuvvem_app;
GRANT USAGE, SELECT ON SEQUENCE urun_kategori_id_seq TO kuvvem_app;

COMMIT;

-- ────────────────────────────────────────────────
-- Özet
-- ────────────────────────────────────────────────
SELECT 'Marka yeni kolonlar:' AS bilgi, COUNT(*) AS deger FROM information_schema.columns
WHERE table_name = 'marka' AND column_name IN ('banner_url','seo_baslik','seo_aciklama','seo_anahtar_kelimeler','og_image_url','canonical_url','eticaret_aktif','b2b_aktif')
UNION ALL
SELECT 'Kategori yeni kolonlar:', COUNT(*) FROM information_schema.columns
WHERE table_name = 'kategori' AND column_name IN ('banner_url','icerik','og_image_url','canonical_url','b2b_aktif')
UNION ALL
SELECT 'marka_model tablosu satır:', COUNT(*) FROM marka_model
UNION ALL
SELECT 'urun_kategori tablosu satır:', COUNT(*) FROM urun_kategori;
