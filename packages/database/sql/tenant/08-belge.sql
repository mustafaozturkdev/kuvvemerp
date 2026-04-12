-- ============================================================
-- MODÜL 08: BELGE (SİPARİŞ, İRSALİYE, FATURA, İADE) — v2 refactor
-- ============================================================
-- v1 eleştirmen skoru: 7/10 → v2 hedef: 9/10
--
-- Bu refactor'da çözülen kritik sorunlar:
--   #1 `siparis_kalem_vergi` + `fatura_kalem_vergi` ayrı tablolar (çoklu vergi: KDV+ÖTV+OIV)
--   #2 `siparis.toplam_tutar` trigger ile otomatik hesap (siparis_toplam_hesapla)
--   #3 `siparis_fatura` ara tablo — 1 sipariş → çoklu fatura; `siparis.fatura_id` KALDIRILDI
--   #4 `irsaliye.siparis_id` KALDIRILDI — kalem bazlı bağ (irsaliye_kalem.siparis_kalem_id)
--   #7 `siparis_kalem_seri` eşleşme tablosu (garanti/iade takibi için)
--   #9 `UNIQUE (firma_id, fatura_no)` — multi-firma desteği
--   #10 `iade_sebep` lookup tablo + `iade.iade_sebep_id` FK
--   #12 `siparis.cari_id` NOT NULL + `_NIHAI_TUKETICI` sistem cari gerekli
--       (cari modülünde seed edilir; bu dosya referans verir)
--
-- PHP v1'de "siparis" tablosunda magic SiparisModu vardı.
-- v2'de belge tipleri açık enum, her belge ayrı.
-- ============================================================

