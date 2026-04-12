-- ============================================================
-- KUVVEM v2 — MASTER DATABASE
-- ============================================================
-- Platform yönetimi, tenant kaydı, billing, domain eşleştirme.
-- Tek bir master DB, tüm tenant'lar bunu paylaşır.
--
-- DB adı: kuvvem_master
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ----------------------------------------------------------------
-- PLAN: SaaS abonelik planları
-- ----------------------------------------------------------------
CREATE TABLE plan (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    aciklama        text,
    aylik_ucret     numeric(18, 4) NOT NULL,
    yillik_ucret    numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) NOT NULL DEFAULT 'TRY',
    -- Limitler (NULL = sınırsız)
    max_magaza      int,
    max_kullanici   int,
    max_urun        int,
    max_aylik_siparis int,
    max_aylik_api_cagri int,
    max_disk_mb     int,
    -- Özellikler (toggle)
    ozellikler      jsonb NOT NULL DEFAULT '{}',
    -- Pazarlama
    sira            int NOT NULL DEFAULT 0,
    populer_mi      boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan (kod, ad, aylik_ucret, yillik_ucret, max_magaza, max_kullanici, max_urun, ozellikler, sira) VALUES
('starter',  'Starter',  29,  290,  1, 3,   500,    '{"eticaret": false, "pazaryeri": false, "muhasebe": false}', 1),
('business', 'Business', 99,  990,  5, 15,  10000,  '{"eticaret": true,  "pazaryeri": false, "muhasebe": true}',  2),
('pro',      'Pro',      299, 2990, 20, 50, NULL,   '{"eticaret": true,  "pazaryeri": true,  "muhasebe": true}',  3),
('enterprise','Enterprise', 0, 0,    NULL, NULL, NULL, '{"eticaret": true, "pazaryeri": true, "muhasebe": true, "ozel_sunucu": true}', 4);

-- ----------------------------------------------------------------
-- TENANT: Müşteri kaydı (her satır = bir DB)
-- ----------------------------------------------------------------
CREATE TABLE tenant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            varchar(50) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9_]{3,30}$'),
    ad              varchar(200) NOT NULL,
    db_adi          varchar(100) UNIQUE NOT NULL,
    db_sunucu       varchar(200),                       -- NULL = ana sunucu, ileride multi-server
    db_sema_versiyonu varchar(20),                      -- prisma migration version
    plan_id         bigint NOT NULL REFERENCES plan(id),
    -- Durum
    durum           varchar(20) NOT NULL DEFAULT 'deneme'
                    CHECK (durum IN ('deneme', 'aktif', 'askida', 'iptal', 'silindi')),
    deneme_baslangic timestamptz,
    deneme_bitis    timestamptz,
    askiya_alma_tarihi timestamptz,
    askiya_alma_nedeni text,
    iptal_tarihi    timestamptz,
    iptal_nedeni    text,
    -- Locale
    varsayilan_dil  char(2) NOT NULL DEFAULT 'tr',
    varsayilan_para_birimi char(3) NOT NULL DEFAULT 'TRY',
    zaman_dilimi    varchar(50) NOT NULL DEFAULT 'Europe/Istanbul',
    ulke_kodu       char(2) NOT NULL DEFAULT 'TR',
    -- İletişim
    iletisim_email  citext NOT NULL,
    iletisim_telefon varchar(30),
    iletisim_yetkili_ad varchar(200),
    -- Notlar
    notlar          text,
    etiketler       text[],
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_durum ON tenant(durum);
CREATE INDEX idx_tenant_email ON tenant(iletisim_email);

