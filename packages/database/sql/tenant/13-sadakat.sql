-- ============================================================
-- MODUL 13: SADAKAT + HEDIYE KARTI
-- ============================================================
-- PHP v1'de yok. v2'de tam sadakat motoru + hediye karti.
--
-- Kapsam:
--   * Sadakat programi (tenant tek program + cok program desteklenir)
--   * Seviyeler (Bronze/Silver/Gold/Platinum) — esnek tanimlanir
--   * Puan kazanma/harcama kurallari (alisveris, kategori, urun, dogum gunu, referans, yorum)
--   * Puan hareket logu (immutable)
--   * Hediye karti tip + kart + hareket (fiziksel/dijital)
--   * Musteri yorumlari -> puan eslesmesi
--   * Atomik puan/hediye karti fonksiyonlari (race condition guvenli)
--   * Cron destekli son kullanma temizligi + seviye kontrolu
--
-- Entegrasyon:
--   * cari                 (modul 05) — sadakat musteriye baglanir
--   * kullanici             (modul 01) — puan hareketi kim yaptiysa
--   * siparis / fatura      (modul 08) — alisveris -> kazanim trigger kaynagi
--   * para_birimi           (modul 02) — harcama / hediye karti tutari para biriminde
--   * urun / kategori       (modul 06) — kategori/urun spesifik kurallar
--   * hesap_hareket         (modul 09) — hediye karti kullanimi odeme sayilir (app katmani)
--
-- Tasarim kararlari:
--   1) Puan int (bigint) olarak tutulur — ondalik puan yok (5.3 puan anlamsiz).
--   2) Her hareket immutable (trg_musteri_puan_hareket_immutable UPDATE/DELETE engeller).
--   3) musteri_sadakat.mevcut_puan trigger ile senkron (tek kaynak hareket tablosu olsa da
--      LIST sorgusu icin materialize edilir).
--   4) Hediye karti PIN plain text YASAK — pin_hash (argon2/bcrypt) zorunlu.
--   5) Hediye karti bakiyesi numeric(18, 4) + para birimi zorunlu (cok para desteklenir).
--   6) "Dogrulanmis alici mi" yorum puani icin sart — sahte puan istismari engeli.
--   7) Seviye dususu kural: yillik_harcama son 365 gune bakar (cron job kontrol eder).
--   8) Puan son kullanma FIFO'dan cok kural bazli: her hareketin kendi son_kullanma_tarihi.
-- ============================================================


-- ----------------------------------------------------------------
-- SADAKAT_PROGRAM: Tenant'in sadakat programi tanimi
-- Cogu tenant tek program yurutur ama birden fazla mumkun
-- (ornek: "B2B VIP" + "Perakende Puan").
-- ----------------------------------------------------------------
CREATE TABLE sadakat_program (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod                 varchar(50) UNIQUE NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    -- Uygulanabilirlik
    uygulanir_satis_kanallari text[] NOT NULL DEFAULT ARRAY['perakende', 'eticaret', 'b2b']::text[],
    -- Puan taban kurali (her alisveriste default kazanim)
    taban_kazanim_orani numeric(9, 4) NOT NULL DEFAULT 0,   -- 1 TL = X puan
    taban_kazanim_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Puan 1 birimi kac TL eder (harcama oraninin default'u)
    varsayilan_puan_degeri numeric(18, 4) NOT NULL DEFAULT 0.01,
    varsayilan_puan_para_birimi char(3) NOT NULL DEFAULT 'TRY' REFERENCES para_birimi(kod),
    -- Puan omur suresi (NULL = sonsuz)
    puan_gecerlilik_gun int,
    -- Program donemi
    baslangic_tarihi    date NOT NULL DEFAULT CURRENT_DATE,
    bitis_tarihi        date,
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    varsayilan_mi       boolean NOT NULL DEFAULT false,
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    silinme_tarihi      timestamptz,
    silen_kullanici_id  bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (bitis_tarihi IS NULL OR bitis_tarihi >= baslangic_tarihi),
    CHECK (taban_kazanim_orani >= 0),
    CHECK (varsayilan_puan_degeri >= 0)
);
CREATE UNIQUE INDEX unq_sadakat_program_varsayilan
    ON sadakat_program (varsayilan_mi)
    WHERE varsayilan_mi = true AND silindi_mi = false;
CREATE INDEX idx_sadakat_program_aktif ON sadakat_program (aktif_mi) WHERE silindi_mi = false;

CREATE TRIGGER trg_sadakat_program_guncelleme
    BEFORE UPDATE ON sadakat_program
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- SADAKAT_SEVIYE: Bronze, Silver, Gold, Platinum — tenant ozelinde
-- Seviye atlama kriteri: min_puan VEYA min_yillik_harcama (her ikisi de saglaninca)
-- ----------------------------------------------------------------
CREATE TABLE sadakat_seviye (
    id                  bigserial PRIMARY KEY,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE CASCADE,
    kod                 varchar(50) NOT NULL,
    ad                  varchar(100) NOT NULL,
    sira                smallint NOT NULL,                  -- 1=en dusuk, 10=en yuksek
    -- Esik kriterleri
    min_puan            bigint NOT NULL DEFAULT 0,
    min_yillik_harcama  numeric(18, 4) NOT NULL DEFAULT 0,
    min_yillik_harcama_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Avantajlar
    indirim_orani       numeric(5, 2) NOT NULL DEFAULT 0,   -- %
    ekstra_puan_carpani numeric(5, 2) NOT NULL DEFAULT 1,   -- 1.5 = %50 bonus
    -- Ek ozellikler (ucretsiz_kargo, vip_destek, vb.)
    ozellikler          jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Gorsel
    renk                varchar(20),                         -- hex
    ikon                varchar(50),
    aciklama            text,
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (program_id, kod),
    UNIQUE (program_id, sira),
    CHECK (min_puan >= 0),
    CHECK (min_yillik_harcama >= 0),
    CHECK (indirim_orani BETWEEN 0 AND 100),
    CHECK (ekstra_puan_carpani >= 0)
);
CREATE INDEX idx_sadakat_seviye_program ON sadakat_seviye (program_id);

CREATE TRIGGER trg_sadakat_seviye_guncelleme
    BEFORE UPDATE ON sadakat_seviye
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- MUSTERI_SADAKAT: Cari'nin sadakat durumu (bir cari, bir program, bir satir)
-- mevcut_puan = SUM(musteri_puan_hareket.puan_miktar) — trigger ile senkron.
-- ----------------------------------------------------------------
CREATE TABLE musteri_sadakat (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id             bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE RESTRICT,
    seviye_id           bigint REFERENCES sadakat_seviye(id),
    -- Canli bakiye (trigger ile senkron)
    mevcut_puan         bigint NOT NULL DEFAULT 0,
    toplam_kazanilan_puan bigint NOT NULL DEFAULT 0,
    toplam_harcanan_puan bigint NOT NULL DEFAULT 0,
    toplam_iptal_puan   bigint NOT NULL DEFAULT 0,
    -- Yillik harcama (seviye kontrol icin — cron guncellenir)
    yillik_harcama_tutar numeric(18, 4) NOT NULL DEFAULT 0,
    yillik_harcama_para_birimi char(3) REFERENCES para_birimi(kod),
    yillik_harcama_son_hesap_tarihi timestamptz,
    -- Seviye takibi
    son_seviye_degisim_tarihi timestamptz,
    bir_sonraki_seviye_id bigint REFERENCES sadakat_seviye(id),
    bir_sonraki_seviye_icin_eksik_puan bigint,
    bir_sonraki_seviye_icin_eksik_harcama numeric(18, 4),
    -- Kart
    kart_no             varchar(50) UNIQUE,
    kart_basim_tarihi   date,
    -- Durum
    aktif_mi            boolean NOT NULL DEFAULT true,
    dondurulmus_mu      boolean NOT NULL DEFAULT false,     -- sikayet/iade gibi durumlarda
    dondurma_sebep      text,
    -- Audit
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cari_id, program_id),
    CHECK (mevcut_puan >= 0),
    CHECK (toplam_kazanilan_puan >= 0),
    CHECK (toplam_harcanan_puan >= 0)
);
CREATE INDEX idx_musteri_sadakat_cari ON musteri_sadakat (cari_id);
CREATE INDEX idx_musteri_sadakat_program_seviye ON musteri_sadakat (program_id, seviye_id);
CREATE INDEX idx_musteri_sadakat_kart_no ON musteri_sadakat (kart_no) WHERE kart_no IS NOT NULL;

