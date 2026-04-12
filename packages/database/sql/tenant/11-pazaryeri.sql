-- ============================================================
-- MODUL 11: PAZARYERI ENTEGRASYONU (v2 REFACTOR)
-- ============================================================
-- Trendyol, Hepsiburada, N11, Amazon, Ciceksepeti, Pazarama, GittiGidiyor...
-- Tenant tabanli coklu pazaryeri + coklu baglanti (magaza basina ayri satici hesabi)
-- Kategori eslesme, urun eslesme, stok/fiyat push, siparis pull, iade, komisyon.
--
-- Entegrasyon noktalari:
--   - Modul 04: magaza (baglanti hangi magaza adina satis)
--   - Modul 06: urun, urun_varyant, kategori, fiyat_listesi
--   - Modul 07: urun_stok, urun_stok_rezervasyon, stok_rezerve_et()
--   - Modul 08: siparis, siparis_kalem, iade_sebep
--
-- v1 -> v2 Degisiklikler (Elestirmen v1 bulgularina yanit):
--   #1 Credential guvenligi — bytea + pgcrypto + key rotation (pazaryeri_baglanti_kms)
--   #2 raw_data ayri tablo (pazaryeri_siparis_raw) + arsivleme stratejisi
--   #3 Cok seviyeli fiyat override — pazaryeri_urun_fiyat (donem bazli)
--   #4 Stok tek kaynak — vw_pazaryeri_urun_stok view
--   #5 Aktarim fonksiyonu yazildi — pazaryeri_siparis_aktar()
--   #6 Sync job retry + exponential backoff
--   #7 Webhook dedup tablosu (pazaryeri_webhook_log)
--   #8 Komisyon politikasi tablosu + oncelikli hesaplama fonksiyonu
--   + pazaryeri_iade.iade_sebep_id FK (modul 08 lookup)
--   + pazaryeri_baglanti.saglik_kontrolu_son
--   + pazaryeri_siparis yillik partition
-- ============================================================

-- ----------------------------------------------------------------
-- PAZARYERI: Master tablo (enum yasak — yeni pazaryeri = INSERT)
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL
                    CHECK (kod ~ '^[a-z][a-z0-9_]+$'),
    ad              varchar(200) NOT NULL,
    logo_url        text,
    ulke_kodu       char(2) REFERENCES ulke(kod),
    web_sitesi      varchar(500),
    api_dokuman_url varchar(500),
    varsayilan_komisyon_orani numeric(7, 4),
    auth_tipi       varchar(30) NOT NULL DEFAULT 'api_key' CHECK (auth_tipi IN (
        'api_key', 'basic_auth', 'oauth2', 'bearer_token', 'ozel'
    )),
    sync_destek     jsonb NOT NULL DEFAULT '{
        "urun_push": true,
        "urun_pull": false,
        "stok_push": true,
        "fiyat_push": true,
        "siparis_pull": true,
        "kategori_pull": true,
        "iade_pull": true,
        "webhook": false
    }'::jsonb,
    ozellikler      jsonb NOT NULL DEFAULT '{}',
    sira            int NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_aktif ON pazaryeri(aktif_mi, sira);

CREATE TRIGGER trg_pazaryeri_guncelleme
    BEFORE UPDATE ON pazaryeri
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Seed: TR pazaryerleri + Amazon
INSERT INTO pazaryeri (kod, ad, ulke_kodu, web_sitesi, api_dokuman_url, varsayilan_komisyon_orani, auth_tipi, sira) VALUES
('trendyol',      'Trendyol',       'TR', 'https://www.trendyol.com',     'https://developers.trendyol.com',        0.1800, 'basic_auth',   10),
('hepsiburada',   'Hepsiburada',    'TR', 'https://www.hepsiburada.com',  'https://developers.hepsiburada.com',     0.1750, 'basic_auth',   20),
('n11',           'N11',            'TR', 'https://www.n11.com',          'https://api.n11.com',                    0.1500, 'api_key',      30),
('ciceksepeti',   'Ciceksepeti',    'TR', 'https://www.ciceksepeti.com',  'https://pazaryeri.ciceksepeti.com',      0.1500, 'api_key',      40),
('pazarama',      'Pazarama',       'TR', 'https://www.pazarama.com',     'https://isortagimapi.pazarama.com',      0.1200, 'api_key',      50),
('gittigidiyor',  'GittiGidiyor',   'TR', 'https://www.gittigidiyor.com', 'https://dev.gittigidiyor.com',           0.1500, 'api_key',      60),
('amazon_tr',     'Amazon TR',      'TR', 'https://www.amazon.com.tr',    'https://developer-docs.amazon.com',      0.1500, 'oauth2',       70),
('amazon_eu',     'Amazon EU',      'DE', 'https://sellercentral-europe.amazon.com', 'https://developer-docs.amazon.com', 0.1500, 'oauth2', 80),
('ptt_avm',       'PTT AVM',        'TR', 'https://www.pttavm.com',       NULL,                                     0.1000, 'api_key',      90),
('modanisa',      'Modanisa',       'TR', 'https://www.modanisa.com',     NULL,                                     0.2000, 'api_key',     100);

-- ----------------------------------------------------------------
-- PAZARYERI_BAGLANTI: Tenant'in pazaryeri API baglantisi (magaza basina)
-- v1 Sorun #1: Credential guvenligi — hicbir secret bu tabloda tutulmuyor.
-- Tum secret'lar pazaryeri_baglanti_kms tablosunda sifrelenmis bytea olarak.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_baglanti (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id) ON DELETE RESTRICT,
    ad              varchar(200) NOT NULL,
    -- Pazaryeri kimlik (sadece public tanimlayicilar; hassas degil)
    satici_id       varchar(100),
    magaza_adi_py   varchar(200),
    -- Ayarlar (endpoint override, timeout, rate limit, default fiyat listesi, stok guvenlik tamponu)
    baglanti_ayar   jsonb NOT NULL DEFAULT '{
        "stok_guvenlik_tampon": 0,
        "fiyat_debounce_saniye": 300,
        "rate_limit_rps": 5,
        "timeout_ms": 15000
    }'::jsonb,
    -- Fiyatlandirma baglantisi
    fiyat_listesi_id bigint REFERENCES fiyat_listesi(id),
    -- Default kategori komisyon override
    komisyon_override_orani numeric(7, 4),
    -- Durum
    durum           varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'aktif', 'hata', 'askida', 'pasif', 'test'
    )),
    son_sync_zamani timestamptz,
    son_hata_zamani timestamptz,
    son_hata        text,
    toplam_hata_sayisi int NOT NULL DEFAULT 0,
    -- Saglik kontrolu (v1 bonus): periyodik ping/whoami cagrisi
    saglik_kontrolu_son timestamptz,
    saglik_kontrolu_durum varchar(20) CHECK (saglik_kontrolu_durum IN ('saglikli', 'uyari', 'bozuk', 'bilinmiyor')),
    -- Rate limit takip (v1 iyilestirme #3)
    rate_limit_kalan int,
    rate_limit_reset timestamptz,
    -- OAuth2 metadata (sifrelenmis tokenlar _kms tablosunda)
    oauth_son_gecerlilik timestamptz,
    -- Otomasyon toggles
    oto_siparis_aktar_mi boolean NOT NULL DEFAULT true,
    oto_stok_push_mi boolean NOT NULL DEFAULT true,
    oto_fiyat_push_mi boolean NOT NULL DEFAULT true,
    -- Audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_id, magaza_id, satici_id)
);
CREATE INDEX idx_pazaryeri_baglanti_pazaryeri ON pazaryeri_baglanti(pazaryeri_id) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_baglanti_magaza ON pazaryeri_baglanti(magaza_id) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_baglanti_durum ON pazaryeri_baglanti(durum) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_baglanti_saglik ON pazaryeri_baglanti(saglik_kontrolu_son) WHERE aktif_mi = true;