-- ----------------------------------------------------------------
-- TENANT_DOMAIN: Subdomain + custom domain eşleştirme
-- ----------------------------------------------------------------
CREATE TABLE tenant_domain (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    domain          citext UNIQUE NOT NULL,
    tip             varchar(30) NOT NULL CHECK (tip IN ('subdomain', 'custom_admin', 'custom_storefront')),
    cloudflare_zone_id varchar(100),
    cloudflare_hostname_id varchar(100),
    ssl_durum       varchar(20) NOT NULL DEFAULT 'beklemede'
                    CHECK (ssl_durum IN ('beklemede', 'dogrulaniyor', 'aktif', 'hata', 'iptal')),
    dogrulama_durum varchar(20) NOT NULL DEFAULT 'beklemede'
                    CHECK (dogrulama_durum IN ('beklemede', 'dogrulandi', 'hata')),
    dogrulama_tokeni varchar(100),
    dogrulama_yontemi varchar(20),                      -- 'cname', 'txt', 'http_file'
    son_dogrulama_denemesi timestamptz,
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_domain_tenant ON tenant_domain(tenant_id);
CREATE INDEX idx_tenant_domain_aktif ON tenant_domain(aktif_mi) WHERE aktif_mi = true;

-- ----------------------------------------------------------------
-- PLATFORM_KULLANICI: Master kullanıcılar (platform admin, destek, tenant)
-- ----------------------------------------------------------------
CREATE TABLE platform_kullanici (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           citext UNIQUE NOT NULL,
    sifre_hash      varchar(255) NOT NULL,
    ad              varchar(100) NOT NULL,
    soyad           varchar(100) NOT NULL,
    telefon         varchar(30),
    avatar_url      text,
    rol             varchar(20) NOT NULL CHECK (rol IN ('platform_admin', 'destek', 'tenant')),
    iki_faktor_aktif boolean NOT NULL DEFAULT false,
    iki_faktor_secret varchar(100),
    son_giris_tarihi timestamptz,
    son_giris_ip    inet,
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

-- Hangi platform kullanıcısı hangi tenant'a erişebilir
CREATE TABLE platform_kullanici_tenant (
    platform_kullanici_id uuid NOT NULL REFERENCES platform_kullanici(id) ON DELETE CASCADE,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    rol             varchar(50) NOT NULL,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (platform_kullanici_id, tenant_id)
);

-- ----------------------------------------------------------------
-- ABONELIK: Tenant'ın aktif aboneliği
-- ----------------------------------------------------------------
CREATE TABLE abonelik (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    plan_id         bigint NOT NULL REFERENCES plan(id),
    durum           varchar(20) NOT NULL
                    CHECK (durum IN ('deneme', 'aktif', 'gecikmis', 'askida', 'iptal')),
    yenileme_tipi   varchar(20) NOT NULL DEFAULT 'aylik' CHECK (yenileme_tipi IN ('aylik', 'yillik')),
    baslangic_tarihi timestamptz NOT NULL,
    bitis_tarihi    timestamptz,
    sonraki_fatura_tarihi timestamptz,
    iptal_tarihi    timestamptz,
    iptal_donem_sonu_mu boolean NOT NULL DEFAULT true,  -- dönem sonunda iptal
    iptal_nedeni    text,
    -- Stripe
    stripe_subscription_id varchar(100) UNIQUE,
    stripe_customer_id varchar(100),
    -- Indirim/promosyon
    indirim_kodu    varchar(50),
    indirim_orani   numeric(5, 2) DEFAULT 0,
    indirim_bitis_tarihi timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_abonelik_tenant ON abonelik(tenant_id);
CREATE INDEX idx_abonelik_durum ON abonelik(durum);
CREATE INDEX idx_abonelik_yenileme ON abonelik(sonraki_fatura_tarihi)
    WHERE durum IN ('aktif', 'gecikmis');

-- ----------------------------------------------------------------
-- ABONELIK_FATURA: SaaS faturalama
-- ----------------------------------------------------------------
CREATE TABLE abonelik_fatura (
    id              bigserial PRIMARY KEY,
    abonelik_id     bigint NOT NULL REFERENCES abonelik(id),
    tenant_id       uuid NOT NULL REFERENCES tenant(id),
    fatura_no       varchar(50) UNIQUE NOT NULL,
    -- Tutarlar
    ara_toplam      numeric(18, 4) NOT NULL,
    indirim_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    vergi_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) NOT NULL,
    -- Durum
    durum           varchar(20) NOT NULL
                    CHECK (durum IN ('taslak', 'gonderildi', 'odendi', 'gecikmis', 'iptal', 'iade')),
    odeme_tarihi    timestamptz,
    son_odeme_tarihi timestamptz NOT NULL,
    odeme_yontemi   varchar(50),
    -- Stripe
    stripe_invoice_id varchar(100) UNIQUE,
    stripe_payment_intent_id varchar(100),
    -- Belge
    pdf_url         text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_abonelik_fatura_tenant ON abonelik_fatura(tenant_id);
CREATE INDEX idx_abonelik_fatura_durum ON abonelik_fatura(durum);

-- ----------------------------------------------------------------
-- KULLANIM_METRIK: Plan limitlerini takip için
-- ----------------------------------------------------------------
CREATE TABLE kullanim_metrik_gunluk (
    tarih           date NOT NULL,
    tenant_id       uuid NOT NULL REFERENCES tenant(id),
    siparis_sayisi  int NOT NULL DEFAULT 0,
    api_cagri_sayisi int NOT NULL DEFAULT 0,
    aktif_kullanici_sayisi int NOT NULL DEFAULT 0,
    disk_kullanimi_mb int NOT NULL DEFAULT 0,
    urun_sayisi     int NOT NULL DEFAULT 0,
    magaza_sayisi   int NOT NULL DEFAULT 0,
    ciro_try        numeric(18, 4) NOT NULL DEFAULT 0,  -- ana para biriminde
    PRIMARY KEY (tarih, tenant_id)
);
CREATE INDEX idx_kullanim_metrik_tenant ON kullanim_metrik_gunluk(tenant_id, tarih DESC);

-- ----------------------------------------------------------------
-- PLATFORM_LOG: Cross-tenant olaylar (migration, backup, billing)
-- ----------------------------------------------------------------
CREATE TABLE platform_log (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid REFERENCES tenant(id),
    seviye          varchar(10) NOT NULL CHECK (seviye IN ('debug', 'info', 'uyari', 'hata', 'kritik')),
    kategori        varchar(50) NOT NULL,
    mesaj           text NOT NULL,
    metadata        jsonb,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_log_tenant ON platform_log(tenant_id, olusturma_tarihi DESC);
CREATE INDEX idx_platform_log_kategori ON platform_log(kategori, olusturma_tarihi DESC);
CREATE INDEX idx_platform_log_seviye ON platform_log(seviye, olusturma_tarihi DESC)
    WHERE seviye IN ('hata', 'kritik');

-- Partition adayı: 6 aydan eski kayıtlar arşive
-- ALTER TABLE platform_log ... PARTITION BY RANGE (olusturma_tarihi);

-- ----------------------------------------------------------------
-- TENANT_BACKUP: Backup geçmişi
-- ----------------------------------------------------------------
CREATE TABLE tenant_backup (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    tip             varchar(20) NOT NULL CHECK (tip IN ('gunluk', 'haftalik', 'manuel', 'restore_oncesi')),
    durum           varchar(20) NOT NULL CHECK (durum IN ('basliyor', 'devam_ediyor', 'tamamlandi', 'hata')),
    dosya_yolu      text,
    dosya_boyutu_mb numeric(12, 2),
    sikistirma_orani numeric(5, 2),
    baslangic_tarihi timestamptz NOT NULL DEFAULT now(),
    bitis_tarihi    timestamptz,
    sure_saniye     int,
    hata_mesaji     text,
    saklama_son_tarihi timestamptz                       -- bu tarihten sonra silinebilir
);
CREATE INDEX idx_tenant_backup_tenant ON tenant_backup(tenant_id, baslangic_tarihi DESC);
