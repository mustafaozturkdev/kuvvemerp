-- ============================================================
-- MODUL 14: SERVIS (Tamir / Bakim / Kurulum / Garanti)
-- ============================================================
-- PHP v1'deki servis modulunden esinlenildi ama daha temiz.
--
-- Kapsam:
--   * Servis kategorileri (tamir, bakim, kurulum, garanti, kontrol)
--   * Servis kayit (fis_no, cari, urun, seri_no, ariza, durum)
--   * Servis islem (yapilan islemler, saat, ucret)
--   * Servis parca (yedek parca tuketimi -> stok dusumu)
--   * Servis durum log (state machine)
--   * Servis dosya (foto, fatura, garanti belgesi)
--   * Garanti yonetimi (satislar uzerinden otomatik kayit)
--
-- Entegrasyon:
--   * cari              (modul 05) — servise getiren musteri
--   * magaza            (modul 04) — servis merkezi/atolye
--   * kullanici          (modul 01) — teknisyen, kasiyer
--   * urun_varyant      (modul 06) — servise gelen urun + yedek parca
--   * urun_stok_hareket (modul 07) — yedek parca dusumu (stok_dus)
--   * siparis / fatura  (modul 08) — servis ucreti faturalanir, garanti kaynak satisi
--   * para_birimi       (modul 02) — ucret + parca para biriminde
--
-- Tasarim kararlari:
--   1) Servis kayit "durum" alani acik enum state machine (trg ile log'lanir).
--   2) servis_parca garanti kapsaminda olunca musteriye yansitilmaz (ucret 0).
--   3) garanti_kayit satis triggerlari ile otomatik olusur (fatura kesildiginde).
--   4) Seri_no takipli urunlerde garanti urun_stok_seri (modul 07) ile baglidir.
--   5) Servis tamamlandiginda fatura/siparis baglantisi app katmaninda kurulur.
--   6) servis_dosya polymorphic degil — servis_kayit_id veya servis_islem_id
--      secimli, CHECK ile tek dolu.
-- ============================================================


