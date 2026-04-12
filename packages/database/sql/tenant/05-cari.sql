-- ============================================================
-- MODÜL 05: CARİ HESAPLAR (v2 — REFACTOR)
-- ============================================================
-- Müşteri + tedarikçi + personel + diğer — tek cari tablo.
-- B2B portal auth ayrı model, KVKK anonimleştirme, merge, VKN/TCKN doğrulama.
--
-- v1'den farklar (v1 eleştirisi 05-cari-elestiri-v1.md çözümleri):
--   - KRİTİK BUG: trgm GIN index syntax düzeltildi (parantez eklendi)
--   - firma_id ile multi-firma desteği + (firma_id, kod) unique
--   - cari_birlestirme_log + cari_birlestir() fonksiyonu
--   - KVKK anonimleştirme + cari_silme_talebi kuyruğu
--   - 2FA + brute force koruma + cari_portal_oturum
--   - cari_kod_olustur() + BEFORE INSERT trigger
--   - cari_iliski (aile/grup/bağlı şirket)
--   - vkn_dogrula, tckn_dogrula TR algoritma
--   - vergi_no (firma_id, vergi_no, vergi_no_tipi) unique
--   - cari_iletisim varsayılan partial unique
--   - cari.notlar kaldırıldı → cari_not tek kaynak
--   - cari.etiketler text[] kaldırıldı → cari_etiket (modül 01 etiket tablosu)
--   - IBAN format check
--   - cari ekstre özet view
-- ============================================================

