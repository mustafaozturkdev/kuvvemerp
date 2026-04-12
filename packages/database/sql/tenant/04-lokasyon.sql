-- ============================================================
-- MODÜL 04: LOKASYON HİYERARŞİSİ — v2 REFACTOR
-- ============================================================
-- v1 eleştirmen skoru: 7/10 → v2 hedef: 9+/10
--
-- Bu refactor'da çözülen kritik sorunlar (04-lokasyon-elestiri-v1):
--   #1 magaza.kod global UNIQUE → (firma_id, kod) composite UNIQUE
--   #2 Multi-firma belge bağlılığı — `magaza_id` üzerinden firma_id türetilir
--   #3 firma.muhasebe_donem_id_aktif — şube bazlı muhasebe ayrımı
--   #4 calisma_saatleri JSONB minimum schema CHECK
--   #5 magaza.geo_yaricap_metre — basit geo-fence
--   #6 magaza.kapanis_tarihi + kapanis_devir_magaza_id + vw_magaza_kapanis_devir
--   #7 raf.yol ltree — hiyerarşi için path enumeration
--   #8 Kasa OKC entegrasyon alanları (marka/model/ip/port/z_rapor)
--   #9 firma.firma_tipi — ana_sirket/bayi/distribütor/franchise
--
-- Multi-firma kural: Her belge magaza_id taşır; firma_id `magaza.firma_id`
-- üzerinden çözülür. Belge tablolarında opsiyonel `firma_id` kolonu
-- denormalize için tutulabilir (app katmanı tutarlılığı garanti eder).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS ltree;

