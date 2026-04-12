-- ============================================================
-- MODUL 15: URETIM (BOM + Uretim Emri)
-- ============================================================
-- PHP v1'de basit uretim var. v2'de tam Bill of Materials + emir
-- + operasyon (islem) + maliyet hesabi.
--
-- Kapsam:
--   * Recete (BOM) — mamul + hammadde listesi + versiyonlama
--   * Recete malzeme — zorunlu/opsiyonel, alternatif grup, fire
--   * Recete islem — isçilik asamalari, sure, makine
--   * Makine / is istasyonu master (basit)
--   * Uretim emri — hedef miktar, planlanan/gercek, sorumlu
--   * Uretim emri malzeme — emre ozel malzeme cekimi (lot no ile)
--   * Uretim emri cikti — mamul + yan urun + fire + lot
--   * Uretim emri islem log — her asama tamamlamasi
--   * Atomik fonksiyonlar: emri_baslat, emri_tamamla, maliyet_hesapla
--
-- Entegrasyon:
--   * urun_varyant       (modul 06) — mamul + hammadde ayni tabloda
--   * urun_stok_hareket  (modul 07) — stok_dus (hammadde) + stok_artir (mamul)
--   * magaza             (modul 04) — uretim hatti/atolye
--   * kullanici          (modul 01) — sorumlu personel
--   * siparis            (modul 08) — kaynak siparis (make-to-order)
--   * para_birimi        (modul 02) — maliyet para biriminde
--
-- Tasarim kararlari:
--   1) Recete versiyonlu. Eski versiyonlar arsiv, aktif tek versiyon.
--   2) Malzeme alternatif grup: ayni grup icindeki iki malzemeden biri kullanilir.
--   3) Fire orani malzeme seviyesi — "bu malzemenin %5'i uretim sirasinda kayip".
--   4) Uretim emri durum state machine, atomik gecis.
--   5) Uretim emri malzeme cekimi: emir baslayinca stoktan dusulur (stok_dus).
--   6) Uretim emri cikti: emir tamamlaninca stoga girilir (stok_artir).
--   7) Mamul maliyeti: hammadde_maliyeti + iscilik + genel_gider / cikti_miktar.
--   8) Uretim emri birden fazla cikti (ana mamul + yan urun + kalite sinifi) destekler.
--   9) Birden fazla partial tamamlama desteklenir (gerceklesen_miktar += ...).
--  10) Recete aktif versiyonu degistiginde eski emirler eski versiyonu saklar (versiyon snapshot).
-- ============================================================


-- ----------------------------------------------------------------
-- IS_ISTASYONU: Makine / is hatti / atolye kosesi
-- ----------------------------------------------------------------
CREATE TABLE is_istasyonu (
    id                  bigserial PRIMARY KEY,
    kod                 varchar(50) UNIQUE NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    magaza_id           bigint NOT NULL REFERENCES magaza(id),
    tip                 varchar(30) NOT NULL DEFAULT 'makine' CHECK (tip IN (
        'makine', 'el_isciligi', 'montaj_hatti', 'test_istasyonu', 'kalite_kontrol', 'paketleme', 'diger'
    )),
    -- Kapasite
    saatlik_kapasite    numeric(15, 4),                      -- adet/saat
    vardiya_saat        numeric(5, 2) NOT NULL DEFAULT 8,
    -- Maliyet
    saatlik_maliyet     numeric(18, 4),
    saatlik_maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Kullanilirlik
    kullanim_orani      numeric(5, 2) NOT NULL DEFAULT 85,   -- duraksamalar, bakim dusulmus
    aktif_mi            boolean NOT NULL DEFAULT true,
    silindi_mi          boolean NOT NULL DEFAULT false,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_is_istasyonu_magaza ON is_istasyonu (magaza_id) WHERE silindi_mi = false;

CREATE TRIGGER trg_is_istasyonu_guncelleme
    BEFORE UPDATE ON is_istasyonu
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- RECETE: BOM — mamul + versiyon
-- Bir mamulun birden fazla versiyonu olabilir, sadece biri aktif.
-- ----------------------------------------------------------------
CREATE TABLE recete (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod                 varchar(50) NOT NULL,
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    -- Mamul
    urun_varyant_id     bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    -- Versiyon
    versiyon            varchar(20) NOT NULL DEFAULT '1.0',
    versiyon_notu       text,
    durum               varchar(20) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak', 'test', 'aktif', 'arsivlenmis', 'iptal'
    )),
    -- Uretim tanimi
    birim_uretim_miktari numeric(15, 4) NOT NULL DEFAULT 1,  -- bu recete 1 calistirmada kac birim uretir
    uretim_sure_dakika  int,
    varsayilan_magaza_id bigint REFERENCES magaza(id),
    -- Maliyet (son hesaplama cache'i)
    tahmini_hammadde_maliyet numeric(18, 4),
    tahmini_iscilik_maliyet numeric(18, 4),
    tahmini_genel_gider numeric(18, 4),
    tahmini_birim_maliyet numeric(18, 4),                    -- (hammadde + iscilik + genel) / birim_uretim
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    maliyet_son_hesap_tarihi timestamptz,
    -- Gecerlilik
    gecerli_baslangic   date NOT NULL DEFAULT CURRENT_DATE,
    gecerli_bitis       date,
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    silinme_tarihi      timestamptz,
    silen_kullanici_id  bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kod, versiyon),
    CHECK (birim_uretim_miktari > 0)
);
CREATE INDEX idx_recete_urun_varyant ON recete (urun_varyant_id) WHERE silindi_mi = false;
CREATE INDEX idx_recete_durum ON recete (durum) WHERE silindi_mi = false;

