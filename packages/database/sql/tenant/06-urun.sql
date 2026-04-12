-- ============================================================
-- MODÜL 06: ÜRÜN, VARYANT, FİYAT (v2 — refactor)
-- ============================================================
-- v1 eleştirmen skoru: 7.5/10 → v2 hedef: 9/10
--
-- Bu refactor'da çözülen kritik sorunlar:
--   #1 `urun.varyantli_mi` flag kaldırıldı — her ürünün en az 1 default varyantı var
--   #2 `urun_varyant.satis_fiyati`/`liste_fiyati`/`indirimli_fiyat` kaldırıldı
--      Tek kaynak: `fiyat_listesi_varyant`. Hızlı erişim için `vw_urun_varyant_fiyat`
--   #4 `kategori.yol` → `ltree` extension
--   #5 `UNIQUE (urun_id, eksen_kombinasyon)` eklendi
--   #6 `urun_varyant.son_alis_fiyati`/`ortalama_alis_fiyati` kaldırıldı (mağaza spesifik → urun_stok'ta)
--   #9 `urun_paket` → `parent_varyant_id` olarak yeniden adlandırıldı (varyant seviyesi)
--
-- PHP v1'in en büyük borcu: variant tek satırda düz kolon.
-- v2'de: parent ürün + child varyant (SKU) ayrımı baştan.
-- Stok varyant seviyesinde, fiyat varyant seviyesinde, barkod varyant seviyesinde.
-- ============================================================

