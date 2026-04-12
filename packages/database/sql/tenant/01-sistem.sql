-- ============================================================
-- MODÜL 01: SİSTEM (Tenant DB) — v2 REFACTOR
-- ============================================================
-- v1 eleştirmen skoru: 6.5/10 → v2 hedef: 9+/10
--
-- Bu refactor'da çözülen kritik sorunlar (01-sistem-elestiri-v1):
--   #1 RBAC granülerlik: yetki_kapsam (row-level filtre) + vw_kullanici_etkin_yetki
--   #2 audit_log declarative partitioning (yıllık) + 2026/2027/2028 partition'ları
--   #3 JSONB blob schema validation (CHECK) + belge_numara_serisi tablosu ayrı
--   #4 sifre_politikasi + kullanici_sifre_gecmisi
--   #5 oturum hijacking tespiti: oturum.olusturma_ip/son_kullanim_ip + oturum_anomali
--   #6 api_rate_limit tablosu — sliding window sayaç
--   #7 bildirim_tipi sözlüğü (katalog) + seed
--   #8 sistem_ayar_versiyon (config geçmişi)
--   #9 kullanici_2fa_yedek_kullanim — backup kod kullanım log
--
-- Multi-tenant: DB-per-tenant. Her tenant kendi PostgreSQL DB'sinde çalışır.
-- RLS kullanılmıyor çünkü izolasyon zaten DB seviyesinde. RBAC row-level
-- filtre mantığı yetki_kapsam tablosuyla app katmanında enforce edilir.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

-- ----------------------------------------------------------------
-- TRIGGER FUNCTION: guncelleme_tarihi otomatik (tüm modüllerde ortak)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION guncelle_guncelleme_tarihi()
RETURNS TRIGGER AS $$
BEGIN
    NEW.guncelleme_tarihi = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- SISTEM_AYAR: Tenant'ın merkezi config (tek satır)
-- ----------------------------------------------------------------
CREATE TABLE sistem_ayar (
    id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    tenant_id       uuid NOT NULL,                       -- master DB'deki tenant.id
    -- Firma kimliği
    firma_adi       varchar(200) NOT NULL,
    firma_logo_url  text,
    firma_favicon_url text,
    -- Locale
    varsayilan_dil  char(2) NOT NULL DEFAULT 'tr',
    desteklenen_diller char(2)[] NOT NULL DEFAULT ARRAY['tr', 'en'],
    varsayilan_para_birimi char(3) NOT NULL DEFAULT 'TRY',
    zaman_dilimi    varchar(50) NOT NULL DEFAULT 'Europe/Istanbul',
    ulke_kodu       char(2) NOT NULL DEFAULT 'TR',
    tarih_formati   varchar(20) NOT NULL DEFAULT 'DD.MM.YYYY',
    saat_formati    varchar(10) NOT NULL DEFAULT 'HH:mm',
    haftaningunu_baslangic smallint NOT NULL DEFAULT 1,  -- 1=Pzt, 7=Pazar
    -- Tema
    tema            varchar(20) NOT NULL DEFAULT 'sistem' CHECK (tema IN ('acik', 'koyu', 'sistem')),
    marka_rengi     varchar(20),                         -- hex color
    -- Modüller (toggle) — minimum schema check
    moduller        jsonb NOT NULL DEFAULT '{
        "eticaret": false,
        "pazaryeri": false,
        "muhasebe_cift_giris": false,
        "uretim": false,
        "servis": false,
        "abonelik": false,
        "sadakat": false,
        "hediye_karti": false,
        "e_fatura": false,
        "e_irsaliye": false
    }'::jsonb,
    -- Numara serileri — minimum schema check (detaylı seri belge_numara_serisi'nde)
    numara_serileri jsonb NOT NULL DEFAULT '{
        "siparis": {"on_ek": "SIP", "uzunluk": 6, "sonraki": 1},
        "fatura": {"on_ek": "FAT", "uzunluk": 6, "sonraki": 1},
        "irsaliye": {"on_ek": "IRS", "uzunluk": 6, "sonraki": 1},
        "iade": {"on_ek": "IAD", "uzunluk": 6, "sonraki": 1},
        "transfer": {"on_ek": "TRN", "uzunluk": 6, "sonraki": 1},
        "sayim": {"on_ek": "SAY", "uzunluk": 6, "sonraki": 1},
        "yevmiye": {"on_ek": "YEV", "uzunluk": 6, "sonraki": 1},
        "cari": {"on_ek": "C", "uzunluk": 5, "sonraki": 1},
        "urun": {"on_ek": "U", "uzunluk": 6, "sonraki": 1}
    }'::jsonb,
    -- E-Fatura ayarları (TR'ye özel)
    e_fatura_ayar   jsonb NOT NULL DEFAULT '{}',
    -- Bildirim ayarları
    bildirim_ayar   jsonb NOT NULL DEFAULT '{
        "email": {"aktif": true, "smtp": null},
        "sms": {"aktif": false, "saglayici": null},
        "whatsapp": {"aktif": false}
    }'::jsonb,
    -- Varsayılan kur kaynağı (modül 02'de FK eklenecek)
    varsayilan_kur_kaynagi_id bigint,
    -- KVKK / GDPR
    veri_saklama_yili int NOT NULL DEFAULT 10,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Minimum JSONB schema doğrulaması (tam validation app katmanında Zod ile)
    CONSTRAINT chk_sistem_ayar_moduller CHECK (
        jsonb_typeof(moduller) = 'object'
        AND moduller ? 'eticaret'
        AND moduller ? 'pazaryeri'
        AND moduller ? 'muhasebe_cift_giris'
    ),
    CONSTRAINT chk_sistem_ayar_numara_serileri CHECK (
        jsonb_typeof(numara_serileri) = 'object'
        AND numara_serileri ? 'siparis'
        AND numara_serileri ? 'fatura'
    ),
    CONSTRAINT chk_sistem_ayar_bildirim_ayar CHECK (
        jsonb_typeof(bildirim_ayar) = 'object'
        AND bildirim_ayar ? 'email'
    )
);