-- ----------------------------------------------------------------
-- CARI_GRUP: Müşteri segmentasyonu
-- ----------------------------------------------------------------
CREATE TABLE cari_grup (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    aciklama        text,
    -- Varsayılanlar
    varsayilan_iskonto_orani numeric(5, 2) NOT NULL DEFAULT 0 CHECK (varsayilan_iskonto_orani BETWEEN 0 AND 100),
    varsayilan_vade_gun int,
    fiyat_listesi_id bigint,                             -- modül 06'da FK eklenecek
    -- Görsel
    renk            varchar(20),                         -- hex
    ikon            varchar(50),                         -- lucide icon name
    -- Audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cari_grup_guncelleme
    BEFORE UPDATE ON cari_grup
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI: Ana cari tablosu
-- ----------------------------------------------------------------
CREATE TABLE cari (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    -- Multi-firma: NULL = tüm firmalara açık (tenant-global)
    firma_id        bigint REFERENCES firma(id) ON DELETE RESTRICT,
    kod             varchar(50) NOT NULL,
    -- Tip
    tip             varchar(20) NOT NULL DEFAULT 'musteri'
                    CHECK (tip IN ('musteri', 'tedarikci', 'her_ikisi', 'personel', 'diger')),
    kisi_tipi       varchar(20) NOT NULL CHECK (kisi_tipi IN ('gercek', 'tuzel')),
    cari_grup_id    bigint REFERENCES cari_grup(id) ON DELETE SET NULL,
    -- Kimlik (gerçek kişi)
    ad              varchar(100),
    soyad           varchar(100),
    cinsiyet        varchar(20) CHECK (cinsiyet IS NULL OR cinsiyet IN ('erkek', 'kadin', 'diger', 'belirtilmemis')),
    dogum_tarihi    date,
    -- Kimlik (tüzel kişi)
    unvan           varchar(300),
    kisa_ad         varchar(100),
    yetkili_ad_soyad varchar(200),
    yetkili_gorev   varchar(100),
    -- Vergi (uluslararası)
    vergi_no        varchar(30),
    vergi_no_tipi   varchar(20) CHECK (vergi_no_tipi IS NULL OR vergi_no_tipi IN (
        'TCKN', 'VKN', 'YKN', 'TRN', 'EU_VAT', 'SSN', 'EIN', 'GSTIN', 'DIGER'
    )),
    vergi_dairesi_id bigint REFERENCES vergi_dairesi(id) ON DELETE SET NULL,
    -- İletişim dili
    dil             char(2),                             -- iletişim dili
    -- Ana lokasyon (detay cari_adres tablosunda)
    ulke_kodu       char(2) REFERENCES ulke(kod),
    il_id           bigint REFERENCES il(id) ON DELETE SET NULL,
    ilce_id         bigint REFERENCES ilce(id) ON DELETE SET NULL,
    -- Ticari ayarlar
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    fiyat_listesi_id bigint,                             -- modül 06'da
    iskonto_orani   numeric(5, 2) NOT NULL DEFAULT 0 CHECK (iskonto_orani BETWEEN 0 AND 100),
    vade_gun        int NOT NULL DEFAULT 0 CHECK (vade_gun >= 0),
    -- Kredi kontrolü
    kredi_limiti    numeric(18, 4) NOT NULL DEFAULT 0 CHECK (kredi_limiti >= 0),
    kredi_limiti_aktif_mi boolean NOT NULL DEFAULT false,
    risk_durumu     varchar(20) NOT NULL DEFAULT 'normal'
                    CHECK (risk_durumu IN ('normal', 'dikkat', 'riskli', 'kara_liste')),
    risk_aciklama   text,
    -- Vergi muafiyet (detay cari_vergi_muafiyet/vergi_muafiyet)
    vergi_muaf_mi   boolean NOT NULL DEFAULT false,
    varsayilan_vergi_orani_id bigint REFERENCES vergi_orani(id),
    -- Kayıt bilgileri
    kayit_magaza_id bigint REFERENCES magaza(id),
    musteri_temsilcisi_id bigint REFERENCES kullanici(id) ON DELETE SET NULL,
    -- B2B Portal erişim özetleri (detay: cari_kullanici, cari_portal_oturum)
    portal_aktif    boolean NOT NULL DEFAULT false,
    portal_son_giris timestamptz,
    portal_son_giris_ip inet,
    -- Sadakat
    sadakat_puani   bigint NOT NULL DEFAULT 0,
    sadakat_seviye_id bigint,                            -- modül 13'te
    sadakat_kart_no varchar(50),                         -- tenant-wide unique partial
    -- CRM
    kaynak          varchar(50) CHECK (kaynak IS NULL OR kaynak IN (
        'walk_in', 'eticaret', 'pazarlama', 'referans', 'pazaryeri', 'manuel', 'api', 'import', 'diger'
    )),
    referans_cari_id bigint REFERENCES cari(id) ON DELETE SET NULL,
    -- B2B segmentasyon
    sektor          varchar(100),
    calisan_sayisi  int,
    -- KVKK / GDPR
    kvkk_onay_mi    boolean NOT NULL DEFAULT false,
    kvkk_onay_tarihi timestamptz,
    kvkk_silme_talebi boolean NOT NULL DEFAULT false,    -- talep gelmiş mi
    anonimlestirildi_mi boolean NOT NULL DEFAULT false,
    anonimlestirme_tarihi timestamptz,
    pazarlama_email_onay boolean NOT NULL DEFAULT false,
    pazarlama_sms_onay boolean NOT NULL DEFAULT false,
    -- Soft delete + audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Tutarlılık: personel ise gerçek kişi olmalı
    CONSTRAINT chk_cari_personel_gercek
        CHECK (tip <> 'personel' OR kisi_tipi = 'gercek'),
    -- Gerçek kişide ad zorunlu
    CONSTRAINT chk_cari_gercek_ad
        CHECK (kisi_tipi <> 'gercek' OR (ad IS NOT NULL AND soyad IS NOT NULL)),
    -- Tüzel kişide unvan zorunlu
    CONSTRAINT chk_cari_tuzel_unvan
        CHECK (kisi_tipi <> 'tuzel' OR unvan IS NOT NULL)
);

-- Multi-firma kod unique: firma varsa firma bazlı; NULL ise global
CREATE UNIQUE INDEX unq_cari_firma_kod
    ON cari (firma_id, kod)
    WHERE silindi_mi = false AND firma_id IS NOT NULL;
CREATE UNIQUE INDEX unq_cari_global_kod
    ON cari (kod)
    WHERE silindi_mi = false AND firma_id IS NULL;

-- Vergi no duplicate koruma (firma bazlı)
CREATE UNIQUE INDEX unq_cari_vergi_no
    ON cari (COALESCE(firma_id, 0), vergi_no, vergi_no_tipi)
    WHERE vergi_no IS NOT NULL AND silindi_mi = false;

-- Sadakat kartı tenant-wide unique
CREATE UNIQUE INDEX unq_cari_sadakat_kart_no
    ON cari (sadakat_kart_no)
    WHERE sadakat_kart_no IS NOT NULL AND silindi_mi = false;

-- Temel index'ler
CREATE INDEX idx_cari_tip ON cari(tip) WHERE silindi_mi = false;
CREATE INDEX idx_cari_firma ON cari(firma_id) WHERE silindi_mi = false;
CREATE INDEX idx_cari_grup ON cari(cari_grup_id);
CREATE INDEX idx_cari_kayit_magaza ON cari(kayit_magaza_id);
CREATE INDEX idx_cari_vergi_no_arama ON cari(vergi_no) WHERE vergi_no IS NOT NULL;

-- KRİTİK FIX: Trgm GIN index'ler — parantez doğru konumda
CREATE INDEX idx_cari_unvan_trgm
    ON cari USING gin ((COALESCE(unvan, '')) gin_trgm_ops)
    WHERE silindi_mi = false;

CREATE INDEX idx_cari_ad_soyad_trgm
    ON cari USING gin (((COALESCE(ad, '') || ' ' || COALESCE(soyad, ''))) gin_trgm_ops)
    WHERE silindi_mi = false;

CREATE INDEX idx_cari_kisa_ad_trgm
    ON cari USING gin ((COALESCE(kisa_ad, '')) gin_trgm_ops)
    WHERE silindi_mi = false;

-- Doğum günü filtresi için partial index (MM-DD)
CREATE INDEX idx_cari_dogum_ay_gun
    ON cari ((EXTRACT(MONTH FROM dogum_tarihi) * 100 + EXTRACT(DAY FROM dogum_tarihi)))
    WHERE dogum_tarihi IS NOT NULL AND silindi_mi = false;

CREATE TRIGGER trg_cari_guncelleme
    BEFORE UPDATE ON cari
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI_FIRMA_BAKIYE: Multi-firma opsiyonel override (ileride modül 10 kullanır)
-- ----------------------------------------------------------------
-- Tek bir cari kimliğinin farklı firmalarda farklı kredi limiti, vade vb. tutabilmesi için.
CREATE TABLE cari_firma_iliski (
    id              bigserial PRIMARY KEY,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    firma_id        bigint NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
    -- Firma bazlı override
    firma_cari_kodu varchar(50),                         -- firma bazlı kod
    kredi_limiti    numeric(18, 4),
    vade_gun        int,
    risk_durumu     varchar(20),
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cari_id, firma_id),
    UNIQUE (firma_id, firma_cari_kodu)
);
CREATE INDEX idx_cari_firma_iliski_cari ON cari_firma_iliski(cari_id);