-- ----------------------------------------------------------------
-- FIRMA: Aynı tenant içinde birden fazla tüzel kişi
-- ----------------------------------------------------------------
CREATE TABLE firma (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    -- Kimlik
    unvan           varchar(300) NOT NULL,
    kisa_ad         varchar(100),
    firma_tipi      varchar(20) NOT NULL DEFAULT 'ana_sirket' CHECK (firma_tipi IN (
        'ana_sirket', 'sube', 'bayi', 'distributor', 'franchise'
    )),
    ana_firma_id    bigint REFERENCES firma(id),         -- bayi/şube ise bağlı olduğu ana firma
    -- Vergi
    vergi_no        varchar(50),
    vergi_no_tipi   varchar(20),                         -- VKN, TRN, EU_VAT
    vergi_dairesi_id bigint REFERENCES vergi_dairesi(id),
    ticaret_sicil_no varchar(50),
    mersis_no       varchar(50),
    -- Lokasyon
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod),
    il_id           bigint REFERENCES il(id),
    ilce_id         bigint REFERENCES ilce(id),
    adres           text,
    posta_kodu      varchar(20),
    -- İletişim
    telefon         varchar(30),
    faks            varchar(30),
    email           citext,
    web_sitesi      varchar(200),
    -- Görsel
    logo_url        text,
    imza_url        text,                                -- fatura imzası için
    -- Finans
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Muhasebe (modül 10 FK — forward-declared)
    muhasebe_donem_id_aktif bigint,                      -- FK modül 10'da eklenir
    -- Banka bilgileri (JSONB array — firma_banka tablosu önerisi modül 05/09'da)
    -- [{ "banka": "İş Bankası", "sube": "Levent", "iban": "TR...", "hesap_no": "..." }]
    banka_bilgileri jsonb NOT NULL DEFAULT '[]',
    -- E-Fatura ayarları (tenant-level değil firma-level)
    e_fatura_ayar   jsonb NOT NULL DEFAULT '{}',
    e_arsiv_ayar    jsonb NOT NULL DEFAULT '{}',
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
CREATE INDEX idx_firma_aktif ON firma(aktif_mi) WHERE silindi_mi = false;
CREATE INDEX idx_firma_ana ON firma(ana_firma_id) WHERE ana_firma_id IS NOT NULL;

CREATE TRIGGER trg_firma_guncelleme
    BEFORE UPDATE ON firma
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- MAGAZA: Mağaza, depo, showroom, sanal mağaza - hepsi tek tabloda
-- ----------------------------------------------------------------
CREATE TABLE magaza (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    firma_id        bigint NOT NULL REFERENCES firma(id),
    kod             varchar(50) NOT NULL,
    ad              varchar(200) NOT NULL,
    -- Tip
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'magaza',       -- Fiziksel perakende mağaza
        'depo',         -- Ana/şube depo
        'showroom',     -- Vitrin (satış yapmaz)
        'sanal',        -- Sanal mağaza (e-ticaret backend)
        'pazaryeri',    -- Pazaryeri sanal mağazası
        'transit'       -- Transit/yolda stok için sanal lokasyon
    )),
    ek_fonksiyonlar text[] NOT NULL DEFAULT '{}',        -- 'depo_da_var', 'showroom', vb. (multi-tip)
    -- Hiyerarşi (depo bir mağazaya bağlı olabilir)
    ust_magaza_id   bigint REFERENCES magaza(id),
    -- Lokasyon
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod),
    il_id           bigint REFERENCES il(id),
    ilce_id         bigint REFERENCES ilce(id),
    adres           text,
    posta_kodu      varchar(20),
    enlem           numeric(10, 7),
    boylam          numeric(10, 7),
    geo_yaricap_metre int CHECK (geo_yaricap_metre IS NULL OR geo_yaricap_metre > 0),  -- geo-fence
    -- İletişim
    telefon         varchar(30),
    email           citext,
    -- Operasyonel
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    zaman_dilimi    varchar(50),                         -- NULL = sistem default
    fiyat_listesi_id bigint,                             -- modül 06'da FK eklenecek
    varsayilan_vergi_orani_id bigint REFERENCES vergi_orani(id),
    -- Stok
    stok_takibi_aktif boolean NOT NULL DEFAULT true,
    negatif_stok_izin boolean NOT NULL DEFAULT false,
    rezervasyon_aktif boolean NOT NULL DEFAULT true,     -- e-ticaret stok rezervasyonu
    -- Satış kanalları
    perakende_satis boolean NOT NULL DEFAULT true,
    eticaret_satis  boolean NOT NULL DEFAULT false,
    pazaryeri_satis boolean NOT NULL DEFAULT false,
    b2b_satis       boolean NOT NULL DEFAULT false,
    -- Kasa
    kasa_acilis_zorunlu boolean NOT NULL DEFAULT false,  -- gün başında kasa sayımı şart mı
    kasa_kapanis_zorunlu boolean NOT NULL DEFAULT false,
    -- Çalışma saatleri (JSON) — minimum schema check, tam validation app katmanında
    -- {"pazartesi": [{"acilis": "09:00", "kapanis": "22:00"}], ...}
    calisma_saatleri jsonb,
    -- E-Fatura/E-İrsaliye için sube kodu
    sube_kodu       varchar(20),
    -- Kapanış / devir
    kapanis_tarihi  date,                                -- mağaza kapandıysa tarih
    kapanis_devir_magaza_id bigint REFERENCES magaza(id),-- stok/cari nereye devredildi
    kapanis_aciklamasi text,
    -- Soft delete + audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Multi-firma tekillik: aynı firma içinde kod benzersiz
    CONSTRAINT unq_magaza_firma_kod UNIQUE (firma_id, kod),
    -- Çalışma saatleri minimum format kontrolü
    CONSTRAINT chk_magaza_calisma_saatleri CHECK (
        calisma_saatleri IS NULL
        OR (jsonb_typeof(calisma_saatleri) = 'object'
            AND (calisma_saatleri ? 'pazartesi'
                 OR calisma_saatleri ? 'pzt'))
    )
);
CREATE INDEX idx_magaza_firma ON magaza(firma_id) WHERE silindi_mi = false;
CREATE INDEX idx_magaza_tip ON magaza(tip);
CREATE INDEX idx_magaza_aktif ON magaza(aktif_mi) WHERE silindi_mi = false;
CREATE INDEX idx_magaza_geo ON magaza(enlem, boylam) WHERE enlem IS NOT NULL;
CREATE INDEX idx_magaza_kapanis_devir ON magaza(kapanis_devir_magaza_id) WHERE kapanis_devir_magaza_id IS NOT NULL;

CREATE TRIGGER trg_magaza_guncelleme
    BEFORE UPDATE ON magaza
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- kullanici_magaza FK'si (modül 01'de placeholder)
ALTER TABLE kullanici_magaza
    ADD CONSTRAINT fk_kullanici_magaza_magaza
    FOREIGN KEY (magaza_id) REFERENCES magaza(id) ON DELETE CASCADE;