CREATE TRIGGER trg_musteri_sadakat_guncelleme
    BEFORE UPDATE ON musteri_sadakat
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- PUAN_KAZANMA_KURALI: Hangi durumda kac puan kazanilir
-- ----------------------------------------------------------------
CREATE TABLE puan_kazanma_kurali (
    id                  bigserial PRIMARY KEY,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE CASCADE,
    kod                 varchar(50) NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    -- Kosul tipi
    kosul_tipi          varchar(30) NOT NULL CHECK (kosul_tipi IN (
        'alisveris_tutari',     -- Her X TL = Y puan (varsayilan)
        'kategori_alisveris',   -- Belirli kategoride alisveris
        'urun_alisveris',       -- Belirli urun/varyant alisverisi
        'dogum_gunu',           -- Dogum gunu hediyesi
        'referans',             -- Musteri referansi (arkadasini getirdi)
        'degerlendirme',        -- Urun/siparis yorumu
        'ilk_alisveris',        -- Kayit sonrasi ilk siparis
        'kayit_bonus',          -- Sadece kayit olma
        'manuel'                -- Operator manuel ekler
    )),
    -- Kosul detaylari JSON — esnek
    -- ornek: {"kategori_ids": [4, 7], "minimum_tutar": 100, "para_birimi": "TRY"}
    kosul_jsonb         jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Kazanim tipi
    kazanim_tipi        varchar(20) NOT NULL CHECK (kazanim_tipi IN (
        'sabit_puan',           -- X puan ver
        'oran_puan',            -- Tutarin %X kadari puan (1 TL = 0.05 puan gibi)
        'carpan_puan'           -- Normal kazanimi X kat (2x etkinlik gunu)
    )),
    kazanim_deger       numeric(18, 4) NOT NULL,
    -- Sinirlar
    maksimum_puan_tek_islem bigint,                          -- bir siparis basi cap
    maksimum_puan_kullanim_basi_cari bigint,                 -- bir musteri kurali kac kere alabilir
    -- Gecerlilik
    gecerli_baslangic   timestamptz NOT NULL DEFAULT now(),
    gecerli_bitis       timestamptz,
    -- Uygulanacak seviye filtresi (NULL = tum seviyeler)
    uygulanir_seviye_idler bigint[],
    -- Oncelik (kural catismasinda buyuk oncelik kazanir)
    oncelik             int NOT NULL DEFAULT 100,
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (program_id, kod),
    CHECK (kazanim_deger >= 0),
    CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic)
);
CREATE INDEX idx_puan_kazanma_kurali_program_aktif
    ON puan_kazanma_kurali (program_id, aktif_mi)
    WHERE aktif_mi = true;
CREATE INDEX idx_puan_kazanma_kurali_kosul_tipi ON puan_kazanma_kurali (kosul_tipi);