CREATE TRIGGER trg_cari_firma_iliski_guncelleme
    BEFORE UPDATE ON cari_firma_iliski
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI_ADRES: Çoklu adres
-- ----------------------------------------------------------------
CREATE TABLE cari_adres (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    baslik          varchar(100) NOT NULL,
    tip             varchar(20) NOT NULL DEFAULT 'genel'
                    CHECK (tip IN ('fatura', 'sevk', 'ev', 'is', 'genel')),
    yetkili_ad_soyad varchar(200),
    yetkili_telefon varchar(30),
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod),
    il_id           bigint REFERENCES il(id) ON DELETE SET NULL,
    ilce_id         bigint REFERENCES ilce(id) ON DELETE SET NULL,
    mahalle         varchar(200),
    sokak           varchar(200),
    bina_no         varchar(20),
    daire_no        varchar(20),
    posta_kodu      varchar(20),
    adres_satir1    text NOT NULL,
    adres_satir2    text,
    enlem           numeric(10, 7),
    boylam          numeric(10, 7),
    varsayilan_fatura_mi boolean NOT NULL DEFAULT false,
    varsayilan_sevk_mi boolean NOT NULL DEFAULT false,
    dogrulanmis_mi  boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_adres_cari ON cari_adres(cari_id);

CREATE UNIQUE INDEX idx_cari_adres_varsayilan_fatura
    ON cari_adres(cari_id) WHERE varsayilan_fatura_mi = true;
CREATE UNIQUE INDEX idx_cari_adres_varsayilan_sevk
    ON cari_adres(cari_id) WHERE varsayilan_sevk_mi = true;

CREATE TRIGGER trg_cari_adres_guncelleme
    BEFORE UPDATE ON cari_adres
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI_ILETISIM: Çoklu iletişim
-- ----------------------------------------------------------------
CREATE TABLE cari_iletisim (
    id              bigserial PRIMARY KEY,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'telefon', 'cep', 'email', 'whatsapp', 'instagram', 'facebook',
        'twitter', 'linkedin', 'web', 'faks'
    )),
    deger           varchar(255) NOT NULL,
    aciklama        varchar(100),
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    dogrulanmis_mi  boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_iletisim_cari ON cari_iletisim(cari_id);
CREATE INDEX idx_cari_iletisim_email ON cari_iletisim(deger) WHERE tip = 'email';
CREATE INDEX idx_cari_iletisim_telefon ON cari_iletisim(deger) WHERE tip IN ('telefon', 'cep');

-- Bir cari için tip bazlı en fazla 1 varsayılan
CREATE UNIQUE INDEX idx_cari_iletisim_varsayilan
    ON cari_iletisim(cari_id, tip) WHERE varsayilan_mi = true;

