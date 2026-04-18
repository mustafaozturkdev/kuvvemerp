-- Kuvvem v2 — Ödeme Araçları Modülü Schema Güncellemesi
-- Hesap tablosuna: magazalar JSONB, grup_id, ayarlar JSONB, varsayilan_mi
-- HesapGrup tablosu oluşturma

BEGIN;

-- 1) HesapGrup tablosu
CREATE TABLE IF NOT EXISTS hesap_grup (
    id                      bigserial PRIMARY KEY,
    public_id               uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod                     varchar(50) UNIQUE NOT NULL,
    ad                      varchar(100) NOT NULL,
    aciklama                text,
    ikon                    varchar(50),
    renk                    varchar(20),
    sira                    int NOT NULL DEFAULT 0,
    aktif_mi                boolean NOT NULL DEFAULT true,
    silindi_mi              boolean NOT NULL DEFAULT false,
    silinme_tarihi          timestamptz,
    silen_kullanici_id      bigint REFERENCES kullanici(id),
    olusturan_kullanici_id  bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi        timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hesap_grup_aktif ON hesap_grup(aktif_mi) WHERE silindi_mi = false;

DROP TRIGGER IF EXISTS trg_hesap_grup_guncelleme ON hesap_grup;
CREATE TRIGGER trg_hesap_grup_guncelleme
    BEFORE UPDATE ON hesap_grup
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- 2) Hesap tablosuna yeni kolonlar
ALTER TABLE hesap
    ADD COLUMN IF NOT EXISTS magazalar jsonb NOT NULL DEFAULT '{"magazaIdler":[],"varsayilanMagazaId":null}'::jsonb,
    ADD COLUMN IF NOT EXISTS grup_id bigint REFERENCES hesap_grup(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ayarlar jsonb,
    ADD COLUMN IF NOT EXISTS varsayilan_mi boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_hesap_grup ON hesap(grup_id) WHERE silindi_mi = false;
CREATE INDEX IF NOT EXISTS idx_hesap_varsayilan ON hesap(tip, varsayilan_mi) WHERE silindi_mi = false AND varsayilan_mi = true;

-- JSONB içinde magazaId sorgulamak için GIN index (ileride şube bazlı filtreleme için)
CREATE INDEX IF NOT EXISTS idx_hesap_magazalar ON hesap USING gin (magazalar);

-- 3) Eski magaza_id kolonunu kaldır (artık magazalar JSON kullanılıyor)
ALTER TABLE hesap DROP COLUMN IF EXISTS magaza_id;

-- 4) Tenant kullanıcısına izin ver (v2 multi-tenant GRANT)
GRANT SELECT, INSERT, UPDATE, DELETE ON hesap_grup TO kuvvem_app;
GRANT USAGE, SELECT ON SEQUENCE hesap_grup_id_seq TO kuvvem_app;

COMMIT;