-- Bir mamul icin ayni anda yalniz bir aktif recete
CREATE UNIQUE INDEX unq_recete_aktif_per_mamul
    ON recete (urun_varyant_id)
    WHERE durum = 'aktif' AND silindi_mi = false;

CREATE TRIGGER trg_recete_guncelleme
    BEFORE UPDATE ON recete
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- RECETE_MALZEME: Recete bilesenleri
-- ----------------------------------------------------------------
CREATE TABLE recete_malzeme (
    id                  bigserial PRIMARY KEY,
    recete_id           bigint NOT NULL REFERENCES recete(id) ON DELETE CASCADE,
    malzeme_varyant_id  bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    sira                int NOT NULL DEFAULT 0,
    -- Miktar
    miktar              numeric(15, 4) NOT NULL,             -- birim_uretim_miktari icin gerekli miktar
    birim_id            bigint REFERENCES birim(id),
    -- Fire/kayip
    fire_orani          numeric(5, 2) NOT NULL DEFAULT 0,    -- % uretim sirasinda kayip
    -- Zorunluluk
    zorunlu_mu          boolean NOT NULL DEFAULT true,
    alternatif_grup     varchar(20),                         -- ayni grupta iki malzemeden biri secilir
    -- Maliyet (hesaplama snapshot)
    son_birim_maliyet   numeric(18, 4),
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Notlar
    aciklama            text,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (miktar > 0),
    CHECK (fire_orani >= 0 AND fire_orani <= 100),
    -- Sorun: mamul kendisi malzeme olamaz (cyclic BOM) — trigger'da guard
    UNIQUE (recete_id, malzeme_varyant_id, COALESCE(alternatif_grup, ''))
);
CREATE INDEX idx_recete_malzeme_recete ON recete_malzeme (recete_id);
CREATE INDEX idx_recete_malzeme_varyant ON recete_malzeme (malzeme_varyant_id);

CREATE TRIGGER trg_recete_malzeme_guncelleme
    BEFORE UPDATE ON recete_malzeme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Cyclic BOM guard: malzeme mamulun kendisi olamaz
CREATE OR REPLACE FUNCTION recete_cyclic_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_mamul_varyant_id bigint;
BEGIN
    SELECT urun_varyant_id INTO v_mamul_varyant_id
    FROM recete WHERE id = NEW.recete_id;

    IF v_mamul_varyant_id = NEW.malzeme_varyant_id THEN
        RAISE EXCEPTION 'Recete cyclic: mamul (varyant %) kendini malzeme olarak kullanamaz', v_mamul_varyant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recete_malzeme_cyclic_guard
    BEFORE INSERT OR UPDATE ON recete_malzeme
    FOR EACH ROW EXECUTE FUNCTION recete_cyclic_guard();


-- ----------------------------------------------------------------
-- RECETE_ISLEM: Uretim operasyonlari (routing)
-- ----------------------------------------------------------------
CREATE TABLE recete_islem (
    id                  bigserial PRIMARY KEY,
    recete_id           bigint NOT NULL REFERENCES recete(id) ON DELETE CASCADE,
    sira                int NOT NULL,
    islem_ad            varchar(200) NOT NULL,
    aciklama            text,
    -- Kaynak
    is_istasyonu_id     bigint REFERENCES is_istasyonu(id),
    -- Sure
    hazirlik_sure_dakika int NOT NULL DEFAULT 0,             -- setup time
    birim_sure_dakika   numeric(10, 4) NOT NULL DEFAULT 0,   -- birim basi dakika
    -- Maliyet
    saatlik_iscilik_maliyet numeric(18, 4),
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Kalite kontrol asamasi mi
    kalite_kontrol_mu   boolean NOT NULL DEFAULT false,
    -- Bagimlilik (sirali hesabi icin)
    onceki_islem_id     bigint REFERENCES recete_islem(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recete_id, sira),
    CHECK (hazirlik_sure_dakika >= 0),
    CHECK (birim_sure_dakika >= 0)
);
CREATE INDEX idx_recete_islem_recete ON recete_islem (recete_id, sira);