-- ----------------------------------------------------------------
-- BELGE_DURUM: State machine için durum tanımları (referans)
-- siparis: taslak → onay_bekliyor → onaylandi → hazirlaniyor → kargoda → teslim_edildi
-- fatura:  taslak → kesildi → odendi (kismi/tam) → iptal
-- irsaliye: taslak → kesildi → sevk_edildi → teslim_alindi → iptal
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- IADE_SEBEP: Lookup tablo (Sorun #10)
-- ----------------------------------------------------------------
CREATE TABLE iade_sebep (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    kategori        varchar(50) NOT NULL CHECK (kategori IN (
        'musteri_memnuniyetsizligi', 'urun_kusur', 'lojistik_hata',
        'yanlis_urun', 'hasarli', 'siparis_hatasi', 'diger'
    )),
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);

INSERT INTO iade_sebep (kod, ad, kategori, sira) VALUES
('begenilmedi',    'Beğenilmedi',             'musteri_memnuniyetsizligi', 10),
('uymadi',         'Beden/ölçü uymadı',       'musteri_memnuniyetsizligi', 20),
('arizali',        'Arızalı / Çalışmıyor',    'urun_kusur',               30),
('hasarli',        'Hasarlı geldi',           'hasarli',                  40),
('yanlis_urun',    'Yanlış ürün gönderildi',  'yanlis_urun',              50),
('eksik',          'Eksik ürün',              'lojistik_hata',            60),
('gec_teslim',     'Geç teslimat',            'lojistik_hata',            70),
('fikir_degistir', 'Fikir değiştirdim',       'musteri_memnuniyetsizligi', 80),
('daha_ucuz',      'Daha ucuzunu buldum',     'musteri_memnuniyetsizligi', 90),
('diger',          'Diğer',                   'diger',                    999);

-- ----------------------------------------------------------------
-- SIPARIS: Satış / Alış / İade siparişi
-- Değişiklikler:
--   - `fatura_id` KALDIRILDI → siparis_fatura ara tablosu
--   - `cari_id` NOT NULL (nihai tüketici için sistem cari _NIHAI_TUKETICI)
--   - Vergi toplamları header'da hesaplanıyor (trigger üretir)
-- ----------------------------------------------------------------
CREATE TABLE siparis (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    siparis_no      varchar(50) UNIQUE NOT NULL,
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'satis', 'alis', 'iade_satis', 'iade_alis', 'transfer', 'teklif'
    )),
    satis_kanali    varchar(20) NOT NULL DEFAULT 'perakende' CHECK (satis_kanali IN (
        'perakende', 'b2b', 'eticaret', 'pazaryeri', 'telefon', 'whatsapp', 'fuar', 'diger'
    )),
    -- Pazaryeri özel
    pazaryeri_kod   varchar(50),
    pazaryeri_siparis_id varchar(100),
    pazaryeri_paket_no varchar(100),
    -- Cari + Mağaza (Sorun #12: cari_id NOT NULL — _NIHAI_TUKETICI sistem cari kullanılır)
    cari_id         bigint NOT NULL REFERENCES cari(id),
    cari_unvan_snapshot varchar(300),
    cari_vergi_no_snapshot varchar(50),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    kasa_id         bigint REFERENCES kasa(id),
    -- Adresler (snapshot)
    fatura_adres_id bigint REFERENCES cari_adres(id),
    fatura_adres_snapshot jsonb,
    sevk_adres_id   bigint REFERENCES cari_adres(id),
    sevk_adres_snapshot jsonb,
    -- Durum
    durum           varchar(30) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak', 'onay_bekliyor', 'onaylandi', 'hazirlaniyor',
        'kismen_hazirlandi', 'hazirlandi', 'kargoda', 'teslim_edildi',
        'iade_talep_edildi', 'iade_edildi', 'iptal_edildi', 'tamamlandi'
    )),
    -- Tarihler
    siparis_tarihi  timestamptz NOT NULL DEFAULT now(),
    onay_tarihi     timestamptz,
    sevk_tarihi     timestamptz,
    teslim_tarihi   timestamptz,
    vade_tarihi     date,
    iptal_tarihi    timestamptz,
    -- Para birimi
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    fiyatlar_kdv_dahil_mi boolean NOT NULL DEFAULT true,
    -- Toplamlar (trigger ile otomatik hesap — Sorun #2)
    ara_toplam      numeric(18, 4) NOT NULL DEFAULT 0,     -- KDV hariç satır toplamı
    iskonto_orani   numeric(7, 4) NOT NULL DEFAULT 0,       -- belge seviyesi
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    otv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,      -- yeni: ayrı takip
    diger_vergi_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    tevkifat_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    kargo_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    yuvarlama       numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    -- Ödeme
    odenen_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    kalan_tutar     numeric(18, 4) GENERATED ALWAYS AS (toplam_tutar - odenen_tutar) STORED,
    odeme_durumu    varchar(20) NOT NULL DEFAULT 'odenmedi'
                    CHECK (odeme_durumu IN ('odenmedi', 'kismi', 'odendi', 'fazla_odendi', 'iade_edildi')),
    -- Kargo
    kargo_firma     varchar(100),
    kargo_takip_no  varchar(100),
    -- Açıklama
    aciklama        text,
    fatura_aciklama text,
    ic_notlar       text,                                -- müşteri görmez (Türkçe karakter yasağına uygun: ic_notlar)
    etiketler       text[],
    -- Personel
    satis_personeli_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    -- Soft delete
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_siparis_cari_tarih ON siparis(cari_id, siparis_tarihi DESC);
CREATE INDEX idx_siparis_magaza_tarih ON siparis(magaza_id, siparis_tarihi DESC);
CREATE INDEX idx_siparis_durum ON siparis(durum);
CREATE INDEX idx_siparis_tip ON siparis(tip);
CREATE INDEX idx_siparis_pazaryeri ON siparis(pazaryeri_kod, pazaryeri_siparis_id) WHERE pazaryeri_kod IS NOT NULL;
CREATE INDEX idx_siparis_vade ON siparis(vade_tarihi) WHERE vade_tarihi IS NOT NULL AND odeme_durumu != 'odendi';
CREATE INDEX idx_siparis_aktif ON siparis(siparis_tarihi DESC) WHERE silindi_mi = false;

CREATE UNIQUE INDEX unq_siparis_pazaryeri
    ON siparis(pazaryeri_kod, pazaryeri_siparis_id)
    WHERE pazaryeri_kod IS NOT NULL AND pazaryeri_siparis_id IS NOT NULL;

CREATE TRIGGER trg_siparis_guncelleme
    BEFORE UPDATE ON siparis
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SIPARIS_KALEM: Sipariş satırları
-- Değişiklikler (Sorun #1):
--   - vergi_orani_id, vergi_orani, vergi_tutari, tevkifat_orani, tevkifat_tutari KALDIRILDI
--   - Bunlar artık siparis_kalem_vergi tablosunda (çoklu vergi desteği)
--   - vergi_tutari_toplam bilgi kolonu (kalem_vergi'den trigger ile hesaplanır)
-- ----------------------------------------------------------------
CREATE TABLE siparis_kalem (
    id              bigserial PRIMARY KEY,
    siparis_id      bigint NOT NULL REFERENCES siparis(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    -- Ürün
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    -- Snapshot
    urun_adi        varchar(300) NOT NULL,
    urun_kodu       varchar(100),
    barkod          varchar(100),
    varyant_aciklama varchar(300),
    -- Birim
    birim_id        bigint REFERENCES birim(id),
    birim_kisaltma  varchar(10),
    -- Miktar
    miktar          numeric(18, 4) NOT NULL CHECK (miktar > 0),
    teslim_edilen_miktar numeric(18, 4) NOT NULL DEFAULT 0,
    iade_edilen_miktar numeric(18, 4) NOT NULL DEFAULT 0,
    -- Fiyat
    birim_fiyat     numeric(18, 4) NOT NULL,              -- KDV hariç
    birim_fiyat_kdv_dahil numeric(18, 4) NOT NULL,
    liste_fiyati    numeric(18, 4),
    -- İskonto satır seviyesi
    iskonto_orani   numeric(7, 4) NOT NULL DEFAULT 0,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    iskonto_aciklama varchar(200),
    -- Hesaplanan
    ara_toplam      numeric(18, 4) NOT NULL,              -- miktar × birim_fiyat - iskonto
    vergi_tutari_toplam numeric(18, 4) NOT NULL DEFAULT 0, -- kalem_vergi'den üretilir
    tevkifat_tutari_toplam numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL,              -- ara_toplam + vergi - tevkifat
    -- Maliyet (satışta — kâr/zarar için)
    birim_maliyet   numeric(18, 4),
    toplam_maliyet  numeric(18, 4),
    -- Lot
    lot_no          varchar(100),
    -- Kampanya/Kupon
    kampanya_id     bigint,
    kupon_id        bigint,
    aciklama        text,
    kaynak_satir_id varchar(100),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_siparis_kalem_siparis ON siparis_kalem(siparis_id);
CREATE INDEX idx_siparis_kalem_varyant ON siparis_kalem(urun_varyant_id);

CREATE TRIGGER trg_siparis_kalem_guncelleme
    BEFORE UPDATE ON siparis_kalem
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SIPARIS_KALEM_VERGI (Sorun #1) — Çoklu vergi satırı
-- Bir kaleme birden fazla vergi (KDV + ÖTV + OIV) eklenebilir.
-- Örnek: Otomotiv satışında ÖTV %45 + KDV %20 (matrah farklı).
-- ----------------------------------------------------------------
CREATE TABLE siparis_kalem_vergi (
    id              bigserial PRIMARY KEY,
    siparis_kalem_id bigint NOT NULL REFERENCES siparis_kalem(id) ON DELETE CASCADE,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id),
    -- Snapshot (rate değişse de belge fotoğrafı bozulmaz)
    vergi_kodu      varchar(50) NOT NULL,
    vergi_tipi      varchar(20) NOT NULL CHECK (vergi_tipi IN ('KDV', 'OTV', 'OIV', 'KKDF', 'BSMV', 'DAMGA', 'DIGER')),
    matrah          numeric(18, 4) NOT NULL,
    oran            numeric(7, 4) NOT NULL,
    tutar           numeric(18, 4) NOT NULL,
    -- Tevkifat
    tevkifat_orani  numeric(7, 4) NOT NULL DEFAULT 0,
    tevkifat_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    -- Uygulama sırası (ÖTV önce, KDV sonra vs.)
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (siparis_kalem_id, vergi_orani_id)
);
CREATE INDEX idx_siparis_kalem_vergi_kalem ON siparis_kalem_vergi(siparis_kalem_id);
CREATE INDEX idx_siparis_kalem_vergi_orani ON siparis_kalem_vergi(vergi_orani_id);

-- ----------------------------------------------------------------
-- SIPARIS_KALEM_SERI (Sorun #7) — Satılan seri no eşleşmesi
-- Garanti, iade takibi için kalem ↔ seri_no bağı.
-- ----------------------------------------------------------------
CREATE TABLE siparis_kalem_seri (
    id              bigserial PRIMARY KEY,
    siparis_kalem_id bigint NOT NULL REFERENCES siparis_kalem(id) ON DELETE CASCADE,
    urun_stok_seri_id bigint NOT NULL REFERENCES urun_stok_seri(id) ON DELETE RESTRICT,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (siparis_kalem_id, urun_stok_seri_id),
    UNIQUE (urun_stok_seri_id)   -- bir seri tek sipariş kalemiyle ilişkilenir
);
CREATE INDEX idx_siparis_kalem_seri_kalem ON siparis_kalem_seri(siparis_kalem_id);

-- ----------------------------------------------------------------
-- FUNCTION: siparis_kalem_vergi_topla
-- Kalem-vergi değişiminde siparis_kalem.vergi_tutari_toplam güncellenir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION siparis_kalem_vergi_topla() RETURNS TRIGGER AS $$
DECLARE
    v_kalem_id bigint;
BEGIN
    v_kalem_id := COALESCE(NEW.siparis_kalem_id, OLD.siparis_kalem_id);

    UPDATE siparis_kalem
    SET vergi_tutari_toplam = COALESCE(
            (SELECT SUM(tutar) FROM siparis_kalem_vergi WHERE siparis_kalem_id = v_kalem_id),
            0
        ),
        tevkifat_tutari_toplam = COALESCE(
            (SELECT SUM(tevkifat_tutari) FROM siparis_kalem_vergi WHERE siparis_kalem_id = v_kalem_id),
            0
        ),
        toplam_tutar = ara_toplam
                     + COALESCE(
                         (SELECT SUM(tutar) FROM siparis_kalem_vergi WHERE siparis_kalem_id = v_kalem_id),
                         0
                       )
                     - COALESCE(
                         (SELECT SUM(tevkifat_tutari) FROM siparis_kalem_vergi WHERE siparis_kalem_id = v_kalem_id),
                         0
                       )
    WHERE id = v_kalem_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_siparis_kalem_vergi_topla
    AFTER INSERT OR UPDATE OR DELETE ON siparis_kalem_vergi
    FOR EACH ROW EXECUTE FUNCTION siparis_kalem_vergi_topla();

-- ----------------------------------------------------------------
-- FUNCTION: siparis_toplam_hesapla (Sorun #2)
-- Kalem ekleme/silme/güncellemede siparis header toplamını yeniden hesaplar.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION siparis_toplam_hesapla() RETURNS TRIGGER AS $$
DECLARE
    v_siparis_id bigint;
BEGIN
    v_siparis_id := COALESCE(NEW.siparis_id, OLD.siparis_id);

    UPDATE siparis s
    SET
        ara_toplam = COALESCE(
            (SELECT SUM(ara_toplam) FROM siparis_kalem WHERE siparis_id = v_siparis_id), 0
        ),
        kdv_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM siparis_kalem sk
             JOIN siparis_kalem_vergi kv ON kv.siparis_kalem_id = sk.id
             WHERE sk.siparis_id = v_siparis_id AND kv.vergi_tipi = 'KDV'), 0
        ),
        otv_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM siparis_kalem sk
             JOIN siparis_kalem_vergi kv ON kv.siparis_kalem_id = sk.id
             WHERE sk.siparis_id = v_siparis_id AND kv.vergi_tipi = 'OTV'), 0
        ),
        diger_vergi_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM siparis_kalem sk
             JOIN siparis_kalem_vergi kv ON kv.siparis_kalem_id = sk.id
             WHERE sk.siparis_id = v_siparis_id
               AND kv.vergi_tipi NOT IN ('KDV', 'OTV')), 0
        ),
        tevkifat_tutari = COALESCE(
            (SELECT SUM(kv.tevkifat_tutari)
             FROM siparis_kalem sk
             JOIN siparis_kalem_vergi kv ON kv.siparis_kalem_id = sk.id
             WHERE sk.siparis_id = v_siparis_id), 0
        ),
        toplam_tutar = COALESCE(
            (SELECT SUM(toplam_tutar) FROM siparis_kalem WHERE siparis_id = v_siparis_id), 0
        ) - s.iskonto_tutari + s.kargo_tutari + s.yuvarlama,
        guncelleme_tarihi = now()
    WHERE s.id = v_siparis_id;

    -- Ödeme durumu otomatik güncelle
    UPDATE siparis
    SET odeme_durumu = CASE
        WHEN odenen_tutar = 0 THEN 'odenmedi'
        WHEN odenen_tutar < toplam_tutar THEN 'kismi'
        WHEN odenen_tutar = toplam_tutar THEN 'odendi'
        WHEN odenen_tutar > toplam_tutar THEN 'fazla_odendi'
        ELSE odeme_durumu
    END
    WHERE id = v_siparis_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_siparis_kalem_toplam
    AFTER INSERT OR UPDATE OR DELETE ON siparis_kalem
    FOR EACH ROW EXECUTE FUNCTION siparis_toplam_hesapla();

-- ----------------------------------------------------------------
-- SIPARIS_DURUM_LOG: Belge durum değişikliği audit trail
-- ----------------------------------------------------------------
CREATE TABLE siparis_durum_log (
    id              bigserial PRIMARY KEY,
    siparis_id      bigint NOT NULL REFERENCES siparis(id) ON DELETE CASCADE,
    eski_durum      varchar(30),
    yeni_durum      varchar(30) NOT NULL,
    aciklama        text,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_siparis_durum_log_siparis ON siparis_durum_log(siparis_id, olusturma_tarihi DESC);

-- ----------------------------------------------------------------
-- IRSALIYE: Sevk irsaliyesi (Sorun #4: siparis_id KALDIRILDI)
-- Kalem bazlı bağ: irsaliye_kalem.siparis_kalem_id yeterli.
-- ----------------------------------------------------------------
CREATE TABLE irsaliye (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    irsaliye_no     varchar(50) UNIQUE NOT NULL,
    tip             varchar(20) NOT NULL CHECK (tip IN ('sevk', 'alis', 'transfer', 'iade')),
    -- Cari + Mağaza
    cari_id         bigint REFERENCES cari(id),
    cari_unvan_snapshot varchar(300),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    hedef_magaza_id bigint REFERENCES magaza(id),
    sevk_adres_snapshot jsonb,
    durum           varchar(20) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak', 'kesildi', 'sevk_edildi', 'teslim_alindi', 'iptal'
    )),
    irsaliye_tarihi date NOT NULL DEFAULT CURRENT_DATE,
    sevk_tarihi     timestamptz,
    teslim_tarihi   timestamptz,
    arac_plaka      varchar(20),
    sofor_ad_soyad  varchar(200),
    kargo_firma     varchar(100),
    kargo_takip_no  varchar(100),
    e_irsaliye_uuid varchar(100),
    e_irsaliye_durum varchar(20),
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_irsaliye_cari ON irsaliye(cari_id);
CREATE INDEX idx_irsaliye_durum ON irsaliye(durum);
CREATE INDEX idx_irsaliye_tarih ON irsaliye(irsaliye_tarihi DESC);

CREATE TRIGGER trg_irsaliye_guncelleme
    BEFORE UPDATE ON irsaliye
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- İrsaliye → Sipariş bağı artık SADECE kalem bazlı.
CREATE TABLE irsaliye_kalem (
    id              bigserial PRIMARY KEY,
    irsaliye_id     bigint NOT NULL REFERENCES irsaliye(id) ON DELETE CASCADE,
    siparis_kalem_id bigint REFERENCES siparis_kalem(id),
    sira            int NOT NULL,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    urun_adi        varchar(300) NOT NULL,
    urun_kodu       varchar(100),
    miktar          numeric(18, 4) NOT NULL CHECK (miktar > 0),
    birim_kisaltma  varchar(10),
    lot_no          varchar(100),
    seri_nolar      text[],
    aciklama        text
);
CREATE INDEX idx_irsaliye_kalem_irsaliye ON irsaliye_kalem(irsaliye_id);
CREATE INDEX idx_irsaliye_kalem_siparis_kalem ON irsaliye_kalem(siparis_kalem_id);

-- ----------------------------------------------------------------
-- FATURA: Satış / Alış faturası
-- Sorun #9: fatura_no UNIQUE kaldırıldı, (firma_id, fatura_no) UNIQUE eklendi.
-- ----------------------------------------------------------------
CREATE TABLE fatura (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    fatura_no       varchar(50) NOT NULL,
    tip             varchar(20) NOT NULL CHECK (tip IN ('satis', 'alis', 'iade_satis', 'iade_alis')),
    fatura_tip_kodu varchar(20) NOT NULL DEFAULT 'SATIS' CHECK (fatura_tip_kodu IN (
        'SATIS', 'IADE', 'OZELMATRAH', 'ISTISNA', 'TEVKIFAT', 'IHRACAT', 'KOMISYON'
    )),
    senaryo         varchar(20) DEFAULT 'TEMELFATURA' CHECK (senaryo IN ('TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA')),
    -- İrsaliye bağı (tekil referans gerekirse; kalem bazlı da mümkün)
    irsaliye_id     bigint REFERENCES irsaliye(id),
    -- Cari + Firma + Mağaza
    firma_id        bigint NOT NULL REFERENCES firma(id),
    cari_id         bigint NOT NULL REFERENCES cari(id),
    cari_unvan_snapshot varchar(300),
    cari_vergi_no_snapshot varchar(50),
    cari_vergi_dairesi_snapshot varchar(200),
    cari_adres_snapshot jsonb,
    magaza_id       bigint REFERENCES magaza(id),
    durum           varchar(20) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak', 'kesildi', 'gonderildi', 'kabul_edildi', 'reddedildi', 'iptal'
    )),
    fatura_tarihi   date NOT NULL DEFAULT CURRENT_DATE,
    fatura_saati    time NOT NULL DEFAULT CURRENT_TIME,
    son_odeme_tarihi date,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    fiyatlar_kdv_dahil_mi boolean NOT NULL DEFAULT true,
    ara_toplam      numeric(18, 4) NOT NULL DEFAULT 0,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    otv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    tevkifat_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    diger_vergi_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    yuvarlama       numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    odenecek_tutar  numeric(18, 4) NOT NULL DEFAULT 0,
    odenen_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    kalan_tutar     numeric(18, 4) GENERATED ALWAYS AS (odenecek_tutar - odenen_tutar) STORED,
    odeme_durumu    varchar(20) NOT NULL DEFAULT 'odenmedi',
    -- E-Fatura
    e_fatura_uuid   varchar(100),
    e_fatura_durum  varchar(20) DEFAULT 'kesilmedi' CHECK (e_fatura_durum IN (
        'kesilmedi', 'kuyrukta', 'gonderiliyor', 'kesildi', 'kabul_edildi', 'reddedildi', 'hata'
    )),
    e_fatura_etiket varchar(100),
    e_fatura_dosya_url text,
    e_fatura_hata_mesaj text,
    e_fatura_gonderim_zamani timestamptz,
    aciklama        text,
    fatura_notu     text,
    ic_notlar       text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
-- Sorun #9: multi-firma desteği
CREATE UNIQUE INDEX unq_fatura_firma_fatura_no ON fatura(firma_id, fatura_no) WHERE silindi_mi = false;
CREATE INDEX idx_fatura_cari_tarih ON fatura(cari_id, fatura_tarihi DESC);
CREATE INDEX idx_fatura_firma ON fatura(firma_id);
CREATE INDEX idx_fatura_durum ON fatura(durum);
CREATE INDEX idx_fatura_tip ON fatura(tip);
CREATE INDEX idx_fatura_e_fatura_durum ON fatura(e_fatura_durum) WHERE e_fatura_durum != 'kesildi';
CREATE INDEX idx_fatura_son_odeme ON fatura(son_odeme_tarihi) WHERE odeme_durumu != 'odendi';

CREATE TRIGGER trg_fatura_guncelleme
    BEFORE UPDATE ON fatura
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SIPARIS_FATURA: Sipariş ↔ Fatura ara tablo (Sorun #3)
-- Bir sipariş birden fazla faturaya parçalanabilir (kısmi fatura).
-- kalem_baglantilari jsonb: {"siparis_kalem_id": miktar, ...}
-- ----------------------------------------------------------------
CREATE TABLE siparis_fatura (
    id              bigserial PRIMARY KEY,
    siparis_id      bigint NOT NULL REFERENCES siparis(id) ON DELETE RESTRICT,
    fatura_id       bigint NOT NULL REFERENCES fatura(id) ON DELETE RESTRICT,
    kalem_baglantilari jsonb NOT NULL DEFAULT '{}',
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    UNIQUE (siparis_id, fatura_id)
);
CREATE INDEX idx_siparis_fatura_siparis ON siparis_fatura(siparis_id);
CREATE INDEX idx_siparis_fatura_fatura ON siparis_fatura(fatura_id);

-- ----------------------------------------------------------------
-- FATURA_KALEM
-- Değişiklikler (Sorun #1):
--   - vergi_orani, vergi_tutari, tevkifat_orani, tevkifat_tutari, diger_vergi_tutari KALDIRILDI
--   - Çoklu vergi → fatura_kalem_vergi
-- ----------------------------------------------------------------
CREATE TABLE fatura_kalem (
    id              bigserial PRIMARY KEY,
    fatura_id       bigint NOT NULL REFERENCES fatura(id) ON DELETE CASCADE,
    siparis_kalem_id bigint REFERENCES siparis_kalem(id),
    sira            int NOT NULL,
    urun_varyant_id bigint REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    urun_adi        varchar(300) NOT NULL,
    urun_kodu       varchar(100),
    aciklama        text,
    gtip_kodu       varchar(20),
    birim_id        bigint REFERENCES birim(id),
    birim_kisaltma  varchar(10),
    miktar          numeric(18, 4) NOT NULL CHECK (miktar > 0),
    birim_fiyat     numeric(18, 4) NOT NULL,
    iskonto_orani   numeric(7, 4) NOT NULL DEFAULT 0,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    iskonto_aciklama varchar(200),
    ara_toplam      numeric(18, 4) NOT NULL,
    -- Hesaplanan toplamlar (fatura_kalem_vergi'den üretilir)
    vergi_tutari_toplam numeric(18, 4) NOT NULL DEFAULT 0,
    tevkifat_tutari_toplam numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL,
    -- Özel matrah (kuyumculuk vb.)
    ozel_matrah_kodu varchar(20),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fatura_kalem_fatura ON fatura_kalem(fatura_id);
CREATE INDEX idx_fatura_kalem_varyant ON fatura_kalem(urun_varyant_id);

-- ----------------------------------------------------------------
-- FATURA_KALEM_VERGI (Sorun #1) — Çoklu vergi satırı
-- ----------------------------------------------------------------
CREATE TABLE fatura_kalem_vergi (
    id              bigserial PRIMARY KEY,
    fatura_kalem_id bigint NOT NULL REFERENCES fatura_kalem(id) ON DELETE CASCADE,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id),
    vergi_kodu      varchar(50) NOT NULL,
    vergi_tipi      varchar(20) NOT NULL CHECK (vergi_tipi IN ('KDV', 'OTV', 'OIV', 'KKDF', 'BSMV', 'DAMGA', 'DIGER')),
    matrah          numeric(18, 4) NOT NULL,
    oran            numeric(7, 4) NOT NULL,
    tutar           numeric(18, 4) NOT NULL,
    tevkifat_orani  numeric(7, 4) NOT NULL DEFAULT 0,
    tevkifat_tutari numeric(18, 4) NOT NULL DEFAULT 0,
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fatura_kalem_id, vergi_orani_id)
);
CREATE INDEX idx_fatura_kalem_vergi_kalem ON fatura_kalem_vergi(fatura_kalem_id);

-- Fatura kalem vergi topla trigger'ı
CREATE OR REPLACE FUNCTION fatura_kalem_vergi_topla() RETURNS TRIGGER AS $$
DECLARE
    v_kalem_id bigint;
BEGIN
    v_kalem_id := COALESCE(NEW.fatura_kalem_id, OLD.fatura_kalem_id);

    UPDATE fatura_kalem
    SET vergi_tutari_toplam = COALESCE(
            (SELECT SUM(tutar) FROM fatura_kalem_vergi WHERE fatura_kalem_id = v_kalem_id), 0
        ),
        tevkifat_tutari_toplam = COALESCE(
            (SELECT SUM(tevkifat_tutari) FROM fatura_kalem_vergi WHERE fatura_kalem_id = v_kalem_id), 0
        ),
        toplam_tutar = ara_toplam
                     + COALESCE(
                         (SELECT SUM(tutar) FROM fatura_kalem_vergi WHERE fatura_kalem_id = v_kalem_id), 0)
                     - COALESCE(
                         (SELECT SUM(tevkifat_tutari) FROM fatura_kalem_vergi WHERE fatura_kalem_id = v_kalem_id), 0)
    WHERE id = v_kalem_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fatura_kalem_vergi_topla
    AFTER INSERT OR UPDATE OR DELETE ON fatura_kalem_vergi
    FOR EACH ROW EXECUTE FUNCTION fatura_kalem_vergi_topla();

-- Fatura header toplam trigger'ı
CREATE OR REPLACE FUNCTION fatura_toplam_hesapla() RETURNS TRIGGER AS $$
DECLARE
    v_fatura_id bigint;
BEGIN
    v_fatura_id := COALESCE(NEW.fatura_id, OLD.fatura_id);

    UPDATE fatura f
    SET
        ara_toplam = COALESCE(
            (SELECT SUM(ara_toplam) FROM fatura_kalem WHERE fatura_id = v_fatura_id), 0
        ),
        kdv_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM fatura_kalem fk
             JOIN fatura_kalem_vergi kv ON kv.fatura_kalem_id = fk.id
             WHERE fk.fatura_id = v_fatura_id AND kv.vergi_tipi = 'KDV'), 0
        ),
        otv_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM fatura_kalem fk
             JOIN fatura_kalem_vergi kv ON kv.fatura_kalem_id = fk.id
             WHERE fk.fatura_id = v_fatura_id AND kv.vergi_tipi = 'OTV'), 0
        ),
        diger_vergi_tutari = COALESCE(
            (SELECT SUM(kv.tutar)
             FROM fatura_kalem fk
             JOIN fatura_kalem_vergi kv ON kv.fatura_kalem_id = fk.id
             WHERE fk.fatura_id = v_fatura_id AND kv.vergi_tipi NOT IN ('KDV', 'OTV')), 0
        ),
        tevkifat_tutari = COALESCE(
            (SELECT SUM(kv.tevkifat_tutari)
             FROM fatura_kalem fk
             JOIN fatura_kalem_vergi kv ON kv.fatura_kalem_id = fk.id
             WHERE fk.fatura_id = v_fatura_id), 0
        ),
        toplam_tutar = COALESCE(
            (SELECT SUM(toplam_tutar) FROM fatura_kalem WHERE fatura_id = v_fatura_id), 0
        ) - f.iskonto_tutari + f.yuvarlama,
        odenecek_tutar = COALESCE(
            (SELECT SUM(toplam_tutar) FROM fatura_kalem WHERE fatura_id = v_fatura_id), 0
        ) - f.iskonto_tutari + f.yuvarlama
          - COALESCE(
                (SELECT SUM(kv.tevkifat_tutari)
                 FROM fatura_kalem fk
                 JOIN fatura_kalem_vergi kv ON kv.fatura_kalem_id = fk.id
                 WHERE fk.fatura_id = v_fatura_id), 0),
        guncelleme_tarihi = now()
    WHERE f.id = v_fatura_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fatura_kalem_toplam
    AFTER INSERT OR UPDATE OR DELETE ON fatura_kalem
    FOR EACH ROW EXECUTE FUNCTION fatura_toplam_hesapla();