-- ----------------------------------------------------------------
-- SERVIS_KATEGORI: Servis kategorileri (tenant tanimlar)
-- ----------------------------------------------------------------
CREATE TABLE servis_kategori (
    id                  bigserial PRIMARY KEY,
    kod                 varchar(50) UNIQUE NOT NULL,
    ad                  varchar(100) NOT NULL,
    aciklama            text,
    -- Varsayilan ozellikler
    varsayilan_sure_dakika int,                             -- ortalama islem suresi
    varsayilan_ucret    numeric(18, 4),                      -- ortalama ucret
    varsayilan_para_birimi char(3) REFERENCES para_birimi(kod),
    -- Siralama/aktif
    renk                varchar(20),                         -- hex
    ikon                varchar(50),
    sira                int NOT NULL DEFAULT 0,
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_servis_kategori_guncelleme
    BEFORE UPDATE ON servis_kategori
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- SERVIS_KAYIT: Ana servis fisi (is emri)
-- ----------------------------------------------------------------
CREATE TABLE servis_kayit (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    fis_no              varchar(50) UNIQUE NOT NULL,
    -- Siniflandirma
    tip                 varchar(20) NOT NULL CHECK (tip IN (
        'tamir',                -- Ariza tamiri
        'bakim',                -- Periyodik bakim
        'kurulum',              -- Yeni urun kurulumu
        'garanti',              -- Garanti kapsami
        'kontrol',              -- Teshis/muayene
        'iade_onari',           -- Iade gelen urun onari
        'diger'
    )),
    kategori_id         bigint REFERENCES servis_kategori(id),
    durum               varchar(30) NOT NULL DEFAULT 'alindi' CHECK (durum IN (
        'alindi',               -- Musteriden teslim alindi
        'kontrol',              -- Teshis asamasinda
        'fiyat_teklifi',        -- Musteriye teklif gonderildi
        'onay_bekleniyor',      -- Musteri onayi bekleniyor
        'parca_bekleniyor',     -- Yedek parca siparisi bekleniyor
        'tamir_devam_ediyor',   -- Isçilik devam ediyor
        'test',                 -- Test/kalite kontrol
        'tamamlandi',           -- Hazir, teslim bekliyor
        'teslim_edildi',        -- Musteriye teslim edildi
        'iade_red',             -- Onarilamiyor/reddedildi
        'iptal'                 -- Musteri vazgectı
    )),
    oncelik             varchar(10) NOT NULL DEFAULT 'normal' CHECK (oncelik IN (
        'dusuk', 'normal', 'yuksek', 'acil'
    )),
    -- Cari + lokasyon
    cari_id             bigint NOT NULL REFERENCES cari(id) ON DELETE RESTRICT,
    magaza_id           bigint NOT NULL REFERENCES magaza(id) ON DELETE RESTRICT,
    -- Urun
    urun_varyant_id     bigint REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    seri_no             varchar(100),
    marka               varchar(100),                        -- snapshot (urun marka degisebilir)
    model               varchar(200),
    urun_ad_snapshot    varchar(300),
    aksesuar_listesi    text,                                -- "sarj aleti, kutu, kulaklik"
    -- Garanti durumu
    garanti_durumu      varchar(20) NOT NULL DEFAULT 'belirsiz' CHECK (garanti_durumu IN (
        'garantide', 'disi', 'belirsiz', 'iptal'
    )),
    garanti_kayit_id    bigint,                              -- FK asagida (garanti_kayit olustuktan sonra)
    garanti_baslangic   date,
    garanti_bitis       date,
    -- Ariza / teshis
    ariza_tanim         text NOT NULL,                       -- musterinin anlatimi
    on_kontrol_notlari  text,                                -- teshis sonucu teknisyen notu
    cozum_aciklama      text,                                -- neler yapildi
    -- Finansal
    fiyat_teklifi       numeric(18, 4),                      -- on tahmini
    onaylanan_fiyat     numeric(18, 4),
    gerceklesen_fiyat   numeric(18, 4),
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    kur                 numeric(18, 6) NOT NULL DEFAULT 1,
    -- Tarihler
    alindi_tarih        timestamptz NOT NULL DEFAULT now(),
    soz_verilen_tarih   timestamptz,
    tamamlandi_tarih    timestamptz,
    teslim_tarih        timestamptz,
    -- Personel
    teslim_alan_kullanici_id bigint REFERENCES kullanici(id),
    sorumlu_teknisyen_id bigint REFERENCES kullanici(id),
    teslim_eden_kullanici_id bigint REFERENCES kullanici(id),
    -- Fatura/siparis baglantisi (islem faturalandiginda)
    siparis_id          bigint,                              -- FK yok, polymorphic (modul 08 siparis.id)
    fatura_id           bigint,                              -- FK yok, polymorphic (modul 08 fatura.id)
    -- Musteri iletisim / bildirim tercihi
    bildirim_kanali     varchar(20) CHECK (bildirim_kanali IN ('sms', 'email', 'whatsapp', 'telefon', 'yok')),
    son_bildirim_zamani timestamptz,
    -- Musteri memnuniyet
    memnuniyet_puani    smallint CHECK (memnuniyet_puani BETWEEN 1 AND 5),
    memnuniyet_yorumu   text,
    -- Meta
    aciklama            text,
    ic_notlar           text,                                -- musteri gormez
    etiketler           text[],
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    silinme_tarihi      timestamptz,
    silen_kullanici_id  bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (fiyat_teklifi IS NULL OR fiyat_teklifi >= 0),
    CHECK (onaylanan_fiyat IS NULL OR onaylanan_fiyat >= 0)
);
CREATE INDEX idx_servis_kayit_cari ON servis_kayit (cari_id) WHERE silindi_mi = false;
CREATE INDEX idx_servis_kayit_magaza ON servis_kayit (magaza_id) WHERE silindi_mi = false;
CREATE INDEX idx_servis_kayit_durum ON servis_kayit (durum) WHERE silindi_mi = false;
CREATE INDEX idx_servis_kayit_teknisyen ON servis_kayit (sorumlu_teknisyen_id) WHERE silindi_mi = false;
CREATE INDEX idx_servis_kayit_alindi_tarih ON servis_kayit (alindi_tarih DESC);
CREATE INDEX idx_servis_kayit_seri_no ON servis_kayit (seri_no) WHERE seri_no IS NOT NULL;
CREATE INDEX idx_servis_kayit_aktif_durum ON servis_kayit (magaza_id, durum)
    WHERE durum NOT IN ('teslim_edildi', 'iptal', 'iade_red') AND silindi_mi = false;

CREATE TRIGGER trg_servis_kayit_guncelleme
    BEFORE UPDATE ON servis_kayit
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- SERVIS_DURUM_LOG: State machine gecis logu (audit)
-- ----------------------------------------------------------------
CREATE TABLE servis_durum_log (
    id                  bigserial PRIMARY KEY,
    servis_kayit_id     bigint NOT NULL REFERENCES servis_kayit(id) ON DELETE CASCADE,
    eski_durum          varchar(30),
    yeni_durum          varchar(30) NOT NULL,
    aciklama            text,
    sure_onceki_durum_saniye int,                           -- bir onceki durumdan geciş suresi
    kullanici_id        bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_servis_durum_log_kayit ON servis_durum_log (servis_kayit_id, olusturma_tarihi DESC);


-- ----------------------------------------------------------------
-- SERVIS_ISLEM: Servis kaydi icin yapilan isler (isçilik)
-- ----------------------------------------------------------------
CREATE TABLE servis_islem (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    servis_kayit_id     bigint NOT NULL REFERENCES servis_kayit(id) ON DELETE CASCADE,
    -- Islem
    sira                int NOT NULL DEFAULT 0,
    islem_aciklama      text NOT NULL,
    islem_kod           varchar(50),                         -- standart islem kod (opsiyonel)
    -- Sure
    baslangic_tarihi    timestamptz,
    bitis_tarihi        timestamptz,
    sure_dakika         int,
    -- Finansal
    ucret               numeric(18, 4) NOT NULL DEFAULT 0,
    garanti_kapsami_mi  boolean NOT NULL DEFAULT false,      -- true ise musteriden alinmaz
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Personel
    islem_yapan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (ucret >= 0),
    CHECK (sure_dakika IS NULL OR sure_dakika >= 0)
);
CREATE INDEX idx_servis_islem_kayit ON servis_islem (servis_kayit_id);
CREATE INDEX idx_servis_islem_kullanici ON servis_islem (islem_yapan_kullanici_id);

CREATE TRIGGER trg_servis_islem_guncelleme
    BEFORE UPDATE ON servis_islem
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- SERVIS_PARCA: Kullanilan yedek parcalar
-- Stok dusumu app katmaninda stok_dus('servis_parca', ...) ile yapilir.
-- ----------------------------------------------------------------
CREATE TABLE servis_parca (
    id                  bigserial PRIMARY KEY,
    servis_kayit_id     bigint NOT NULL REFERENCES servis_kayit(id) ON DELETE CASCADE,
    urun_varyant_id     bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    magaza_id           bigint NOT NULL REFERENCES magaza(id),      -- hangi depodan alindi
    miktar              numeric(15, 4) NOT NULL,
    birim_fiyat         numeric(18, 4) NOT NULL,
    indirim_orani       numeric(5, 2) NOT NULL DEFAULT 0,
    vergi_orani         numeric(5, 2) NOT NULL DEFAULT 0,
    toplam_fiyat        numeric(18, 4) NOT NULL,
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Garanti
    garanti_kapsami_mi  boolean NOT NULL DEFAULT false,      -- true => musteriden alinmaz
    -- Seri/lot takibi
    seri_no             varchar(100),
    lot_no              varchar(100),
    -- Stok dusumu referansi
    stok_hareket_id     bigint,                              -- urun_stok_hareket.id (modul 07)
    stok_dusuldu_mu     boolean NOT NULL DEFAULT false,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (miktar > 0),
    CHECK (birim_fiyat >= 0),
    CHECK (toplam_fiyat >= 0)
);
CREATE INDEX idx_servis_parca_kayit ON servis_parca (servis_kayit_id);
CREATE INDEX idx_servis_parca_varyant ON servis_parca (urun_varyant_id);

CREATE TRIGGER trg_servis_parca_guncelleme
    BEFORE UPDATE ON servis_parca
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- SERVIS_DOSYA: Foto, fatura, garanti belgesi
-- ----------------------------------------------------------------
CREATE TABLE servis_dosya (
    id                  bigserial PRIMARY KEY,
    servis_kayit_id     bigint REFERENCES servis_kayit(id) ON DELETE CASCADE,
    servis_islem_id     bigint REFERENCES servis_islem(id) ON DELETE CASCADE,
    tip                 varchar(30) NOT NULL CHECK (tip IN (
        'giris_foto',           -- Servise geldiginde cekilen foto
        'cikis_foto',           -- Teslim oncesi foto
        'ariza_foto',           -- Ariza detay foto
        'onari_foto',           -- Onari sureci
        'garanti_belgesi',
        'fatura_kopya',
        'teklif_pdf',
        'test_raporu',
        'diger'
    )),
    ad                  varchar(200) NOT NULL,
    dosya_url           text NOT NULL,
    dosya_boyut         bigint,
    mime_tipi           varchar(100),
    aciklama            text,
    yukleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (servis_kayit_id IS NOT NULL AND servis_islem_id IS NULL)
        OR (servis_kayit_id IS NULL AND servis_islem_id IS NOT NULL)
        OR (servis_kayit_id IS NOT NULL AND servis_islem_id IS NOT NULL)
    )
);
CREATE INDEX idx_servis_dosya_kayit ON servis_dosya (servis_kayit_id);
CREATE INDEX idx_servis_dosya_islem ON servis_dosya (servis_islem_id);


-- ============================================================
-- GARANTI YONETIMI
-- ============================================================

-- ----------------------------------------------------------------
-- GARANTI_KAYIT: Satis sonrasi olusan garanti
-- Otomatik olusur: trg_fatura_garanti_olustur (modul 08'de wire edilir)
-- ----------------------------------------------------------------
CREATE TABLE garanti_kayit (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    garanti_no          varchar(50) UNIQUE NOT NULL,
    -- Urun
    urun_varyant_id     bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    seri_no             varchar(100),
    -- Kaynak satis
    satis_belge_tipi    varchar(20) NOT NULL DEFAULT 'fatura' CHECK (satis_belge_tipi IN (
        'fatura', 'siparis', 'manuel'
    )),
    satis_belge_id      bigint,                              -- fatura.id veya siparis.id
    satis_kalem_id      bigint,                              -- fatura_kalem.id veya siparis_kalem.id
    satis_tarihi        date NOT NULL,
    cari_id             bigint NOT NULL REFERENCES cari(id),
    magaza_id           bigint REFERENCES magaza(id),
    -- Garanti suresi
    garanti_baslangic   date NOT NULL,
    garanti_bitis       date NOT NULL,
    garanti_sure_ay     int NOT NULL,
    -- Kapsam
    garanti_tipi        varchar(30) NOT NULL DEFAULT 'uretici' CHECK (garanti_tipi IN (
        'uretici',              -- Uretici garantisi
        'satici',               -- Satici (bizim) garantimiz
        'genisletilmis',        -- Ek paralel odemeli
        'iade'                  -- Iade sureci icinde
    )),
    garanti_kapsami     text,                                -- neler dahil, neler degil
    kapsam_disi         text,
    -- Durum
    durum               varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'aktif',
        'dolmus',
        'iptal',
        'kullanilmis'           -- Tek kullanimlik garanti (buyuk arac vb.)
    )),
    -- Meta
    aciklama            text,
    -- Soft delete
    silindi_mi          boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (garanti_bitis >= garanti_baslangic),
    CHECK (garanti_sure_ay > 0)
);
CREATE INDEX idx_garanti_kayit_cari ON garanti_kayit (cari_id) WHERE silindi_mi = false;
CREATE INDEX idx_garanti_kayit_varyant ON garanti_kayit (urun_varyant_id) WHERE silindi_mi = false;
CREATE INDEX idx_garanti_kayit_seri_no ON garanti_kayit (seri_no) WHERE seri_no IS NOT NULL;
CREATE INDEX idx_garanti_kayit_satis_belge ON garanti_kayit (satis_belge_tipi, satis_belge_id);
CREATE INDEX idx_garanti_kayit_durum ON garanti_kayit (durum) WHERE silindi_mi = false;
CREATE INDEX idx_garanti_kayit_bitis ON garanti_kayit (garanti_bitis) WHERE durum = 'aktif';