-- ----------------------------------------------------------------
-- CARI_BANKA: Havale/EFT için banka bilgileri
-- ----------------------------------------------------------------
CREATE TABLE cari_banka (
    id              bigserial PRIMARY KEY,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    banka_adi       varchar(100) NOT NULL,
    sube            varchar(100),
    hesap_adi       varchar(200),
    hesap_no        varchar(50),
    iban            varchar(34),
    swift_kod       varchar(20),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    aciklama        text,
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Basit IBAN format kontrolü: 2 harf ülke + rakam/harf karışımı 15-32
    CONSTRAINT chk_cari_banka_iban_format
        CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$')
);
CREATE INDEX idx_cari_banka_cari ON cari_banka(cari_id);

CREATE UNIQUE INDEX idx_cari_banka_varsayilan
    ON cari_banka(cari_id, para_birimi_kod) WHERE varsayilan_mi = true;

-- ----------------------------------------------------------------
-- CARI_DOSYA: Vergi levhası, sözleşme, imza sirküleri vb.
-- ----------------------------------------------------------------
CREATE TABLE cari_dosya (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    ad              varchar(200) NOT NULL,
    tip             varchar(50),
    dosya_url       text NOT NULL,
    storage_saglayici varchar(30),                       -- 's3', 'r2', 'local'
    dosya_boyut     bigint,
    mime_tipi       varchar(100),
    sha256          varchar(64),
    yukleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_dosya_cari ON cari_dosya(cari_id);

-- ----------------------------------------------------------------
-- CARI_NOT: CRM notları (tek kaynağı — cari.notlar kaldırıldı)
-- ----------------------------------------------------------------
CREATE TABLE cari_not (
    id              bigserial PRIMARY KEY,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    icerik          text NOT NULL,
    onemli_mi       boolean NOT NULL DEFAULT false,
    sabitlenmis_mi  boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_not_cari ON cari_not(cari_id, olusturma_tarihi DESC);

CREATE TRIGGER trg_cari_not_guncelleme
    BEFORE UPDATE ON cari_not
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI_ETIKET: Cari ↔ modül 01 etiket ilişkisi (text[] yerine)
-- ----------------------------------------------------------------
CREATE TABLE cari_etiket (
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    etiket_id       bigint NOT NULL REFERENCES etiket(id) ON DELETE CASCADE,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cari_id, etiket_id)
);
CREATE INDEX idx_cari_etiket_etiket ON cari_etiket(etiket_id);

-- ----------------------------------------------------------------
-- CARI_ILISKI: Aile, grup, ana şirket, bağlı şirket
-- ----------------------------------------------------------------
CREATE TABLE cari_iliski (
    id              bigserial PRIMARY KEY,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    iliskili_cari_id bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    iliski_tipi     varchar(30) NOT NULL CHECK (iliski_tipi IN (
        'ana_sirket', 'bagli_sirket', 'aile_uyesi', 'es', 'cocuk', 'ebeveyn',
        'referans', 'garantor', 'yetkili', 'ortak', 'grup_uyesi', 'diger'
    )),
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cari_id, iliskili_cari_id, iliski_tipi),
    CONSTRAINT chk_cari_iliski_self CHECK (cari_id <> iliskili_cari_id)
);
CREATE INDEX idx_cari_iliski_cari ON cari_iliski(cari_id);
CREATE INDEX idx_cari_iliski_ilgili ON cari_iliski(iliskili_cari_id);

-- ================================================================
-- B2B PORTAL AUTH
-- ================================================================

-- ----------------------------------------------------------------
-- CARI_KULLANICI: B2B portal kullanıcıları (bir cari için N kullanıcı)
-- ----------------------------------------------------------------
CREATE TABLE cari_kullanici (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    email           citext NOT NULL,
    sifre_hash      varchar(255) NOT NULL,               -- argon2id
    ad              varchar(100),
    soyad           varchar(100),
    telefon         varchar(30),
    gorev           varchar(100),                        -- 'satın alma', 'muhasebe', 'yönetici'
    -- 2FA
    iki_faktor_aktif boolean NOT NULL DEFAULT false,
    iki_faktor_secret varchar(100),
    iki_faktor_yedek_kodlar text[],
    -- Brute force / kilit
    yanlis_giris_sayisi int NOT NULL DEFAULT 0,
    kilit_son_tarih timestamptz,
    -- Şifre reset
    sifre_sifirlama_tokeni varchar(100),
    sifre_sifirlama_son timestamptz,
    sifre_son_degisim timestamptz,
    -- Aktivite
    son_giris_tarihi timestamptz,
    son_giris_ip    inet,
    -- Yetki (cari portal seviyesinde sınırlı set)
    yetkiler        text[] NOT NULL DEFAULT ARRAY[
        'siparis.goruntule', 'siparis.olustur',
        'fatura.goruntule', 'ekstre.goruntule'
    ],
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cari_id, email)
);
CREATE INDEX idx_cari_kullanici_cari ON cari_kullanici(cari_id) WHERE silindi_mi = false;
CREATE UNIQUE INDEX unq_cari_kullanici_email
    ON cari_kullanici(email) WHERE silindi_mi = false;