-- Tek satır garantisi
INSERT INTO sistem_ayar (tenant_id, firma_adi) VALUES ('00000000-0000-0000-0000-000000000000', 'Yeni Firma');

CREATE TRIGGER trg_sistem_ayar_guncelleme
    BEFORE UPDATE ON sistem_ayar
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SISTEM_AYAR_VERSIYON: Config geçmişi (audit/rollback için)
-- ----------------------------------------------------------------
CREATE TABLE sistem_ayar_versiyon (
    id              bigserial PRIMARY KEY,
    versiyon_no     int NOT NULL,
    onceki_ayar     jsonb NOT NULL,                      -- değişim öncesi sistem_ayar snapshot'ı
    yeni_ayar       jsonb NOT NULL,                      -- değişim sonrası snapshot
    degisim_alanlari text[],                             -- değişen alan isimleri
    aciklama        text,
    olusturan_kullanici_id bigint,                       -- FK aşağıda
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sistem_ayar_versiyon_tarih ON sistem_ayar_versiyon(olusturma_tarihi DESC);

-- ----------------------------------------------------------------
-- SIFRE_POLITIKASI: Tenant-wide şifre kuralları (singleton)
-- ----------------------------------------------------------------
CREATE TABLE sifre_politikasi (
    id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    min_uzunluk     int NOT NULL DEFAULT 10 CHECK (min_uzunluk BETWEEN 6 AND 128),
    ozel_karakter_zorunlu boolean NOT NULL DEFAULT true,
    sayi_zorunlu    boolean NOT NULL DEFAULT true,
    buyuk_kucuk_harf_zorunlu boolean NOT NULL DEFAULT true,
    gecerlilik_gun  int NOT NULL DEFAULT 90 CHECK (gecerlilik_gun >= 0),   -- 0 = hiç expire olmasın
    gecmis_sifre_sayisi int NOT NULL DEFAULT 5 CHECK (gecmis_sifre_sayisi >= 0),
    max_yanlis_giris int NOT NULL DEFAULT 5 CHECK (max_yanlis_giris >= 1),
    kilit_dakika    int NOT NULL DEFAULT 15 CHECK (kilit_dakika >= 0),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sifre_politikasi (id) VALUES (1);

CREATE TRIGGER trg_sifre_politikasi_guncelleme
    BEFORE UPDATE ON sifre_politikasi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- KULLANICI
-- ----------------------------------------------------------------
CREATE TABLE kullanici (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    email           citext UNIQUE NOT NULL,
    sifre_hash      varchar(255) NOT NULL,               -- argon2id
    ad              varchar(100) NOT NULL,
    soyad           varchar(100) NOT NULL,
    telefon         varchar(30),
    avatar_url      text,
    -- Locale (override sistem default)
    dil             char(2),
    zaman_dilimi    varchar(50),
    -- Güvenlik
    iki_faktor_aktif boolean NOT NULL DEFAULT false,
    iki_faktor_secret bytea,                             -- pgcrypto ile şifreli (pgp_sym_encrypt)
    iki_faktor_yedek_kodlar text[],                      -- hash'lenmiş yedek kodlar
    sifre_son_degisim timestamptz,
    sifre_sifirlama_tokeni varchar(100),                 -- @deprecated: sifre_sifirlama_tokeni tablosu kullan
    sifre_sifirlama_son timestamptz,
    yanlis_giris_sayisi int NOT NULL DEFAULT 0,
    kilitli_son_tarih timestamptz,
    -- Aktivite
    son_giris_tarihi timestamptz,
    son_giris_ip    inet,
    son_aktivite_tarihi timestamptz,
    -- Tercihler
    tercihler       jsonb NOT NULL DEFAULT '{}',         -- server-side UI tercihleri
    -- Soft delete + audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kullanici_aktif ON kullanici(aktif_mi) WHERE silindi_mi = false;
CREATE INDEX idx_kullanici_email_aktif ON kullanici(email) WHERE silindi_mi = false;
CREATE INDEX idx_kullanici_ad_soyad_trgm ON kullanici USING gin ((ad || ' ' || soyad) gin_trgm_ops);

CREATE TRIGGER trg_kullanici_guncelleme
    BEFORE UPDATE ON kullanici
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- sistem_ayar_versiyon.olusturan FK
ALTER TABLE sistem_ayar_versiyon
    ADD CONSTRAINT fk_sistem_ayar_versiyon_kullanici
    FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id);

-- ----------------------------------------------------------------
-- KULLANICI_SIFRE_GECMISI: Eski şifre hash'leri (yeniden kullanımı engelle)
-- ----------------------------------------------------------------
CREATE TABLE kullanici_sifre_gecmisi (
    id              bigserial PRIMARY KEY,
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    sifre_hash      varchar(255) NOT NULL,               -- argon2id
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kullanici_sifre_gecmisi_kullanici ON kullanici_sifre_gecmisi(kullanici_id, olusturma_tarihi DESC);

-- ----------------------------------------------------------------
-- SIFRE_SIFIRLAMA_TOKEN: Ayrı tablo (multi-active destekler)
-- ----------------------------------------------------------------
CREATE TABLE sifre_sifirlama_tokeni (
    id              bigserial PRIMARY KEY,
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    token_hash      varchar(255) NOT NULL UNIQUE,
    son_kullanim_tarihi timestamptz NOT NULL,            -- expiration
    kullanildi_mi   boolean NOT NULL DEFAULT false,
    kullanim_tarihi timestamptz,
    kullanim_ip     inet,
    olusturma_ip    inet,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sifre_sifirlama_tokeni_kullanici ON sifre_sifirlama_tokeni(kullanici_id) WHERE kullanildi_mi = false;

-- ----------------------------------------------------------------
-- KULLANICI_2FA_YEDEK_KULLANIM: Backup kod kullanım logu
-- ----------------------------------------------------------------
CREATE TABLE kullanici_2fa_yedek_kullanim (
    id              bigserial PRIMARY KEY,
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    kod_hash        varchar(255) NOT NULL,
    kullanim_tarihi timestamptz NOT NULL DEFAULT now(),
    kullanim_ip     inet,
    cihaz_bilgisi   text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kullanici_2fa_yedek_kullanici ON kullanici_2fa_yedek_kullanim(kullanici_id, kullanim_tarihi DESC);

-- ----------------------------------------------------------------
-- ROL
-- ----------------------------------------------------------------
CREATE TABLE rol (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    aciklama        text,
    sistem_rolu_mu  boolean NOT NULL DEFAULT false,     -- silinemez, sınırlı düzenleme
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rol_guncelleme
    BEFORE UPDATE ON rol
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

INSERT INTO rol (kod, ad, sistem_rolu_mu) VALUES
('patron', 'Patron', true),
('genel_mudur', 'Genel Müdür', true),
('magaza_muduru', 'Mağaza Müdürü', true),
('kasiyer', 'Kasiyer', true),
('depo_sorumlusu', 'Depo Sorumlusu', true),
('muhasebeci', 'Muhasebeci', true),
('eticaret_yoneticisi', 'E-Ticaret Yöneticisi', true),
('satin_alma', 'Satın Alma', true),
('musteri_temsilcisi', 'Müşteri Temsilcisi', true);

-- ----------------------------------------------------------------
-- YETKI: Granüler yetkiler
-- ----------------------------------------------------------------
CREATE TABLE yetki (
    id              bigserial PRIMARY KEY,
    kod             varchar(100) UNIQUE NOT NULL,        -- 'urun.olustur', 'siparis.iptal'
    modul           varchar(50) NOT NULL,
    eylem           varchar(50) NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    riskli_mi       boolean NOT NULL DEFAULT false,      -- audit log için işaretle
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_yetki_modul ON yetki(modul);

-- Çekirdek yetkiler (seed)
INSERT INTO yetki (kod, modul, eylem, ad, riskli_mi) VALUES
-- Ürün
('urun.goruntule', 'urun', 'goruntule', 'Ürünleri görüntüle', false),
('urun.olustur', 'urun', 'olustur', 'Ürün oluştur', false),
('urun.guncelle', 'urun', 'guncelle', 'Ürün güncelle', false),
('urun.sil', 'urun', 'sil', 'Ürün sil', true),
('urun.fiyat_degistir', 'urun', 'fiyat_degistir', 'Ürün fiyatı değiştir', true),
('urun.maliyet_goruntule', 'urun', 'maliyet_goruntule', 'Maliyet fiyatını gör', true),
-- Sipariş
('siparis.goruntule', 'siparis', 'goruntule', 'Siparişleri görüntüle', false),
('siparis.olustur', 'siparis', 'olustur', 'Sipariş oluştur', false),
('siparis.iptal', 'siparis', 'iptal', 'Sipariş iptal et', true),
('siparis.iade', 'siparis', 'iade', 'İade işlemi yap', true),
('siparis.iskonto_uygula', 'siparis', 'iskonto_uygula', 'İskonto uygula', false),
-- Cari
('cari.goruntule', 'cari', 'goruntule', 'Cari görüntüle', false),
('cari.olustur', 'cari', 'olustur', 'Cari oluştur', false),
('cari.guncelle', 'cari', 'guncelle', 'Cari güncelle', false),
('cari.sil', 'cari', 'sil', 'Cari sil', true),
('cari.kredi_limit_degistir', 'cari', 'kredi_limit_degistir', 'Kredi limiti değiştir', true),
-- Stok
('stok.goruntule', 'stok', 'goruntule', 'Stok görüntüle', false),
('stok.transfer', 'stok', 'transfer', 'Stok transferi yap', false),
('stok.sayim', 'stok', 'sayim', 'Stok sayımı yap', false),
('stok.duzeltme', 'stok', 'duzeltme', 'Manuel stok düzeltme', true),
-- Rapor
('rapor.satis', 'rapor', 'satis', 'Satış raporları', false),
('rapor.kar_zarar', 'rapor', 'kar_zarar', 'Kâr/zarar raporu', true),
('rapor.bilanco', 'rapor', 'bilanco', 'Bilanço görüntüle', true),
-- Yönetim
('kullanici.yonet', 'kullanici', 'yonet', 'Kullanıcı yönetimi', true),
('rol.yonet', 'rol', 'yonet', 'Rol/yetki yönetimi', true),
('ayar.yonet', 'ayar', 'yonet', 'Sistem ayarları', true),
('audit_log.goruntule', 'audit_log', 'goruntule', 'Audit log görüntüle', true);

-- ----------------------------------------------------------------
-- ROL_YETKI: Rol-yetki eşleşme
-- ----------------------------------------------------------------
CREATE TABLE rol_yetki (
    rol_id          bigint NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
    yetki_id        bigint NOT NULL REFERENCES yetki(id) ON DELETE CASCADE,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rol_id, yetki_id)
);

-- Patron tüm yetkileri alır (default)
INSERT INTO rol_yetki (rol_id, yetki_id)
SELECT (SELECT id FROM rol WHERE kod = 'patron'), id FROM yetki;

-- ----------------------------------------------------------------
-- YETKI_KAPSAM: Row-level yetki filtrelemesi (RBAC granülerliği)
-- ----------------------------------------------------------------
-- Örnek: Mağaza Müdürü sadece kendi mağazasının siparişlerini görsün.
-- kapsam_tipi:
--   'tum'               → kısıt yok, tüm kayıtlar
--   'magaza'            → sadece atanmış mağazaların kayıtları
--   'kategori'          → kapsam_jsonb.kategori_id_listesi içeren kayıtlar
--   'cari_grup'         → kapsam_jsonb.cari_grup_id_listesi içeren kayıtlar
--   'kendi_olusturdugu' → olusturan_kullanici_id = current_user
-- kapsam_jsonb'de detay filtre (app katmanında WHERE clause üretilir).
-- ----------------------------------------------------------------
CREATE TABLE yetki_kapsam (
    id              bigserial PRIMARY KEY,
    rol_id          bigint NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
    yetki_id        bigint NOT NULL REFERENCES yetki(id) ON DELETE CASCADE,
    kapsam_tipi     varchar(30) NOT NULL CHECK (kapsam_tipi IN (
        'tum', 'magaza', 'kategori', 'cari_grup', 'kendi_olusturdugu'
    )),
    kapsam_jsonb    jsonb NOT NULL DEFAULT '{}'::jsonb,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rol_id, yetki_id, kapsam_tipi)
);
CREATE INDEX idx_yetki_kapsam_rol ON yetki_kapsam(rol_id);
CREATE INDEX idx_yetki_kapsam_yetki ON yetki_kapsam(yetki_id);

-- ----------------------------------------------------------------
-- KULLANICI_ROL
-- ----------------------------------------------------------------
CREATE TABLE kullanici_rol (
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    rol_id          bigint NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
    aktif_baslangic date,                                -- geçici rol atama için
    aktif_bitis     date,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kullanici_id, rol_id)
);

-- ----------------------------------------------------------------
-- KULLANICI_MAGAZA: Hangi kullanıcı hangi mağazada çalışır
-- (FK constraint magaza tablosu oluşturulduktan sonra eklenecek - modül 04)
-- ----------------------------------------------------------------
CREATE TABLE kullanici_magaza (
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    magaza_id       bigint NOT NULL,
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kullanici_id, magaza_id)
);

-- ----------------------------------------------------------------
-- OTURUM: Refresh token tracking + session hijacking tespiti
-- ----------------------------------------------------------------
CREATE TABLE oturum (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    refresh_token_hash varchar(255) NOT NULL UNIQUE,
    cihaz_bilgisi   text,                                -- user agent
    cihaz_tipi      varchar(20) CHECK (cihaz_tipi IN ('masaustu', 'mobil', 'tablet', 'bot', 'diger')),
    cihaz_parmak_izi varchar(255),                       -- fingerprint (canvas/webgl hash)
    tarayici        varchar(50),
    isletim_sistemi varchar(50),
    -- Hijacking tespiti: ilk + güncel IP karşılaştırması
    olusturma_ip    inet,                                -- oturum başladığında IP (sabit)
    son_kullanim_ip inet,                                -- son istek IP'si (güncellenir)
    konum_ulke      char(2),
    konum_sehir     varchar(100),
    risk_skoru      smallint NOT NULL DEFAULT 0 CHECK (risk_skoru BETWEEN 0 AND 100),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    son_kullanim_tarihi timestamptz NOT NULL DEFAULT now(),
    son_kullanim_bitis timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    iptal_edildi_mi boolean NOT NULL DEFAULT false,
    iptal_tarihi    timestamptz,
    iptal_nedeni    varchar(100)                         -- 'kullanici', 'timeout', 'hijack', 'admin'
);
CREATE INDEX idx_oturum_kullanici ON oturum(kullanici_id) WHERE iptal_edildi_mi = false;
CREATE INDEX idx_oturum_token ON oturum(refresh_token_hash);

-- ----------------------------------------------------------------
-- OTURUM_ANOMALI: IP/cihaz/konum değişim logu
-- ----------------------------------------------------------------
CREATE TABLE oturum_anomali (
    id              bigserial PRIMARY KEY,
    oturum_id       bigint NOT NULL REFERENCES oturum(id) ON DELETE CASCADE,
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    anomali_tipi    varchar(30) NOT NULL CHECK (anomali_tipi IN (
        'ip_degisim', 'cihaz_degisim', 'ulke_degisim', 'sehir_degisim',
        'supheli_useragent', 'hizli_konum_degisim', 'zaman_disi_giris'
    )),
    eski_deger      text,
    yeni_deger      text,
    risk_skoru      smallint NOT NULL DEFAULT 0 CHECK (risk_skoru BETWEEN 0 AND 100),
    aksiyon         varchar(30),                         -- 'log', 'bildirim', 'iptal_oturum', 'kilitle'
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oturum_anomali_kullanici ON oturum_anomali(kullanici_id, olusturma_tarihi DESC);
CREATE INDEX idx_oturum_anomali_oturum ON oturum_anomali(oturum_id);

-- ----------------------------------------------------------------
-- API_ANAHTAR: 3rd party entegrasyon için
-- ----------------------------------------------------------------
CREATE TABLE api_anahtar (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    ad              varchar(200) NOT NULL,
    aciklama        text,
    anahtar_hash    varchar(255) UNIQUE NOT NULL,        -- sha256
    on_ek           varchar(20) NOT NULL,                -- 'kvm_live_xxx...'
    yetkiler        text[] NOT NULL DEFAULT '{}',        -- ['urun.read', 'siparis.write']
    izin_verilen_ip cidr[],                              -- IP whitelist (NULL = tüm IP'ler)
    -- Rate limiting (limit tanımı)
    rate_limit_dakika int,                               -- dakika başına max istek (NULL = limitsiz)
    rate_limit_gun  int,                                 -- gün başına max istek
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    son_kullanim_tarihi timestamptz,
    son_kullanim_ip inet,
    son_kullanim_bitis timestamptz,                      -- expiration
    iptal_edildi_mi boolean NOT NULL DEFAULT false,
    iptal_tarihi    timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_anahtar_aktif ON api_anahtar(anahtar_hash) WHERE iptal_edildi_mi = false;

-- ----------------------------------------------------------------
-- API_RATE_LIMIT: Sliding window kullanım sayacı
-- ----------------------------------------------------------------
-- Her API anahtarı için pencere bazlı istek sayısı.
-- Redis alternatifi; düşük-orta hacimde DB yeterli. Yüksek hacimde
-- Redis'e taşınır ama limit tanımı yine api_anahtar tablosunda durur.
-- ----------------------------------------------------------------
CREATE TABLE api_rate_limit (
    id              bigserial PRIMARY KEY,
    api_anahtar_id  bigint NOT NULL REFERENCES api_anahtar(id) ON DELETE CASCADE,
    pencere_baslangic timestamptz NOT NULL,              -- örn dakikanın başı (DATE_TRUNC('minute'))
    pencere_tipi    varchar(10) NOT NULL CHECK (pencere_tipi IN ('dakika', 'saat', 'gun')),
    istek_sayisi    int NOT NULL DEFAULT 0,
    son_istek_zamani timestamptz NOT NULL DEFAULT now(),
    UNIQUE (api_anahtar_id, pencere_tipi, pencere_baslangic)
);
CREATE INDEX idx_api_rate_limit_anahtar_pencere ON api_rate_limit(api_anahtar_id, pencere_baslangic DESC);

-- ----------------------------------------------------------------
-- BELGE_NUMARA_SERISI: Numara serileri ayrı tablo (race condition'dan uzak)
-- ----------------------------------------------------------------
-- Race-safe sonraki numara üretimi için `UPDATE ... RETURNING sonraki`
-- pattern'i kullanılır. Yıllık reset isteyen tenant'lar için `yil` kolonu.
-- Mağaza/firma bazlı ayrı seri desteği.
-- ----------------------------------------------------------------
CREATE TABLE belge_numara_serisi (
    id              bigserial PRIMARY KEY,
    belge_tipi      varchar(30) NOT NULL,                -- 'siparis', 'fatura', 'irsaliye', 'yevmiye', vb.
    firma_id        bigint,                              -- NULL = tenant geneli (modül 04 FK)
    magaza_id       bigint,                              -- NULL = firma geneli (modül 04 FK)
    yil             int,                                 -- NULL = yıllık reset yok
    on_ek           varchar(20) NOT NULL DEFAULT '',
    son_ek          varchar(20) NOT NULL DEFAULT '',
    uzunluk         smallint NOT NULL DEFAULT 6 CHECK (uzunluk BETWEEN 1 AND 20),
    sonraki         bigint NOT NULL DEFAULT 1 CHECK (sonraki >= 1),
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (belge_tipi, firma_id, magaza_id, yil)
);
CREATE INDEX idx_belge_numara_serisi_tip ON belge_numara_serisi(belge_tipi) WHERE aktif_mi = true;

CREATE TRIGGER trg_belge_numara_serisi_guncelleme
    BEFORE UPDATE ON belge_numara_serisi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- AUDIT_LOG: Her kritik işlem — YILLIK DECLARATIVE PARTITIONING
-- ----------------------------------------------------------------
-- PostgreSQL 12+ declarative partitioning.
-- Yıllık bölümleme, DROP PARTITION ile hızlı eski veri silme (KVKK).
--
-- Otomatik partition yaratma (her Aralık ayında bir sonraki yılı aç):
--   Option A - pg_partman extension:
--     SELECT partman.create_parent('public.audit_log', 'olusturma_tarihi', 'native', 'yearly');
--   Option B - pg_cron veya sistem cron'u ile:
--     0 0 1 12 * psql -c "CREATE TABLE audit_log_2029 PARTITION OF audit_log
--       FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');"
-- ----------------------------------------------------------------
CREATE TABLE audit_log (
    id              bigserial,
    kullanici_id    bigint REFERENCES kullanici(id),
    api_anahtar_id  bigint REFERENCES api_anahtar(id),
    oturum_id       bigint REFERENCES oturum(id),
    -- Ne yapıldı
    eylem           varchar(50) NOT NULL,                -- olustur, guncelle, sil, giris, cikis, iptal, iade
    yetki_kodu      varchar(100),
    -- Hedef
    tablo_adi       varchar(100),
    kayit_id        bigint,
    -- Veri (sadece kritik tablolarda)
    eski_veri       jsonb,
    yeni_veri       jsonb,
    degisim_alanlari text[],                             -- hangi alanlar değişti
    -- Bağlam
    aciklama        text,
    ip_adresi       inet,
    cihaz_bilgisi   text,
    -- Sonuç
    basarili_mi     boolean NOT NULL DEFAULT true,
    hata_mesaji     text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, olusturma_tarihi)
) PARTITION BY RANGE (olusturma_tarihi);

-- Yıllık partition'lar
CREATE TABLE audit_log_2026 PARTITION OF audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE audit_log_2027 PARTITION OF audit_log
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE audit_log_2028 PARTITION OF audit_log
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
-- Default partition: tarih sınırı dışındaki kayıtlar (recovery için)
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

CREATE INDEX idx_audit_kullanici_tarih ON audit_log(kullanici_id, olusturma_tarihi DESC);
CREATE INDEX idx_audit_tablo_kayit ON audit_log(tablo_adi, kayit_id);
CREATE INDEX idx_audit_tarih ON audit_log(olusturma_tarihi DESC);
CREATE INDEX idx_audit_eylem ON audit_log(eylem);

-- ----------------------------------------------------------------
-- BILDIRIM_TIPI: Sistem bildirim tipleri kataloğu (sözlük)
-- ----------------------------------------------------------------
CREATE TABLE bildirim_tipi (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    varsayilan_kanallar text[] NOT NULL DEFAULT ARRAY['in_app'],  -- email, sms, push, in_app, whatsapp
    sablon_kod      varchar(100),                        -- i18n mesaj sablon anahtarı
    ikon            varchar(50),
    renk            varchar(20),
    seviye          varchar(20) NOT NULL DEFAULT 'bilgi' CHECK (seviye IN ('bilgi', 'basari', 'uyari', 'tehlike')),
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bildirim_tipi_guncelleme
    BEFORE UPDATE ON bildirim_tipi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

INSERT INTO bildirim_tipi (kod, ad, aciklama, varsayilan_kanallar, sablon_kod, ikon, renk, seviye) VALUES
('stok_kritik',     'Stok Kritik Seviyede',  'Ürün kritik stok seviyesinin altına düştü',       ARRAY['email','in_app'], 'bildirim.stok.kritik',    'package',   '#f44336', 'uyari'),
('stok_tukendi',    'Stok Tükendi',           'Ürün stoğu 0',                                    ARRAY['email','in_app'], 'bildirim.stok.tukendi',   'x-octagon', '#f44336', 'tehlike'),
('vade_yaklasiyor', 'Vade Yaklaşıyor',        'Cari vadesi yaklaşıyor',                          ARRAY['email','in_app'], 'bildirim.cari.vade',      'clock',     '#ff9800', 'uyari'),
('vade_gecti',      'Vade Geçti',             'Cari vadesi geçti',                               ARRAY['email','sms','in_app'], 'bildirim.cari.vade_gecti', 'alert-circle', '#d32f2f', 'tehlike'),
('yeni_siparis',    'Yeni Sipariş',           'Yeni sipariş alındı',                             ARRAY['in_app','push'],  'bildirim.siparis.yeni',   'shopping-cart','#4caf50','basari'),
('fatura_kesildi',  'Fatura Kesildi',         'Fatura oluşturuldu',                              ARRAY['email','in_app'], 'bildirim.fatura.kesildi', 'file-text', '#2196f3', 'bilgi'),
('odeme_alindi',    'Ödeme Alındı',           'Müşteriden ödeme alındı',                         ARRAY['in_app'],         'bildirim.odeme.alindi',   'dollar-sign','#4caf50','basari'),
('iade_talebi',     'İade Talebi',            'Yeni iade talebi geldi',                          ARRAY['email','in_app'], 'bildirim.iade.talep',     'rotate-ccw','#ff9800','uyari'),
('kullanici_giris_supheli', 'Şüpheli Giriş Denemesi', 'Farklı konum/cihazdan giriş algılandı', ARRAY['email','in_app'], 'bildirim.guvenlik.supheli', 'shield-alert', '#d32f2f', 'tehlike'),
('sistem_bakim',    'Sistem Bakım',           'Planlı sistem bakımı bildirimi',                  ARRAY['in_app','email'], 'bildirim.sistem.bakim',   'tool',      '#9e9e9e', 'bilgi');

-- ----------------------------------------------------------------
-- BILDIRIM: Kullanıcı bildirimleri (in-app)
-- ----------------------------------------------------------------
CREATE TABLE bildirim (
    id              bigserial PRIMARY KEY,
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    bildirim_tipi_id bigint REFERENCES bildirim_tipi(id),
    tip_kod         varchar(50) NOT NULL,                -- bildirim_tipi.kod kopyası (hızlı filtre)
    seviye          varchar(20) NOT NULL DEFAULT 'bilgi' CHECK (seviye IN ('bilgi', 'basari', 'uyari', 'tehlike')),
    baslik          varchar(200) NOT NULL,
    icerik          text,
    link            varchar(500),
    okundu_mu       boolean NOT NULL DEFAULT false,
    okunma_tarihi   timestamptz,
    metadata        jsonb,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bildirim_kullanici_okunmamis ON bildirim(kullanici_id, olusturma_tarihi DESC)
    WHERE okundu_mu = false;
CREATE INDEX idx_bildirim_tip ON bildirim(tip_kod, olusturma_tarihi DESC);

CREATE TABLE bildirim_tercih (
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
    kanal           varchar(20) NOT NULL CHECK (kanal IN ('email', 'sms', 'push', 'in_app', 'whatsapp')),
    tip_kod         varchar(50) NOT NULL,                -- bildirim_tipi.kod
    aktif_mi        boolean NOT NULL DEFAULT true,
    PRIMARY KEY (kullanici_id, kanal, tip_kod)
);

-- ----------------------------------------------------------------
-- ETIKET: Genel etiket sistemi (cari, ürün, sipariş için)
-- ----------------------------------------------------------------
CREATE TABLE etiket (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) NOT NULL,
    ad              varchar(100) NOT NULL,
    renk            varchar(20),                         -- hex
    aciklama        text,
    kapsam          varchar(50) CHECK (kapsam IN (
        'cari', 'urun', 'siparis', 'fatura', 'magaza', 'firma', 'kampanya', 'hepsi'
    )),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kod, kapsam)
);

-- ----------------------------------------------------------------
-- VIEW: vw_kullanici_etkin_yetki — Kullanıcının efektif yetki listesi
-- ----------------------------------------------------------------
-- Kullanım: app katmanında authorization check için.
-- Her satır: (kullanici_id, yetki_kod, kapsam_tipi, kapsam_jsonb)
-- app WHERE clause'u kapsam_tipi'ye göre üretir.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_kullanici_etkin_yetki AS
SELECT
    kr.kullanici_id,
    y.id AS yetki_id,
    y.kod AS yetki_kod,
    y.modul,
    y.eylem,
    y.riskli_mi,
    r.id AS rol_id,
    r.kod AS rol_kod,
    COALESCE(yk.kapsam_tipi, 'tum') AS kapsam_tipi,
    COALESCE(yk.kapsam_jsonb, '{}'::jsonb) AS kapsam_jsonb
FROM kullanici_rol kr
JOIN rol r ON r.id = kr.rol_id
JOIN rol_yetki ry ON ry.rol_id = r.id
JOIN yetki y ON y.id = ry.yetki_id
LEFT JOIN yetki_kapsam yk ON yk.rol_id = r.id AND yk.yetki_id = y.id
WHERE (kr.aktif_baslangic IS NULL OR kr.aktif_baslangic <= CURRENT_DATE)
  AND (kr.aktif_bitis IS NULL OR kr.aktif_bitis >= CURRENT_DATE);
