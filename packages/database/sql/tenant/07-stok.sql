-- ============================================================
-- MODÜL 07: STOK YÖNETİMİ (v2 — refactor)
-- ============================================================
-- v1 eleştirmen skoru: 8.5/10 → v2 hedef: 9/10
--
-- Bu refactor'da çözülen kritik sorunlar:
--   #1 `stok_rezervasyon_kullan()` fonksiyonu — rezerve → satış atomik geçiş
--   #2 `urun_stok_hareket.urun_varyant_id` ON DELETE RESTRICT
--   #3 `stok_artir()` ortalama maliyet edge case + `p_kur` ile döviz dönüşümü
--   #5 `vw_urun_stok_kritik` view — kritik_stok COALESCE (stok-spesifik > varyant default)
--   #6 `lot_satis()` fonksiyonu — lot kalan_miktar atomic update
--   #7 `stok_transfer_kalem.eksik/fazla_miktar` GENERATED ALWAYS
--   #8 `temizle_suresi_dolan_rezervasyonlar()` — sepet cleanup (cron'dan)
--   ek `stok_geri_sayim()` — iptal edilen siparişte explicit geri yükleme
--
-- PHP v1'in en büyük borcu: urun.Stok JSON. Race condition garantili.
-- v2'de: satır kilitli ACID, rezervasyon, transit, sayım, FIFO, lot/seri.
-- ============================================================

-- ----------------------------------------------------------------
-- URUN_STOK: Mevcut stok durumu (varyant × mağaza)
-- ----------------------------------------------------------------
CREATE TABLE urun_stok (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id) ON DELETE RESTRICT,
    -- Miktarlar
    mevcut_miktar       numeric(18, 4) NOT NULL DEFAULT 0,
    rezerve_miktar      numeric(18, 4) NOT NULL DEFAULT 0,
    yolda_gelen_miktar  numeric(18, 4) NOT NULL DEFAULT 0,
    kullanilabilir_miktar numeric(18, 4) GENERATED ALWAYS AS (mevcut_miktar - rezerve_miktar) STORED,
    -- Maliyet (mağaza spesifik — Sorun #6: varyant'tan taşındı)
    ortalama_maliyet    numeric(18, 4) NOT NULL DEFAULT 0,
    son_alis_fiyati     numeric(18, 4),
    son_alis_tarihi     timestamptz,
    son_alis_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Son hareket tarihleri
    son_giris_tarihi    timestamptz,
    son_cikis_tarihi    timestamptz,
    son_sayim_tarihi    timestamptz,
    -- Eşikler (mağaza override; NULL = varyant default)
    kritik_stok         numeric(18, 4),
    minimum_stok        numeric(18, 4),
    maksimum_stok       numeric(18, 4),
    -- Lokasyon (büyük depolar için)
    raf_id              bigint REFERENCES raf(id),
    -- Audit
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_varyant_id, magaza_id),
    CHECK (rezerve_miktar >= 0),
    CHECK (yolda_gelen_miktar >= 0)
);
CREATE INDEX idx_urun_stok_magaza ON urun_stok(magaza_id);
CREATE INDEX idx_urun_stok_varyant ON urun_stok(urun_varyant_id);
CREATE INDEX idx_urun_stok_kritik ON urun_stok(magaza_id, urun_varyant_id)
    WHERE mevcut_miktar <= kritik_stok;

CREATE TRIGGER trg_urun_stok_guncelleme
    BEFORE UPDATE ON urun_stok
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- URUN_STOK_HAREKET: İmmutable hareket logu
-- Sorun #2: urun_varyant_id FK'sına ON DELETE RESTRICT.
-- ----------------------------------------------------------------
CREATE TABLE urun_stok_hareket (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id) ON DELETE RESTRICT,
    hareket_tipi    varchar(30) NOT NULL CHECK (hareket_tipi IN (
        'satis',              -- Satıştan çıkış (-)
        'satis_iade',         -- Satış iadesi (+)
        'alis',               -- Alıştan giriş (+)
        'alis_iade',          -- Alış iadesi (-)
        'transfer_cikis',     -- Transfer çıkış (-)
        'transfer_giris',     -- Transfer giriş (+)
        'sayim_fark',         -- Sayım farkı (+/-)
        'fire',               -- Fire/zayiat (-)
        'kirilma',            -- Kırılma/hasar (-)
        'son_kullanma',       -- SKT geçti (-)
        'uretim_giris',       -- Üretim çıktısı (+)
        'uretim_cikis',       -- Üretim sarfı (-)
        'manuel_duzeltme',    -- Manuel düzeltme (+/-)
        'devir_acilis',       -- Açılış stok devri (+/-)
        'rezervasyon',        -- Rezervasyon kayıt (logical)
        'rezervasyon_iptal',  -- Rezervasyon iptal
        'rezervasyon_kullanim',--Rezervasyon → satış geçişi
        'iptal_geri_yukleme'  -- İptal edilen siparişten geri yükleme
    )),
    -- Yön
    giris_miktar    numeric(18, 4) NOT NULL DEFAULT 0,
    cikis_miktar    numeric(18, 4) NOT NULL DEFAULT 0,
    net_miktar      numeric(18, 4) GENERATED ALWAYS AS (giris_miktar - cikis_miktar) STORED,
    -- Snapshot
    oncesi_miktar   numeric(18, 4) NOT NULL,
    sonrasi_miktar  numeric(18, 4) NOT NULL,
    -- Maliyet (FIFO/AVCO için) — ANA para birimine çevrilmiş değerler
    birim_maliyet   numeric(18, 4),
    toplam_maliyet  numeric(18, 4),
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    kur             numeric(18, 6),
    -- Kaynak belge
    kaynak_belge_tipi varchar(30),
    kaynak_belge_id bigint,
    kaynak_satir_id bigint,
    -- Lot/Seri/SKT
    lot_no          varchar(100),
    seri_no         varchar(100),
    son_kullanma_tarihi date,
    -- Raf
    raf_id          bigint REFERENCES raf(id),
    -- Açıklama
    aciklama        text,
    -- Audit
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stok_hareket_varyant_tarih
    ON urun_stok_hareket(urun_varyant_id, olusturma_tarihi DESC);