CREATE TRIGGER trg_garanti_kayit_guncelleme
    BEFORE UPDATE ON garanti_kayit
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- servis_kayit.garanti_kayit_id FK eklenmesi
ALTER TABLE servis_kayit
    ADD CONSTRAINT fk_servis_kayit_garanti
    FOREIGN KEY (garanti_kayit_id) REFERENCES garanti_kayit(id) ON DELETE SET NULL;


-- ============================================================
-- TRIGGERLAR
-- ============================================================

-- ----------------------------------------------------------------
-- trg_servis_kayit_durum_log: Durum degisince log tut
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_servis_kayit_durum_degisim()
RETURNS TRIGGER AS $$
DECLARE
    v_son_log timestamptz;
    v_sure_saniye int;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO servis_durum_log (
            servis_kayit_id, eski_durum, yeni_durum, aciklama, kullanici_id
        ) VALUES (
            NEW.id, NULL, NEW.durum, 'Servis acildi', NEW.olusturan_kullanici_id
        );
        RETURN NEW;
    END IF;

    IF NEW.durum IS DISTINCT FROM OLD.durum THEN
        SELECT MAX(olusturma_tarihi) INTO v_son_log
        FROM servis_durum_log WHERE servis_kayit_id = NEW.id;

        v_sure_saniye := CASE
            WHEN v_son_log IS NULL THEN NULL
            ELSE EXTRACT(EPOCH FROM (now() - v_son_log))::int
        END;

        INSERT INTO servis_durum_log (
            servis_kayit_id, eski_durum, yeni_durum,
            sure_onceki_durum_saniye, kullanici_id
        ) VALUES (
            NEW.id, OLD.durum, NEW.durum,
            v_sure_saniye, NEW.guncelleyen_kullanici_id
        );

        -- Kritik durumlarda tarih damgala
        IF NEW.durum = 'tamamlandi' AND NEW.tamamlandi_tarih IS NULL THEN
            NEW.tamamlandi_tarih := now();
        END IF;
        IF NEW.durum = 'teslim_edildi' AND NEW.teslim_tarih IS NULL THEN
            NEW.teslim_tarih := now();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_servis_kayit_durum_insert
    AFTER INSERT ON servis_kayit
    FOR EACH ROW EXECUTE FUNCTION trg_servis_kayit_durum_degisim();