-- belge_numara_serisi FK'leri (modül 01'de placeholder)
ALTER TABLE belge_numara_serisi
    ADD CONSTRAINT fk_belge_numara_serisi_firma
    FOREIGN KEY (firma_id) REFERENCES firma(id) ON DELETE CASCADE;
ALTER TABLE belge_numara_serisi
    ADD CONSTRAINT fk_belge_numara_serisi_magaza
    FOREIGN KEY (magaza_id) REFERENCES magaza(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- VIEW: vw_magaza_kapanis_devir — Kapanan mağaza devir geçmişi
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_magaza_kapanis_devir AS
SELECT
    m.id              AS kapanan_magaza_id,
    m.kod             AS kapanan_magaza_kod,
    m.ad              AS kapanan_magaza_ad,
    m.firma_id        AS kapanan_firma_id,
    m.kapanis_tarihi,
    m.kapanis_aciklamasi,
    hedef.id          AS devir_magaza_id,
    hedef.kod         AS devir_magaza_kod,
    hedef.ad          AS devir_magaza_ad,
    hedef.firma_id    AS devir_firma_id
FROM magaza m
LEFT JOIN magaza hedef ON hedef.id = m.kapanis_devir_magaza_id
WHERE m.kapanis_tarihi IS NOT NULL;

-- ----------------------------------------------------------------
-- RAF: Depo içi raf/lokasyon (büyük depolar için picking) — ltree hiyerarşi
-- ----------------------------------------------------------------
CREATE TABLE raf (
    id              bigserial PRIMARY KEY,
    magaza_id       bigint NOT NULL REFERENCES magaza(id) ON DELETE CASCADE,
    kod             varchar(50) NOT NULL,                -- 'A-01-03' (koridor-raf-göz)
    ad              varchar(200),
    -- Hiyerarşi
    ust_raf_id      bigint REFERENCES raf(id),
    seviye          smallint NOT NULL DEFAULT 1,         -- 1=zone, 2=koridor, 3=raf, 4=göz
    yol             ltree,                               -- 'a.koridor_01.raf_03.goz_02'
    -- Özellikler
    bolge_tipi      varchar(50),                         -- 'soguk', 'kuru', 'tehlikeli', 'ozel'
    max_kapasite    numeric(15, 2),
    max_agirlik_kg  numeric(15, 2),
    -- Picking için sıralama
    pick_sirasi     int,
    -- Aktif
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (magaza_id, kod)
);
CREATE INDEX idx_raf_magaza ON raf(magaza_id);
CREATE INDEX idx_raf_ust ON raf(ust_raf_id);
CREATE INDEX idx_raf_yol_gist ON raf USING gist(yol);
CREATE INDEX idx_raf_yol_btree ON raf USING btree(yol);

CREATE TRIGGER trg_raf_guncelleme
    BEFORE UPDATE ON raf
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- KASA: Mağazada birden fazla kasa olabilir (pos terminal) + OKC
-- ----------------------------------------------------------------
CREATE TABLE kasa (
    id              bigserial PRIMARY KEY,
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    kod             varchar(50) NOT NULL,
    ad              varchar(100) NOT NULL,
    tip             varchar(20) NOT NULL DEFAULT 'fiziksel_pos' CHECK (tip IN (
        'fiziksel_pos', 'sanal_kasa', 'banka_sanal_kasa', 'muhasebe_kasa'
    )),
    seri_no         varchar(100),                        -- pos cihazı seri no
    -- Ödeme Kayıt Cihazı (TR yasal)
    okc_seri_no     varchar(100),
    okc_marka       varchar(50),                         -- Hugin, Beko, Ingenico, Verifone, vb.
    okc_model       varchar(50),
    okc_ip_adresi   inet,
    okc_port        int CHECK (okc_port IS NULL OR (okc_port BETWEEN 1 AND 65535)),
    okc_aktif_mi    boolean NOT NULL DEFAULT false,
    okc_son_z_raporu timestamptz,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (magaza_id, kod)
);
CREATE INDEX idx_kasa_magaza ON kasa(magaza_id);
CREATE INDEX idx_kasa_okc_aktif ON kasa(okc_aktif_mi) WHERE okc_aktif_mi = true;

CREATE TRIGGER trg_kasa_guncelleme
    BEFORE UPDATE ON kasa
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();