CREATE TRIGGER trg_puan_kazanma_kurali_guncelleme
    BEFORE UPDATE ON puan_kazanma_kurali
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- PUAN_HARCAMA_KURALI: Puan nasil harcanir (indirim/kargo/hediye)
-- ----------------------------------------------------------------
CREATE TABLE puan_harcama_kurali (
    id                  bigserial PRIMARY KEY,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE CASCADE,
    kod                 varchar(50) NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    -- Harcama tipi
    harcama_tipi        varchar(30) NOT NULL CHECK (harcama_tipi IN (
        'indirim',              -- Siparis toplam indirim
        'urun_hediye',          -- Belirli urunu puan ile al
        'kargo_iptal',          -- Kargo ucretini puan ile sifirla
        'hediye_karti_yukleme'  -- Puan -> hediye karti bakiyesi
    )),
    -- 1 puan = kac TL (harcama oraninin kural bazli override'i)
    puan_degeri         numeric(18, 4) NOT NULL,
    puan_degeri_para_birimi char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Minimum/maksimum
    minimum_harcama_puan bigint NOT NULL DEFAULT 1,
    maksimum_harcama_puan bigint,
    minimum_siparis_tutari numeric(18, 4),
    minimum_siparis_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Siparis basi indirim sinir (siparis tutarinin %X'inden fazlasi kapatilmasin)
    maksimum_siparis_kapatma_orani numeric(5, 2),
    -- Uygunluk filtreleri
    uygulanir_kategori_idler bigint[],
    uygulanir_urun_varyant_idler bigint[],
    kosul_jsonb         jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Gecerlilik
    gecerli_baslangic   timestamptz NOT NULL DEFAULT now(),
    gecerli_bitis       timestamptz,
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (program_id, kod),
    CHECK (puan_degeri > 0),
    CHECK (minimum_harcama_puan > 0),
    CHECK (maksimum_siparis_kapatma_orani IS NULL OR maksimum_siparis_kapatma_orani BETWEEN 0 AND 100)
);
CREATE INDEX idx_puan_harcama_kurali_program_aktif
    ON puan_harcama_kurali (program_id, aktif_mi)
    WHERE aktif_mi = true;

CREATE TRIGGER trg_puan_harcama_kurali_guncelleme
    BEFORE UPDATE ON puan_harcama_kurali
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- MUSTERI_PUAN_HAREKET: Tum puan giris/cikis logu (IMMUTABLE)
-- Bu tablo tek dogruluk kaynagi. musteri_sadakat.mevcut_puan bundan turer.
-- ----------------------------------------------------------------
CREATE TABLE musteri_puan_hareket (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id             bigint NOT NULL REFERENCES cari(id) ON DELETE RESTRICT,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE RESTRICT,
    musteri_sadakat_id  bigint NOT NULL REFERENCES musteri_sadakat(id) ON DELETE RESTRICT,
    -- Hareket tipi
    hareket_tipi        varchar(30) NOT NULL CHECK (hareket_tipi IN (
        'kazanim',              -- + alisveristen kazanilan
        'bonus',                -- + ekstra bonus (kampanya, dogum gunu)
        'harcama',              -- - kullanildi
        'iade',                 -- + siparis iade edildiginde harcanan puan geri yuklenir
        'kazanim_iptal',        -- - siparis iptal edildiginde kazanilan puan silinir
        'manuel_ekleme',        -- + operator ekledi (sikayet telafi vb.)
        'manuel_silme',         -- - operator sildi
        'son_kullanma',         -- - cron: suresi gecti
        'transfer_giris',       -- + kardes karta transfer (opsiyonel)
        'transfer_cikis'        -- - kardes karta transfer
    )),
    -- Miktar: + giris, - cikis (isaretli)
    puan_miktar         bigint NOT NULL,
    oncesi_bakiye       bigint NOT NULL,
    sonrasi_bakiye      bigint NOT NULL,
    -- Kaynak belge
    kaynak_belge_tipi   varchar(30) CHECK (kaynak_belge_tipi IN (
        'siparis', 'fatura', 'iade', 'manuel', 'kampanya',
        'dogum_gunu', 'referans', 'yorum', 'kayit', 'transfer',
        'cron_son_kullanma', 'hediye_karti_yukleme'
    )),
    kaynak_belge_id     bigint,
    kural_id            bigint REFERENCES puan_kazanma_kurali(id),
    harcama_kural_id    bigint REFERENCES puan_harcama_kurali(id),
    -- Son kullanma (sadece kazanim hareketleri icin)
    son_kullanma_tarihi timestamptz,
    -- Iptal/iade takibi
    iptal_edildi_mi     boolean NOT NULL DEFAULT false,
    iptal_hareket_id    bigint REFERENCES musteri_puan_hareket(id),
    -- Metadata
    aciklama            text,
    metadata            jsonb,
    -- Audit
    kullanici_id        bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    CHECK (puan_miktar <> 0),
    CHECK (sonrasi_bakiye = oncesi_bakiye + puan_miktar),
    CHECK (sonrasi_bakiye >= 0)
);
CREATE INDEX idx_musteri_puan_hareket_cari_tarih
    ON musteri_puan_hareket (cari_id, olusturma_tarihi DESC);
CREATE INDEX idx_musteri_puan_hareket_sadakat
    ON musteri_puan_hareket (musteri_sadakat_id, olusturma_tarihi DESC);
CREATE INDEX idx_musteri_puan_hareket_tip ON musteri_puan_hareket (hareket_tipi);
CREATE INDEX idx_musteri_puan_hareket_kaynak
    ON musteri_puan_hareket (kaynak_belge_tipi, kaynak_belge_id);
CREATE INDEX idx_musteri_puan_hareket_son_kullanma
    ON musteri_puan_hareket (son_kullanma_tarihi)
    WHERE son_kullanma_tarihi IS NOT NULL AND iptal_edildi_mi = false;


-- ----------------------------------------------------------------
-- TRIGGER: musteri_puan_hareket IMMUTABLE
-- Log tablosu update/delete edilemez — audit butunlugu.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION musteri_puan_hareket_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'musteri_puan_hareket tablosu immutable: % yapilamaz (id=%)',
        TG_OP, COALESCE(OLD.id, NEW.id);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_musteri_puan_hareket_update_engel
    BEFORE UPDATE OF puan_miktar, oncesi_bakiye, sonrasi_bakiye, hareket_tipi, cari_id
    ON musteri_puan_hareket
    FOR EACH ROW EXECUTE FUNCTION musteri_puan_hareket_immutable();

CREATE TRIGGER trg_musteri_puan_hareket_delete_engel
    BEFORE DELETE ON musteri_puan_hareket
    FOR EACH ROW EXECUTE FUNCTION musteri_puan_hareket_immutable();


-- ----------------------------------------------------------------
-- MUSTERI_SEVIYE_GECMIS: Seviye degisim logu
-- ----------------------------------------------------------------
CREATE TABLE musteri_seviye_gecmis (
    id                  bigserial PRIMARY KEY,
    musteri_sadakat_id  bigint NOT NULL REFERENCES musteri_sadakat(id) ON DELETE CASCADE,
    cari_id             bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    eski_seviye_id      bigint REFERENCES sadakat_seviye(id),
    yeni_seviye_id      bigint NOT NULL REFERENCES sadakat_seviye(id),
    degisim_tipi        varchar(20) NOT NULL CHECK (degisim_tipi IN ('yukselme', 'dusus', 'baslangic', 'manuel')),
    sebep               text,
    mevcut_puan_snapshot bigint,
    yillik_harcama_snapshot numeric(18, 4),
    kullanici_id        bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_musteri_seviye_gecmis_cari_tarih
    ON musteri_seviye_gecmis (cari_id, olusturma_tarihi DESC);


-- ----------------------------------------------------------------
-- HEDIYE_KARTI_TIP: Hediye karti sablonu (500 TL, 1000 TL, vb.)
-- ----------------------------------------------------------------
CREATE TABLE hediye_karti_tip (
    id                  bigserial PRIMARY KEY,
    kod                 varchar(50) UNIQUE NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    -- Gorsel
    gorsel_url          text,
    tema                varchar(50),                         -- 'dogum_gunu', 'sevgililer', vb.
    -- Varsayilanlar
    varsayilan_tutar    numeric(18, 4),
    varsayilan_para_birimi char(3) NOT NULL REFERENCES para_birimi(kod),
    varsayilan_gecerlilik_gun int NOT NULL DEFAULT 365,
    -- Sinirlar
    minimum_tutar       numeric(18, 4),
    maksimum_tutar      numeric(18, 4),
    yeniden_yuklenebilir_mi boolean NOT NULL DEFAULT false,  -- kalan_bakiye 0 olunca tekrar yuklenebilir mi
    transfer_edilebilir_mi boolean NOT NULL DEFAULT true,    -- alici_cari degisebilir mi
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (minimum_tutar IS NULL OR minimum_tutar >= 0),
    CHECK (maksimum_tutar IS NULL OR maksimum_tutar >= COALESCE(minimum_tutar, 0)),
    CHECK (varsayilan_gecerlilik_gun > 0)
);

CREATE TRIGGER trg_hediye_karti_tip_guncelleme
    BEFORE UPDATE ON hediye_karti_tip
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- HEDIYE_KARTI: Fiziksel/dijital hediye karti
-- PIN plain text YASAK. Kontrol icin hediye_karti_kullan() fonksiyonu.
-- ----------------------------------------------------------------
CREATE TABLE hediye_karti (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    -- Tanim
    kart_no             varchar(50) UNIQUE NOT NULL,         -- okunabilir kod: "HDY-XXXX-XXXX"
    pin_hash            varchar(255) NOT NULL,               -- argon2/bcrypt
    tip_id              bigint NOT NULL REFERENCES hediye_karti_tip(id),
    -- Tutar/bakiye
    baslangic_tutar     numeric(18, 4) NOT NULL,
    kalan_bakiye        numeric(18, 4) NOT NULL,
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Durum
    durum               varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'beklemede',            -- Olusturuldu, henuz aktive edilmedi
        'aktif',                -- Kullanilabilir
        'kullanildi',           -- Bakiye 0
        'iptal',                -- Operator iptal etti
        'son_kullanma',         -- Suresi gecti
        'calinti_bildirildi',   -- Musteri kayip/calinti bildirdi
        'dondurulmus'           -- Gecici dondurma
    )),
    -- Alici/satin alan
    satin_alan_cari_id  bigint REFERENCES cari(id),
    alici_cari_id       bigint REFERENCES cari(id),
    alici_ad_soyad      varchar(200),
    alici_email         citext,
    alici_telefon       varchar(30),
    mesaj               text,
    -- Satildigi belge
    satildigi_belge_tipi varchar(30) CHECK (satildigi_belge_tipi IN ('siparis', 'fatura', 'manuel')),
    satildigi_belge_id  bigint,
    -- Tarihler
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    aktivasyon_tarihi   timestamptz,
    son_kullanma_tarihi timestamptz NOT NULL,
    ilk_kullanim_tarihi timestamptz,
    son_kullanim_tarihi timestamptz,
    -- Fiziksel/dijital
    kart_fiziksel_mi    boolean NOT NULL DEFAULT false,
    teslim_adresi_id    bigint REFERENCES cari_adres(id),
    -- Hatali PIN sayaci
    hatali_pin_sayisi   int NOT NULL DEFAULT 0,
    son_hatali_pin_tarihi timestamptz,
    kilitli_son         timestamptz,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    iptal_eden_kullanici_id bigint REFERENCES kullanici(id),
    iptal_sebep         text,
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (baslangic_tutar > 0),
    CHECK (kalan_bakiye >= 0),
    CHECK (kalan_bakiye <= baslangic_tutar * 10),           -- reloadable olsa bile mantiksiz uzak ucu kapatir
    CHECK (son_kullanma_tarihi > olusturma_tarihi)
);
CREATE INDEX idx_hediye_karti_durum ON hediye_karti (durum);
CREATE INDEX idx_hediye_karti_alici ON hediye_karti (alici_cari_id) WHERE alici_cari_id IS NOT NULL;
CREATE INDEX idx_hediye_karti_satin_alan ON hediye_karti (satin_alan_cari_id);
CREATE INDEX idx_hediye_karti_son_kullanma ON hediye_karti (son_kullanma_tarihi) WHERE durum = 'aktif';

CREATE TRIGGER trg_hediye_karti_guncelleme
    BEFORE UPDATE ON hediye_karti
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- HEDIYE_KARTI_HAREKET: Bakiye hareketleri (IMMUTABLE)
-- ----------------------------------------------------------------
CREATE TABLE hediye_karti_hareket (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    hediye_karti_id     bigint NOT NULL REFERENCES hediye_karti(id) ON DELETE RESTRICT,
    hareket_tipi        varchar(20) NOT NULL CHECK (hareket_tipi IN (
        'yukleme',              -- + ilk yukleme veya reload
        'kullanim',             -- - odeme olarak kullanildi
        'iade',                 -- + siparis iade edildiginde bakiye geri
        'iptal',                -- - kart iptal, bakiye sifirlandi
        'son_kullanma',         -- - cron
        'transfer_giris',       -- + baska karttan aktarildi
        'transfer_cikis',       -- - baska karta aktarildi
        'duzeltme'              -- +/- operator manuel
    )),
    tutar               numeric(18, 4) NOT NULL,             -- + veya - isaretli
    oncesi_bakiye       numeric(18, 4) NOT NULL,
    sonrasi_bakiye      numeric(18, 4) NOT NULL,
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Kaynak belge (kullanim icin siparis/fatura)
    kaynak_belge_tipi   varchar(30) CHECK (kaynak_belge_tipi IN (
        'siparis', 'fatura', 'iade', 'manuel', 'cron', 'transfer'
    )),
    kaynak_belge_id     bigint,
    -- Audit
    kullanici_id        bigint REFERENCES kullanici(id),
    ip_adresi           inet,
    aciklama            text,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    CHECK (tutar <> 0),
    CHECK (sonrasi_bakiye = oncesi_bakiye + tutar),
    CHECK (sonrasi_bakiye >= 0)
);
CREATE INDEX idx_hediye_karti_hareket_kart_tarih
    ON hediye_karti_hareket (hediye_karti_id, olusturma_tarihi DESC);
CREATE INDEX idx_hediye_karti_hareket_kaynak
    ON hediye_karti_hareket (kaynak_belge_tipi, kaynak_belge_id);


-- ----------------------------------------------------------------
-- TRIGGER: hediye_karti_hareket IMMUTABLE
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hediye_karti_hareket_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'hediye_karti_hareket tablosu immutable: % yapilamaz', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hediye_karti_hareket_update_engel
    BEFORE UPDATE OF tutar, oncesi_bakiye, sonrasi_bakiye, hareket_tipi
    ON hediye_karti_hareket
    FOR EACH ROW EXECUTE FUNCTION hediye_karti_hareket_immutable();

CREATE TRIGGER trg_hediye_karti_hareket_delete_engel
    BEFORE DELETE ON hediye_karti_hareket
    FOR EACH ROW EXECUTE FUNCTION hediye_karti_hareket_immutable();


-- ----------------------------------------------------------------
-- YORUM_PUAN_ESLESME: Yorum -> puan kural tablosu
-- ----------------------------------------------------------------
CREATE TABLE yorum_puan_eslesme (
    id                  bigserial PRIMARY KEY,
    program_id          bigint NOT NULL REFERENCES sadakat_program(id) ON DELETE CASCADE,
    -- Hedef (NULL = genel)
    kategori_id         bigint REFERENCES kategori(id),
    urun_id             bigint REFERENCES urun(id),
    -- Kazanim
    puan_miktari        bigint NOT NULL CHECK (puan_miktari > 0),
    -- Kisit
    dogrulanmis_alici_mi boolean NOT NULL DEFAULT true,     -- sadece gercek alicilar
    minimum_yorum_uzunluk int NOT NULL DEFAULT 20,
    minimum_resim_sayisi int NOT NULL DEFAULT 0,
    maksimum_yorum_basi_cari int NOT NULL DEFAULT 1,        -- ayni urune kac yorum puanli
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (kategori_id IS NULL OR urun_id IS NULL)           -- ikisi birden olmasin
);
CREATE INDEX idx_yorum_puan_eslesme_program ON yorum_puan_eslesme (program_id);
CREATE INDEX idx_yorum_puan_eslesme_kategori ON yorum_puan_eslesme (kategori_id) WHERE kategori_id IS NOT NULL;
CREATE INDEX idx_yorum_puan_eslesme_urun ON yorum_puan_eslesme (urun_id) WHERE urun_id IS NOT NULL;

CREATE TRIGGER trg_yorum_puan_eslesme_guncelleme
    BEFORE UPDATE ON yorum_puan_eslesme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ============================================================
-- FONKSIYONLAR
-- ============================================================


-- ----------------------------------------------------------------
-- musteri_sadakat_getir_veya_olustur
-- Cari icin varsayilan programa ait sadakat kaydi yoksa olusturur.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION musteri_sadakat_getir_veya_olustur(
    p_cari_id bigint,
    p_program_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_program_id bigint;
    v_sadakat_id bigint;
    v_baslangic_seviye_id bigint;
BEGIN
    -- Program belirle
    IF p_program_id IS NULL THEN
        SELECT id INTO v_program_id
        FROM sadakat_program
        WHERE varsayilan_mi = true AND aktif_mi = true AND silindi_mi = false
        LIMIT 1;
        IF v_program_id IS NULL THEN
            RAISE EXCEPTION 'Varsayilan sadakat programi bulunamadi';
        END IF;
    ELSE
        v_program_id := p_program_id;
    END IF;

    -- Mevcut kayit?
    SELECT id INTO v_sadakat_id
    FROM musteri_sadakat
    WHERE cari_id = p_cari_id AND program_id = v_program_id;

    IF v_sadakat_id IS NOT NULL THEN
        RETURN v_sadakat_id;
    END IF;

    -- En dusuk seviye
    SELECT id INTO v_baslangic_seviye_id
    FROM sadakat_seviye
    WHERE program_id = v_program_id AND aktif_mi = true
    ORDER BY sira ASC
    LIMIT 1;

    INSERT INTO musteri_sadakat (
        cari_id, program_id, seviye_id, mevcut_puan,
        son_seviye_degisim_tarihi
    ) VALUES (
        p_cari_id, v_program_id, v_baslangic_seviye_id, 0,
        now()
    ) RETURNING id INTO v_sadakat_id;

    IF v_baslangic_seviye_id IS NOT NULL THEN
        INSERT INTO musteri_seviye_gecmis (
            musteri_sadakat_id, cari_id, eski_seviye_id, yeni_seviye_id,
            degisim_tipi, sebep
        ) VALUES (
            v_sadakat_id, p_cari_id, NULL, v_baslangic_seviye_id,
            'baslangic', 'Ilk kayit'
        );
    END IF;

    RETURN v_sadakat_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- puan_kazandir: Atomik kazanim
-- Sadakat kaydini kilitler, hareket ekler, bakiyeyi gunceller.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION puan_kazandir(
    p_cari_id bigint,
    p_puan bigint,
    p_hareket_tipi varchar DEFAULT 'kazanim',
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_kural_id bigint DEFAULT NULL,
    p_son_kullanma_tarihi timestamptz DEFAULT NULL,
    p_aciklama text DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_program_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_sadakat_id bigint;
    v_program_id bigint;
    v_oncesi bigint;
    v_sonrasi bigint;
    v_hareket_id bigint;
    v_son_kullanma timestamptz;
    v_gecerlilik_gun int;
BEGIN
    IF p_puan <= 0 THEN
        RAISE EXCEPTION 'puan_kazandir: puan pozitif olmali (verilen: %)', p_puan;
    END IF;

    IF p_hareket_tipi NOT IN ('kazanim', 'bonus', 'iade', 'manuel_ekleme', 'transfer_giris') THEN
        RAISE EXCEPTION 'puan_kazandir: gecersiz hareket_tipi %', p_hareket_tipi;
    END IF;

    v_sadakat_id := musteri_sadakat_getir_veya_olustur(p_cari_id, p_program_id);

    -- Satir kilit
    SELECT ms.mevcut_puan, ms.program_id
      INTO v_oncesi, v_program_id
    FROM musteri_sadakat ms
    WHERE ms.id = v_sadakat_id
    FOR UPDATE;

    IF v_oncesi IS NULL THEN
        v_oncesi := 0;
    END IF;

    v_sonrasi := v_oncesi + p_puan;

    -- Son kullanma tarihi hesapla
    IF p_son_kullanma_tarihi IS NOT NULL THEN
        v_son_kullanma := p_son_kullanma_tarihi;
    ELSE
        SELECT puan_gecerlilik_gun INTO v_gecerlilik_gun
        FROM sadakat_program WHERE id = v_program_id;
        IF v_gecerlilik_gun IS NOT NULL THEN
            v_son_kullanma := now() + (v_gecerlilik_gun || ' days')::interval;
        END IF;
    END IF;

    -- Hareket ekle
    INSERT INTO musteri_puan_hareket (
        cari_id, program_id, musteri_sadakat_id,
        hareket_tipi, puan_miktar, oncesi_bakiye, sonrasi_bakiye,
        kaynak_belge_tipi, kaynak_belge_id, kural_id,
        son_kullanma_tarihi, aciklama, kullanici_id
    ) VALUES (
        p_cari_id, v_program_id, v_sadakat_id,
        p_hareket_tipi, p_puan, v_oncesi, v_sonrasi,
        p_kaynak_belge_tipi, p_kaynak_belge_id, p_kural_id,
        v_son_kullanma, p_aciklama, p_kullanici_id
    ) RETURNING id INTO v_hareket_id;

    -- Sadakat bakiyesi guncelle
    UPDATE musteri_sadakat
    SET mevcut_puan = v_sonrasi,
        toplam_kazanilan_puan = toplam_kazanilan_puan + p_puan,
        guncelleme_tarihi = now()
    WHERE id = v_sadakat_id;

    -- Seviye kontrolu
    PERFORM musteri_seviye_kontrol(p_cari_id, v_program_id);

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- puan_harcat: Atomik harcama
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION puan_harcat(
    p_cari_id bigint,
    p_puan bigint,
    p_hareket_tipi varchar DEFAULT 'harcama',
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_harcama_kural_id bigint DEFAULT NULL,
    p_aciklama text DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_program_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_sadakat_id bigint;
    v_program_id bigint;
    v_oncesi bigint;
    v_sonrasi bigint;
    v_hareket_id bigint;
    v_dondurulmus boolean;
BEGIN
    IF p_puan <= 0 THEN
        RAISE EXCEPTION 'puan_harcat: puan pozitif olmali';
    END IF;

    IF p_hareket_tipi NOT IN ('harcama', 'kazanim_iptal', 'manuel_silme', 'son_kullanma', 'transfer_cikis') THEN
        RAISE EXCEPTION 'puan_harcat: gecersiz hareket_tipi %', p_hareket_tipi;
    END IF;

    v_sadakat_id := musteri_sadakat_getir_veya_olustur(p_cari_id, p_program_id);

    SELECT ms.mevcut_puan, ms.program_id, ms.dondurulmus_mu
      INTO v_oncesi, v_program_id, v_dondurulmus
    FROM musteri_sadakat ms
    WHERE ms.id = v_sadakat_id
    FOR UPDATE;

    IF COALESCE(v_dondurulmus, false) AND p_hareket_tipi = 'harcama' THEN
        RAISE EXCEPTION 'Sadakat hesabi dondurulmus, puan harcanamaz';
    END IF;

    IF v_oncesi < p_puan THEN
        RAISE EXCEPTION 'Yetersiz puan: cari=%, mevcut=%, istenen=%',
            p_cari_id, v_oncesi, p_puan;
    END IF;

    v_sonrasi := v_oncesi - p_puan;

    INSERT INTO musteri_puan_hareket (
        cari_id, program_id, musteri_sadakat_id,
        hareket_tipi, puan_miktar, oncesi_bakiye, sonrasi_bakiye,
        kaynak_belge_tipi, kaynak_belge_id, harcama_kural_id,
        aciklama, kullanici_id
    ) VALUES (
        p_cari_id, v_program_id, v_sadakat_id,
        p_hareket_tipi, -p_puan, v_oncesi, v_sonrasi,
        p_kaynak_belge_tipi, p_kaynak_belge_id, p_harcama_kural_id,
        p_aciklama, p_kullanici_id
    ) RETURNING id INTO v_hareket_id;

    UPDATE musteri_sadakat
    SET mevcut_puan = v_sonrasi,
        toplam_harcanan_puan = toplam_harcanan_puan + p_puan,
        guncelleme_tarihi = now()
    WHERE id = v_sadakat_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- musteri_seviye_kontrol: Seviye yukselme/dusurme degerlendirme
-- Cron'dan veya puan_kazandir sonunda cagrilir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION musteri_seviye_kontrol(
    p_cari_id bigint,
    p_program_id bigint DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_sadakat_id bigint;
    v_program_id bigint;
    v_mevcut_puan bigint;
    v_yillik_harcama numeric(18, 4);
    v_eski_seviye_id bigint;
    v_yeni_seviye_id bigint;
    v_yeni_seviye_sira smallint;
    v_eski_seviye_sira smallint;
    v_degisim_tipi varchar(20);
BEGIN
    IF p_program_id IS NULL THEN
        SELECT id INTO p_program_id
        FROM sadakat_program WHERE varsayilan_mi = true AND aktif_mi = true
        LIMIT 1;
    END IF;

    SELECT id, mevcut_puan, yillik_harcama_tutar, seviye_id
      INTO v_sadakat_id, v_mevcut_puan, v_yillik_harcama, v_eski_seviye_id
    FROM musteri_sadakat
    WHERE cari_id = p_cari_id AND program_id = p_program_id
    FOR UPDATE;

    IF v_sadakat_id IS NULL THEN
        RETURN;
    END IF;

    -- En yuksek hak edilen seviyeyi bul
    SELECT id, sira INTO v_yeni_seviye_id, v_yeni_seviye_sira
    FROM sadakat_seviye
    WHERE program_id = p_program_id
      AND aktif_mi = true
      AND min_puan <= v_mevcut_puan
      AND min_yillik_harcama <= COALESCE(v_yillik_harcama, 0)
    ORDER BY sira DESC
    LIMIT 1;

    IF v_yeni_seviye_id IS NULL THEN
        RETURN;
    END IF;

    IF v_yeni_seviye_id = v_eski_seviye_id THEN
        RETURN;
    END IF;

    SELECT sira INTO v_eski_seviye_sira
    FROM sadakat_seviye WHERE id = v_eski_seviye_id;

    v_degisim_tipi := CASE
        WHEN v_eski_seviye_sira IS NULL THEN 'baslangic'
        WHEN v_yeni_seviye_sira > v_eski_seviye_sira THEN 'yukselme'
        ELSE 'dusus'
    END;

    UPDATE musteri_sadakat
    SET seviye_id = v_yeni_seviye_id,
        son_seviye_degisim_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE id = v_sadakat_id;

    INSERT INTO musteri_seviye_gecmis (
        musteri_sadakat_id, cari_id, eski_seviye_id, yeni_seviye_id,
        degisim_tipi, mevcut_puan_snapshot, yillik_harcama_snapshot
    ) VALUES (
        v_sadakat_id, p_cari_id, v_eski_seviye_id, v_yeni_seviye_id,
        v_degisim_tipi, v_mevcut_puan, v_yillik_harcama
    );
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- hediye_karti_kullan: Atomik hediye karti kullanim
-- PIN dogrulamasi app katmaninda yapilir (hash kontrolu); bu fonksiyon
-- kart bakiyesini dusurur ve hareket ekler.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hediye_karti_kullan(
    p_kart_no varchar,
    p_tutar numeric,
    p_kaynak_belge_tipi varchar DEFAULT 'siparis',
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_ip_adresi inet DEFAULT NULL,
    p_aciklama text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_kart_id bigint;
    v_oncesi numeric(18, 4);
    v_sonrasi numeric(18, 4);
    v_durum varchar(20);
    v_son_kullanma timestamptz;
    v_para_birimi char(3);
    v_hareket_id bigint;
BEGIN
    IF p_tutar <= 0 THEN
        RAISE EXCEPTION 'hediye_karti_kullan: tutar pozitif olmali';
    END IF;

    SELECT id, kalan_bakiye, durum, son_kullanma_tarihi, para_birimi_kod
      INTO v_kart_id, v_oncesi, v_durum, v_son_kullanma, v_para_birimi
    FROM hediye_karti
    WHERE kart_no = p_kart_no
    FOR UPDATE;

    IF v_kart_id IS NULL THEN
        RAISE EXCEPTION 'Hediye karti bulunamadi: %', p_kart_no;
    END IF;

    IF v_durum <> 'aktif' THEN
        RAISE EXCEPTION 'Hediye karti aktif degil (durum=%)', v_durum;
    END IF;

    IF v_son_kullanma < now() THEN
        UPDATE hediye_karti SET durum = 'son_kullanma' WHERE id = v_kart_id;
        RAISE EXCEPTION 'Hediye kartinin suresi gecmis (%)', v_son_kullanma;
    END IF;

    IF v_oncesi < p_tutar THEN
        RAISE EXCEPTION 'Hediye karti bakiyesi yetersiz: mevcut=%, istenen=%', v_oncesi, p_tutar;
    END IF;

    v_sonrasi := v_oncesi - p_tutar;

    UPDATE hediye_karti
    SET kalan_bakiye = v_sonrasi,
        durum = CASE WHEN v_sonrasi = 0 THEN 'kullanildi' ELSE durum END,
        ilk_kullanim_tarihi = COALESCE(ilk_kullanim_tarihi, now()),
        son_kullanim_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE id = v_kart_id;

    INSERT INTO hediye_karti_hareket (
        hediye_karti_id, hareket_tipi, tutar,
        oncesi_bakiye, sonrasi_bakiye, para_birimi_kod,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, ip_adresi, aciklama
    ) VALUES (
        v_kart_id, 'kullanim', -p_tutar,
        v_oncesi, v_sonrasi, v_para_birimi,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id, p_ip_adresi, p_aciklama
    ) RETURNING id INTO v_hareket_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- hediye_karti_yukle: Atomik bakiye yukleme (reload)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hediye_karti_yukle(
    p_kart_no varchar,
    p_tutar numeric,
    p_kaynak_belge_tipi varchar DEFAULT 'manuel',
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_aciklama text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_kart_id bigint;
    v_oncesi numeric(18, 4);
    v_sonrasi numeric(18, 4);
    v_para_birimi char(3);
    v_reloadable boolean;
    v_hareket_id bigint;
BEGIN
    IF p_tutar <= 0 THEN
        RAISE EXCEPTION 'hediye_karti_yukle: tutar pozitif olmali';
    END IF;

    SELECT hk.id, hk.kalan_bakiye, hk.para_birimi_kod, hkt.yeniden_yuklenebilir_mi
      INTO v_kart_id, v_oncesi, v_para_birimi, v_reloadable
    FROM hediye_karti hk
    JOIN hediye_karti_tip hkt ON hkt.id = hk.tip_id
    WHERE hk.kart_no = p_kart_no
    FOR UPDATE;

    IF v_kart_id IS NULL THEN
        RAISE EXCEPTION 'Hediye karti bulunamadi: %', p_kart_no;
    END IF;

    IF v_oncesi > 0 AND NOT COALESCE(v_reloadable, false) THEN
        RAISE EXCEPTION 'Bu hediye karti tipi yeniden yuklenemez';
    END IF;

    v_sonrasi := v_oncesi + p_tutar;

    UPDATE hediye_karti
    SET kalan_bakiye = v_sonrasi,
        baslangic_tutar = GREATEST(baslangic_tutar, v_sonrasi),
        durum = CASE WHEN durum = 'kullanildi' THEN 'aktif' ELSE durum END,
        guncelleme_tarihi = now()
    WHERE id = v_kart_id;

    INSERT INTO hediye_karti_hareket (
        hediye_karti_id, hareket_tipi, tutar,
        oncesi_bakiye, sonrasi_bakiye, para_birimi_kod,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    ) VALUES (
        v_kart_id, 'yukleme', p_tutar,
        v_oncesi, v_sonrasi, v_para_birimi,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id, p_aciklama
    ) RETURNING id INTO v_hareket_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- puan_son_kullanma_kontrol: Cron job
-- Suresi gecen puanlari sil (kazanim hareketinden dusumu hesapla).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION puan_son_kullanma_kontrol()
RETURNS TABLE (
    cari_id_etkilenen bigint,
    silinen_puan bigint
) AS $$
DECLARE
    v_hareket record;
BEGIN
    FOR v_hareket IN
        SELECT DISTINCT ON (mph.cari_id, mph.program_id)
            mph.cari_id,
            mph.program_id,
            SUM(mph.puan_miktar) FILTER (
                WHERE mph.son_kullanma_tarihi < now()
                  AND mph.iptal_edildi_mi = false
                  AND mph.hareket_tipi IN ('kazanim', 'bonus')
            ) OVER (PARTITION BY mph.cari_id, mph.program_id) AS eksi_puan
        FROM musteri_puan_hareket mph
        WHERE mph.son_kullanma_tarihi < now()
          AND mph.iptal_edildi_mi = false
          AND mph.hareket_tipi IN ('kazanim', 'bonus')
    LOOP
        IF v_hareket.eksi_puan IS NULL OR v_hareket.eksi_puan <= 0 THEN
            CONTINUE;
        END IF;

        BEGIN
            PERFORM puan_harcat(
                v_hareket.cari_id,
                v_hareket.eksi_puan,
                'son_kullanma',
                'cron_son_kullanma',
                NULL,
                NULL,
                'Suresi gecen puan temizligi',
                NULL,
                v_hareket.program_id
            );

            -- Hareketleri iptal isaretle
            UPDATE musteri_puan_hareket
            SET iptal_edildi_mi = true
            WHERE cari_id = v_hareket.cari_id
              AND program_id = v_hareket.program_id
              AND son_kullanma_tarihi < now()
              AND iptal_edildi_mi = false
              AND hareket_tipi IN ('kazanim', 'bonus');

            cari_id_etkilenen := v_hareket.cari_id;
            silinen_puan := v_hareket.eksi_puan;
            RETURN NEXT;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Puan son kullanma temizligi hata (cari=%): %', v_hareket.cari_id, SQLERRM;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- hediye_karti_son_kullanma_kontrol: Cron job
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hediye_karti_son_kullanma_kontrol()
RETURNS int AS $$
DECLARE
    v_sayi int;
BEGIN
    WITH suresi_gecmis AS (
        UPDATE hediye_karti
        SET durum = 'son_kullanma',
            guncelleme_tarihi = now()
        WHERE durum = 'aktif'
          AND son_kullanma_tarihi < now()
        RETURNING id, kalan_bakiye, para_birimi_kod
    )
    INSERT INTO hediye_karti_hareket (
        hediye_karti_id, hareket_tipi, tutar,
        oncesi_bakiye, sonrasi_bakiye, para_birimi_kod,
        kaynak_belge_tipi, aciklama
    )
    SELECT id, 'son_kullanma', -kalan_bakiye,
           kalan_bakiye, 0, para_birimi_kod,
           'cron', 'Suresi geçti - otomatik iptal'
    FROM suresi_gecmis
    WHERE kalan_bakiye > 0;

    GET DIAGNOSTICS v_sayi = ROW_COUNT;

    -- Kalan bakiyeyi sifirla
    UPDATE hediye_karti
    SET kalan_bakiye = 0
    WHERE durum = 'son_kullanma' AND kalan_bakiye > 0;

    RETURN v_sayi;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- yillik_harcama_yeniden_hesapla: Cron job
-- Son 365 gunun siparis toplamini musteri_sadakat'a yazar.
-- Siparis modulu (08) ile entegrasyon noktasi.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yillik_harcama_yeniden_hesapla(
    p_cari_id bigint DEFAULT NULL
) RETURNS int AS $$
DECLARE
    v_sayi int := 0;
BEGIN
    UPDATE musteri_sadakat ms
    SET yillik_harcama_tutar = COALESCE(t.toplam, 0),
        yillik_harcama_son_hesap_tarihi = now(),
        guncelleme_tarihi = now()
    FROM (
        SELECT s.cari_id,
               SUM(s.toplam_tutar / NULLIF(s.kur, 0)) AS toplam
        FROM siparis s
        WHERE s.tip = 'satis'
          AND s.durum NOT IN ('iptal_edildi', 'taslak')
          AND s.silindi_mi = false
          AND s.siparis_tarihi >= now() - interval '365 days'
          AND (p_cari_id IS NULL OR s.cari_id = p_cari_id)
        GROUP BY s.cari_id
    ) t
    WHERE ms.cari_id = t.cari_id;

    GET DIAGNOSTICS v_sayi = ROW_COUNT;

    -- Hesaplama sonrasi seviye kontrol
    IF p_cari_id IS NOT NULL THEN
        PERFORM musteri_seviye_kontrol(p_cari_id);
    END IF;

    RETURN v_sayi;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VIEW'LAR
-- ============================================================

-- ----------------------------------------------------------------
-- vw_musteri_sadakat_ozet: Cari + program + seviye + puan
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_musteri_sadakat_ozet AS
SELECT
    ms.id                           AS musteri_sadakat_id,
    ms.cari_id,
    c.kod                           AS cari_kod,
    COALESCE(c.unvan, c.ad || ' ' || c.soyad) AS cari_ad,
    ms.program_id,
    sp.kod                          AS program_kod,
    sp.ad                           AS program_ad,
    ms.seviye_id,
    ss.kod                          AS seviye_kod,
    ss.ad                           AS seviye_ad,
    ss.renk                         AS seviye_renk,
    ss.indirim_orani                AS seviye_indirim_orani,
    ss.ekstra_puan_carpani,
    ms.mevcut_puan,
    ms.toplam_kazanilan_puan,
    ms.toplam_harcanan_puan,
    ms.yillik_harcama_tutar,
    ms.yillik_harcama_para_birimi,
    ms.kart_no,
    ms.son_seviye_degisim_tarihi,
    ms.dondurulmus_mu,
    -- Bir sonraki seviye hesabi
    (SELECT json_build_object(
        'seviye_id', ssn.id,
        'seviye_ad', ssn.ad,
        'eksik_puan', GREATEST(0, ssn.min_puan - ms.mevcut_puan),
        'eksik_harcama', GREATEST(0, ssn.min_yillik_harcama - COALESCE(ms.yillik_harcama_tutar, 0))
     )
     FROM sadakat_seviye ssn
     WHERE ssn.program_id = ms.program_id
       AND ssn.aktif_mi = true
       AND ssn.sira > COALESCE(ss.sira, 0)
     ORDER BY ssn.sira ASC
     LIMIT 1) AS sonraki_seviye
FROM musteri_sadakat ms
JOIN cari c ON c.id = ms.cari_id
JOIN sadakat_program sp ON sp.id = ms.program_id
LEFT JOIN sadakat_seviye ss ON ss.id = ms.seviye_id
WHERE c.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_hediye_karti_aktif: Aktif hediye kartlari
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_hediye_karti_aktif AS
SELECT
    hk.id,
    hk.public_id,
    hk.kart_no,
    hk.tip_id,
    hkt.kod                         AS tip_kod,
    hkt.ad                          AS tip_ad,
    hk.baslangic_tutar,
    hk.kalan_bakiye,
    hk.para_birimi_kod,
    hk.durum,
    hk.alici_cari_id,
    hk.alici_ad_soyad,
    hk.satin_alan_cari_id,
    hk.olusturma_tarihi,
    hk.son_kullanma_tarihi,
    (hk.son_kullanma_tarihi - now())::interval AS kalan_sure,
    hk.son_kullanma_tarihi < (now() + interval '30 days') AS son_kullanmaya_yaklasti_mi
FROM hediye_karti hk
JOIN hediye_karti_tip hkt ON hkt.id = hk.tip_id
WHERE hk.durum = 'aktif' AND hk.kalan_bakiye > 0;


-- ----------------------------------------------------------------
-- vw_yaklasan_seviye_dususu: Seviye dusmek uzere olanlar
-- Son 365 gun icinde harcamasi, mevcut seviyenin min_yillik_harcamasi
-- altindaysa uyari.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_yaklasan_seviye_dususu AS
SELECT
    ms.id                           AS musteri_sadakat_id,
    ms.cari_id,
    c.kod                           AS cari_kod,
    COALESCE(c.unvan, c.ad || ' ' || c.soyad) AS cari_ad,
    ms.seviye_id                    AS mevcut_seviye_id,
    ss.ad                           AS mevcut_seviye_ad,
    ms.yillik_harcama_tutar,
    ss.min_yillik_harcama,
    (ss.min_yillik_harcama - ms.yillik_harcama_tutar) AS eksik_harcama,
    ms.son_seviye_degisim_tarihi + interval '365 days' AS tahmini_dusus_tarihi,
    -- Bir alt seviye
    (SELECT ssa.ad
     FROM sadakat_seviye ssa
     WHERE ssa.program_id = ms.program_id
       AND ssa.sira < ss.sira
       AND ssa.aktif_mi = true
     ORDER BY ssa.sira DESC
     LIMIT 1) AS bir_alt_seviye_ad
FROM musteri_sadakat ms
JOIN sadakat_seviye ss ON ss.id = ms.seviye_id
JOIN cari c ON c.id = ms.cari_id
WHERE ms.yillik_harcama_tutar < ss.min_yillik_harcama
  AND ss.min_yillik_harcama > 0
  AND c.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_puan_hareket_son_30_gun: Son 30 gun ozet
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_puan_hareket_son_30_gun AS
SELECT
    cari_id,
    program_id,
    SUM(puan_miktar) FILTER (WHERE puan_miktar > 0) AS kazanilan,
    SUM(-puan_miktar) FILTER (WHERE puan_miktar < 0) AS harcanan,
    COUNT(*) AS hareket_sayisi,
    MAX(olusturma_tarihi) AS son_hareket_tarihi
FROM musteri_puan_hareket
WHERE olusturma_tarihi >= now() - interval '30 days'
GROUP BY cari_id, program_id;


-- ============================================================
-- SEED: Varsayilan program (opsiyonel tenant kurulumu)
-- ============================================================
-- Tenant kurulumunda default 1 program + 4 seviye app katmani tarafindan
-- olusturulur. Burada yerlesik deger yok (tenant baslangici esnek).

-- ============================================================
-- NOTLAR:
--   * Siparis/fatura trigger'lari modul 08'de yazilir:
--       - AFTER INSERT siparis (tip=satis, durum=tamamlandi) -> puan_kazandir
--       - AFTER UPDATE siparis (durum=iptal_edildi) -> puan_harcat ('kazanim_iptal')
--     Bu modul sadece altyapiyi kurar, trigger bindings app tarafinda.
--   * Hediye karti satisi (fatura_kalem.urun_varyant_id -> hediye_karti_tip match)
--     modul 08 POST-COMMIT hook ile hediye_karti + hediye_karti_yukle cagirir.
--   * PIN hashlemesi app katmaninda (argon2id) — fonksiyon sadece hash varligini
--     bekler. Plain text PIN DB'ye YASAK.
-- ============================================================