CREATE TRIGGER trg_servis_kayit_durum_update
    BEFORE UPDATE OF durum ON servis_kayit
    FOR EACH ROW EXECUTE FUNCTION trg_servis_kayit_durum_degisim();


-- ============================================================
-- FONKSIYONLAR
-- ============================================================

-- ----------------------------------------------------------------
-- servis_alindi: Yeni servis kaydi (en temel akis)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION servis_alindi(
    p_cari_id bigint,
    p_magaza_id bigint,
    p_urun_varyant_id bigint,
    p_ariza text,
    p_tip varchar DEFAULT 'tamir',
    p_seri_no varchar DEFAULT NULL,
    p_fiyat_teklifi numeric DEFAULT NULL,
    p_para_birimi char(3) DEFAULT 'TRY',
    p_kullanici_id bigint DEFAULT NULL,
    p_oncelik varchar DEFAULT 'normal'
) RETURNS bigint AS $$
DECLARE
    v_fis_no varchar;
    v_servis_id bigint;
    v_urun_ad varchar;
    v_marka varchar;
    v_garanti_id bigint;
    v_garanti_durumu varchar;
    v_garanti_baslangic date;
    v_garanti_bitis date;
BEGIN
    IF p_cari_id IS NULL OR p_magaza_id IS NULL THEN
        RAISE EXCEPTION 'servis_alindi: cari_id ve magaza_id zorunlu';
    END IF;

    -- Fis no (tenant numara serisi sistem_ayar'da, burada basit varsayilan)
    v_fis_no := 'SRV-' || to_char(now(), 'YYYYMMDD') || '-' ||
                lpad(nextval('servis_kayit_id_seq')::text, 6, '0');

    -- Urun bilgisi snapshot
    IF p_urun_varyant_id IS NOT NULL THEN
        SELECT u.ad, m.ad
          INTO v_urun_ad, v_marka
        FROM urun_varyant uv
        JOIN urun u ON u.id = uv.urun_id
        LEFT JOIN marka m ON m.id = u.marka_id
        WHERE uv.id = p_urun_varyant_id;
    END IF;

    -- Garanti kontrolu (seri no varsa)
    IF p_seri_no IS NOT NULL THEN
        SELECT id, durum, garanti_baslangic, garanti_bitis
          INTO v_garanti_id, v_garanti_durumu, v_garanti_baslangic, v_garanti_bitis
        FROM garanti_kayit
        WHERE seri_no = p_seri_no AND silindi_mi = false
        ORDER BY garanti_bitis DESC
        LIMIT 1;

        IF v_garanti_id IS NOT NULL THEN
            IF v_garanti_durumu = 'aktif' AND v_garanti_bitis >= CURRENT_DATE THEN
                v_garanti_durumu := 'garantide';
            ELSE
                v_garanti_durumu := 'disi';
            END IF;
        ELSE
            v_garanti_durumu := 'belirsiz';
        END IF;
    END IF;

    INSERT INTO servis_kayit (
        fis_no, tip, durum, oncelik,
        cari_id, magaza_id, urun_varyant_id, seri_no,
        urun_ad_snapshot, marka,
        ariza_tanim, fiyat_teklifi, para_birimi_kod,
        garanti_kayit_id, garanti_durumu, garanti_baslangic, garanti_bitis,
        alindi_tarih, teslim_alan_kullanici_id, olusturan_kullanici_id
    ) VALUES (
        v_fis_no, p_tip, 'alindi', p_oncelik,
        p_cari_id, p_magaza_id, p_urun_varyant_id, p_seri_no,
        v_urun_ad, v_marka,
        p_ariza, p_fiyat_teklifi, p_para_birimi,
        v_garanti_id, COALESCE(v_garanti_durumu, 'belirsiz'),
        v_garanti_baslangic, v_garanti_bitis,
        now(), p_kullanici_id, p_kullanici_id
    ) RETURNING id INTO v_servis_id;

    RETURN v_servis_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- servis_durum_guncelle: Durum gecisi (state machine guard)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION servis_durum_guncelle(
    p_servis_id bigint,
    p_yeni_durum varchar,
    p_kullanici_id bigint DEFAULT NULL,
    p_aciklama text DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_eski_durum varchar;
BEGIN
    SELECT durum INTO v_eski_durum
    FROM servis_kayit WHERE id = p_servis_id FOR UPDATE;

    IF v_eski_durum IS NULL THEN
        RAISE EXCEPTION 'Servis bulunamadi: %', p_servis_id;
    END IF;

    -- Final durumlardan cikis yasak
    IF v_eski_durum IN ('teslim_edildi', 'iptal') AND p_yeni_durum <> v_eski_durum THEN
        RAISE EXCEPTION 'Final durumdan cikis yasak: %->%', v_eski_durum, p_yeni_durum;
    END IF;

    UPDATE servis_kayit
    SET durum = p_yeni_durum,
        guncelleyen_kullanici_id = p_kullanici_id,
        guncelleme_tarihi = now()
    WHERE id = p_servis_id;

    IF p_aciklama IS NOT NULL THEN
        UPDATE servis_durum_log
        SET aciklama = p_aciklama
        WHERE id = (
            SELECT MAX(id) FROM servis_durum_log WHERE servis_kayit_id = p_servis_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- servis_parca_ekle: Yedek parca ekleme + stok dusumu
-- Modul 07 stok_dus fonksiyonunu cagirir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION servis_parca_ekle(
    p_servis_id bigint,
    p_urun_varyant_id bigint,
    p_magaza_id bigint,
    p_miktar numeric,
    p_birim_fiyat numeric,
    p_garanti_kapsami boolean DEFAULT false,
    p_para_birimi char(3) DEFAULT 'TRY',
    p_seri_no varchar DEFAULT NULL,
    p_lot_no varchar DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_parca_id bigint;
    v_stok_hareket_id bigint;
    v_toplam_fiyat numeric(18, 4);
BEGIN
    IF p_miktar <= 0 THEN
        RAISE EXCEPTION 'servis_parca_ekle: miktar pozitif olmali';
    END IF;

    -- Garanti kapsaminda ise musteriye yansitilmaz
    v_toplam_fiyat := CASE
        WHEN p_garanti_kapsami THEN 0
        ELSE ROUND(p_miktar * p_birim_fiyat, 4)
    END;

    -- Stok dusumu (modul 07 fonksiyonu)
    v_stok_hareket_id := stok_dus(
        p_urun_varyant_id,
        p_magaza_id,
        p_miktar,
        'satis',                          -- servis parca satis hareketi
        'servis_parca',
        p_servis_id,
        p_kullanici_id,
        'Servis yedek parca tuketimi'
    );

    INSERT INTO servis_parca (
        servis_kayit_id, urun_varyant_id, magaza_id,
        miktar, birim_fiyat, toplam_fiyat, para_birimi_kod,
        garanti_kapsami_mi, seri_no, lot_no,
        stok_hareket_id, stok_dusuldu_mu,
        olusturan_kullanici_id
    ) VALUES (
        p_servis_id, p_urun_varyant_id, p_magaza_id,
        p_miktar, p_birim_fiyat, v_toplam_fiyat, p_para_birimi,
        p_garanti_kapsami, p_seri_no, p_lot_no,
        v_stok_hareket_id, true,
        p_kullanici_id
    ) RETURNING id INTO v_parca_id;

    RETURN v_parca_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- garanti_kontrol: Seri no ile garanti durumu sorgulama
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION garanti_kontrol(
    p_seri_no varchar
) RETURNS TABLE (
    garanti_kayit_id bigint,
    garanti_no varchar,
    durum varchar,
    kalan_gun int,
    garanti_baslangic date,
    garanti_bitis date,
    urun_varyant_id bigint,
    urun_ad text,
    cari_id bigint,
    cari_ad text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gk.id,
        gk.garanti_no,
        CASE
            WHEN gk.durum <> 'aktif' THEN gk.durum
            WHEN gk.garanti_bitis < CURRENT_DATE THEN 'dolmus'::varchar
            ELSE 'aktif'::varchar
        END AS durum,
        GREATEST(0, (gk.garanti_bitis - CURRENT_DATE))::int AS kalan_gun,
        gk.garanti_baslangic,
        gk.garanti_bitis,
        gk.urun_varyant_id,
        u.ad::text,
        gk.cari_id,
        COALESCE(c.unvan, (c.ad || ' ' || c.soyad))::text
    FROM garanti_kayit gk
    LEFT JOIN urun_varyant uv ON uv.id = gk.urun_varyant_id
    LEFT JOIN urun u ON u.id = uv.urun_id
    LEFT JOIN cari c ON c.id = gk.cari_id
    WHERE gk.seri_no = p_seri_no AND gk.silindi_mi = false
    ORDER BY gk.garanti_bitis DESC;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- garanti_otomatik_olustur: Fatura kesildiginde garanti olustur
-- Modul 08 trigger'i tarafindan cagrilir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION garanti_olustur_fatura_kaleminden(
    p_fatura_id bigint,
    p_fatura_kalem_id bigint,
    p_urun_varyant_id bigint,
    p_cari_id bigint,
    p_magaza_id bigint,
    p_seri_no varchar,
    p_satis_tarihi date,
    p_garanti_ay int
) RETURNS bigint AS $$
DECLARE
    v_garanti_id bigint;
    v_garanti_no varchar;
BEGIN
    IF p_garanti_ay IS NULL OR p_garanti_ay <= 0 THEN
        RETURN NULL;
    END IF;

    v_garanti_no := 'GAR-' || to_char(now(), 'YYYYMMDD') || '-' ||
                    lpad(nextval('garanti_kayit_id_seq')::text, 6, '0');

    INSERT INTO garanti_kayit (
        garanti_no, urun_varyant_id, seri_no,
        satis_belge_tipi, satis_belge_id, satis_kalem_id, satis_tarihi,
        cari_id, magaza_id,
        garanti_baslangic, garanti_bitis, garanti_sure_ay,
        garanti_tipi, durum
    ) VALUES (
        v_garanti_no, p_urun_varyant_id, p_seri_no,
        'fatura', p_fatura_id, p_fatura_kalem_id, p_satis_tarihi,
        p_cari_id, p_magaza_id,
        p_satis_tarihi,
        p_satis_tarihi + (p_garanti_ay || ' months')::interval,
        p_garanti_ay,
        'uretici', 'aktif'
    ) RETURNING id INTO v_garanti_id;

    RETURN v_garanti_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- garanti_dolmus_temizle: Cron — suresi dolan garantiler
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION garanti_dolmus_isaretle()
RETURNS int AS $$
DECLARE
    v_sayi int;
BEGIN
    UPDATE garanti_kayit
    SET durum = 'dolmus',
        guncelleme_tarihi = now()
    WHERE durum = 'aktif'
      AND garanti_bitis < CURRENT_DATE
      AND silindi_mi = false;

    GET DIAGNOSTICS v_sayi = ROW_COUNT;
    RETURN v_sayi;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VIEW'LAR
-- ============================================================

-- ----------------------------------------------------------------
-- vw_servis_aktif: Devam eden servisler
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_servis_aktif AS
SELECT
    sk.id,
    sk.public_id,
    sk.fis_no,
    sk.tip,
    sk.durum,
    sk.oncelik,
    sk.cari_id,
    COALESCE(c.unvan, c.ad || ' ' || c.soyad) AS cari_ad,
    sk.magaza_id,
    m.ad AS magaza_ad,
    sk.urun_varyant_id,
    sk.urun_ad_snapshot,
    sk.marka,
    sk.seri_no,
    sk.garanti_durumu,
    sk.ariza_tanim,
    sk.fiyat_teklifi,
    sk.onaylanan_fiyat,
    sk.para_birimi_kod,
    sk.alindi_tarih,
    sk.sorumlu_teknisyen_id,
    k.ad || ' ' || k.soyad AS teknisyen_ad,
    EXTRACT(EPOCH FROM (now() - sk.alindi_tarih)) / 86400 AS bekleme_gun,
    COALESCE((SELECT SUM(si.ucret) FROM servis_islem si WHERE si.servis_kayit_id = sk.id AND si.garanti_kapsami_mi = false), 0) AS iscilik_tutar,
    COALESCE((SELECT SUM(sp.toplam_fiyat) FROM servis_parca sp WHERE sp.servis_kayit_id = sk.id AND sp.garanti_kapsami_mi = false), 0) AS parca_tutar
FROM servis_kayit sk
JOIN cari c ON c.id = sk.cari_id
JOIN magaza m ON m.id = sk.magaza_id
LEFT JOIN kullanici k ON k.id = sk.sorumlu_teknisyen_id
WHERE sk.durum NOT IN ('teslim_edildi', 'iptal', 'iade_red')
  AND sk.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_servis_gecikmis: 7 gunden uzun devam eden
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_servis_gecikmis AS
SELECT *
FROM vw_servis_aktif
WHERE bekleme_gun > 7
ORDER BY bekleme_gun DESC;


-- ----------------------------------------------------------------
-- vw_garanti_yaklasan_dolus: 30 gun icinde dolacak garantiler
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_garanti_yaklasan_dolus AS
SELECT
    gk.id,
    gk.garanti_no,
    gk.seri_no,
    gk.cari_id,
    gk.urun_varyant_id,
    gk.garanti_baslangic,
    gk.garanti_bitis,
    (gk.garanti_bitis - CURRENT_DATE) AS kalan_gun
FROM garanti_kayit gk
WHERE gk.durum = 'aktif'
  AND gk.garanti_bitis BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '30 days')
  AND gk.silindi_mi = false
ORDER BY gk.garanti_bitis ASC;


-- ----------------------------------------------------------------
-- vw_servis_teknisyen_yuk: Teknisyen is yuku
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_servis_teknisyen_yuk AS
SELECT
    k.id AS kullanici_id,
    k.ad || ' ' || k.soyad AS teknisyen_ad,
    COUNT(sk.id) FILTER (WHERE sk.durum NOT IN ('teslim_edildi', 'iptal', 'iade_red')) AS aktif_is_sayisi,
    COUNT(sk.id) FILTER (WHERE sk.durum = 'tamir_devam_ediyor') AS devam_eden,
    COUNT(sk.id) FILTER (WHERE sk.durum = 'parca_bekleniyor') AS parca_bekleyen,
    AVG(EXTRACT(EPOCH FROM (COALESCE(sk.tamamlandi_tarih, now()) - sk.alindi_tarih)) / 3600)
        FILTER (WHERE sk.tamamlandi_tarih IS NOT NULL) AS ortalama_tamamlama_saat
FROM kullanici k
LEFT JOIN servis_kayit sk ON sk.sorumlu_teknisyen_id = k.id AND sk.silindi_mi = false
WHERE k.silindi_mi = false
GROUP BY k.id, k.ad, k.soyad;


-- ============================================================
-- NOTLAR (Modul 08 entegrasyon wire'lari):
--   * fatura INSERT trigger -> garanti_olustur_fatura_kaleminden (her seri_no'lu kalem icin)
--   * siparis iptal -> servis_kayit.garanti_kayit_id sifirla, garanti_kayit.durum=iptal
--   * servis faturalandirildiginda: fatura olustur + servis_kayit.fatura_id update
--
-- PHP v1'de YOK, v2'de EKLENDI:
--   * State machine log (servis_durum_log + trigger)
--   * Garanti otomatik olusturulmasi (trigger tabanli)
--   * Cok para birimi servis ucreti
--   * Teknisyen is yuku dashboard view
--   * Garanti kapsami bayragi (parca/iscilik ayri ayri)
--   * Servis icin gercek stok entegrasyonu (stok_dus cagrisi)
-- ============================================================