CREATE TRIGGER trg_pazaryeri_baglanti_guncelleme
    BEFORE UPDATE ON pazaryeri_baglanti
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_BAGLANTI_KMS: Sifrelenmis credential deposu (v1 Sorun #1)
-- Her anahtar ayri satir. Key rotation icin key_version. Encryption app
-- katmaninda yapilir (KMS / HashiCorp Vault). DB sadece ciphertext tasir.
-- `pgcrypto` extension'i modul 01'de aktif edilmis olmalidir.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_baglanti_kms (
    id              bigserial PRIMARY KEY,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    anahtar_kod     varchar(50) NOT NULL CHECK (anahtar_kod IN (
        'api_anahtar', 'api_secret', 'api_token',
        'oauth_access_token', 'oauth_refresh_token',
        'webhook_secret', 'imza_anahtari', 'ozel'
    )),
    -- Sifrelenmis veri (pgp_sym_encrypt VEYA KMS envelope encryption)
    sifreli_icerik  bytea NOT NULL,
    nonce           bytea,                                  -- AEAD icin (GCM/ChaCha20)
    -- KMS metadata
    kms_saglayici   varchar(50) NOT NULL DEFAULT 'pgcrypto' CHECK (kms_saglayici IN (
        'pgcrypto', 'aws_kms', 'gcp_kms', 'azure_kv', 'vault', 'local'
    )),
    kms_key_id      varchar(200),                           -- KMS'deki master key id (ARN vb.)
    kms_key_version int NOT NULL DEFAULT 1,                 -- rotation icin
    encryption_algoritma varchar(30) NOT NULL DEFAULT 'AES-256-GCM',
    -- Gecerlilik
    gecerlilik_baslangic timestamptz NOT NULL DEFAULT now(),
    gecerlilik_bitis timestamptz,                           -- token TTL
    aktif_mi        boolean NOT NULL DEFAULT true,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Bir anahtarin ayni baglanti icin ayni versiyonda bir kez olmasi
    UNIQUE (baglanti_id, anahtar_kod, kms_key_version)
);
CREATE INDEX idx_pazaryeri_baglanti_kms_baglanti ON pazaryeri_baglanti_kms(baglanti_id) WHERE aktif_mi = true;
CREATE INDEX idx_pazaryeri_baglanti_kms_rotate ON pazaryeri_baglanti_kms(gecerlilik_bitis) WHERE aktif_mi = true AND gecerlilik_bitis IS NOT NULL;

CREATE TRIGGER trg_pazaryeri_baglanti_kms_guncelleme
    BEFORE UPDATE ON pazaryeri_baglanti_kms
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

COMMENT ON TABLE pazaryeri_baglanti_kms IS
'Credential deposu. Encryption app katmaninda KMS ile yapilir; DB seviyesi yalnizca sifrelenmis bytea tasir. Key rotation icin kms_key_version kullanilir. Rotation akisi: yeni satir ekle (v+1) -> eski satiri aktif_mi=false yap.';

-- ----------------------------------------------------------------
-- FUNCTION: pazaryeri_credential_decrypt — sadece DEBUG/TEST icin
-- Production'da bu fonksiyon kullanilmamalidir; app katmani KMS uzerinden
-- cozmelidir. pgcrypto saglayici icin bir gosterim icin.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION pazaryeri_credential_decrypt(
    p_baglanti_id bigint,
    p_anahtar_kod varchar,
    p_master_key text
) RETURNS text AS $$
DECLARE
    v_cipher bytea;
    v_saglayici varchar;
BEGIN
    SELECT sifreli_icerik, kms_saglayici INTO v_cipher, v_saglayici
    FROM pazaryeri_baglanti_kms
    WHERE baglanti_id = p_baglanti_id
      AND anahtar_kod = p_anahtar_kod
      AND aktif_mi = true
    ORDER BY kms_key_version DESC
    LIMIT 1;

    IF v_cipher IS NULL THEN
        RAISE EXCEPTION 'Credential bulunamadi: baglanti=%, anahtar=%', p_baglanti_id, p_anahtar_kod;
    END IF;

    IF v_saglayici <> 'pgcrypto' THEN
        RAISE EXCEPTION 'Bu fonksiyon sadece pgcrypto saglayicisi icin calisir. Saglayici: %', v_saglayici;
    END IF;

    RETURN pgp_sym_decrypt(v_cipher, p_master_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION pazaryeri_credential_decrypt IS
'UYARI: Sadece test/debug amaclidir. Production ortamda app katmani KMS uzerinden cozmelidir.';

-- ----------------------------------------------------------------
-- PAZARYERI_BAGLANTI_LOG: Auth / baglanti eventleri
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_baglanti_log (
    id              bigserial PRIMARY KEY,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    olay_tipi       varchar(50) NOT NULL CHECK (olay_tipi IN (
        'baglanti_test', 'auth_basarili', 'auth_hata', 'token_yenile',
        'rate_limit', 'api_hata', 'durum_degisim', 'manuel_mudahale',
        'saglik_kontrolu', 'credential_rotasyon'
    )),
    basarili_mi     boolean NOT NULL,
    http_durum      int,
    mesaj           text,
    detay           jsonb,
    ip_adresi       inet,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_baglanti_log_baglanti
    ON pazaryeri_baglanti_log(baglanti_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_baglanti_log_hata
    ON pazaryeri_baglanti_log(baglanti_id, olusturma_tarihi DESC) WHERE basarili_mi = false;

-- ----------------------------------------------------------------
-- PAZARYERI_KATEGORI: Pazaryerinin kategori agaci (senkronize edilen)
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_kategori (
    id              bigserial PRIMARY KEY,
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE CASCADE,
    py_kategori_id  varchar(100) NOT NULL,
    ad              varchar(300) NOT NULL,
    ust_id          bigint REFERENCES pazaryeri_kategori(id) ON DELETE RESTRICT,
    yol             ltree,                                  -- v1 Sorun #6: ltree (modul 06 ile tutarli)
    seviye          smallint NOT NULL DEFAULT 1,
    komisyon_orani  numeric(7, 4),
    ozellik_sablon_id varchar(100),
    zorunlu_ozellik_var_mi boolean NOT NULL DEFAULT false,
    yaprak_mi       boolean NOT NULL DEFAULT true,
    aktif_mi        boolean NOT NULL DEFAULT true,
    son_sync_tarihi timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_id, py_kategori_id)
);
CREATE INDEX idx_pazaryeri_kategori_pazaryeri ON pazaryeri_kategori(pazaryeri_id);
CREATE INDEX idx_pazaryeri_kategori_ust ON pazaryeri_kategori(ust_id);
CREATE INDEX idx_pazaryeri_kategori_yaprak ON pazaryeri_kategori(pazaryeri_id, yaprak_mi) WHERE aktif_mi = true;
CREATE INDEX idx_pazaryeri_kategori_ad_trgm ON pazaryeri_kategori USING gin (ad gin_trgm_ops);
CREATE INDEX idx_pazaryeri_kategori_yol ON pazaryeri_kategori USING gist (yol);

CREATE TRIGGER trg_pazaryeri_kategori_guncelleme
    BEFORE UPDATE ON pazaryeri_kategori
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_KATEGORI_OZELLIK: Kategorinin zorunlu/opsiyonel ozellikleri
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_kategori_ozellik (
    id              bigserial PRIMARY KEY,
    pazaryeri_kategori_id bigint NOT NULL REFERENCES pazaryeri_kategori(id) ON DELETE CASCADE,
    ozellik_kod     varchar(100) NOT NULL,
    ozellik_ad      varchar(200) NOT NULL,
    tip             varchar(20) NOT NULL DEFAULT 'metin' CHECK (tip IN (
        'metin', 'sayi', 'boolean', 'liste', 'coklu_liste', 'tarih'
    )),
    zorunlu_mu      boolean NOT NULL DEFAULT false,
    varyant_belirleyici_mi boolean NOT NULL DEFAULT false,
    izin_verilen_degerler_sayisi int,
    secenekler      jsonb,
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_kategori_id, ozellik_kod)
);
CREATE INDEX idx_pazaryeri_kategori_ozellik_kategori
    ON pazaryeri_kategori_ozellik(pazaryeri_kategori_id);

-- ----------------------------------------------------------------
-- PAZARYERI_KATEGORI_ESLESME: Bizim kategorimiz <-> pazaryeri kategorisi
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_kategori_eslesme (
    id              bigserial PRIMARY KEY,
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE CASCADE,
    kategori_id     bigint NOT NULL REFERENCES kategori(id) ON DELETE CASCADE,
    pazaryeri_kategori_id bigint NOT NULL REFERENCES pazaryeri_kategori(id) ON DELETE RESTRICT,
    sertifika_url   text,
    sertifika_tipi  varchar(50),
    varsayilan_ozellikler jsonb DEFAULT '{}',
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_id, kategori_id)
);
CREATE INDEX idx_pazaryeri_kategori_eslesme_pazaryeri
    ON pazaryeri_kategori_eslesme(pazaryeri_id);
CREATE INDEX idx_pazaryeri_kategori_eslesme_kategori
    ON pazaryeri_kategori_eslesme(kategori_id);

CREATE TRIGGER trg_pazaryeri_kategori_eslesme_guncelleme
    BEFORE UPDATE ON pazaryeri_kategori_eslesme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_KOMISYON_POLITIKASI (v1 Sorun #8): Pazaryeri+kategori bazli
-- kategori/tarih donemli komisyon ve hizmet bedeli politikasi.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_komisyon_politikasi (
    id              bigserial PRIMARY KEY,
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE CASCADE,
    pazaryeri_kategori_id bigint REFERENCES pazaryeri_kategori(id) ON DELETE CASCADE,
    baglanti_id     bigint REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,  -- NULL = tum baglantilar
    -- Komisyon
    komisyon_orani  numeric(7, 4) NOT NULL,
    hizmet_bedeli   numeric(18, 4) NOT NULL DEFAULT 0,
    sabit_ucret     numeric(18, 4) NOT NULL DEFAULT 0,
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    -- Gecerlilik
    gecerli_baslangic timestamptz NOT NULL DEFAULT now(),
    gecerli_bitis   timestamptz,
    -- Audit
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (gecerli_bitis IS NULL OR gecerli_baslangic < gecerli_bitis)
);
CREATE INDEX idx_pazaryeri_komisyon_politikasi_pazaryeri
    ON pazaryeri_komisyon_politikasi(pazaryeri_id, pazaryeri_kategori_id);
CREATE INDEX idx_pazaryeri_komisyon_politikasi_baglanti
    ON pazaryeri_komisyon_politikasi(baglanti_id) WHERE baglanti_id IS NOT NULL;
CREATE INDEX idx_pazaryeri_komisyon_politikasi_gecerli
    ON pazaryeri_komisyon_politikasi(pazaryeri_id, gecerli_baslangic, gecerli_bitis);

CREATE TRIGGER trg_pazaryeri_komisyon_politikasi_guncelleme
    BEFORE UPDATE ON pazaryeri_komisyon_politikasi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_URUN_ESLESME: Bizim varyantimiz <-> pazaryeri urunu
-- Asil "listing" tablosu
-- v1 Sorun #3: Fiyat override kaldirildi — pazaryeri_urun_fiyat alt tablosu kullanilir.
-- v1 Sorun #10: py_kategori_id override semantigi netlesti — yorum bloguna bakin.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_urun_eslesme (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE CASCADE,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    -- Pazaryeri kimlikleri
    py_urun_id      varchar(100),
    py_barkod       varchar(100),
    py_sku          varchar(100),
    py_modelkodu    varchar(100),
    py_stok_kodu    varchar(100),
    -- Kategori override (NULL = pazaryeri_kategori_eslesme'den turet)
    py_kategori_id  bigint REFERENCES pazaryeri_kategori(id),
    py_url          text,
    -- Komisyon override (eslesme bazli — pazaryeri_komisyon_hesapla oncelik sirasinda #1)
    py_komisyon_orani numeric(7, 4),
    -- Durum
    py_durum        varchar(30) CHECK (py_durum IN (
        'taslak', 'onayda', 'aktif', 'pasif', 'reddedildi', 'kilitli', 'stoksuz', 'silindi'
    )),
    py_durum_sebep  text,
    satis_aktif_mi  boolean NOT NULL DEFAULT true,
    -- Sync takip
    listed_at       timestamptz,
    son_stok_push   timestamptz,
    son_fiyat_push  timestamptz,
    son_sync        timestamptz,
    son_sync_durum  varchar(20) CHECK (son_sync_durum IN ('basarili', 'hatali', 'kuyrukta', 'calisiyor')),
    sync_hatasi     text,
    -- NOT: Stok degeri BURADA TUTULMAZ. Tek kaynak: urun_stok + urun_stok_rezervasyon
    --      Gonderilecek sayi icin vw_pazaryeri_urun_stok view kullanin.
    -- Audit
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (baglanti_id, urun_varyant_id)
);
CREATE INDEX idx_pazaryeri_urun_eslesme_pazaryeri ON pazaryeri_urun_eslesme(pazaryeri_id) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_urun_eslesme_baglanti ON pazaryeri_urun_eslesme(baglanti_id) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_urun_eslesme_varyant ON pazaryeri_urun_eslesme(urun_varyant_id) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_urun_eslesme_py_urun ON pazaryeri_urun_eslesme(pazaryeri_id, py_urun_id)
    WHERE py_urun_id IS NOT NULL;
CREATE INDEX idx_pazaryeri_urun_eslesme_durum ON pazaryeri_urun_eslesme(py_durum) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_urun_eslesme_sync_hata ON pazaryeri_urun_eslesme(baglanti_id, son_sync DESC)
    WHERE son_sync_durum = 'hatali';

CREATE TRIGGER trg_pazaryeri_urun_eslesme_guncelleme
    BEFORE UPDATE ON pazaryeri_urun_eslesme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

COMMENT ON COLUMN pazaryeri_urun_eslesme.py_kategori_id IS
'NULL ise pazaryeri_kategori_eslesme tablosundan urun.kategori_id araciligiyla turetilir. Dolu ise bu eslesme icin override.';

-- ----------------------------------------------------------------
-- PAZARYERI_URUN_FIYAT (v1 Sorun #3): Donem bazli fiyat override
-- Bir eslesme icin coklu fiyat tipi (satis, liste, piyasa_satis_fiyati,
-- business, kampanya) ve tarih donemi tutabilir.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_urun_fiyat (
    id              bigserial PRIMARY KEY,
    eslesme_id      bigint NOT NULL REFERENCES pazaryeri_urun_eslesme(id) ON DELETE CASCADE,
    fiyat_tipi      varchar(30) NOT NULL DEFAULT 'satis' CHECK (fiyat_tipi IN (
        'satis', 'liste', 'piyasa_satis', 'business', 'indirimli', 'kampanya'
    )),
    fiyat           numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    indirim_orani   numeric(7, 4),                          -- opsiyonel — ornegin %15 off
    -- Donem
    baslangic_tarihi timestamptz NOT NULL DEFAULT now(),
    bitis_tarihi    timestamptz,
    -- Audit
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (bitis_tarihi IS NULL OR baslangic_tarihi < bitis_tarihi)
);
CREATE INDEX idx_pazaryeri_urun_fiyat_eslesme
    ON pazaryeri_urun_fiyat(eslesme_id, fiyat_tipi, baslangic_tarihi DESC);
CREATE INDEX idx_pazaryeri_urun_fiyat_etkin
    ON pazaryeri_urun_fiyat(eslesme_id, baslangic_tarihi, bitis_tarihi);

CREATE TRIGGER trg_pazaryeri_urun_fiyat_guncelleme
    BEFORE UPDATE ON pazaryeri_urun_fiyat
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_URUN_ESLESME_OZELLIK
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_urun_eslesme_ozellik (
    id              bigserial PRIMARY KEY,
    eslesme_id      bigint NOT NULL REFERENCES pazaryeri_urun_eslesme(id) ON DELETE CASCADE,
    ozellik_kod     varchar(100) NOT NULL,
    ozellik_ad      varchar(200),
    deger_kod       varchar(200),
    deger           text NOT NULL,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eslesme_id, ozellik_kod)
);
CREATE INDEX idx_pazaryeri_urun_eslesme_ozellik_eslesme
    ON pazaryeri_urun_eslesme_ozellik(eslesme_id);

-- ----------------------------------------------------------------
-- PAZARYERI_STOK_SYNC_LOG: Stok push event gecmisi
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_stok_sync_log (
    id              bigserial PRIMARY KEY,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    eslesme_id      bigint REFERENCES pazaryeri_urun_eslesme(id) ON DELETE SET NULL,
    urun_varyant_id bigint REFERENCES urun_varyant(id),
    eski_stok       numeric(18, 4),
    yeni_stok       numeric(18, 4) NOT NULL,
    kaynak          varchar(50),
    basarili_mi     boolean NOT NULL DEFAULT true,
    http_durum      int,
    hata_mesaji     text,
    istek_detay     jsonb,
    cevap_detay     jsonb,
    sure_ms         int,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_stok_sync_log_baglanti
    ON pazaryeri_stok_sync_log(baglanti_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_stok_sync_log_eslesme
    ON pazaryeri_stok_sync_log(eslesme_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_stok_sync_log_hata
    ON pazaryeri_stok_sync_log(baglanti_id, olusturma_tarihi DESC) WHERE basarili_mi = false;

-- ----------------------------------------------------------------
-- PAZARYERI_FIYAT_SYNC_LOG: Fiyat push event gecmisi
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_fiyat_sync_log (
    id              bigserial PRIMARY KEY,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    eslesme_id      bigint REFERENCES pazaryeri_urun_eslesme(id) ON DELETE SET NULL,
    urun_varyant_id bigint REFERENCES urun_varyant(id),
    eski_fiyat      numeric(18, 4),
    yeni_fiyat      numeric(18, 4) NOT NULL,
    eski_liste_fiyati numeric(18, 4),
    yeni_liste_fiyati numeric(18, 4),
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    kaynak          varchar(50),
    basarili_mi     boolean NOT NULL DEFAULT true,
    http_durum      int,
    hata_mesaji     text,
    istek_detay     jsonb,
    cevap_detay     jsonb,
    sure_ms         int,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_fiyat_sync_log_baglanti
    ON pazaryeri_fiyat_sync_log(baglanti_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_fiyat_sync_log_eslesme
    ON pazaryeri_fiyat_sync_log(eslesme_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_fiyat_sync_log_hata
    ON pazaryeri_fiyat_sync_log(baglanti_id, olusturma_tarihi DESC) WHERE basarili_mi = false;

-- ----------------------------------------------------------------
-- PAZARYERI_SIPARIS: Pazaryerinden gelen ham siparis
-- v1 Sorun #2: raw_data ayri tabloya + yillik partition.
-- `siparis` tablosuna aktarilmadan once burada tutulur.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_siparis (
    id              bigserial,
    public_id       uuid NOT NULL DEFAULT gen_random_uuid(),
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE RESTRICT,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE RESTRICT,
    -- Pazaryeri kimlikleri
    py_siparis_no   varchar(100) NOT NULL,
    py_paket_no     varchar(100),
    py_siparis_kalem_grup_no varchar(100),
    -- Durumlar
    py_durum        varchar(50) NOT NULL,
    durum_normalize varchar(30) NOT NULL DEFAULT 'yeni' CHECK (durum_normalize IN (
        'yeni', 'onaylandi', 'hazirlaniyor', 'hazirlandi', 'kargoda',
        'teslim_edildi', 'iptal_edildi', 'iade_talebi', 'iade_edildi', 'bilinmiyor'
    )),
    -- Musteri bilgileri (pazaryeri paylastigi kadar)
    musteri_ad      varchar(200),
    musteri_soyad   varchar(200),
    musteri_telefon varchar(30),
    musteri_email   citext,
    musteri_vergi_no varchar(50),
    fatura_adres    jsonb,
    sevk_adres      jsonb,
    -- Para / tutarlar
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    brut_tutar      numeric(18, 4) NOT NULL DEFAULT 0,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kupon_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    kargo_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    net_tutar       numeric(18, 4) NOT NULL DEFAULT 0,
    -- Pazaryerinin kestigi komisyonlar
    komisyon_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    hizmet_bedeli   numeric(18, 4) NOT NULL DEFAULT 0,
    -- Saticiya odenecek net
    hakedilen_tutar numeric(18, 4) GENERATED ALWAYS AS
                    (net_tutar - komisyon_tutari - hizmet_bedeli) STORED,
    -- Tarihler
    py_siparis_tarihi timestamptz NOT NULL,
    py_onay_tarihi  timestamptz,
    py_kargo_tarihi timestamptz,
    py_teslim_tarihi timestamptz,
    vade_tarihi     date,
    -- Kargo
    kargo_firma     varchar(100),
    kargo_takip_no  varchar(100),
    kargo_barkod    varchar(100),
    -- siparis tablosuna aktarim (Modul 08)
    aktarildi_mi    boolean NOT NULL DEFAULT false,
    aktarim_siparis_id bigint REFERENCES siparis(id) ON DELETE SET NULL,
    aktarim_zamani  timestamptz,
    aktarim_hatasi  text,
    -- Iade
    iade_talep_var_mi boolean NOT NULL DEFAULT false,
    -- Arsivleme (v1 Sorun #2)
    arsivlendi_mi   boolean NOT NULL DEFAULT false,
    arsivleme_tarihi timestamptz,
    -- Audit
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- PK must include partition key
    PRIMARY KEY (id, py_siparis_tarihi),
    UNIQUE (pazaryeri_id, py_siparis_no, py_paket_no, py_siparis_tarihi)
) PARTITION BY RANGE (py_siparis_tarihi);

CREATE INDEX idx_pazaryeri_siparis_pazaryeri_tarih
    ON pazaryeri_siparis(pazaryeri_id, py_siparis_tarihi DESC);
CREATE INDEX idx_pazaryeri_siparis_baglanti
    ON pazaryeri_siparis(baglanti_id, py_siparis_tarihi DESC);
CREATE INDEX idx_pazaryeri_siparis_aktarilacak
    ON pazaryeri_siparis(baglanti_id, olusturma_tarihi)
    WHERE aktarildi_mi = false AND silindi_mi = false;
CREATE INDEX idx_pazaryeri_siparis_durum
    ON pazaryeri_siparis(durum_normalize) WHERE silindi_mi = false;
CREATE INDEX idx_pazaryeri_siparis_siparis
    ON pazaryeri_siparis(aktarim_siparis_id) WHERE aktarim_siparis_id IS NOT NULL;
CREATE UNIQUE INDEX unq_pazaryeri_siparis_public
    ON pazaryeri_siparis(public_id);

CREATE TRIGGER trg_pazaryeri_siparis_guncelleme
    BEFORE UPDATE ON pazaryeri_siparis
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Yillik partitionlar (default + son 3 yil + next year)
CREATE TABLE pazaryeri_siparis_y2024 PARTITION OF pazaryeri_siparis
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE pazaryeri_siparis_y2025 PARTITION OF pazaryeri_siparis
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE pazaryeri_siparis_y2026 PARTITION OF pazaryeri_siparis
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE pazaryeri_siparis_y2027 PARTITION OF pazaryeri_siparis
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE pazaryeri_siparis_default PARTITION OF pazaryeri_siparis DEFAULT;

COMMENT ON TABLE pazaryeri_siparis IS
'Yillik range partition (py_siparis_tarihi). Yeni yil icin ek partition cron ile olusturulmali (modul 16).';

-- ----------------------------------------------------------------
-- PAZARYERI_SIPARIS_RAW (v1 Sorun #2): Ham API payload'lari ayri tabloda
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_siparis_raw (
    id              bigserial PRIMARY KEY,
    pazaryeri_siparis_id bigint NOT NULL,                   -- polymorphic FK (partition nedeniyle)
    py_siparis_tarihi timestamptz NOT NULL,                 -- partition erisimi icin
    raw_tipi        varchar(30) NOT NULL DEFAULT 'api_pull' CHECK (raw_tipi IN (
        'api_pull', 'webhook', 'manuel_import', 'arsiv'
    )),
    raw_data        jsonb NOT NULL,
    byte_boyut      int GENERATED ALWAYS AS (octet_length(raw_data::text)) STORED,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_siparis_raw_siparis
    ON pazaryeri_siparis_raw(pazaryeri_siparis_id);
CREATE INDEX idx_pazaryeri_siparis_raw_tarih
    ON pazaryeri_siparis_raw(olusturma_tarihi);
-- LZ4 compression PostgreSQL 14+
ALTER TABLE pazaryeri_siparis_raw
    ALTER COLUMN raw_data SET STORAGE EXTERNAL;

COMMENT ON TABLE pazaryeri_siparis_raw IS
'Ham API cevaplari. 6 aydan eski kayitlar pazaryeri_siparis_raw_arsiv tablosuna tasinir (cron).';

-- ----------------------------------------------------------------
-- PAZARYERI_SIPARIS_RAW_ARSIV (v1 Sorun #2): Soguk depolama
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_siparis_raw_arsiv (
    id              bigint PRIMARY KEY,
    pazaryeri_siparis_id bigint NOT NULL,
    py_siparis_tarihi timestamptz NOT NULL,
    raw_tipi        varchar(30) NOT NULL,
    raw_data        jsonb NOT NULL,
    byte_boyut      int,
    olusturma_tarihi timestamptz NOT NULL,
    arsivleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_siparis_raw_arsiv_siparis
    ON pazaryeri_siparis_raw_arsiv(pazaryeri_siparis_id);

-- View: aktif (arsivlenmemis) pazaryeri siparisleri
CREATE OR REPLACE VIEW vw_pazaryeri_siparis_aktif AS
SELECT *
FROM pazaryeri_siparis
WHERE silindi_mi = false
  AND arsivlendi_mi = false;

-- ----------------------------------------------------------------
-- PAZARYERI_SIPARIS_KALEM
-- NOT: Partitioned parent FK desteklemez; bu yuzden FK yok,
-- butunluk uygulama + trigger'la saglanir.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_siparis_kalem (
    id              bigserial PRIMARY KEY,
    pazaryeri_siparis_id bigint NOT NULL,
    py_siparis_tarihi timestamptz NOT NULL,                 -- partition erisimi
    eslesme_id      bigint REFERENCES pazaryeri_urun_eslesme(id) ON DELETE SET NULL,
    urun_varyant_id bigint REFERENCES urun_varyant(id) ON DELETE SET NULL,
    sira            int NOT NULL DEFAULT 0,
    py_kalem_id     varchar(100),
    py_urun_id      varchar(100),
    py_barkod       varchar(100),
    py_sku          varchar(100),
    urun_ad         varchar(500) NOT NULL,
    urun_aciklama   text,
    miktar          numeric(15, 4) NOT NULL CHECK (miktar > 0),
    birim_fiyat     numeric(18, 4) NOT NULL,
    liste_fiyati    numeric(18, 4),
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_orani       numeric(5, 2),
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL,
    -- Komisyon
    komisyon_orani  numeric(7, 4),
    komisyon_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    hizmet_bedeli   numeric(18, 4) NOT NULL DEFAULT 0,
    -- Satir durumu
    py_kalem_durum  varchar(50),
    durum_normalize varchar(30),
    -- Iade takip
    iade_edilen_miktar numeric(15, 4) NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_siparis_kalem_siparis
    ON pazaryeri_siparis_kalem(pazaryeri_siparis_id);
CREATE INDEX idx_pazaryeri_siparis_kalem_varyant
    ON pazaryeri_siparis_kalem(urun_varyant_id);
CREATE INDEX idx_pazaryeri_siparis_kalem_eslesme
    ON pazaryeri_siparis_kalem(eslesme_id);

-- ----------------------------------------------------------------
-- PAZARYERI_SIPARIS_DURUM_LOG
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_siparis_durum_log (
    id              bigserial PRIMARY KEY,
    pazaryeri_siparis_id bigint NOT NULL,
    py_siparis_tarihi timestamptz NOT NULL,
    eski_durum      varchar(50),
    yeni_durum      varchar(50) NOT NULL,
    eski_durum_normalize varchar(30),
    yeni_durum_normalize varchar(30),
    kaynak          varchar(30) NOT NULL DEFAULT 'pazaryeri' CHECK (kaynak IN (
        'pazaryeri', 'webhook', 'manuel', 'sync_job'
    )),
    aciklama        text,
    raw_data        jsonb,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_siparis_durum_log_siparis
    ON pazaryeri_siparis_durum_log(pazaryeri_siparis_id, olusturma_tarihi DESC);

-- ----------------------------------------------------------------
-- PAZARYERI_KOMISYON_KALEM
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_komisyon_kalem (
    id              bigserial PRIMARY KEY,
    pazaryeri_siparis_id bigint NOT NULL,
    py_siparis_tarihi timestamptz NOT NULL,
    pazaryeri_siparis_kalem_id bigint REFERENCES pazaryeri_siparis_kalem(id) ON DELETE CASCADE,
    urun_varyant_id bigint REFERENCES urun_varyant(id),
    -- Gelir / gider
    satis_tutari    numeric(18, 4) NOT NULL,
    komisyon_orani  numeric(7, 4),
    komisyon_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    hizmet_bedeli   numeric(18, 4) NOT NULL DEFAULT 0,
    kargo_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    kargo_satici_maliyeti numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_orani       numeric(5, 2),
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    otv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    -- Urun maliyeti snapshot
    maliyet_birim   numeric(18, 4),
    maliyet_toplam  numeric(18, 4) NOT NULL DEFAULT 0,
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- v1 Sorun #9: Ikili kar hesabi
    brut_kar        numeric(18, 4) GENERATED ALWAYS AS (
        satis_tutari - komisyon_tutari - hizmet_bedeli - kargo_satici_maliyeti - maliyet_toplam
    ) STORED,
    net_kar_vergi_sonrasi numeric(18, 4) GENERATED ALWAYS AS (
        satis_tutari - komisyon_tutari - hizmet_bedeli
        - kargo_satici_maliyeti - maliyet_toplam - kdv_tutari - otv_tutari
    ) STORED,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_komisyon_kalem_siparis
    ON pazaryeri_komisyon_kalem(pazaryeri_siparis_id);
CREATE INDEX idx_pazaryeri_komisyon_kalem_varyant
    ON pazaryeri_komisyon_kalem(urun_varyant_id);

-- ----------------------------------------------------------------
-- VIEW: vw_pazaryeri_karlilik (v1 Sorun #9 uyumlu)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pazaryeri_karlilik AS
SELECT
    pk.urun_varyant_id,
    uv.sku,
    uv.varyant_ad,
    ps.pazaryeri_id,
    p.kod                           AS pazaryeri_kod,
    p.ad                            AS pazaryeri_ad,
    COUNT(DISTINCT ps.id)           AS siparis_sayisi,
    SUM(psk.miktar)                 AS satilan_miktar,
    SUM(pk.satis_tutari)            AS toplam_satis,
    SUM(pk.komisyon_tutari)         AS toplam_komisyon,
    SUM(pk.hizmet_bedeli)           AS toplam_hizmet,
    SUM(pk.kargo_satici_maliyeti)   AS toplam_kargo_maliyet,
    SUM(pk.maliyet_toplam)          AS toplam_urun_maliyet,
    SUM(pk.kdv_tutari + pk.otv_tutari) AS toplam_vergi,
    SUM(pk.brut_kar)                AS toplam_brut_kar,
    SUM(pk.net_kar_vergi_sonrasi)   AS toplam_net_kar,
    CASE WHEN SUM(pk.satis_tutari) > 0
         THEN SUM(pk.net_kar_vergi_sonrasi) / SUM(pk.satis_tutari)
         ELSE 0 END                 AS net_kar_marji,
    pk.para_birimi_kod
FROM pazaryeri_komisyon_kalem pk
JOIN pazaryeri_siparis ps      ON ps.id = pk.pazaryeri_siparis_id AND ps.py_siparis_tarihi = pk.py_siparis_tarihi
JOIN pazaryeri p               ON p.id = ps.pazaryeri_id
LEFT JOIN pazaryeri_siparis_kalem psk ON psk.id = pk.pazaryeri_siparis_kalem_id
LEFT JOIN urun_varyant uv      ON uv.id = pk.urun_varyant_id
WHERE ps.silindi_mi = false
GROUP BY pk.urun_varyant_id, uv.sku, uv.varyant_ad,
         ps.pazaryeri_id, p.kod, p.ad, pk.para_birimi_kod;

-- ----------------------------------------------------------------
-- PAZARYERI_IADE
-- v1 bonus: iade_sebep_id FK modul 08 iade_sebep lookup'a
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_iade (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE RESTRICT,
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE RESTRICT,
    pazaryeri_siparis_id bigint NOT NULL,
    py_siparis_tarihi timestamptz NOT NULL,
    pazaryeri_siparis_kalem_id bigint REFERENCES pazaryeri_siparis_kalem(id) ON DELETE RESTRICT,
    py_iade_no      varchar(100) NOT NULL,
    py_iade_tipi    varchar(50),
    py_durum        varchar(50) NOT NULL,
    durum_normalize varchar(30) NOT NULL DEFAULT 'yeni' CHECK (durum_normalize IN (
        'yeni', 'kabul_edildi', 'reddedildi', 'urun_geldi', 'tamamlandi', 'iptal'
    )),
    iade_sebep_id   bigint REFERENCES iade_sebep(id),
    py_sebep_kod    varchar(100),
    py_sebep_aciklama text,
    miktar          numeric(15, 4) NOT NULL CHECK (miktar > 0),
    iade_tutari     numeric(18, 4) NOT NULL DEFAULT 0,
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    musteri_notu    text,
    iade_kargo_firma varchar(100),
    iade_kargo_takip varchar(100),
    py_talep_tarihi timestamptz,
    py_son_tarih    timestamptz,
    sonuc_tarihi    timestamptz,
    -- Ic baglanti
    iade_belge_id   bigint REFERENCES iade(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_id, py_iade_no)
);
CREATE INDEX idx_pazaryeri_iade_siparis ON pazaryeri_iade(pazaryeri_siparis_id);
CREATE INDEX idx_pazaryeri_iade_durum ON pazaryeri_iade(durum_normalize);
CREATE INDEX idx_pazaryeri_iade_baglanti_tarih ON pazaryeri_iade(baglanti_id, py_talep_tarihi DESC);
CREATE INDEX idx_pazaryeri_iade_sebep ON pazaryeri_iade(iade_sebep_id) WHERE iade_sebep_id IS NOT NULL;

CREATE TRIGGER trg_pazaryeri_iade_guncelleme
    BEFORE UPDATE ON pazaryeri_iade
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- PAZARYERI_WEBHOOK_LOG (v1 Sorun #7 + iyilestirme): Webhook dedup + audit
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_webhook_log (
    id              bigserial PRIMARY KEY,
    pazaryeri_id    bigint NOT NULL REFERENCES pazaryeri(id) ON DELETE CASCADE,
    baglanti_id     bigint REFERENCES pazaryeri_baglanti(id) ON DELETE SET NULL,
    event_tipi      varchar(100) NOT NULL,                  -- 'siparis_olusturuldu', 'iade_talebi', 'stok_uyari' vb.
    olay_kimligi    varchar(200),                           -- pazaryerinin event id'si (dedup icin)
    payload         jsonb NOT NULL,
    imza            text,                                   -- HMAC/JWT signature
    dogrulandi_mi   boolean NOT NULL DEFAULT false,
    islendi_mi      boolean NOT NULL DEFAULT false,
    islem_zamani    timestamptz,
    hata            text,
    deneme_sayisi   int NOT NULL DEFAULT 0,
    ip_adresi       inet,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pazaryeri_id, olay_kimligi)                     -- Idempotent dedup
);
CREATE INDEX idx_pazaryeri_webhook_log_bekleyen
    ON pazaryeri_webhook_log(pazaryeri_id, olusturma_tarihi)
    WHERE islendi_mi = false;
CREATE INDEX idx_pazaryeri_webhook_log_baglanti
    ON pazaryeri_webhook_log(baglanti_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_webhook_log_hata
    ON pazaryeri_webhook_log(pazaryeri_id, olusturma_tarihi DESC) WHERE hata IS NOT NULL;

-- ----------------------------------------------------------------
-- PAZARYERI_SYNC_JOB: Cron job kuyruk yonetimi
-- v1 Sorun #6: Retry + exponential backoff alanlari eklendi.
-- ----------------------------------------------------------------
CREATE TABLE pazaryeri_sync_job (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    baglanti_id     bigint NOT NULL REFERENCES pazaryeri_baglanti(id) ON DELETE CASCADE,
    tip             varchar(50) NOT NULL CHECK (tip IN (
        'urun_push', 'urun_pull', 'stok_push', 'fiyat_push',
        'siparis_pull', 'iade_pull', 'kategori_pull', 'komisyon_pull',
        'durum_guncelle', 'webhook_islem', 'toplu_push', 'saglik_kontrol'
    )),
    oncelik         smallint NOT NULL DEFAULT 50,
    durum           varchar(20) NOT NULL DEFAULT 'kuyrukta' CHECK (durum IN (
        'kuyrukta', 'devam_ediyor', 'basarili', 'hatali', 'iptal', 'beklemede'
    )),
    hedef_tip       varchar(30),
    hedef_id        bigint,
    -- Zamanlama
    zamanlama       timestamptz,
    baslangic       timestamptz,
    bitis           timestamptz,
    sure_ms         int,
    -- Retry + backoff
    girdi_param     jsonb,
    sonuc           jsonb,
    hata_mesaji     text,
    deneme_sayisi   int NOT NULL DEFAULT 0,
    maksimum_deneme int NOT NULL DEFAULT 5,
    son_deneme_zamani timestamptz,
    sonraki_deneme_zamani timestamptz,                      -- exponential backoff
    backoff_tabani_saniye int NOT NULL DEFAULT 30,          -- 30, 60, 120, 240, 480...
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pazaryeri_sync_job_kuyruk
    ON pazaryeri_sync_job(oncelik, zamanlama)
    WHERE durum = 'kuyrukta';
CREATE INDEX idx_pazaryeri_sync_job_bekleyen
    ON pazaryeri_sync_job(sonraki_deneme_zamani)
    WHERE durum IN ('kuyrukta', 'beklemede');
CREATE INDEX idx_pazaryeri_sync_job_baglanti
    ON pazaryeri_sync_job(baglanti_id, olusturma_tarihi DESC);
CREATE INDEX idx_pazaryeri_sync_job_hata
    ON pazaryeri_sync_job(baglanti_id, olusturma_tarihi DESC) WHERE durum = 'hatali';
CREATE INDEX idx_pazaryeri_sync_job_devam
    ON pazaryeri_sync_job(baslangic) WHERE durum = 'devam_ediyor';

CREATE TRIGGER trg_pazaryeri_sync_job_guncelleme
    BEFORE UPDATE ON pazaryeri_sync_job
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- View: calistirilabilir job'lar (kuyrukta veya backoff dolmus)
CREATE OR REPLACE VIEW vw_pazaryeri_sync_kuyruk AS
SELECT
    psj.*,
    pb.ad AS baglanti_ad,
    p.kod AS pazaryeri_kod
FROM pazaryeri_sync_job psj
JOIN pazaryeri_baglanti pb ON pb.id = psj.baglanti_id
JOIN pazaryeri p ON p.id = pb.pazaryeri_id
WHERE psj.durum IN ('kuyrukta', 'beklemede')
  AND (psj.sonraki_deneme_zamani IS NULL OR psj.sonraki_deneme_zamani <= now())
  AND (psj.zamanlama IS NULL OR psj.zamanlama <= now())
  AND psj.deneme_sayisi < psj.maksimum_deneme
  AND pb.aktif_mi = true
  AND pb.silindi_mi = false
ORDER BY psj.oncelik, psj.olusturma_tarihi;

-- ----------------------------------------------------------------
-- VIEW: vw_pazaryeri_baglanti_ozet
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pazaryeri_baglanti_ozet AS
SELECT
    pb.id                                   AS baglanti_id,
    pb.ad                                   AS baglanti_ad,
    p.id                                    AS pazaryeri_id,
    p.kod                                   AS pazaryeri_kod,
    p.ad                                    AS pazaryeri_ad,
    pb.magaza_id,
    pb.durum,
    pb.son_sync_zamani,
    pb.saglik_kontrolu_son,
    pb.saglik_kontrolu_durum,
    pb.son_hata,
    (SELECT COUNT(*) FROM pazaryeri_urun_eslesme pue
        WHERE pue.baglanti_id = pb.id AND pue.silindi_mi = false
          AND pue.py_durum = 'aktif')       AS aktif_listing_sayisi,
    (SELECT COUNT(*) FROM pazaryeri_urun_eslesme pue
        WHERE pue.baglanti_id = pb.id AND pue.silindi_mi = false
          AND pue.son_sync_durum = 'hatali') AS hatali_listing_sayisi,
    (SELECT COUNT(*) FROM pazaryeri_siparis ps
        WHERE ps.baglanti_id = pb.id AND ps.aktarildi_mi = false
          AND ps.silindi_mi = false)        AS bekleyen_siparis_sayisi,
    (SELECT COUNT(*) FROM pazaryeri_sync_job psj
        WHERE psj.baglanti_id = pb.id AND psj.durum = 'kuyrukta') AS kuyrukta_job_sayisi,
    (SELECT COUNT(*) FROM pazaryeri_sync_job psj
        WHERE psj.baglanti_id = pb.id AND psj.durum = 'hatali'
          AND psj.olusturma_tarihi > now() - interval '24 hours') AS son_24s_hata_sayisi,
    (SELECT COUNT(*) FROM pazaryeri_webhook_log pwl
        WHERE pwl.baglanti_id = pb.id AND pwl.islendi_mi = false) AS bekleyen_webhook_sayisi
FROM pazaryeri_baglanti pb
JOIN pazaryeri p ON p.id = pb.pazaryeri_id
WHERE pb.silindi_mi = false;

-- ============================================================
-- VIEW: vw_pazaryeri_urun_stok (v1 Sorun #4)
-- Tek kaynak stok: urun_stok - urun_stok_rezervasyon - guvenlik_tampon
-- Pazaryerine gonderilecek adet bu view'dan okunur.
-- ============================================================
CREATE OR REPLACE VIEW vw_pazaryeri_urun_stok AS
SELECT
    pue.id                              AS eslesme_id,
    pue.baglanti_id,
    pue.urun_varyant_id,
    pb.magaza_id,
    us.mevcut_miktar,
    us.rezerve_miktar,
    us.kullanilabilir_miktar,
    COALESCE((pb.baglanti_ayar->>'stok_guvenlik_tampon')::numeric, 0)
                                        AS guvenlik_tampon,
    GREATEST(
        0,
        us.kullanilabilir_miktar - COALESCE((pb.baglanti_ayar->>'stok_guvenlik_tampon')::numeric, 0)
    )                                   AS gonderilecek_stok,
    us.guncelleme_tarihi                AS stok_son_guncelleme
FROM pazaryeri_urun_eslesme pue
JOIN pazaryeri_baglanti pb ON pb.id = pue.baglanti_id
LEFT JOIN urun_stok us
       ON us.urun_varyant_id = pue.urun_varyant_id
      AND us.magaza_id = pb.magaza_id
WHERE pue.silindi_mi = false
  AND pb.silindi_mi = false
  AND pue.satis_aktif_mi = true;

COMMENT ON VIEW vw_pazaryeri_urun_stok IS
'Pazaryerine gonderilecek nihai stok sayisi. Tek kaynak: urun_stok. Modul 16 push worker bu view''dan okur.';

-- ============================================================
-- FUNCTION: pazaryeri_komisyon_hesapla (v1 Sorun #8)
-- Oncelik sirasi:
--   1. pazaryeri_urun_eslesme.py_komisyon_orani (eslesme bazli override)
--   2. pazaryeri_komisyon_politikasi (baglanti + kategori + gecerli donem)
--   3. pazaryeri_komisyon_politikasi (pazaryeri + kategori + gecerli donem)
--   4. pazaryeri_kategori.komisyon_orani
--   5. pazaryeri_baglanti.komisyon_override_orani
--   6. pazaryeri.varsayilan_komisyon_orani
-- ============================================================
CREATE OR REPLACE FUNCTION pazaryeri_komisyon_hesapla(
    p_baglanti_id bigint,
    p_urun_varyant_id bigint,
    p_tarih timestamptz DEFAULT now()
) RETURNS numeric AS $$
DECLARE
    v_pazaryeri_id bigint;
    v_py_kategori_id bigint;
    v_oran numeric;
BEGIN
    SELECT pb.pazaryeri_id INTO v_pazaryeri_id
    FROM pazaryeri_baglanti pb
    WHERE pb.id = p_baglanti_id;

    IF v_pazaryeri_id IS NULL THEN
        RAISE EXCEPTION 'Baglanti bulunamadi: %', p_baglanti_id;
    END IF;

    -- 1) Eslesme bazli override
    SELECT pue.py_komisyon_orani, pue.py_kategori_id
      INTO v_oran, v_py_kategori_id
    FROM pazaryeri_urun_eslesme pue
    WHERE pue.baglanti_id = p_baglanti_id
      AND pue.urun_varyant_id = p_urun_varyant_id
      AND pue.silindi_mi = false
    LIMIT 1;

    IF v_oran IS NOT NULL THEN
        RETURN v_oran;
    END IF;

    -- py_kategori_id bulunamadiysa kategori_eslesme'den turet
    IF v_py_kategori_id IS NULL THEN
        SELECT pke.pazaryeri_kategori_id INTO v_py_kategori_id
        FROM pazaryeri_kategori_eslesme pke
        JOIN urun u ON u.kategori_id = pke.kategori_id
        JOIN urun_varyant uv ON uv.urun_id = u.id
        WHERE uv.id = p_urun_varyant_id
          AND pke.pazaryeri_id = v_pazaryeri_id
        LIMIT 1;
    END IF;

    -- 2) Komisyon politikasi (baglanti + kategori)
    SELECT kp.komisyon_orani INTO v_oran
    FROM pazaryeri_komisyon_politikasi kp
    WHERE kp.pazaryeri_id = v_pazaryeri_id
      AND kp.baglanti_id = p_baglanti_id
      AND kp.pazaryeri_kategori_id = v_py_kategori_id
      AND kp.gecerli_baslangic <= p_tarih
      AND (kp.gecerli_bitis IS NULL OR kp.gecerli_bitis > p_tarih)
    ORDER BY kp.gecerli_baslangic DESC
    LIMIT 1;

    IF v_oran IS NOT NULL THEN
        RETURN v_oran;
    END IF;

    -- 3) Komisyon politikasi (pazaryeri + kategori, baglanti bagimsiz)
    SELECT kp.komisyon_orani INTO v_oran
    FROM pazaryeri_komisyon_politikasi kp
    WHERE kp.pazaryeri_id = v_pazaryeri_id
      AND kp.baglanti_id IS NULL
      AND kp.pazaryeri_kategori_id = v_py_kategori_id
      AND kp.gecerli_baslangic <= p_tarih
      AND (kp.gecerli_bitis IS NULL OR kp.gecerli_bitis > p_tarih)
    ORDER BY kp.gecerli_baslangic DESC
    LIMIT 1;

    IF v_oran IS NOT NULL THEN
        RETURN v_oran;
    END IF;

    -- 4) pazaryeri_kategori.komisyon_orani
    SELECT pk.komisyon_orani INTO v_oran
    FROM pazaryeri_kategori pk
    WHERE pk.id = v_py_kategori_id;

    IF v_oran IS NOT NULL THEN
        RETURN v_oran;
    END IF;

    -- 5) Baglanti override
    SELECT pb.komisyon_override_orani INTO v_oran
    FROM pazaryeri_baglanti pb
    WHERE pb.id = p_baglanti_id;

    IF v_oran IS NOT NULL THEN
        RETURN v_oran;
    END IF;

    -- 6) Pazaryeri default
    SELECT p.varsayilan_komisyon_orani INTO v_oran
    FROM pazaryeri p
    WHERE p.id = v_pazaryeri_id;

    RETURN COALESCE(v_oran, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCTION: pazaryeri_etkin_fiyat — Bir eslesmenin belirli tarihteki etkin fiyati
-- ============================================================
CREATE OR REPLACE FUNCTION pazaryeri_etkin_fiyat(
    p_eslesme_id bigint,
    p_fiyat_tipi varchar DEFAULT 'satis',
    p_tarih timestamptz DEFAULT now()
) RETURNS numeric AS $$
DECLARE
    v_fiyat numeric;
BEGIN
    SELECT fiyat INTO v_fiyat
    FROM pazaryeri_urun_fiyat
    WHERE eslesme_id = p_eslesme_id
      AND fiyat_tipi = p_fiyat_tipi
      AND baslangic_tarihi <= p_tarih
      AND (bitis_tarihi IS NULL OR bitis_tarihi > p_tarih)
    ORDER BY baslangic_tarihi DESC
    LIMIT 1;

    RETURN v_fiyat;
END;
$$ LANGUAGE plpgsql STABLE;

-- View: her eslesme icin tum etkin fiyat tipleri (o an gecerli olanlar)
CREATE OR REPLACE VIEW vw_pazaryeri_etkin_fiyat AS
SELECT DISTINCT ON (puf.eslesme_id, puf.fiyat_tipi)
    puf.eslesme_id,
    puf.fiyat_tipi,
    puf.fiyat,
    puf.para_birimi_kod,
    puf.indirim_orani,
    puf.baslangic_tarihi,
    puf.bitis_tarihi
FROM pazaryeri_urun_fiyat puf
WHERE puf.baslangic_tarihi <= now()
  AND (puf.bitis_tarihi IS NULL OR puf.bitis_tarihi > now())
ORDER BY puf.eslesme_id, puf.fiyat_tipi, puf.baslangic_tarihi DESC;

-- ============================================================
-- FUNCTION: pazaryeri_siparis_aktar (v1 Sorun #5)
-- Pazaryeri siparisini `siparis` + `siparis_kalem` tablolarina atomic aktarir.
-- - Cari: p_cari_id verilmisse o, yoksa _NIHAI_TUKETICI sistem cari kullanilir.
-- - Her kalem icin stok rezervasyonu (modul 07 stok_rezerve_et).
-- - Hata durumunda transaction rollback; aktarim_hatasi'na yazilir.
-- ============================================================
CREATE OR REPLACE FUNCTION pazaryeri_siparis_aktar(
    p_pazaryeri_siparis_id bigint,
    p_py_siparis_tarihi timestamptz,
    p_cari_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_ps             record;
    v_kalem          record;
    v_cari_id        bigint;
    v_magaza_id      bigint;
    v_siparis_id     bigint;
    v_siparis_no     varchar;
    v_pazaryeri_kod  varchar;
    v_sira           int := 0;
    v_rezervasyon_id bigint;
BEGIN
    -- 1) Pazaryeri siparisini kilitle
    SELECT * INTO v_ps
    FROM pazaryeri_siparis
    WHERE id = p_pazaryeri_siparis_id
      AND py_siparis_tarihi = p_py_siparis_tarihi
    FOR UPDATE;

    IF v_ps.id IS NULL THEN
        RAISE EXCEPTION 'Pazaryeri siparis bulunamadi: id=%', p_pazaryeri_siparis_id;
    END IF;

    IF v_ps.aktarildi_mi THEN
        RAISE EXCEPTION 'Siparis zaten aktarilmis: id=% (siparis_id=%)',
            p_pazaryeri_siparis_id, v_ps.aktarim_siparis_id;
    END IF;

    IF v_ps.silindi_mi THEN
        RAISE EXCEPTION 'Siparis silinmis: id=%', p_pazaryeri_siparis_id;
    END IF;

    -- 2) Magaza + pazaryeri kodu
    SELECT pb.magaza_id, p.kod
      INTO v_magaza_id, v_pazaryeri_kod
    FROM pazaryeri_baglanti pb
    JOIN pazaryeri p ON p.id = pb.pazaryeri_id
    WHERE pb.id = v_ps.baglanti_id;

    -- 3) Cari: parametre verilmisse o, yoksa _NIHAI_TUKETICI
    IF p_cari_id IS NOT NULL THEN
        v_cari_id := p_cari_id;
    ELSE
        SELECT id INTO v_cari_id
        FROM cari
        WHERE kod = '_NIHAI_TUKETICI'
        LIMIT 1;

        IF v_cari_id IS NULL THEN
            RAISE EXCEPTION '_NIHAI_TUKETICI sistem cari bulunamadi. Seed eksik.';
        END IF;
    END IF;

    -- 4) Siparis no: pazaryeri kodu + py siparis no
    v_siparis_no := 'PY-' || v_pazaryeri_kod || '-' || v_ps.py_siparis_no;
    IF v_ps.py_paket_no IS NOT NULL THEN
        v_siparis_no := v_siparis_no || '-' || v_ps.py_paket_no;
    END IF;

    -- 5) Siparis kaydi
    INSERT INTO siparis (
        siparis_no, tip, satis_kanali,
        pazaryeri_kod, pazaryeri_siparis_id, pazaryeri_paket_no,
        cari_id, magaza_id,
        cari_unvan_snapshot,
        fatura_adres_snapshot, sevk_adres_snapshot,
        durum, siparis_tarihi,
        para_birimi_kod, kur, fiyatlar_kdv_dahil_mi,
        kargo_tutari, kargo_firma, kargo_takip_no,
        aciklama,
        olusturan_kullanici_id
    ) VALUES (
        v_siparis_no, 'satis', 'pazaryeri',
        v_pazaryeri_kod, v_ps.py_siparis_no, v_ps.py_paket_no,
        v_cari_id, v_magaza_id,
        COALESCE(v_ps.musteri_ad || ' ' || v_ps.musteri_soyad, 'Pazaryeri Musterisi'),
        v_ps.fatura_adres, v_ps.sevk_adres,
        CASE v_ps.durum_normalize
            WHEN 'iptal_edildi' THEN 'iptal_edildi'
            WHEN 'teslim_edildi' THEN 'teslim_edildi'
            WHEN 'kargoda' THEN 'kargoda'
            WHEN 'hazirlandi' THEN 'hazirlandi'
            ELSE 'onaylandi'
        END,
        v_ps.py_siparis_tarihi,
        v_ps.para_birimi_kod, 1, true,
        v_ps.kargo_tutari, v_ps.kargo_firma, v_ps.kargo_takip_no,
        format('Pazaryeri aktarimi: %s / %s', v_pazaryeri_kod, v_ps.py_siparis_no),
        p_kullanici_id
    ) RETURNING id INTO v_siparis_id;

    -- 6) Kalemler
    FOR v_kalem IN
        SELECT * FROM pazaryeri_siparis_kalem
        WHERE pazaryeri_siparis_id = v_ps.id
        ORDER BY sira, id
    LOOP
        v_sira := v_sira + 1;

        IF v_kalem.urun_varyant_id IS NULL THEN
            RAISE EXCEPTION 'Kalem icin urun_varyant_id eslesmesi yok. Kalem id=%, sku=%',
                v_kalem.id, v_kalem.py_sku;
        END IF;

        INSERT INTO siparis_kalem (
            siparis_id, sira,
            urun_varyant_id,
            urun_adi, barkod,
            miktar,
            birim_fiyat, birim_fiyat_kdv_dahil, liste_fiyati,
            iskonto_tutari,
            ara_toplam, vergi_tutari_toplam, toplam_tutar,
            aciklama
        ) VALUES (
            v_siparis_id, v_sira,
            v_kalem.urun_varyant_id,
            v_kalem.urun_ad, v_kalem.py_barkod,
            v_kalem.miktar,
            -- KDV haric birim (kdv dahil gelen fiyat bolme)
            CASE WHEN v_kalem.kdv_orani IS NOT NULL AND v_kalem.kdv_orani > 0
                 THEN v_kalem.birim_fiyat / (1 + v_kalem.kdv_orani / 100)
                 ELSE v_kalem.birim_fiyat END,
            v_kalem.birim_fiyat,
            v_kalem.liste_fiyati,
            v_kalem.iskonto_tutari,
            v_kalem.miktar * v_kalem.birim_fiyat - v_kalem.iskonto_tutari - v_kalem.kdv_tutari,
            v_kalem.kdv_tutari,
            v_kalem.toplam_tutar,
            format('Pazaryeri kalem: %s', v_kalem.py_sku)
        );

        -- Stok rezervasyonu (modul 07)
        BEGIN
            v_rezervasyon_id := stok_rezerve_et(
                p_urun_varyant_id := v_kalem.urun_varyant_id,
                p_magaza_id := v_magaza_id,
                p_miktar := v_kalem.miktar,
                p_kaynak_tipi := 'pazaryeri_siparis',
                p_kaynak_id := v_siparis_id,
                p_son_kullanim := NULL,
                p_kullanici_id := p_kullanici_id
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Stok rezervasyon hatasi. varyant=%, magaza=%, hata=%',
                v_kalem.urun_varyant_id, v_magaza_id, SQLERRM;
        END;
    END LOOP;

    -- 7) Pazaryeri siparisini aktarildi olarak isaretle
    UPDATE pazaryeri_siparis
    SET aktarildi_mi = true,
        aktarim_siparis_id = v_siparis_id,
        aktarim_zamani = now(),
        aktarim_hatasi = NULL,
        guncelleme_tarihi = now()
    WHERE id = v_ps.id AND py_siparis_tarihi = v_ps.py_siparis_tarihi;

    RETURN v_siparis_id;
EXCEPTION WHEN OTHERS THEN
    -- Hata audit — asil rollback caller transaction'ina ait
    UPDATE pazaryeri_siparis
    SET aktarim_hatasi = SQLERRM,
        guncelleme_tarihi = now()
    WHERE id = p_pazaryeri_siparis_id AND py_siparis_tarihi = p_py_siparis_tarihi;
    RAISE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pazaryeri_siparis_aktar IS
'Pazaryeri siparisini siparis + siparis_kalem tablolarina atomic aktarir. Hata halinde pazaryeri_siparis.aktarim_hatasi doldurulur ve exception yukariya atilir.';

-- ============================================================
-- FUNCTION: pazaryeri_sync_job_backoff_ayarla
-- Hata sonrasi sonraki_deneme_zamani = now() + backoff_tabani * 2^(deneme_sayisi-1)
-- ============================================================
CREATE OR REPLACE FUNCTION pazaryeri_sync_job_backoff_ayarla(
    p_job_id bigint,
    p_hata text
) RETURNS void AS $$
DECLARE
    v_job record;
    v_bekleme_saniye int;
BEGIN
    SELECT * INTO v_job FROM pazaryeri_sync_job WHERE id = p_job_id FOR UPDATE;

    IF v_job.id IS NULL THEN
        RAISE EXCEPTION 'Sync job bulunamadi: %', p_job_id;
    END IF;

    v_bekleme_saniye := v_job.backoff_tabani_saniye * POWER(2, GREATEST(v_job.deneme_sayisi, 0));

    UPDATE pazaryeri_sync_job
    SET deneme_sayisi = deneme_sayisi + 1,
        son_deneme_zamani = now(),
        sonraki_deneme_zamani = now() + make_interval(secs => v_bekleme_saniye),
        hata_mesaji = p_hata,
        durum = CASE
            WHEN deneme_sayisi + 1 >= maksimum_deneme THEN 'hatali'
            ELSE 'beklemede'
        END,
        guncelleme_tarihi = now()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ENTEGRASYON NOTLARI (modul 16 icin)
-- ============================================================
-- 1. Stok push worker: vw_pazaryeri_urun_stok'tan okur, son_stok_push + son push tarih debounce
--    kontrolu yapar, pazaryeri_sync_job.tip='stok_push' ile enqueue eder.
-- 2. urun_stok tablosu her guncellendiginde (modul 07 trigger'i) ilgili aktif eslesmeler icin
--    stok_push job'lari enqueue edilmelidir. Trigger kodu modul 16 (job scheduler) icinde.
-- 3. Arsivleme cron: pazaryeri_siparis_raw tablosundan 180 gun+ eski kayitlari
--    pazaryeri_siparis_raw_arsiv'e MOVE eder. Yillik partition drop/detach modul 16.
-- 4. Credential rotation: pazaryeri_baglanti_kms tablosuna yeni key_version satiri eklenir,
--    eski satir aktif_mi=false yapilir. pazaryeri_baglanti_log'a 'credential_rotasyon' eventi.
-- 5. Webhook listener: pazaryeri_webhook_log'a INSERT (UNIQUE olay_kimligi ile dedup),
--    sonra async islenir. pazaryeri_sync_job.tip='webhook_islem'.
-- 6. Saglik kontrolu: Her aktif baglanti icin 15 dakikada bir whoami cagrisi;
--    sonuc pazaryeri_baglanti.saglik_kontrolu_son + saglik_kontrolu_durum.