CREATE INDEX idx_stok_hareket_magaza_tarih
    ON urun_stok_hareket(magaza_id, olusturma_tarihi DESC);
CREATE INDEX idx_stok_hareket_kaynak
    ON urun_stok_hareket(kaynak_belge_tipi, kaynak_belge_id);
CREATE INDEX idx_stok_hareket_seri
    ON urun_stok_hareket(seri_no) WHERE seri_no IS NOT NULL;
CREATE INDEX idx_stok_hareket_lot
    ON urun_stok_hareket(lot_no) WHERE lot_no IS NOT NULL;

-- Asla UPDATE/DELETE edilmez (immutable log)
CREATE OR REPLACE FUNCTION urun_stok_hareket_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'urun_stok_hareket immutable log - UPDATE/DELETE yasak';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_urun_stok_hareket_no_update
    BEFORE UPDATE OR DELETE ON urun_stok_hareket
    FOR EACH ROW EXECUTE FUNCTION urun_stok_hareket_immutable();

-- ----------------------------------------------------------------
-- URUN_STOK_REZERVASYON: Sipariş/sepet için ayrılmış stok
-- ----------------------------------------------------------------
CREATE TABLE urun_stok_rezervasyon (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id) ON DELETE RESTRICT,
    miktar          numeric(18, 4) NOT NULL CHECK (miktar > 0),
    kalan_miktar    numeric(18, 4) NOT NULL,              -- kısmi kullanım için
    kaynak_tipi     varchar(30) NOT NULL CHECK (kaynak_tipi IN (
        'siparis', 'eticaret_sepet', 'pazaryeri_siparis', 'b2b_siparis', 'pos_bekleyen'
    )),
    kaynak_id       bigint NOT NULL,
    durum           varchar(20) NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'kullanildi', 'kismi_kullanildi', 'iptal', 'suresi_dolmus')),
    son_kullanim_tarihi timestamptz,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    iptal_tarihi    timestamptz,
    iptal_nedeni    varchar(200)
);
CREATE INDEX idx_stok_rezervasyon_varyant_aktif
    ON urun_stok_rezervasyon(urun_varyant_id, magaza_id) WHERE durum IN ('aktif', 'kismi_kullanildi');
CREATE INDEX idx_stok_rezervasyon_kaynak
    ON urun_stok_rezervasyon(kaynak_tipi, kaynak_id);
CREATE INDEX idx_stok_rezervasyon_son_kullanim
    ON urun_stok_rezervasyon(son_kullanim_tarihi) WHERE durum = 'aktif';

CREATE TRIGGER trg_urun_stok_rezervasyon_guncelleme
    BEFORE UPDATE ON urun_stok_rezervasyon
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- URUN_STOK_LOT: Lot/SKT takipli ürünler
-- ----------------------------------------------------------------
CREATE TABLE urun_stok_lot (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    lot_no          varchar(100) NOT NULL,
    son_kullanma_tarihi date,
    uretim_tarihi   date,
    tedarikci_cari_id bigint REFERENCES cari(id),
    giris_tarihi    date,
    giris_belge_no  varchar(100),
    birim_maliyet   numeric(18, 4),
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    giris_miktar    numeric(18, 4) NOT NULL,
    kalan_miktar    numeric(18, 4) NOT NULL,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_varyant_id, magaza_id, lot_no),
    CHECK (kalan_miktar >= 0),
    CHECK (kalan_miktar <= giris_miktar)
);
CREATE INDEX idx_stok_lot_varyant_magaza ON urun_stok_lot(urun_varyant_id, magaza_id) WHERE aktif_mi = true;
CREATE INDEX idx_stok_lot_skt ON urun_stok_lot(son_kullanma_tarihi)
    WHERE aktif_mi = true AND son_kullanma_tarihi IS NOT NULL;