CREATE TRIGGER trg_recete_islem_guncelleme
    BEFORE UPDATE ON recete_islem
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- URETIM_EMRI: Uretim emri ana tablosu
-- ----------------------------------------------------------------
CREATE TABLE uretim_emri (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    emir_no             varchar(50) UNIQUE NOT NULL,
    -- Kaynak recete (snapshot — recete degise bile emir eski surumu saklar)
    recete_id           bigint NOT NULL REFERENCES recete(id) ON DELETE RESTRICT,
    recete_versiyon_snapshot varchar(20),
    -- Mamul (denormalize — hizli sorgu)
    urun_varyant_id     bigint NOT NULL REFERENCES urun_varyant(id),
    -- Hedef
    hedef_miktar        numeric(15, 4) NOT NULL,
    gerceklesen_miktar  numeric(15, 4) NOT NULL DEFAULT 0,
    fire_miktar         numeric(15, 4) NOT NULL DEFAULT 0,
    -- Durum
    durum               varchar(20) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak',
        'onay_bekliyor',
        'onaylandi',
        'hazirlik',             -- Malzeme hazirlaniyor
        'malzeme_cekildi',      -- Stoktan dusuldu
        'devam_ediyor',
        'durduruldu',           -- Kalite sorunu vb.
        'tamamlandi',
        'kismen_tamamlandi',
        'iptal'
    )),
    oncelik             varchar(10) NOT NULL DEFAULT 'normal' CHECK (oncelik IN (
        'dusuk', 'normal', 'yuksek', 'acil'
    )),
    -- Planlama
    planlanan_baslangic date,
    planlanan_bitis     date,
    gercek_baslangic    timestamptz,
    gercek_bitis        timestamptz,
    -- Lokasyon
    magaza_id           bigint NOT NULL REFERENCES magaza(id),
    hammadde_magaza_id  bigint REFERENCES magaza(id),        -- farkli depodan cekilebilir
    -- Personel
    sorumlu_kullanici_id bigint REFERENCES kullanici(id),
    -- Kaynak siparis (make-to-order)
    kaynak_siparis_id   bigint,                              -- FK yok, modul 08'de cross-module
    kaynak_siparis_kalem_id bigint,
    -- Maliyet (hesap snapshot)
    hammadde_maliyet    numeric(18, 4),
    iscilik_maliyet     numeric(18, 4),
    genel_gider_maliyet numeric(18, 4),
    toplam_maliyet      numeric(18, 4),
    birim_maliyet       numeric(18, 4),
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Meta
    aciklama            text,
    ic_notlar           text,
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    silinme_tarihi      timestamptz,
    silen_kullanici_id  bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (hedef_miktar > 0),
    CHECK (gerceklesen_miktar >= 0),
    CHECK (fire_miktar >= 0),
    CHECK (planlanan_bitis IS NULL OR planlanan_baslangic IS NULL OR planlanan_bitis >= planlanan_baslangic)
);
CREATE INDEX idx_uretim_emri_durum ON uretim_emri (durum) WHERE silindi_mi = false;
CREATE INDEX idx_uretim_emri_magaza ON uretim_emri (magaza_id) WHERE silindi_mi = false;
CREATE INDEX idx_uretim_emri_urun_varyant ON uretim_emri (urun_varyant_id) WHERE silindi_mi = false;
CREATE INDEX idx_uretim_emri_planlanan ON uretim_emri (planlanan_baslangic) WHERE silindi_mi = false;
CREATE INDEX idx_uretim_emri_kaynak_siparis ON uretim_emri (kaynak_siparis_id) WHERE kaynak_siparis_id IS NOT NULL;

CREATE TRIGGER trg_uretim_emri_guncelleme
    BEFORE UPDATE ON uretim_emri
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- URETIM_EMRI_MALZEME: Emir bazli malzeme cekimi
-- Plan vs gerceklesen karsilastirmasi icin satir.
-- ----------------------------------------------------------------
CREATE TABLE uretim_emri_malzeme (
    id                  bigserial PRIMARY KEY,
    uretim_emri_id      bigint NOT NULL REFERENCES uretim_emri(id) ON DELETE CASCADE,
    recete_malzeme_id   bigint REFERENCES recete_malzeme(id),
    malzeme_varyant_id  bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    sira                int NOT NULL DEFAULT 0,
    -- Miktar
    planlanan_miktar    numeric(15, 4) NOT NULL,
    gerceklesen_miktar  numeric(15, 4) NOT NULL DEFAULT 0,
    fire_miktar         numeric(15, 4) NOT NULL DEFAULT 0,
    -- Lokasyon
    magaza_id           bigint NOT NULL REFERENCES magaza(id),
    lot_no              varchar(100),
    seri_no             varchar(100),
    -- Maliyet (cekim aninda snapshot)
    birim_maliyet       numeric(18, 4),
    toplam_maliyet      numeric(18, 4),
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Stok hareket referansi
    stok_hareket_id     bigint,                              -- urun_stok_hareket.id
    stok_dusuldu_mu     boolean NOT NULL DEFAULT false,
    cekim_tarihi        timestamptz,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (planlanan_miktar > 0),
    CHECK (gerceklesen_miktar >= 0),
    CHECK (fire_miktar >= 0)
);
CREATE INDEX idx_uretim_emri_malzeme_emri ON uretim_emri_malzeme (uretim_emri_id);
CREATE INDEX idx_uretim_emri_malzeme_varyant ON uretim_emri_malzeme (malzeme_varyant_id);