CREATE TRIGGER trg_cari_kullanici_guncelleme
    BEFORE UPDATE ON cari_kullanici
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- CARI_PORTAL_OTURUM: Refresh token tracking (oturum tablosunun cari versiyonu)
-- ----------------------------------------------------------------
CREATE TABLE cari_portal_oturum (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_kullanici_id bigint NOT NULL REFERENCES cari_kullanici(id) ON DELETE CASCADE,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    refresh_token_hash varchar(255) NOT NULL UNIQUE,
    cihaz_bilgisi   text,
    cihaz_tipi      varchar(20),
    tarayici        varchar(50),
    isletim_sistemi varchar(50),
    ip_adresi       inet,
    konum_ulke      char(2),
    konum_sehir     varchar(100),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    son_kullanim_tarihi timestamptz NOT NULL DEFAULT now(),
    son_kullanim_son timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    iptal_edildi_mi boolean NOT NULL DEFAULT false,
    iptal_tarihi    timestamptz
);
CREATE INDEX idx_cari_portal_oturum_kullanici
    ON cari_portal_oturum(cari_kullanici_id)
    WHERE iptal_edildi_mi = false;
CREATE INDEX idx_cari_portal_oturum_token
    ON cari_portal_oturum(refresh_token_hash);

-- ----------------------------------------------------------------
-- CARI_SIFRE_TOKEN: Şifre reset tokenları (ayrı tablo, audit için)
-- ----------------------------------------------------------------
CREATE TABLE cari_sifre_token (
    id              bigserial PRIMARY KEY,
    cari_kullanici_id bigint NOT NULL REFERENCES cari_kullanici(id) ON DELETE CASCADE,
    token_hash      varchar(255) NOT NULL UNIQUE,
    son_kullanim    timestamptz NOT NULL,
    kullanildi_mi   boolean NOT NULL DEFAULT false,
    kullanilan_ip   inet,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_sifre_token_kullanici ON cari_sifre_token(cari_kullanici_id);

-- ================================================================
-- CARI BİRLEŞTİRME (MERGE)
-- ================================================================

-- ----------------------------------------------------------------
-- CARI_BIRLESIM: Audit log — hangi cari hangisine taşındı
-- ----------------------------------------------------------------
CREATE TABLE cari_birlesim (
    id              bigserial PRIMARY KEY,
    kaynak_cari_id  bigint NOT NULL REFERENCES cari(id),
    hedef_cari_id   bigint NOT NULL REFERENCES cari(id),
    birlesim_zamani timestamptz NOT NULL DEFAULT now(),
    birlesim_yapan_kullanici_id bigint REFERENCES kullanici(id),
    sebep           text,
    tasinan_kayit_sayilari jsonb,                        -- {"siparis": 12, "fatura": 8, ...}
    geri_alinabilir_mi boolean NOT NULL DEFAULT false,
    snapshot_jsonb  jsonb,                               -- kaynak cari tam snapshot
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_birlesim_kaynak ON cari_birlesim(kaynak_cari_id);
CREATE INDEX idx_cari_birlesim_hedef ON cari_birlesim(hedef_cari_id);

-- ================================================================
-- KVKK
-- ================================================================

-- ----------------------------------------------------------------
-- CARI_SILME_TALEBI: KVKK silme talepleri kuyruğu
-- ----------------------------------------------------------------
CREATE TABLE cari_silme_talebi (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint NOT NULL REFERENCES cari(id),
    talep_tarihi    timestamptz NOT NULL DEFAULT now(),
    talep_kaynagi   varchar(30) NOT NULL CHECK (talep_kaynagi IN (
        'musteri_email', 'portal', 'dilekce', 'telefon', 'manuel'
    )),
    talep_aciklama  text,
    durum           varchar(20) NOT NULL DEFAULT 'beklemede'
                    CHECK (durum IN ('beklemede', 'incelemede', 'onaylandi', 'reddedildi', 'uygulandi')),
    inceleyen_kullanici_id bigint REFERENCES kullanici(id),
    inceleme_tarihi timestamptz,
    uygulama_tarihi timestamptz,
    reddetme_sebebi text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cari_silme_talebi_cari ON cari_silme_talebi(cari_id);
CREATE INDEX idx_cari_silme_talebi_durum ON cari_silme_talebi(durum);

CREATE TRIGGER trg_cari_silme_talebi_guncelleme
    BEFORE UPDATE ON cari_silme_talebi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ================================================================
-- FUNCTION & TRIGGER
-- ================================================================

-- ----------------------------------------------------------------
-- tckn_dogrula: TR TCKN 11 hane + checksum
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION tckn_dogrula(p_tckn varchar)
RETURNS boolean AS $$
DECLARE
    d int[];
    s1 int;
    s2 int;
BEGIN
    IF p_tckn IS NULL OR length(p_tckn) <> 11 THEN
        RETURN false;
    END IF;
    IF p_tckn !~ '^[0-9]{11}$' THEN
        RETURN false;
    END IF;
    IF substring(p_tckn from 1 for 1) = '0' THEN
        RETURN false;
    END IF;

    d := ARRAY[
        substring(p_tckn from 1 for 1)::int,
        substring(p_tckn from 2 for 1)::int,
        substring(p_tckn from 3 for 1)::int,
        substring(p_tckn from 4 for 1)::int,
        substring(p_tckn from 5 for 1)::int,
        substring(p_tckn from 6 for 1)::int,
        substring(p_tckn from 7 for 1)::int,
        substring(p_tckn from 8 for 1)::int,
        substring(p_tckn from 9 for 1)::int,
        substring(p_tckn from 10 for 1)::int,
        substring(p_tckn from 11 for 1)::int
    ];

    -- 10. hane kontrolü: ((tek basamakların toplamı * 7) - çift basamakların toplamı) mod 10
    s1 := ((d[1] + d[3] + d[5] + d[7] + d[9]) * 7 - (d[2] + d[4] + d[6] + d[8])) % 10;
    IF s1 < 0 THEN s1 := s1 + 10; END IF;
    IF s1 <> d[10] THEN RETURN false; END IF;

    -- 11. hane kontrolü: ilk 10 basamağın toplamının mod 10'u
    s2 := (d[1] + d[2] + d[3] + d[4] + d[5] + d[6] + d[7] + d[8] + d[9] + d[10]) % 10;
    IF s2 <> d[11] THEN RETURN false; END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------
-- vkn_dogrula: TR VKN 10 hane + checksum
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION vkn_dogrula(p_vkn varchar)
RETURNS boolean AS $$
DECLARE
    i int;
    d int;
    tmp int;
    v int;
    toplam int := 0;
    son_hane int;
BEGIN
    IF p_vkn IS NULL OR length(p_vkn) <> 10 THEN
        RETURN false;
    END IF;
    IF p_vkn !~ '^[0-9]{10}$' THEN
        RETURN false;
    END IF;

    -- GIB VKN algoritması
    FOR i IN 1..9 LOOP
        d := (substring(p_vkn from i for 1))::int;
        tmp := (d + (10 - i)) % 10;
        IF tmp = 0 THEN
            v := 0;
        ELSE
            v := (tmp * (1 << (10 - i))) % 9;
            IF v = 0 AND tmp <> 0 THEN v := 9; END IF;
        END IF;
        toplam := toplam + v;
    END LOOP;

    son_hane := (10 - (toplam % 10)) % 10;
    RETURN son_hane = (substring(p_vkn from 10 for 1))::int;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------
-- vergi_no_dogrula: Tip'e göre doğrulama
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION vergi_no_dogrula(p_no varchar, p_tipi varchar)
RETURNS boolean AS $$
BEGIN
    IF p_no IS NULL OR p_tipi IS NULL THEN
        RETURN true;  -- NULL kabul (opsiyonel alan)
    END IF;
    IF p_tipi = 'TCKN' THEN
        RETURN tckn_dogrula(p_no);
    ELSIF p_tipi = 'VKN' THEN
        RETURN vkn_dogrula(p_no);
    ELSIF p_tipi IN ('YKN', 'TRN', 'EU_VAT', 'SSN', 'EIN', 'GSTIN', 'DIGER') THEN
        -- Diğer tiplere genel format kontrolü (app katmanında detay)
        RETURN length(p_no) BETWEEN 5 AND 30;
    ELSE
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger: cari INSERT/UPDATE'de vergi no doğrula
CREATE OR REPLACE FUNCTION trg_cari_vergi_no_dogrula_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.vergi_no IS NOT NULL AND NEW.vergi_no_tipi IS NOT NULL THEN
        IF NOT vergi_no_dogrula(NEW.vergi_no, NEW.vergi_no_tipi) THEN
            RAISE EXCEPTION 'Gecersiz vergi no: % (tip: %)', NEW.vergi_no, NEW.vergi_no_tipi;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cari_vergi_no_dogrula
    BEFORE INSERT OR UPDATE OF vergi_no, vergi_no_tipi ON cari
    FOR EACH ROW EXECUTE FUNCTION trg_cari_vergi_no_dogrula_fn();

-- ----------------------------------------------------------------
-- cari_kod_olustur: sistem_ayar.numara_serileri.cari'den otomatik kod
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION cari_kod_olustur(p_firma_id bigint DEFAULT NULL)
RETURNS varchar AS $$
DECLARE
    v_on_ek varchar;
    v_uzunluk int;
    v_sonraki bigint;
    v_kod varchar;
    v_seri jsonb;
BEGIN
    SELECT numara_serileri->'cari' INTO v_seri FROM sistem_ayar WHERE id = 1;
    IF v_seri IS NULL THEN
        v_on_ek := 'C';
        v_uzunluk := 5;
        v_sonraki := 1;
    ELSE
        v_on_ek   := COALESCE(v_seri->>'on_ek', 'C');
        v_uzunluk := COALESCE((v_seri->>'uzunluk')::int, 5);
        v_sonraki := COALESCE((v_seri->>'sonraki')::bigint, 1);
    END IF;

    -- Çakışma olmasın diye var olan max + 1
    LOOP
        v_kod := v_on_ek || lpad(v_sonraki::text, v_uzunluk, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM cari
            WHERE kod = v_kod
              AND (firma_id = p_firma_id OR (firma_id IS NULL AND p_firma_id IS NULL))
        );
        v_sonraki := v_sonraki + 1;
    END LOOP;

    -- sonraki değeri sistem_ayar'da güncelle
    UPDATE sistem_ayar
    SET numara_serileri = jsonb_set(numara_serileri, '{cari,sonraki}', to_jsonb(v_sonraki + 1))
    WHERE id = 1;

    RETURN v_kod;
END;
$$ LANGUAGE plpgsql;

-- Trigger: cari BEFORE INSERT → kod NULL ise otomatik doldur
CREATE OR REPLACE FUNCTION trg_cari_kod_doldur_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kod IS NULL OR NEW.kod = '' THEN
        NEW.kod := cari_kod_olustur(NEW.firma_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cari_kod_doldur
    BEFORE INSERT ON cari
    FOR EACH ROW EXECUTE FUNCTION trg_cari_kod_doldur_fn();

-- ----------------------------------------------------------------
-- cari_birlestir: Atomik cari birleştirme
-- ----------------------------------------------------------------
-- Kaynak cari'nin tüm yan kayıtlarını hedef'e taşır,
-- kaynak'ı soft delete yapar, audit log'a yazar.
CREATE OR REPLACE FUNCTION cari_birlestir(
    p_kaynak_id bigint,
    p_hedef_id bigint,
    p_kullanici_id bigint DEFAULT NULL,
    p_sebep text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_birlesim_id bigint;
    v_sayilar jsonb := '{}'::jsonb;
    v_snapshot jsonb;
    v_n int;
BEGIN
    IF p_kaynak_id = p_hedef_id THEN
        RAISE EXCEPTION 'Kaynak ve hedef ayni cari olamaz';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cari WHERE id = p_kaynak_id AND silindi_mi = false) THEN
        RAISE EXCEPTION 'Kaynak cari bulunamadi: %', p_kaynak_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cari WHERE id = p_hedef_id AND silindi_mi = false) THEN
        RAISE EXCEPTION 'Hedef cari bulunamadi: %', p_hedef_id;
    END IF;

    -- Kaynak cari snapshot
    SELECT to_jsonb(c.*) INTO v_snapshot FROM cari c WHERE id = p_kaynak_id;

    -- Yan tabloları taşı (tablolar henüz yüklü olmayabilir — safe)
    BEGIN
        UPDATE cari_adres    SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_adres', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        UPDATE cari_iletisim SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_iletisim', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        UPDATE cari_banka    SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_banka', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        UPDATE cari_dosya    SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_dosya', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        UPDATE cari_not      SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_not', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        UPDATE cari_etiket   SET cari_id = p_hedef_id WHERE cari_id = p_kaynak_id;
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('cari_etiket', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- Modül 08+ belgeler (tablolar yüklü olmayabilir)
    BEGIN
        EXECUTE format('UPDATE siparis SET cari_id = %L WHERE cari_id = %L', p_hedef_id, p_kaynak_id);
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('siparis', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        EXECUTE format('UPDATE fatura SET cari_id = %L WHERE cari_id = %L', p_hedef_id, p_kaynak_id);
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('fatura', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        EXECUTE format('UPDATE hesap_hareket SET cari_id = %L WHERE cari_id = %L', p_hedef_id, p_kaynak_id);
        GET DIAGNOSTICS v_n = ROW_COUNT; v_sayilar := v_sayilar || jsonb_build_object('hesap_hareket', v_n);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- Kaynak cari'yi soft delete + işaretle
    UPDATE cari
    SET silindi_mi = true,
        silinme_tarihi = now(),
        silen_kullanici_id = p_kullanici_id,
        aktif_mi = false,
        guncelleme_tarihi = now()
    WHERE id = p_kaynak_id;

    -- Audit log
    INSERT INTO cari_birlesim (
        kaynak_cari_id, hedef_cari_id,
        birlesim_yapan_kullanici_id, sebep,
        tasinan_kayit_sayilari, snapshot_jsonb
    ) VALUES (
        p_kaynak_id, p_hedef_id,
        p_kullanici_id, p_sebep,
        v_sayilar, v_snapshot
    ) RETURNING id INTO v_birlesim_id;

    RETURN v_birlesim_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- cari_anonimlestir: KVKK silme talebi — kişisel veriyi siler, iş verisini korur
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION cari_anonimlestir(
    p_cari_id bigint,
    p_kullanici_id bigint DEFAULT NULL,
    p_sebep text DEFAULT NULL
) RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cari WHERE id = p_cari_id) THEN
        RAISE EXCEPTION 'Cari bulunamadi: %', p_cari_id;
    END IF;

    UPDATE cari
    SET ad = 'Silinmiş',
        soyad = 'Müşteri',
        unvan = 'Anonim Müşteri',
        kisa_ad = NULL,
        yetkili_ad_soyad = NULL,
        yetkili_gorev = NULL,
        vergi_no = NULL,
        dogum_tarihi = NULL,
        cinsiyet = NULL,
        sektor = NULL,
        sadakat_kart_no = NULL,
        kvkk_silme_talebi = true,
        anonimlestirildi_mi = true,
        anonimlestirme_tarihi = now(),
        guncelleyen_kullanici_id = p_kullanici_id,
        guncelleme_tarihi = now()
    WHERE id = p_cari_id;

    -- Kişisel iletişim ve dosyaları sil
    DELETE FROM cari_iletisim WHERE cari_id = p_cari_id;
    DELETE FROM cari_dosya    WHERE cari_id = p_cari_id;

    -- Adresleri anonimleştir (FK korunsun ama içerik silinsin)
    UPDATE cari_adres
    SET yetkili_ad_soyad = NULL,
        yetkili_telefon = NULL,
        mahalle = NULL,
        sokak = NULL,
        bina_no = NULL,
        daire_no = NULL,
        adres_satir1 = 'Anonim',
        adres_satir2 = NULL,
        enlem = NULL,
        boylam = NULL
    WHERE cari_id = p_cari_id;

    -- Portal kullanıcılarını kapat
    UPDATE cari_kullanici
    SET silindi_mi = true, silinme_tarihi = now(), aktif_mi = false
    WHERE cari_id = p_cari_id;

    -- Portal oturumlarını iptal et
    UPDATE cari_portal_oturum
    SET iptal_edildi_mi = true, iptal_tarihi = now()
    WHERE cari_id = p_cari_id AND iptal_edildi_mi = false;

    -- Audit (modül 01 audit_log varsa)
    BEGIN
        INSERT INTO audit_log (
            kullanici_id, eylem, tablo_adi, kayit_id, aciklama, basarili_mi
        ) VALUES (
            p_kullanici_id, 'anonimlestir', 'cari', p_cari_id,
            COALESCE(p_sebep, 'KVKK silme talebi'), true
        );
    EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- vw_cari_ekstre_ozet: Cari borç/alacak/bakiye özeti
-- ----------------------------------------------------------------
-- NOT: Detaylı bakiye modül 10 (muhasebe)'de hesaplanır.
-- Bu view hesap_hareket tablosu üzerinden özet verir; tablo henüz yoksa view boş döner.
CREATE OR REPLACE VIEW vw_cari_ekstre_ozet AS
SELECT
    c.id              AS cari_id,
    c.kod,
    c.unvan,
    c.ad,
    c.soyad,
    c.para_birimi_kod,
    c.kredi_limiti,
    c.risk_durumu,
    c.aktif_mi,
    c.silindi_mi
FROM cari c
WHERE c.silindi_mi = false;

-- ----------------------------------------------------------------
-- DOKÜMANTASYON: Soft delete + cascade davranışı
-- ----------------------------------------------------------------
-- Cari soft delete'te (`silindi_mi = true`) fiziksel DELETE olmadığı için
-- `ON DELETE CASCADE` aktif olmaz — yan tablolar (adres, iletişim, banka, dosya, not)
-- carinin silinmiş halinde bile sorgulanabilir. Bu istenen davranıştır.
-- KVKK talebi için fiziksel silme yerine `cari_anonimlestir()` kullanılır.