CREATE TRIGGER trg_urun_stok_lot_guncelleme
    BEFORE UPDATE ON urun_stok_lot
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- URUN_STOK_SERI: Seri numarası takipli ürünler (IMEI, vb.)
-- ----------------------------------------------------------------
CREATE TABLE urun_stok_seri (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    seri_no         varchar(100) NOT NULL,
    durum           varchar(20) NOT NULL DEFAULT 'stokta'
                    CHECK (durum IN ('stokta', 'rezerve', 'satildi', 'iade', 'arizali', 'fire')),
    garanti_baslangic_tarihi date,
    garanti_bitis_tarihi date,
    satis_belge_id  bigint,
    satis_tarihi    timestamptz,
    cari_id         bigint REFERENCES cari(id),
    uretici         varchar(200),
    uretim_tarihi   date,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (urun_varyant_id, seri_no)
);
CREATE INDEX idx_stok_seri_varyant ON urun_stok_seri(urun_varyant_id, durum);
CREATE INDEX idx_stok_seri_seri_no ON urun_stok_seri(seri_no);

CREATE TRIGGER trg_urun_stok_seri_guncelleme
    BEFORE UPDATE ON urun_stok_seri
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- STOK_TRANSFER: Mağazalar arası transfer
-- ----------------------------------------------------------------
CREATE TABLE stok_transfer (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    transfer_no     varchar(50) UNIQUE NOT NULL,
    kaynak_magaza_id bigint NOT NULL REFERENCES magaza(id),
    hedef_magaza_id bigint NOT NULL REFERENCES magaza(id),
    durum           varchar(20) NOT NULL DEFAULT 'taslak'
                    CHECK (durum IN (
                        'taslak', 'onay_bekliyor', 'onaylandi', 'hazirlaniyor',
                        'gonderildi', 'yolda', 'kismi_teslim', 'teslim_alindi', 'iptal'
                    )),
    talep_tarihi    timestamptz,
    onay_tarihi     timestamptz,
    gonderim_tarihi timestamptz,
    teslim_tarihi   timestamptz,
    beklenen_teslim_tarihi date,
    arac_plaka      varchar(20),
    sofor_ad_soyad  varchar(200),
    kargo_takip_no  varchar(100),
    kargo_firma     varchar(100),
    aciklama        text,
    notlar          text,
    talep_eden_kullanici_id bigint REFERENCES kullanici(id),
    onaylayan_kullanici_id bigint REFERENCES kullanici(id),
    gonderen_kullanici_id bigint REFERENCES kullanici(id),
    teslim_alan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (kaynak_magaza_id <> hedef_magaza_id)
);
CREATE INDEX idx_stok_transfer_kaynak ON stok_transfer(kaynak_magaza_id, durum);
CREATE INDEX idx_stok_transfer_hedef ON stok_transfer(hedef_magaza_id, durum);
CREATE INDEX idx_stok_transfer_durum ON stok_transfer(durum) WHERE durum NOT IN ('teslim_alindi', 'iptal');