CREATE TRIGGER trg_uretim_emri_malzeme_guncelleme
    BEFORE UPDATE ON uretim_emri_malzeme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- URETIM_EMRI_CIKTI: Uretim ciktisi (ana mamul + yan urun)
-- ----------------------------------------------------------------
CREATE TABLE uretim_emri_cikti (
    id                  bigserial PRIMARY KEY,
    uretim_emri_id      bigint NOT NULL REFERENCES uretim_emri(id) ON DELETE CASCADE,
    urun_varyant_id     bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    cikti_tipi          varchar(20) NOT NULL DEFAULT 'ana' CHECK (cikti_tipi IN (
        'ana',                  -- Asil mamul
        'yan_urun',             -- By-product
        'fire',                 -- Kullanilamaz kayip
        'hurda'                 -- Satilabilir kayip (metal kirpintisi vb.)
    )),
    miktar              numeric(15, 4) NOT NULL,
    kalite              varchar(20) DEFAULT 'birinci' CHECK (kalite IN (
        'birinci', 'ikinci', 'ucuncu', 'red'
    )),
    lot_no              varchar(100),
    seri_no             varchar(100),
    magaza_id           bigint NOT NULL REFERENCES magaza(id),
    -- Maliyet
    birim_maliyet       numeric(18, 4),
    maliyet_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Stok hareket referansi
    stok_hareket_id     bigint,                              -- urun_stok_hareket.id
    stoga_alindi_mi     boolean NOT NULL DEFAULT false,
    stoga_alim_tarihi   timestamptz,
    -- Meta
    aciklama            text,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (miktar > 0)
);
CREATE INDEX idx_uretim_emri_cikti_emri ON uretim_emri_cikti (uretim_emri_id);
CREATE INDEX idx_uretim_emri_cikti_varyant ON uretim_emri_cikti (urun_varyant_id);