-- ----------------------------------------------------------------
-- IADE: RMA workflow
-- Sorun #10: iade_sebep_id FK eklendi; string iade_sebebi KALDIRILDI.
-- ----------------------------------------------------------------
CREATE TABLE iade (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    iade_no         varchar(50) UNIQUE NOT NULL,
    tip             varchar(20) NOT NULL DEFAULT 'satis_iade' CHECK (tip IN (
        'satis_iade', 'alis_iade'
    )),
    asil_siparis_id bigint REFERENCES siparis(id),
    asil_fatura_id  bigint REFERENCES fatura(id),
    cari_id         bigint NOT NULL REFERENCES cari(id),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    durum           varchar(30) NOT NULL DEFAULT 'talep_edildi' CHECK (durum IN (
        'talep_edildi', 'inceleniyor', 'onaylandi', 'reddedildi',
        'urun_teslim_alindi', 'kontrol_ediliyor', 'iade_tamamlandi',
        'degisim_yapildi', 'iptal'
    )),
    -- Sorun #10: enum lookup
    iade_sebep_id   bigint NOT NULL REFERENCES iade_sebep(id),
    iade_aciklama   text,
    musteri_talebi  varchar(20) CHECK (musteri_talebi IN ('iade', 'degisim', 'tamir', 'kupon')),
    iade_tutari     numeric(18, 4) NOT NULL DEFAULT 0,
    iade_para_birimi char(3) REFERENCES para_birimi(kod),
    iade_yontemi    varchar(30),
    iade_tarihi     timestamptz,
    talep_tarihi    timestamptz NOT NULL DEFAULT now(),
    onay_tarihi     timestamptz,
    teslim_tarihi   timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    onaylayan_kullanici_id bigint REFERENCES kullanici(id),
    musteri_notu    text,
    ic_notlar       text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iade_cari ON iade(cari_id);
CREATE INDEX idx_iade_durum ON iade(durum);
CREATE INDEX idx_iade_asil_siparis ON iade(asil_siparis_id);
CREATE INDEX idx_iade_asil_fatura ON iade(asil_fatura_id);
CREATE INDEX idx_iade_sebep ON iade(iade_sebep_id);

CREATE TRIGGER trg_iade_guncelleme
    BEFORE UPDATE ON iade
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE iade_kalem (
    id              bigserial PRIMARY KEY,
    iade_id         bigint NOT NULL REFERENCES iade(id) ON DELETE CASCADE,
    asil_kalem_id   bigint REFERENCES siparis_kalem(id),
    sira            int NOT NULL,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    urun_adi        varchar(300) NOT NULL,
    miktar          numeric(18, 4) NOT NULL CHECK (miktar > 0),
    birim_fiyat     numeric(18, 4) NOT NULL,
    vergi_tutari    numeric(18, 4) NOT NULL DEFAULT 0,     -- tüm vergiler toplamı
    iade_tutari     numeric(18, 4) NOT NULL,
    iade_sebep_id   bigint REFERENCES iade_sebep(id),      -- kalem bazlı (opsiyonel)
    aciklama        text,
    stoga_girecek_mi boolean NOT NULL DEFAULT true,
    raf_id          bigint REFERENCES raf(id),
    lot_no          varchar(100),
    seri_no         varchar(100)
);
CREATE INDEX idx_iade_kalem_iade ON iade_kalem(iade_id);

-- ----------------------------------------------------------------
-- BELGE_EKI: Belgelere bağlı dosyalar
-- Not: Polymorphic FK PostgreSQL'de yok — validation app katmanında.
-- ----------------------------------------------------------------
CREATE TABLE belge_eki (
    id              bigserial PRIMARY KEY,
    belge_tipi      varchar(20) NOT NULL CHECK (belge_tipi IN ('siparis', 'irsaliye', 'fatura', 'iade')),
    belge_id        bigint NOT NULL,
    ad              varchar(200) NOT NULL,
    dosya_url       text NOT NULL,
    dosya_boyut     bigint,
    mime_tipi       varchar(100),
    yukleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_belge_eki_belge ON belge_eki(belge_tipi, belge_id);

-- ============================================================
-- NOTLAR
-- ============================================================
-- 1) _NIHAI_TUKETICI sistem cari'si:
--    siparis.cari_id NOT NULL olduğundan, POS/perakende satışlar için
--    cari modülünde seed edilmiş `_NIHAI_TUKETICI` kodlu sistem cari kullanılır.
--    Seed, 05-cari.sql veya migration'da eklenmeli:
--    INSERT INTO cari (kod, unvan, tip, ...) VALUES ('_NIHAI_TUKETICI', 'Nihai Tüketici', 'gercek_kisi', ...);
--
-- 2) İrsaliye ↔ Sipariş bağı artık sadece kalem bazlı
--    (irsaliye_kalem.siparis_kalem_id). Bir irsaliye birden çok siparişi
--    sevk edebilir, bir sipariş birden çok irsaliyeye parçalanabilir.
--
-- 3) Sipariş ↔ Fatura bağı siparis_fatura ara tablosunda.
--    kalem_baglantilari jsonb ile hangi kalemden ne kadar faturalandı izlenir.
--
-- 4) Çoklu vergi: KDV + ÖTV + OIV senaryosunda her biri siparis_kalem_vergi'de
--    ayrı satır olur. Matrah farklı olabilir (ÖTV matrah, KDV (matrah+ÖTV)).
-- ============================================================