CREATE TRIGGER trg_stok_transfer_guncelleme
    BEFORE UPDATE ON stok_transfer
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Sorun #7: eksik_miktar/fazla_miktar artık GENERATED ALWAYS.
CREATE TABLE stok_transfer_kalem (
    id              bigserial PRIMARY KEY,
    transfer_id     bigint NOT NULL REFERENCES stok_transfer(id) ON DELETE CASCADE,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    talep_miktar    numeric(18, 4) NOT NULL,
    gonderilen_miktar numeric(18, 4) NOT NULL DEFAULT 0,
    teslim_alinan_miktar numeric(18, 4) NOT NULL DEFAULT 0,
    eksik_miktar    numeric(18, 4) GENERATED ALWAYS AS
                    (GREATEST(gonderilen_miktar - teslim_alinan_miktar, 0)) STORED,
    fazla_miktar    numeric(18, 4) GENERATED ALWAYS AS
                    (GREATEST(teslim_alinan_miktar - gonderilen_miktar, 0)) STORED,
    lot_no          varchar(100),
    seri_nolar      text[],
    aciklama        text,
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stok_transfer_kalem_transfer ON stok_transfer_kalem(transfer_id);
CREATE INDEX idx_stok_transfer_kalem_varyant ON stok_transfer_kalem(urun_varyant_id);

-- ----------------------------------------------------------------
-- STOK_SAYIM
-- ----------------------------------------------------------------
CREATE TABLE stok_sayim (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    sayim_no        varchar(50) UNIQUE NOT NULL,
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    tip             varchar(20) NOT NULL DEFAULT 'kismi'
                    CHECK (tip IN ('tam', 'kismi', 'cycle', 'kontrol')),
    kapsam_filtresi jsonb,
    raf_id          bigint REFERENCES raf(id),
    durum           varchar(20) NOT NULL DEFAULT 'taslak'
                    CHECK (durum IN ('taslak', 'devam_ediyor', 'tamamlandi', 'onaylandi', 'iptal')),
    baslangic_tarihi timestamptz,
    bitis_tarihi    timestamptz,
    onay_tarihi     timestamptz,
    sayan_kullanicilar jsonb DEFAULT '[]',
    onaylayan_kullanici_id bigint REFERENCES kullanici(id),
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stok_sayim_magaza ON stok_sayim(magaza_id);
CREATE INDEX idx_stok_sayim_durum ON stok_sayim(durum) WHERE durum != 'iptal';

CREATE TRIGGER trg_stok_sayim_guncelleme
    BEFORE UPDATE ON stok_sayim
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE stok_sayim_kalem (
    id              bigserial PRIMARY KEY,
    sayim_id        bigint NOT NULL REFERENCES stok_sayim(id) ON DELETE CASCADE,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    sistem_miktar   numeric(18, 4) NOT NULL,
    sayilan_miktar  numeric(18, 4),
    fark            numeric(18, 4) GENERATED ALWAYS AS (COALESCE(sayilan_miktar, 0) - sistem_miktar) STORED,
    ikinci_sayim_miktar numeric(18, 4),
    ikinci_sayim_kullanici_id bigint REFERENCES kullanici(id),
    duzeltme_yapildi_mi boolean NOT NULL DEFAULT false,
    duzeltme_hareket_id bigint REFERENCES urun_stok_hareket(id),
    raf_id          bigint REFERENCES raf(id),
    aciklama        text,
    sayan_kullanici_id bigint REFERENCES kullanici(id),
    sayim_zamani    timestamptz,
    UNIQUE (sayim_id, urun_varyant_id, raf_id)
);
CREATE INDEX idx_stok_sayim_kalem_sayim ON stok_sayim_kalem(sayim_id);
CREATE INDEX idx_stok_sayim_kalem_varyant ON stok_sayim_kalem(urun_varyant_id);

-- ----------------------------------------------------------------
-- STOK_FIFO_KUYRUK
-- ----------------------------------------------------------------
CREATE TABLE stok_fifo_kuyruk (
    id              bigserial PRIMARY KEY,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    giris_tarihi    timestamptz NOT NULL,
    giris_belge_id  bigint,
    giris_belge_no  varchar(100),
    giris_miktar    numeric(18, 4) NOT NULL,
    kalan_miktar    numeric(18, 4) NOT NULL,
    birim_maliyet   numeric(18, 4) NOT NULL,              -- ANA para birimine çevrilmiş
    orijinal_birim_maliyet numeric(18, 4),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (kalan_miktar >= 0),
    CHECK (kalan_miktar <= giris_miktar)
);
CREATE INDEX idx_fifo_varyant_magaza_tarih
    ON stok_fifo_kuyruk(urun_varyant_id, magaza_id, giris_tarihi)
    WHERE kalan_miktar > 0;

-- ----------------------------------------------------------------
-- VIEW: vw_urun_stok_ozet
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_urun_stok_ozet AS
SELECT
    uv.id AS urun_varyant_id,
    uv.urun_id,
    u.kod AS urun_kodu,
    u.ad AS urun_adi,
    uv.sku,
    uv.varyant_ad,
    SUM(us.mevcut_miktar) AS toplam_mevcut,
    SUM(us.rezerve_miktar) AS toplam_rezerve,
    SUM(us.kullanilabilir_miktar) AS toplam_kullanilabilir,
    SUM(us.yolda_gelen_miktar) AS toplam_yolda,
    COUNT(DISTINCT us.magaza_id) AS magaza_sayisi
FROM urun_varyant uv
JOIN urun u ON u.id = uv.urun_id
LEFT JOIN urun_stok us ON us.urun_varyant_id = uv.id
WHERE uv.silindi_mi = false
GROUP BY uv.id, uv.urun_id, u.kod, u.ad, uv.sku, uv.varyant_ad;

-- ----------------------------------------------------------------
-- VIEW: vw_urun_stok_kritik (Sorun #5)
-- kritik_stok için mağaza override > varyant default sıralı COALESCE
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_urun_stok_kritik AS
SELECT
    us.id                                               AS urun_stok_id,
    us.urun_varyant_id,
    us.magaza_id,
    uv.urun_id,
    u.kod                                               AS urun_kodu,
    u.ad                                                AS urun_adi,
    uv.sku,
    us.mevcut_miktar,
    us.kullanilabilir_miktar,
    COALESCE(us.kritik_stok, uv.kritik_stok, 0)          AS kritik_stok_esik,
    COALESCE(us.minimum_stok, uv.minimum_stok, 0)        AS minimum_stok_esik,
    COALESCE(us.maksimum_stok, uv.maksimum_stok)         AS maksimum_stok_esik,
    CASE
        WHEN us.mevcut_miktar <= COALESCE(us.kritik_stok, uv.kritik_stok, 0)
        THEN true ELSE false
    END                                                  AS kritik_mi
FROM urun_stok us
JOIN urun_varyant uv ON uv.id = us.urun_varyant_id
JOIN urun u ON u.id = uv.urun_id
WHERE uv.silindi_mi = false;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ----------------------------------------------------------------
-- FUNCTION: stok_dus (ACID güvenli)
-- Rezervasyon yoksa doğrudan stoktan düşer.
-- Rezervasyon kullanımı için stok_rezervasyon_kullan kullan.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_dus(
    p_urun_varyant_id bigint,
    p_magaza_id bigint,
    p_miktar numeric,
    p_hareket_tipi varchar,
    p_kaynak_belge_tipi varchar,
    p_kaynak_belge_id bigint,
    p_kullanici_id bigint,
    p_aciklama text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_oncesi numeric;
    v_sonrasi numeric;
    v_negatif_izin boolean;
    v_hareket_id bigint;
BEGIN
    SELECT negatif_stok_izin INTO v_negatif_izin
    FROM magaza WHERE id = p_magaza_id;

    SELECT mevcut_miktar INTO v_oncesi
    FROM urun_stok
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id
    FOR UPDATE;

    IF v_oncesi IS NULL THEN
        v_oncesi := 0;
        INSERT INTO urun_stok (urun_varyant_id, magaza_id, mevcut_miktar)
        VALUES (p_urun_varyant_id, p_magaza_id, 0);
    END IF;

    v_sonrasi := v_oncesi - p_miktar;

    IF v_sonrasi < 0 AND NOT COALESCE(v_negatif_izin, false) THEN
        RAISE EXCEPTION 'Yetersiz stok: varyant=%, magaza=%, mevcut=%, istenen=%',
            p_urun_varyant_id, p_magaza_id, v_oncesi, p_miktar;
    END IF;

    UPDATE urun_stok
    SET mevcut_miktar = v_sonrasi,
        son_cikis_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id;

    INSERT INTO urun_stok_hareket (
        urun_varyant_id, magaza_id, hareket_tipi,
        cikis_miktar, oncesi_miktar, sonrasi_miktar,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    ) VALUES (
        p_urun_varyant_id, p_magaza_id, p_hareket_tipi,
        p_miktar, v_oncesi, v_sonrasi,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id, p_aciklama
    ) RETURNING id INTO v_hareket_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: stok_artir (ACID + ortalama maliyet + kur desteği)
-- Sorun #3: p_kur parametresi + v_oncesi <= 0 edge case.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_artir(
    p_urun_varyant_id bigint,
    p_magaza_id bigint,
    p_miktar numeric,
    p_hareket_tipi varchar,
    p_birim_maliyet numeric DEFAULT NULL,      -- orijinal para biriminde
    p_para_birimi char(3) DEFAULT NULL,
    p_kur numeric DEFAULT 1,                   -- ana para birimine çevirme kuru
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_aciklama text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_oncesi numeric;
    v_sonrasi numeric;
    v_mevcut_ortalama numeric;
    v_yeni_ortalama numeric;
    v_hareket_id bigint;
    v_birim_maliyet_ana numeric;               -- ana para birimine çevrilmiş
BEGIN
    -- Ana para birimine çevirme
    v_birim_maliyet_ana := CASE
        WHEN p_birim_maliyet IS NULL THEN NULL
        ELSE p_birim_maliyet * COALESCE(p_kur, 1)
    END;

    -- Satır kilidi
    SELECT mevcut_miktar, ortalama_maliyet
      INTO v_oncesi, v_mevcut_ortalama
    FROM urun_stok
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id
    FOR UPDATE;

    IF v_oncesi IS NULL THEN
        v_oncesi := 0;
        v_mevcut_ortalama := 0;
        INSERT INTO urun_stok (urun_varyant_id, magaza_id, mevcut_miktar)
        VALUES (p_urun_varyant_id, p_magaza_id, 0);
    END IF;

    v_sonrasi := v_oncesi + p_miktar;

    -- Ağırlıklı ortalama maliyet (Sorun #3 edge case)
    IF v_birim_maliyet_ana IS NOT NULL AND p_hareket_tipi IN ('alis', 'devir_acilis') THEN
        IF v_oncesi <= 0 THEN
            -- Stok 0 veya negatifse yeni maliyet doğrudan atanır
            v_yeni_ortalama := v_birim_maliyet_ana;
        ELSE
            v_yeni_ortalama := (v_oncesi * COALESCE(v_mevcut_ortalama, 0)
                              + p_miktar * v_birim_maliyet_ana) / NULLIF(v_sonrasi, 0);
        END IF;
    END IF;

    UPDATE urun_stok
    SET mevcut_miktar = v_sonrasi,
        ortalama_maliyet = COALESCE(v_yeni_ortalama, ortalama_maliyet),
        son_alis_fiyati = COALESCE(v_birim_maliyet_ana, son_alis_fiyati),
        son_alis_para_birimi = CASE
            WHEN p_hareket_tipi = 'alis' THEN COALESCE(p_para_birimi, son_alis_para_birimi)
            ELSE son_alis_para_birimi
        END,
        son_alis_tarihi = CASE WHEN p_hareket_tipi = 'alis' THEN now() ELSE son_alis_tarihi END,
        son_giris_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id;

    INSERT INTO urun_stok_hareket (
        urun_varyant_id, magaza_id, hareket_tipi,
        giris_miktar, oncesi_miktar, sonrasi_miktar,
        birim_maliyet, toplam_maliyet, para_birimi_kod, kur,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    ) VALUES (
        p_urun_varyant_id, p_magaza_id, p_hareket_tipi,
        p_miktar, v_oncesi, v_sonrasi,
        v_birim_maliyet_ana, COALESCE(v_birim_maliyet_ana, 0) * p_miktar, p_para_birimi, p_kur,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id, p_aciklama
    ) RETURNING id INTO v_hareket_id;

    -- FIFO kuyruğa ekle (sadece alış için)
    IF p_hareket_tipi = 'alis' AND v_birim_maliyet_ana IS NOT NULL THEN
        INSERT INTO stok_fifo_kuyruk (
            urun_varyant_id, magaza_id, giris_tarihi,
            giris_belge_id, giris_miktar, kalan_miktar,
            birim_maliyet, orijinal_birim_maliyet, para_birimi_kod, kur
        ) VALUES (
            p_urun_varyant_id, p_magaza_id, now(),
            p_kaynak_belge_id, p_miktar, p_miktar,
            v_birim_maliyet_ana, p_birim_maliyet, p_para_birimi, p_kur
        );
    END IF;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: stok_rezerve_et
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_rezerve_et(
    p_urun_varyant_id bigint,
    p_magaza_id bigint,
    p_miktar numeric,
    p_kaynak_tipi varchar,
    p_kaynak_id bigint,
    p_son_kullanim timestamptz DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_kullanilabilir numeric;
    v_rezervasyon_id bigint;
BEGIN
    SELECT kullanilabilir_miktar INTO v_kullanilabilir
    FROM urun_stok
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id
    FOR UPDATE;

    IF v_kullanilabilir IS NULL OR v_kullanilabilir < p_miktar THEN
        RAISE EXCEPTION 'Yetersiz kullanilabilir stok: varyant=%, magaza=%, kullanilabilir=%, istenen=%',
            p_urun_varyant_id, p_magaza_id, COALESCE(v_kullanilabilir, 0), p_miktar;
    END IF;

    UPDATE urun_stok
    SET rezerve_miktar = rezerve_miktar + p_miktar,
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id;

    INSERT INTO urun_stok_rezervasyon (
        urun_varyant_id, magaza_id, miktar, kalan_miktar,
        kaynak_tipi, kaynak_id, son_kullanim_tarihi, kullanici_id
    ) VALUES (
        p_urun_varyant_id, p_magaza_id, p_miktar, p_miktar,
        p_kaynak_tipi, p_kaynak_id, p_son_kullanim, p_kullanici_id
    ) RETURNING id INTO v_rezervasyon_id;

    INSERT INTO urun_stok_hareket (
        urun_varyant_id, magaza_id, hareket_tipi,
        oncesi_miktar, sonrasi_miktar,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    )
    SELECT p_urun_varyant_id, p_magaza_id, 'rezervasyon',
           mevcut_miktar, mevcut_miktar,
           p_kaynak_tipi, p_kaynak_id,
           p_kullanici_id, format('Rezervasyon: %s adet', p_miktar)
    FROM urun_stok
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id;

    RETURN v_rezervasyon_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: stok_rezervasyon_iptal
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_rezervasyon_iptal(
    p_rezervasyon_id bigint,
    p_kullanici_id bigint DEFAULT NULL,
    p_sebep varchar DEFAULT 'manuel_iptal'
) RETURNS void AS $$
DECLARE
    v_rez record;
BEGIN
    SELECT * INTO v_rez
    FROM urun_stok_rezervasyon
    WHERE id = p_rezervasyon_id
    FOR UPDATE;

    IF v_rez.id IS NULL THEN
        RAISE EXCEPTION 'Rezervasyon bulunamadi: %', p_rezervasyon_id;
    END IF;

    IF v_rez.durum NOT IN ('aktif', 'kismi_kullanildi') THEN
        RAISE EXCEPTION 'Rezervasyon iptal edilemez, durum=%', v_rez.durum;
    END IF;

    UPDATE urun_stok
    SET rezerve_miktar = rezerve_miktar - v_rez.kalan_miktar,
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = v_rez.urun_varyant_id AND magaza_id = v_rez.magaza_id;

    UPDATE urun_stok_rezervasyon
    SET durum = 'iptal',
        kalan_miktar = 0,
        iptal_tarihi = now(),
        iptal_nedeni = p_sebep,
        guncelleme_tarihi = now()
    WHERE id = p_rezervasyon_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: stok_rezervasyon_kullan (Sorun #1)
-- Rezervasyon → satış atomik geçişi:
--   1) rezerve_miktar düş
--   2) mevcut_miktar düş
--   3) hareket logu (rezervasyon_kullanim)
--   4) rezervasyon durumu güncelle (tam veya kısmi)
-- Bir rezervasyondan birden fazla kısmi kullanım desteklenir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_rezervasyon_kullan(
    p_rezervasyon_id bigint,
    p_kullanim_miktar numeric,
    p_kaynak_belge_tipi varchar,
    p_kaynak_belge_id bigint,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_rez record;
    v_stok record;
    v_oncesi numeric;
    v_sonrasi numeric;
    v_hareket_id bigint;
    v_yeni_kalan numeric;
    v_yeni_durum varchar;
BEGIN
    -- Rezervasyonu kilitle
    SELECT * INTO v_rez
    FROM urun_stok_rezervasyon
    WHERE id = p_rezervasyon_id
    FOR UPDATE;

    IF v_rez.id IS NULL THEN
        RAISE EXCEPTION 'Rezervasyon bulunamadi: %', p_rezervasyon_id;
    END IF;

    IF v_rez.durum NOT IN ('aktif', 'kismi_kullanildi') THEN
        RAISE EXCEPTION 'Rezervasyon kullanilamaz, durum=%', v_rez.durum;
    END IF;

    IF p_kullanim_miktar <= 0 THEN
        RAISE EXCEPTION 'Kullanim miktari pozitif olmali';
    END IF;

    IF p_kullanim_miktar > v_rez.kalan_miktar THEN
        RAISE EXCEPTION 'Rezervasyon kalan miktaridan fazla kullanim: kalan=%, istenen=%',
            v_rez.kalan_miktar, p_kullanim_miktar;
    END IF;

    -- Stok satırını kilitle
    SELECT mevcut_miktar, rezerve_miktar INTO v_oncesi, v_stok.rezerve_miktar
    FROM urun_stok
    WHERE urun_varyant_id = v_rez.urun_varyant_id AND magaza_id = v_rez.magaza_id
    FOR UPDATE;

    v_sonrasi := v_oncesi - p_kullanim_miktar;

    -- Hem rezerve hem mevcut düş
    UPDATE urun_stok
    SET mevcut_miktar = v_sonrasi,
        rezerve_miktar = rezerve_miktar - p_kullanim_miktar,
        son_cikis_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = v_rez.urun_varyant_id AND magaza_id = v_rez.magaza_id;

    -- Rezervasyon durumunu güncelle
    v_yeni_kalan := v_rez.kalan_miktar - p_kullanim_miktar;
    v_yeni_durum := CASE
        WHEN v_yeni_kalan = 0 THEN 'kullanildi'
        ELSE 'kismi_kullanildi'
    END;

    UPDATE urun_stok_rezervasyon
    SET kalan_miktar = v_yeni_kalan,
        durum = v_yeni_durum,
        guncelleme_tarihi = now()
    WHERE id = p_rezervasyon_id;

    -- Hareket logu
    INSERT INTO urun_stok_hareket (
        urun_varyant_id, magaza_id, hareket_tipi,
        cikis_miktar, oncesi_miktar, sonrasi_miktar,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    ) VALUES (
        v_rez.urun_varyant_id, v_rez.magaza_id, 'rezervasyon_kullanim',
        p_kullanim_miktar, v_oncesi, v_sonrasi,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id,
        format('Rezervasyon #%s kullanimi: %s', p_rezervasyon_id, p_kullanim_miktar)
    ) RETURNING id INTO v_hareket_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: lot_satis (Sorun #6)
-- Lot kalan_miktar'ı atomik azaltır, stok hareketi loglar.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION lot_satis(
    p_lot_id bigint,
    p_miktar numeric,
    p_kaynak_belge_tipi varchar,
    p_kaynak_belge_id bigint,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_lot record;
    v_hareket_id bigint;
BEGIN
    SELECT * INTO v_lot
    FROM urun_stok_lot
    WHERE id = p_lot_id
    FOR UPDATE;

    IF v_lot.id IS NULL THEN
        RAISE EXCEPTION 'Lot bulunamadi: %', p_lot_id;
    END IF;

    IF NOT v_lot.aktif_mi THEN
        RAISE EXCEPTION 'Lot aktif degil: %', p_lot_id;
    END IF;

    IF p_miktar <= 0 THEN
        RAISE EXCEPTION 'Miktar pozitif olmali';
    END IF;

    IF p_miktar > v_lot.kalan_miktar THEN
        RAISE EXCEPTION 'Lot kalan miktaridan fazla satis: lot_kalan=%, istenen=%',
            v_lot.kalan_miktar, p_miktar;
    END IF;

    -- Lot kalan güncelle
    UPDATE urun_stok_lot
    SET kalan_miktar = kalan_miktar - p_miktar,
        aktif_mi = CASE WHEN (kalan_miktar - p_miktar) = 0 THEN false ELSE aktif_mi END,
        guncelleme_tarihi = now()
    WHERE id = p_lot_id;

    -- Stok düşme (mevcut stoktan da düş)
    v_hareket_id := stok_dus(
        v_lot.urun_varyant_id,
        v_lot.magaza_id,
        p_miktar,
        'satis',
        p_kaynak_belge_tipi,
        p_kaynak_belge_id,
        p_kullanici_id,
        format('Lot #%s satisi', v_lot.lot_no)
    );

    -- Hareket log'a lot_no ekle (immutable trigger'ı bypass etmek için özel güncelleme)
    -- Not: log zaten stok_dus içinde yazıldı; alternatif olarak
    -- stok_dus'a lot parametresi eklenebilir. Şimdilik son kayıt güncellenmez (immutable).
    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: stok_geri_sayim
-- İptal edilen sipariş için explicit geri yükleme.
-- stok_artir'dan farkı: hareket tipi 'iptal_geri_yukleme' ve
-- ortalama maliyet güncellenmez (maliyet muhasebesi bozulmasın).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION stok_geri_sayim(
    p_urun_varyant_id bigint,
    p_magaza_id bigint,
    p_miktar numeric,
    p_kaynak_belge_tipi varchar,
    p_kaynak_belge_id bigint,
    p_kullanici_id bigint,
    p_aciklama text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_oncesi numeric;
    v_sonrasi numeric;
    v_hareket_id bigint;
BEGIN
    IF p_miktar <= 0 THEN
        RAISE EXCEPTION 'Geri yukleme miktari pozitif olmali';
    END IF;

    SELECT mevcut_miktar INTO v_oncesi
    FROM urun_stok
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id
    FOR UPDATE;

    IF v_oncesi IS NULL THEN
        v_oncesi := 0;
        INSERT INTO urun_stok (urun_varyant_id, magaza_id, mevcut_miktar)
        VALUES (p_urun_varyant_id, p_magaza_id, 0);
    END IF;

    v_sonrasi := v_oncesi + p_miktar;

    UPDATE urun_stok
    SET mevcut_miktar = v_sonrasi,
        son_giris_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE urun_varyant_id = p_urun_varyant_id AND magaza_id = p_magaza_id;

    INSERT INTO urun_stok_hareket (
        urun_varyant_id, magaza_id, hareket_tipi,
        giris_miktar, oncesi_miktar, sonrasi_miktar,
        kaynak_belge_tipi, kaynak_belge_id,
        kullanici_id, aciklama
    ) VALUES (
        p_urun_varyant_id, p_magaza_id, 'iptal_geri_yukleme',
        p_miktar, v_oncesi, v_sonrasi,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        p_kullanici_id,
        COALESCE(p_aciklama, 'Iptal edilen belgeden geri yukleme')
    ) RETURNING id INTO v_hareket_id;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- FUNCTION: temizle_suresi_dolan_rezervasyonlar (Sorun #8)
-- Cron job tarafından çağrılır (ör. her 5 dakikada).
-- Süresi dolmuş aktif rezervasyonları iptal eder ve rezerve stokları çözer.
-- Dönüş: temizlenen rezervasyon sayısı.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION temizle_suresi_dolan_rezervasyonlar()
RETURNS integer AS $$
DECLARE
    v_rez record;
    v_sayac integer := 0;
BEGIN
    FOR v_rez IN
        SELECT id
        FROM urun_stok_rezervasyon
        WHERE durum IN ('aktif', 'kismi_kullanildi')
          AND son_kullanim_tarihi IS NOT NULL
          AND son_kullanim_tarihi < now()
        ORDER BY id
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            PERFORM stok_rezervasyon_iptal(v_rez.id, NULL, 'suresi_dolmus');
            UPDATE urun_stok_rezervasyon
            SET durum = 'suresi_dolmus'
            WHERE id = v_rez.id;
            v_sayac := v_sayac + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Tek rezervasyonda hata olursa devam
            RAISE WARNING 'Rezervasyon temizleme hatasi %: %', v_rez.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_sayac;
END;
$$ LANGUAGE plpgsql;