CREATE TRIGGER trg_uretim_emri_cikti_guncelleme
    BEFORE UPDATE ON uretim_emri_cikti
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- URETIM_EMRI_ISLEM_LOG: Recete islem asamalari tamamlama
-- ----------------------------------------------------------------
CREATE TABLE uretim_emri_islem_log (
    id                  bigserial PRIMARY KEY,
    uretim_emri_id      bigint NOT NULL REFERENCES uretim_emri(id) ON DELETE CASCADE,
    recete_islem_id     bigint REFERENCES recete_islem(id),
    sira                int NOT NULL,
    islem_ad            varchar(200),
    is_istasyonu_id     bigint REFERENCES is_istasyonu(id),
    baslangic_tarihi    timestamptz,
    bitis_tarihi        timestamptz,
    sure_dakika         int,
    uretilen_miktar     numeric(15, 4),
    fire_miktar         numeric(15, 4) NOT NULL DEFAULT 0,
    kalite_kontrol_sonuc varchar(20) CHECK (kalite_kontrol_sonuc IN ('kabul', 'red', 'duzeltme')),
    kullanici_id        bigint REFERENCES kullanici(id),
    aciklama            text,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uretim_emri_islem_log_emri ON uretim_emri_islem_log (uretim_emri_id, sira);


-- ----------------------------------------------------------------
-- URETIM_EMRI_DURUM_LOG: Durum gecis logu
-- ----------------------------------------------------------------
CREATE TABLE uretim_emri_durum_log (
    id                  bigserial PRIMARY KEY,
    uretim_emri_id      bigint NOT NULL REFERENCES uretim_emri(id) ON DELETE CASCADE,
    eski_durum          varchar(20),
    yeni_durum          varchar(20) NOT NULL,
    aciklama            text,
    kullanici_id        bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uretim_emri_durum_log_emri ON uretim_emri_durum_log (uretim_emri_id, olusturma_tarihi DESC);


-- ============================================================
-- FONKSIYONLAR
-- ============================================================

-- ----------------------------------------------------------------
-- recete_maliyet_hesapla: Guncel hammadde fiyatlariyla maliyet
-- urun_stok.ortalama_maliyet (modul 07) kaynak alinir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION recete_maliyet_hesapla(
    p_recete_id bigint,
    p_magaza_id bigint DEFAULT NULL
) RETURNS numeric AS $$
DECLARE
    v_hammadde_toplam numeric(18, 4) := 0;
    v_iscilik_toplam numeric(18, 4) := 0;
    v_birim_miktar numeric(15, 4);
    v_malzeme record;
    v_islem record;
    v_birim_maliyet numeric(18, 4);
BEGIN
    SELECT birim_uretim_miktari INTO v_birim_miktar
    FROM recete WHERE id = p_recete_id;

    IF v_birim_miktar IS NULL THEN
        RAISE EXCEPTION 'Recete bulunamadi: %', p_recete_id;
    END IF;

    -- Hammadde
    FOR v_malzeme IN
        SELECT rm.id, rm.malzeme_varyant_id, rm.miktar, rm.fire_orani
        FROM recete_malzeme rm
        WHERE rm.recete_id = p_recete_id
          AND rm.zorunlu_mu = true
    LOOP
        SELECT COALESCE(AVG(us.ortalama_maliyet), 0) INTO v_birim_maliyet
        FROM urun_stok us
        WHERE us.urun_varyant_id = v_malzeme.malzeme_varyant_id
          AND (p_magaza_id IS NULL OR us.magaza_id = p_magaza_id)
          AND us.ortalama_maliyet IS NOT NULL;

        -- Fire dahil efektif miktar
        v_hammadde_toplam := v_hammadde_toplam +
            (v_malzeme.miktar * v_birim_maliyet * (1 + v_malzeme.fire_orani / 100));

        UPDATE recete_malzeme
        SET son_birim_maliyet = v_birim_maliyet,
            guncelleme_tarihi = now()
        WHERE id = v_malzeme.id;
    END LOOP;

    -- Isçilik
    FOR v_islem IN
        SELECT ri.id, ri.hazirlik_sure_dakika, ri.birim_sure_dakika,
               COALESCE(ri.saatlik_iscilik_maliyet, ii.saatlik_maliyet, 0) AS saat_maliyet
        FROM recete_islem ri
        LEFT JOIN is_istasyonu ii ON ii.id = ri.is_istasyonu_id
        WHERE ri.recete_id = p_recete_id
    LOOP
        v_iscilik_toplam := v_iscilik_toplam +
            ((v_islem.hazirlik_sure_dakika + v_islem.birim_sure_dakika * v_birim_miktar) / 60.0) * v_islem.saat_maliyet;
    END LOOP;

    -- Toplami recete'ye yaz
    UPDATE recete
    SET tahmini_hammadde_maliyet = v_hammadde_toplam,
        tahmini_iscilik_maliyet = v_iscilik_toplam,
        tahmini_genel_gider = ROUND((v_hammadde_toplam + v_iscilik_toplam) * 0.10, 4),  -- %10 genel gider varsayilan
        tahmini_birim_maliyet = ROUND(
            (v_hammadde_toplam + v_iscilik_toplam + (v_hammadde_toplam + v_iscilik_toplam) * 0.10)
            / v_birim_miktar, 4
        ),
        maliyet_son_hesap_tarihi = now(),
        guncelleme_tarihi = now()
    WHERE id = p_recete_id;

    RETURN (v_hammadde_toplam + v_iscilik_toplam * 1.10) / v_birim_miktar;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- uretim_emri_olustur: Receteden emir uret
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION uretim_emri_olustur(
    p_recete_id bigint,
    p_hedef_miktar numeric,
    p_magaza_id bigint,
    p_planlanan_baslangic date DEFAULT NULL,
    p_planlanan_bitis date DEFAULT NULL,
    p_kaynak_siparis_id bigint DEFAULT NULL,
    p_sorumlu_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_emir_id bigint;
    v_emir_no varchar;
    v_recete record;
    v_carpan numeric(15, 6);
    v_malzeme record;
BEGIN
    SELECT id, kod, versiyon, urun_varyant_id, birim_uretim_miktari, durum
      INTO v_recete
    FROM recete
    WHERE id = p_recete_id;

    IF v_recete.id IS NULL THEN
        RAISE EXCEPTION 'Recete bulunamadi: %', p_recete_id;
    END IF;

    IF v_recete.durum <> 'aktif' THEN
        RAISE EXCEPTION 'Recete aktif degil (durum=%)', v_recete.durum;
    END IF;

    v_emir_no := 'URE-' || to_char(now(), 'YYYYMMDD') || '-' ||
                 lpad(nextval('uretim_emri_id_seq')::text, 6, '0');

    -- Miktar carpani (recete 1 calistirmada birim_uretim_miktari kadar uretir)
    v_carpan := p_hedef_miktar / v_recete.birim_uretim_miktari;

    INSERT INTO uretim_emri (
        emir_no, recete_id, recete_versiyon_snapshot, urun_varyant_id,
        hedef_miktar, durum, magaza_id,
        planlanan_baslangic, planlanan_bitis,
        kaynak_siparis_id, sorumlu_kullanici_id
    ) VALUES (
        v_emir_no, v_recete.id, v_recete.versiyon, v_recete.urun_varyant_id,
        p_hedef_miktar, 'onaylandi', p_magaza_id,
        p_planlanan_baslangic, p_planlanan_bitis,
        p_kaynak_siparis_id, p_sorumlu_kullanici_id
    ) RETURNING id INTO v_emir_id;

    -- Malzeme satirlarini recete'den turet
    FOR v_malzeme IN
        SELECT * FROM recete_malzeme WHERE recete_id = v_recete.id
    LOOP
        INSERT INTO uretim_emri_malzeme (
            uretim_emri_id, recete_malzeme_id, malzeme_varyant_id,
            planlanan_miktar, magaza_id
        ) VALUES (
            v_emir_id, v_malzeme.id, v_malzeme.malzeme_varyant_id,
            ROUND(v_malzeme.miktar * v_carpan * (1 + v_malzeme.fire_orani / 100), 4),
            p_magaza_id
        );
    END LOOP;

    -- Durum log
    INSERT INTO uretim_emri_durum_log (
        uretim_emri_id, eski_durum, yeni_durum, aciklama, kullanici_id
    ) VALUES (
        v_emir_id, NULL, 'onaylandi', 'Emir olusturuldu', p_sorumlu_kullanici_id
    );

    RETURN v_emir_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- uretim_emri_baslat: Hammaddeleri stoktan dus
-- Modul 07 stok_dus fonksiyonunu cagirir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION uretim_emri_baslat(
    p_emri_id bigint,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_durum varchar;
    v_malzeme record;
    v_stok_hareket_id bigint;
    v_toplam_hammadde numeric(18, 4) := 0;
    v_birim_maliyet numeric(18, 4);
BEGIN
    SELECT durum INTO v_durum
    FROM uretim_emri WHERE id = p_emri_id FOR UPDATE;

    IF v_durum IS NULL THEN
        RAISE EXCEPTION 'Uretim emri bulunamadi: %', p_emri_id;
    END IF;
    IF v_durum NOT IN ('onaylandi', 'hazirlik') THEN
        RAISE EXCEPTION 'Uretim emri baslatilamaz (durum=%)', v_durum;
    END IF;

    -- Her planlanan malzemeyi cek
    FOR v_malzeme IN
        SELECT id, malzeme_varyant_id, planlanan_miktar, magaza_id
        FROM uretim_emri_malzeme
        WHERE uretim_emri_id = p_emri_id AND stok_dusuldu_mu = false
    LOOP
        -- Maliyet snapshot
        SELECT us.ortalama_maliyet INTO v_birim_maliyet
        FROM urun_stok us
        WHERE us.urun_varyant_id = v_malzeme.malzeme_varyant_id
          AND us.magaza_id = v_malzeme.magaza_id;

        v_stok_hareket_id := stok_dus(
            v_malzeme.malzeme_varyant_id,
            v_malzeme.magaza_id,
            v_malzeme.planlanan_miktar,
            'uretim_cikis',
            'uretim_emri',
            p_emri_id,
            p_kullanici_id,
            'Uretim emri hammadde cekimi'
        );

        UPDATE uretim_emri_malzeme
        SET gerceklesen_miktar = planlanan_miktar,
            stok_hareket_id = v_stok_hareket_id,
            stok_dusuldu_mu = true,
            cekim_tarihi = now(),
            birim_maliyet = v_birim_maliyet,
            toplam_maliyet = ROUND(planlanan_miktar * COALESCE(v_birim_maliyet, 0), 4),
            guncelleme_tarihi = now()
        WHERE id = v_malzeme.id;

        v_toplam_hammadde := v_toplam_hammadde + COALESCE(v_malzeme.planlanan_miktar * v_birim_maliyet, 0);
    END LOOP;

    UPDATE uretim_emri
    SET durum = 'devam_ediyor',
        gercek_baslangic = now(),
        hammadde_maliyet = v_toplam_hammadde,
        guncelleyen_kullanici_id = p_kullanici_id,
        guncelleme_tarihi = now()
    WHERE id = p_emri_id;

    INSERT INTO uretim_emri_durum_log (uretim_emri_id, eski_durum, yeni_durum, aciklama, kullanici_id)
    VALUES (p_emri_id, v_durum, 'devam_ediyor', 'Hammadde cekildi, uretim basladi', p_kullanici_id);
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- uretim_emri_tamamla: Mamul stoga al
-- Birim maliyet = (hammadde + iscilik + genel_gider) / cikti_miktar
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION uretim_emri_tamamla(
    p_emri_id bigint,
    p_cikti_miktar numeric,
    p_fire_miktar numeric DEFAULT 0,
    p_kalite varchar DEFAULT 'birinci',
    p_lot_no varchar DEFAULT NULL,
    p_iscilik_maliyet numeric DEFAULT 0,
    p_genel_gider numeric DEFAULT 0,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_emri record;
    v_toplam_maliyet numeric(18, 4);
    v_birim_maliyet numeric(18, 4);
    v_stok_hareket_id bigint;
    v_cikti_id bigint;
    v_yeni_durum varchar;
BEGIN
    SELECT * INTO v_emri FROM uretim_emri WHERE id = p_emri_id FOR UPDATE;
    IF v_emri.id IS NULL THEN
        RAISE EXCEPTION 'Uretim emri bulunamadi: %', p_emri_id;
    END IF;
    IF v_emri.durum NOT IN ('devam_ediyor', 'kismen_tamamlandi') THEN
        RAISE EXCEPTION 'Emir tamamlanamaz (durum=%)', v_emri.durum;
    END IF;
    IF p_cikti_miktar <= 0 THEN
        RAISE EXCEPTION 'cikti_miktar pozitif olmali';
    END IF;

    v_toplam_maliyet := COALESCE(v_emri.hammadde_maliyet, 0) +
                        COALESCE(p_iscilik_maliyet, 0) +
                        COALESCE(p_genel_gider, 0);
    v_birim_maliyet := ROUND(v_toplam_maliyet / p_cikti_miktar, 4);

    -- Stoga al
    v_stok_hareket_id := stok_artir(
        v_emri.urun_varyant_id,
        v_emri.magaza_id,
        p_cikti_miktar,
        'uretim_giris',
        v_birim_maliyet,
        v_emri.maliyet_para_birimi,
        1,
        'uretim_emri',
        p_emri_id,
        p_kullanici_id,
        'Uretim ciktisi'
    );

    -- Cikti kaydi
    INSERT INTO uretim_emri_cikti (
        uretim_emri_id, urun_varyant_id, cikti_tipi,
        miktar, kalite, lot_no, magaza_id,
        birim_maliyet, maliyet_para_birimi,
        stok_hareket_id, stoga_alindi_mi, stoga_alim_tarihi
    ) VALUES (
        p_emri_id, v_emri.urun_varyant_id, 'ana',
        p_cikti_miktar, p_kalite, p_lot_no, v_emri.magaza_id,
        v_birim_maliyet, v_emri.maliyet_para_birimi,
        v_stok_hareket_id, true, now()
    ) RETURNING id INTO v_cikti_id;

    -- Emri guncelle
    v_yeni_durum := CASE
        WHEN v_emri.gerceklesen_miktar + p_cikti_miktar >= v_emri.hedef_miktar THEN 'tamamlandi'
        ELSE 'kismen_tamamlandi'
    END;

    UPDATE uretim_emri
    SET gerceklesen_miktar = gerceklesen_miktar + p_cikti_miktar,
        fire_miktar = fire_miktar + COALESCE(p_fire_miktar, 0),
        iscilik_maliyet = COALESCE(iscilik_maliyet, 0) + COALESCE(p_iscilik_maliyet, 0),
        genel_gider_maliyet = COALESCE(genel_gider_maliyet, 0) + COALESCE(p_genel_gider, 0),
        toplam_maliyet = v_toplam_maliyet,
        birim_maliyet = v_birim_maliyet,
        durum = v_yeni_durum,
        gercek_bitis = CASE WHEN v_yeni_durum = 'tamamlandi' THEN now() ELSE gercek_bitis END,
        guncelleyen_kullanici_id = p_kullanici_id,
        guncelleme_tarihi = now()
    WHERE id = p_emri_id;

    INSERT INTO uretim_emri_durum_log (uretim_emri_id, eski_durum, yeni_durum, aciklama, kullanici_id)
    VALUES (p_emri_id, v_emri.durum, v_yeni_durum,
            'Cikti: ' || p_cikti_miktar || ', fire: ' || COALESCE(p_fire_miktar, 0),
            p_kullanici_id);

    RETURN v_cikti_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- uretim_emri_iptal: Emri iptal et + hammadde iade
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION uretim_emri_iptal(
    p_emri_id bigint,
    p_sebep text,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_emri record;
    v_malzeme record;
BEGIN
    SELECT * INTO v_emri FROM uretim_emri WHERE id = p_emri_id FOR UPDATE;
    IF v_emri.id IS NULL THEN
        RAISE EXCEPTION 'Uretim emri bulunamadi: %', p_emri_id;
    END IF;
    IF v_emri.durum IN ('tamamlandi', 'iptal') THEN
        RAISE EXCEPTION 'Emir iptal edilemez (durum=%)', v_emri.durum;
    END IF;

    -- Cekilen hammaddeleri iade et
    FOR v_malzeme IN
        SELECT * FROM uretim_emri_malzeme
        WHERE uretim_emri_id = p_emri_id AND stok_dusuldu_mu = true
    LOOP
        PERFORM stok_artir(
            v_malzeme.malzeme_varyant_id,
            v_malzeme.magaza_id,
            v_malzeme.gerceklesen_miktar,
            'iptal_geri_yukleme',
            v_malzeme.birim_maliyet,
            v_malzeme.maliyet_para_birimi,
            1,
            'uretim_emri',
            p_emri_id,
            p_kullanici_id,
            'Uretim emri iptal — hammadde iadesi'
        );

        UPDATE uretim_emri_malzeme
        SET gerceklesen_miktar = 0,
            stok_dusuldu_mu = false,
            guncelleme_tarihi = now()
        WHERE id = v_malzeme.id;
    END LOOP;

    UPDATE uretim_emri
    SET durum = 'iptal',
        ic_notlar = COALESCE(ic_notlar || E'\n', '') || 'IPTAL: ' || p_sebep,
        guncelleyen_kullanici_id = p_kullanici_id,
        guncelleme_tarihi = now()
    WHERE id = p_emri_id;

    INSERT INTO uretim_emri_durum_log (uretim_emri_id, eski_durum, yeni_durum, aciklama, kullanici_id)
    VALUES (p_emri_id, v_emri.durum, 'iptal', p_sebep, p_kullanici_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VIEW'LAR
-- ============================================================

-- ----------------------------------------------------------------
-- vw_uretim_emri_aktif: Devam eden uretimler
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_uretim_emri_aktif AS
SELECT
    ue.id,
    ue.emir_no,
    ue.durum,
    ue.oncelik,
    ue.urun_varyant_id,
    uv.sku AS mamul_sku,
    u.ad AS mamul_ad,
    ue.hedef_miktar,
    ue.gerceklesen_miktar,
    ue.fire_miktar,
    ROUND(ue.gerceklesen_miktar / NULLIF(ue.hedef_miktar, 0) * 100, 2) AS tamamlanma_orani,
    ue.magaza_id,
    m.ad AS magaza_ad,
    ue.planlanan_baslangic,
    ue.planlanan_bitis,
    ue.gercek_baslangic,
    ue.sorumlu_kullanici_id,
    (k.ad || ' ' || k.soyad) AS sorumlu_ad,
    ue.hammadde_maliyet,
    ue.iscilik_maliyet,
    ue.toplam_maliyet,
    ue.birim_maliyet,
    ue.maliyet_para_birimi,
    CASE
        WHEN ue.planlanan_bitis IS NOT NULL AND ue.planlanan_bitis < CURRENT_DATE
             AND ue.durum NOT IN ('tamamlandi', 'iptal') THEN true
        ELSE false
    END AS gecikti_mi
FROM uretim_emri ue
JOIN urun_varyant uv ON uv.id = ue.urun_varyant_id
JOIN urun u ON u.id = uv.urun_id
JOIN magaza m ON m.id = ue.magaza_id
LEFT JOIN kullanici k ON k.id = ue.sorumlu_kullanici_id
WHERE ue.durum NOT IN ('tamamlandi', 'iptal')
  AND ue.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_recete_maliyet: Guncel maliyet (hesaplanmis snapshot)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_recete_maliyet AS
SELECT
    r.id,
    r.kod,
    r.ad,
    r.versiyon,
    r.durum,
    r.urun_varyant_id,
    uv.sku AS mamul_sku,
    r.birim_uretim_miktari,
    r.tahmini_hammadde_maliyet,
    r.tahmini_iscilik_maliyet,
    r.tahmini_genel_gider,
    r.tahmini_birim_maliyet,
    r.maliyet_para_birimi,
    r.maliyet_son_hesap_tarihi,
    -- Malzeme sayisi
    (SELECT COUNT(*) FROM recete_malzeme rm WHERE rm.recete_id = r.id) AS malzeme_sayisi,
    (SELECT COUNT(*) FROM recete_islem ri WHERE ri.recete_id = r.id) AS islem_sayisi
FROM recete r
JOIN urun_varyant uv ON uv.id = r.urun_varyant_id
WHERE r.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_uretim_kapasite_kullanim: Is istasyonu yuku
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_uretim_kapasite_kullanim AS
SELECT
    ii.id AS is_istasyonu_id,
    ii.kod,
    ii.ad,
    ii.magaza_id,
    ii.saatlik_kapasite,
    ii.kullanim_orani,
    (
        SELECT COUNT(*)
        FROM uretim_emri_islem_log uiil
        JOIN uretim_emri ue ON ue.id = uiil.uretim_emri_id
        WHERE uiil.is_istasyonu_id = ii.id
          AND ue.durum IN ('devam_ediyor', 'onaylandi', 'hazirlik')
    ) AS aktif_emir_sayisi
FROM is_istasyonu ii
WHERE ii.aktif_mi = true AND ii.silindi_mi = false;


-- ============================================================
-- NOTLAR:
--   * Siparise bagli uretim (make-to-order): siparis olusunca tetiklenen
--     app katmani uretim_emri_olustur cagirir, kaynak_siparis_id set edilir.
--   * Recete aktif gecis: ayni mamul icin yeni versiyon aktif olurken
--     eski aktif 'arsivlenmis' yapilmali. App katmani veya ayri function.
--   * Mamul hierarsi (alt montaj): bir recetede malzeme olarak baska
--     bir mamulun varyanti kullanilabilir — cyclic guard tek seviye.
--     Multi-level BOM icin gelecekte recursive CTE.
--
-- PHP v1'de YOK, v2'de EKLENDI:
--   * Recete versiyonlama + aktif tek versiyon
--   * Alternatif malzeme gruplari
--   * Fire orani hammadde bazinda
--   * Uretim emri durum state machine + log
--   * Kaynak siparis bagi (make-to-order)
--   * Gercek iscilik + genel gider dagilimi
--   * Is istasyonu kapasite view
--   * Partial completion (kismen_tamamlandi)
--   * Iptal isleminde hammadde iadesi
-- ============================================================