-- ----------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------
-- KATEGORI: Hiyerarşik kategori ağacı (ltree path enumeration)
-- ----------------------------------------------------------------
CREATE TABLE kategori (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    -- Hiyerarşi
    ust_kategori_id bigint REFERENCES kategori(id) ON DELETE RESTRICT,
    seviye          smallint NOT NULL DEFAULT 1,
    yol             ltree,                               -- 'elektronik.telefon.akilli'
    yol_text        text,                                -- 'Elektronik > Telefon > Akıllı Telefon' (display)
    -- Görsel
    resim_url       text,
    ikon            varchar(50),
    renk            varchar(20),
    -- SEO (e-ticaret için)
    seo_url         varchar(500),
    seo_baslik      varchar(255),
    seo_aciklama    text,
    seo_anahtar_kelimeler text[],
    -- Sıralama
    sira            int NOT NULL DEFAULT 0,
    -- Toggle
    aktif_mi        boolean NOT NULL DEFAULT true,
    eticaret_aktif  boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kategori_ust ON kategori(ust_kategori_id) WHERE silindi_mi = false;
CREATE INDEX idx_kategori_yol_gist ON kategori USING gist(yol);
CREATE INDEX idx_kategori_yol_btree ON kategori USING btree(yol);
CREATE INDEX idx_kategori_aktif ON kategori(aktif_mi) WHERE silindi_mi = false;

CREATE TRIGGER trg_kategori_guncelleme
    BEFORE UPDATE ON kategori
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- KATEGORI_CEVIRI: Çoklu dil desteği
-- ----------------------------------------------------------------
CREATE TABLE kategori_ceviri (
    kategori_id     bigint NOT NULL REFERENCES kategori(id) ON DELETE CASCADE,
    dil_kodu        char(2) NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    seo_baslik      varchar(255),
    seo_aciklama    text,
    PRIMARY KEY (kategori_id, dil_kodu)
);

-- ----------------------------------------------------------------
-- MARKA: Ürün markaları
-- ----------------------------------------------------------------
CREATE TABLE marka (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    logo_url        text,
    web_sitesi      varchar(255),
    ulke_kodu       char(2) REFERENCES ulke(kod),
    seo_url         varchar(500),
    aktif_mi        boolean NOT NULL DEFAULT true,
    sira            int NOT NULL DEFAULT 0,
    silindi_mi      boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- BIRIM: Ürün birimleri (adet, kg, lt, m, paket, koli)
-- ----------------------------------------------------------------
CREATE TABLE birim (
    id              bigserial PRIMARY KEY,
    kod             varchar(20) UNIQUE NOT NULL,
    ad              varchar(50) NOT NULL,
    kisaltma        varchar(10) NOT NULL,
    ana_birim_id    bigint REFERENCES birim(id),
    donusum_orani   numeric(15, 6) DEFAULT 1,
    tip             varchar(20) NOT NULL DEFAULT 'adet'
                    CHECK (tip IN ('adet', 'agirlik', 'hacim', 'uzunluk', 'paket', 'sure', 'diger')),
    ondalikli_mi    boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true
);

INSERT INTO birim (kod, ad, kisaltma, tip, ondalikli_mi) VALUES
('adet',   'Adet',       'ad',  'adet',     false),
('kg',     'Kilogram',   'kg',  'agirlik',  true),
('gr',     'Gram',       'gr',  'agirlik',  true),
('lt',     'Litre',      'L',   'hacim',    true),
('ml',     'Mililitre',  'ml',  'hacim',    true),
('m',      'Metre',      'm',   'uzunluk',  true),
('cm',     'Santimetre', 'cm',  'uzunluk',  true),
('m2',     'Metrekare',  'm²',  'uzunluk',  true),
('m3',     'Metreküp',   'm³',  'hacim',    true),
('paket',  'Paket',      'pkt', 'paket',    false),
('koli',   'Koli',       'kl',  'paket',    false),
('cift',   'Çift',       'çift','adet',     false),
('saat',   'Saat',       'sa',  'sure',     true);

-- ----------------------------------------------------------------
-- URUN: Parent ürün (model/aile)
-- NOT: `varyantli_mi` flag KALDIRILDI. Her ürünün en az 1 default
--      urun_varyant kaydı olur (eksen_kombinasyon='{}'). Varyant sayısı
--      vw_urun_varyant_sayisi view'inden alınır.
-- ----------------------------------------------------------------
CREATE TABLE urun (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    -- Tanım
    ad              varchar(300) NOT NULL,
    aciklama        text,
    kisa_aciklama   varchar(500),
    -- Hiyerarşi
    kategori_id     bigint REFERENCES kategori(id),
    marka_id        bigint REFERENCES marka(id),
    -- Tip
    tip             varchar(20) NOT NULL DEFAULT 'fiziksel'
                    CHECK (tip IN (
                        'fiziksel',     -- Stoklanan
                        'hizmet',       -- Stoksuz hizmet
                        'dijital',      -- İndirilebilir
                        'paket',        -- Bundle (alt ürünlerden oluşan)
                        'abonelik',     -- Tekrar eden ödeme
                        'demirbas'      -- Sabit kıymet
                    )),
    -- Birim
    ana_birim_id    bigint NOT NULL REFERENCES birim(id),
    -- Vergi (varsayılan — kalem seviyesinde birden fazla vergi siparis_kalem_vergi'de)
    vergi_orani_id  bigint REFERENCES vergi_orani(id),
    vergi_kombinasyon_id bigint REFERENCES vergi_kombinasyon(id),
    fiyatlar_kdv_dahil_mi boolean NOT NULL DEFAULT true,
    -- GTİP / HS Code
    gtip_kodu       varchar(20),
    -- Üretici / menşei
    menshei_ulke_kodu char(2) REFERENCES ulke(kod),
    uretici         varchar(200),
    -- Stok takibi
    stok_takibi     boolean NOT NULL DEFAULT true,
    seri_no_takibi  boolean NOT NULL DEFAULT false,
    lot_takibi      boolean NOT NULL DEFAULT false,
    -- Garanti (urun seviyesi varsayılan; stok_seri bundan türetir)
    garanti_ay      int,
    -- Satış özellikleri
    iskonto_uygulanir_mi boolean NOT NULL DEFAULT true,
    puan_kazandirir_mi boolean NOT NULL DEFAULT true,
    minimum_satis_miktar numeric(15, 4) DEFAULT 1,
    -- E-ticaret
    eticaret_aktif  boolean NOT NULL DEFAULT false,
    eticaret_satilik_mi boolean NOT NULL DEFAULT true,
    seo_url         varchar(500),
    seo_baslik      varchar(255),
    seo_aciklama    text,
    seo_anahtar_kelimeler text[],
    -- Görseller (ana ürün seviyesinde)
    ana_resim_url   text,
    -- Pazar yeri
    pazaryeri_aktif boolean NOT NULL DEFAULT false,
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
CREATE INDEX idx_urun_kategori ON urun(kategori_id) WHERE silindi_mi = false;
CREATE INDEX idx_urun_marka ON urun(marka_id) WHERE silindi_mi = false;
CREATE INDEX idx_urun_aktif ON urun(aktif_mi) WHERE silindi_mi = false;
CREATE INDEX idx_urun_ad_trgm ON urun USING gin (ad gin_trgm_ops);
CREATE INDEX idx_urun_eticaret ON urun(eticaret_aktif) WHERE eticaret_aktif = true AND silindi_mi = false;

CREATE TRIGGER trg_urun_guncelleme
    BEFORE UPDATE ON urun
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- URUN_CEVIRI: Çoklu dil
-- ----------------------------------------------------------------
CREATE TABLE urun_ceviri (
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    dil_kodu        char(2) NOT NULL,
    ad              varchar(300) NOT NULL,
    aciklama        text,
    kisa_aciklama   varchar(500),
    seo_baslik      varchar(255),
    seo_aciklama    text,
    seo_anahtar_kelimeler text[],
    PRIMARY KEY (urun_id, dil_kodu)
);

-- ----------------------------------------------------------------
-- URUN_VARYANT_EKSEN: Bu ürünün hangi eksenleri var (renk, beden)
-- ----------------------------------------------------------------
CREATE TABLE urun_varyant_eksen (
    id              bigserial PRIMARY KEY,
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    eksen_kod       varchar(50) NOT NULL,
    eksen_ad        varchar(100) NOT NULL,
    sira            smallint NOT NULL,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_id, eksen_kod),
    UNIQUE (urun_id, sira),
    CHECK (sira BETWEEN 1 AND 5)
);
CREATE INDEX idx_urun_varyant_eksen_urun ON urun_varyant_eksen(urun_id);

-- ----------------------------------------------------------------
-- URUN_VARYANT_SECENEK: Eksenin alabileceği değerler
-- ----------------------------------------------------------------
CREATE TABLE urun_varyant_secenek (
    id              bigserial PRIMARY KEY,
    eksen_id        bigint NOT NULL REFERENCES urun_varyant_eksen(id) ON DELETE CASCADE,
    deger_kod       varchar(50) NOT NULL,
    deger_ad        varchar(100) NOT NULL,
    hex_renk        varchar(20),
    resim_url       text,
    sira            int NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eksen_id, deger_kod)
);
CREATE INDEX idx_urun_varyant_secenek_eksen ON urun_varyant_secenek(eksen_id);

-- ----------------------------------------------------------------
-- URUN_VARYANT: Asıl satılabilir SKU
-- NOT: Fiyat kolonları KALDIRILDI. Tek kaynak: fiyat_listesi_varyant.
-- NOT: son_alis_fiyati / ortalama_alis_fiyati KALDIRILDI. Mağaza spesifik
--      olduğu için urun_stok tablosunda tutulur.
-- NOT: Her ürünün en az 1 varyantı olur (varsayilan_mi=true, eksen_kombinasyon='{}').
-- ----------------------------------------------------------------
CREATE TABLE urun_varyant (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    -- Kimlik
    sku             varchar(100) UNIQUE NOT NULL,
    barkod          varchar(100),                        -- ana barkod; diğerleri urun_varyant_barkod'da
    model_no        varchar(100),
    uretici_kodu    varchar(100),
    tedarikci_kodu  varchar(100),
    -- Görsel ad (otomatik oluşturulabilir: "Kırmızı, Medium")
    varyant_ad      varchar(300),
    -- Varsayılan varyant mı (varyantsız ürünlerde tek varyant = varsayılan)
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    -- Eksen kombinasyonu — {"renk": "kirmizi", "beden": "m"}
    -- Varyantsız ürünlerde: '{}'
    eksen_kombinasyon jsonb NOT NULL DEFAULT '{}',
    -- Para birimi (fiyatlandırma fiyat_listesi'nde ama varyant'a ait para birimi referansı)
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Vergi override (NULL = ürün varsayılanı)
    vergi_orani_id  bigint REFERENCES vergi_orani(id),
    -- Birim (NULL = ürün varsayılanı)
    birim_id        bigint REFERENCES birim(id),
    -- Fiziksel özellikler (kargo hesabı için)
    agirlik_gr      numeric(12, 2),
    en_cm           numeric(10, 2),
    boy_cm          numeric(10, 2),
    yukseklik_cm    numeric(10, 2),
    hacim_dm3       numeric(15, 4),
    -- Stok minimumları (default — mağaza bazlı override urun_stok.kritik_stok'ta)
    kritik_stok     numeric(15, 4) DEFAULT 0,
    minimum_stok    numeric(15, 4) DEFAULT 0,
    maksimum_stok   numeric(15, 4),
    yeniden_siparis_noktasi numeric(15, 4),
    yeniden_siparis_miktar numeric(15, 4),
    -- Resim (varyant özel)
    ana_resim_url   text,
    -- Sıralama / aktif
    sira            int NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    -- Soft delete + audit
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_varyant_urun ON urun_varyant(urun_id) WHERE silindi_mi = false;
CREATE INDEX idx_urun_varyant_sku ON urun_varyant(sku);
CREATE INDEX idx_urun_varyant_barkod ON urun_varyant(barkod) WHERE barkod IS NOT NULL;
CREATE INDEX idx_urun_varyant_aktif ON urun_varyant(aktif_mi) WHERE silindi_mi = false;
CREATE INDEX idx_urun_varyant_eksen_jsonb ON urun_varyant USING gin (eksen_kombinasyon);

-- Sorun #5: JSONB üzerinde UNIQUE — aynı urun için aynı eksen_kombinasyon iki kez kaydedilemez
CREATE UNIQUE INDEX unq_urun_varyant_eksen_kombinasyon
    ON urun_varyant(urun_id, eksen_kombinasyon)
    WHERE silindi_mi = false;

-- Sorun #1 destek: bir ürün için en fazla 1 varsayilan varyant
CREATE UNIQUE INDEX unq_urun_varyant_varsayilan
    ON urun_varyant(urun_id)
    WHERE varsayilan_mi = true AND silindi_mi = false;

CREATE TRIGGER trg_urun_varyant_guncelleme
    BEFORE UPDATE ON urun_varyant
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- FUNCTION: urun_olustur_default_varyant
-- Ürün oluştuğunda otomatik 1 adet default (varsayilan) varyant açar.
-- App katmanı isterse ek varyantlar ekler ama en az 1 tane garanti.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_urun_default_varyant() RETURNS TRIGGER AS $$
DECLARE
    v_ana_para char(3);
BEGIN
    -- Ana para birimini sistem ayarından al (fallback 'TRY')
    SELECT COALESCE(
        (SELECT deger FROM sistem_ayar WHERE anahtar = 'ana_para_birimi' LIMIT 1),
        'TRY'
    ) INTO v_ana_para;

    INSERT INTO urun_varyant (
        urun_id, sku, varyant_ad, varsayilan_mi, eksen_kombinasyon,
        para_birimi_kod, birim_id, olusturan_kullanici_id
    ) VALUES (
        NEW.id,
        NEW.kod,                              -- default SKU = ürün kodu
        NEW.ad,
        true,
        '{}'::jsonb,
        v_ana_para,
        NEW.ana_birim_id,
        NEW.olusturan_kullanici_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_urun_default_varyant_ekle
    AFTER INSERT ON urun
    FOR EACH ROW EXECUTE FUNCTION trg_urun_default_varyant();

-- ----------------------------------------------------------------
-- URUN_VARYANT_BARKOD: Çoklu barkod desteği (EAN, UPC, kendi barkodumuz)
-- ----------------------------------------------------------------
CREATE TABLE urun_varyant_barkod (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE CASCADE,
    barkod          varchar(100) UNIQUE NOT NULL,
    tip             varchar(20) NOT NULL DEFAULT 'EAN13'
                    CHECK (tip IN ('EAN13', 'EAN8', 'UPC_A', 'UPC_E', 'CODE128', 'CODE39', 'QR', 'OZEL')),
    aciklama        varchar(200),
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_varyant_barkod_varyant ON urun_varyant_barkod(urun_varyant_id);

-- ----------------------------------------------------------------
-- URUN_RESIM: Çoklu resim, sıralı, varyant özel
-- urun_varyant_id NULL ise tüm varyantlara uygulanır.
-- ----------------------------------------------------------------
CREATE TABLE urun_resim (
    id              bigserial PRIMARY KEY,
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    urun_varyant_id bigint REFERENCES urun_varyant(id) ON DELETE CASCADE,
    url             text NOT NULL,
    alt_text        varchar(255),
    baslik          varchar(255),
    sira            int NOT NULL DEFAULT 0,
    ana_resim_mi    boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_resim_urun ON urun_resim(urun_id);
CREATE INDEX idx_urun_resim_varyant ON urun_resim(urun_varyant_id);

-- ----------------------------------------------------------------
-- URUN_OZELLIK: Spec / teknik özellik (ekran 6", RAM 8GB, vb.)
-- ----------------------------------------------------------------
CREATE TABLE urun_ozellik_grup (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    sira            int NOT NULL DEFAULT 0
);

CREATE TABLE urun_ozellik_anahtar (
    id              bigserial PRIMARY KEY,
    grup_id         bigint REFERENCES urun_ozellik_grup(id),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    birim           varchar(20),
    tip             varchar(20) NOT NULL DEFAULT 'metin' CHECK (tip IN ('metin', 'sayi', 'boolean', 'liste')),
    siralama_oncelik int NOT NULL DEFAULT 0,
    filtrelenebilir boolean NOT NULL DEFAULT false
);

-- 'liste' tipi için seçenek listesi
CREATE TABLE urun_ozellik_anahtar_secenek (
    id              bigserial PRIMARY KEY,
    anahtar_id      bigint NOT NULL REFERENCES urun_ozellik_anahtar(id) ON DELETE CASCADE,
    deger_kod       varchar(50) NOT NULL,
    deger_ad        varchar(200) NOT NULL,
    sira            int NOT NULL DEFAULT 0,
    UNIQUE (anahtar_id, deger_kod)
);

CREATE TABLE urun_ozellik_deger (
    id              bigserial PRIMARY KEY,
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    anahtar_id      bigint NOT NULL REFERENCES urun_ozellik_anahtar(id),
    deger           text NOT NULL,
    sira            int NOT NULL DEFAULT 0,
    UNIQUE (urun_id, anahtar_id)
);
CREATE INDEX idx_urun_ozellik_deger_urun ON urun_ozellik_deger(urun_id);

-- ----------------------------------------------------------------
-- URUN_PAKET: Bundle/Set ürünler — VARYANT SEVİYESİNDE
-- Sorun #9: parent_varyant_id olarak yeniden adlandırıldı.
-- Böylece "Kırmızı Kombo Paket" gibi varyant-spesifik bundle mümkün.
-- ----------------------------------------------------------------
CREATE TABLE urun_paket (
    id              bigserial PRIMARY KEY,
    parent_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE CASCADE,
    icerik_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    miktar          numeric(15, 4) NOT NULL DEFAULT 1 CHECK (miktar > 0),
    sira            int NOT NULL DEFAULT 0,
    UNIQUE (parent_varyant_id, icerik_varyant_id),
    CHECK (parent_varyant_id <> icerik_varyant_id)
);
CREATE INDEX idx_urun_paket_parent ON urun_paket(parent_varyant_id);
CREATE INDEX idx_urun_paket_icerik ON urun_paket(icerik_varyant_id);

-- ----------------------------------------------------------------
-- URUN_TEDARIKCI: Hangi tedarikçilerden alınır
-- ----------------------------------------------------------------
CREATE TABLE urun_tedarikci (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE CASCADE,
    cari_id         bigint NOT NULL REFERENCES cari(id),
    tedarikci_urun_kodu varchar(100),
    son_alis_fiyati numeric(18, 4),
    son_alis_para_birimi char(3) REFERENCES para_birimi(kod),
    son_alis_tarihi date,
    teslim_suresi_gun int,
    minimum_siparis_miktar numeric(15, 4),
    tercih_edilen_mi boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_varyant_id, cari_id)
);
CREATE INDEX idx_urun_tedarikci_varyant ON urun_tedarikci(urun_varyant_id);
CREATE INDEX idx_urun_tedarikci_cari ON urun_tedarikci(cari_id);

-- ----------------------------------------------------------------
-- FIYAT_LISTESI: Çoklu fiyat listesi (perakende, toptan, bayi, b2b)
-- ----------------------------------------------------------------
CREATE TABLE fiyat_listesi (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    fiyatlar_kdv_dahil_mi boolean NOT NULL DEFAULT true,
    tip             varchar(30) NOT NULL DEFAULT 'sabit'
                    CHECK (tip IN ('sabit', 'iskontolu', 'formul')),
    kaynak_fiyat_listesi_id bigint REFERENCES fiyat_listesi(id),
    iskonto_orani   numeric(7, 4),
    iskonto_tutar   numeric(18, 4),
    gecerli_baslangic timestamptz,
    gecerli_bitis   timestamptz,
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_fiyat_listesi_varsayilan
    ON fiyat_listesi(varsayilan_mi) WHERE varsayilan_mi = true;

CREATE TRIGGER trg_fiyat_listesi_guncelleme
    BEFORE UPDATE ON fiyat_listesi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- FIYAT_LISTESI_VARYANT: TEK FİYAT KAYNAĞI
-- Sorun #2: urun_varyant'tan fiyat kolonları kaldırıldı. Bu tablo tek otorite.
-- ----------------------------------------------------------------
CREATE TABLE fiyat_listesi_varyant (
    id              bigserial PRIMARY KEY,
    fiyat_listesi_id bigint NOT NULL REFERENCES fiyat_listesi(id) ON DELETE CASCADE,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE CASCADE,
    -- Ana fiyat (KDV dahil/hariç fiyat_listesi.fiyatlar_kdv_dahil_mi'ye göre)
    fiyat           numeric(18, 4) NOT NULL,
    liste_fiyati    numeric(18, 4),                      -- iskonto öncesi referans
    -- İndirimli fiyat + geçerlilik (basit kampanya)
    indirimli_fiyat numeric(18, 4),
    indirimli_baslangic timestamptz,
    indirimli_bitis timestamptz,
    -- Miktar bazlı kademeli fiyat
    minimum_miktar  numeric(15, 4) NOT NULL DEFAULT 1,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fiyat_listesi_id, urun_varyant_id, minimum_miktar)
);
CREATE INDEX idx_fiyat_listesi_varyant_liste ON fiyat_listesi_varyant(fiyat_listesi_id);
CREATE INDEX idx_fiyat_listesi_varyant_varyant ON fiyat_listesi_varyant(urun_varyant_id);

CREATE TRIGGER trg_fiyat_listesi_varyant_guncelleme
    BEFORE UPDATE ON fiyat_listesi_varyant
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- VIEW: vw_urun_varyant_fiyat
-- Hızlı erişim için varsayılan fiyat listesinden varyant fiyatı.
-- App katmanı "bu varyantın şu anki fiyatı ne?" sorusu için bunu kullanır.
-- Kademeli fiyat (minimum_miktar=1) default olarak gelir.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_urun_varyant_fiyat AS
SELECT
    uv.id                       AS urun_varyant_id,
    uv.urun_id,
    uv.sku,
    uv.varyant_ad,
    fl.id                       AS fiyat_listesi_id,
    fl.kod                      AS fiyat_listesi_kod,
    fl.para_birimi_kod,
    fl.fiyatlar_kdv_dahil_mi,
    flv.fiyat,
    flv.liste_fiyati,
    -- Aktif indirim varsa onu, yoksa normal fiyatı döner
    CASE
        WHEN flv.indirimli_fiyat IS NOT NULL
             AND (flv.indirimli_baslangic IS NULL OR flv.indirimli_baslangic <= now())
             AND (flv.indirimli_bitis IS NULL OR flv.indirimli_bitis >= now())
        THEN flv.indirimli_fiyat
        ELSE flv.fiyat
    END                         AS guncel_fiyat,
    flv.indirimli_fiyat,
    flv.indirimli_baslangic,
    flv.indirimli_bitis
FROM urun_varyant uv
JOIN fiyat_listesi fl ON fl.varsayilan_mi = true AND fl.aktif_mi = true
LEFT JOIN fiyat_listesi_varyant flv
       ON flv.fiyat_listesi_id = fl.id
      AND flv.urun_varyant_id = uv.id
      AND flv.minimum_miktar = 1
WHERE uv.silindi_mi = false;

-- ----------------------------------------------------------------
-- VIEW: vw_urun_varyant_sayisi
-- "Bu ürünün kaç varyantı var?" — varyantli_mi flag yerine.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_urun_varyant_sayisi AS
SELECT
    u.id AS urun_id,
    COUNT(uv.id) FILTER (WHERE uv.silindi_mi = false) AS varyant_sayisi,
    COUNT(uv.id) FILTER (WHERE uv.silindi_mi = false AND uv.eksen_kombinasyon <> '{}'::jsonb) AS eksenli_varyant_sayisi,
    (COUNT(uv.id) FILTER (WHERE uv.silindi_mi = false AND uv.eksen_kombinasyon <> '{}'::jsonb) > 0) AS varyantli_mi
FROM urun u
LEFT JOIN urun_varyant uv ON uv.urun_id = u.id
GROUP BY u.id;

-- ----------------------------------------------------------------
-- FK eklemeleri (önceki modüllerde placeholder kalan)
-- ----------------------------------------------------------------
ALTER TABLE magaza
    ADD CONSTRAINT fk_magaza_fiyat_listesi
    FOREIGN KEY (fiyat_listesi_id) REFERENCES fiyat_listesi(id);

ALTER TABLE cari_grup
    ADD CONSTRAINT fk_cari_grup_fiyat_listesi
    FOREIGN KEY (fiyat_listesi_id) REFERENCES fiyat_listesi(id);

ALTER TABLE cari
    ADD CONSTRAINT fk_cari_fiyat_listesi
    FOREIGN KEY (fiyat_listesi_id) REFERENCES fiyat_listesi(id);

-- ----------------------------------------------------------------
-- URUN_FIYAT_GECMIS: Fiyat değişiklik logu
-- ----------------------------------------------------------------
CREATE TABLE urun_fiyat_gecmis (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE CASCADE,
    fiyat_listesi_id bigint REFERENCES fiyat_listesi(id),
    eski_fiyat      numeric(18, 4),
    yeni_fiyat      numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) NOT NULL,
    sebep           varchar(200),
    degistiren_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_fiyat_gecmis_varyant_tarih
    ON urun_fiyat_gecmis(urun_varyant_id, olusturma_tarihi DESC);
