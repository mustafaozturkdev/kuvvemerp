-- ============================================================
-- MODÜL 09: ÖDEME (Hesap, Hareket, Tahsilat, Ödeme, Çek/Senet, Taksit)
-- ============================================================
-- REFACTOR v2 — Eleştirmen raporu (09-odeme-elestiri-v1) bulgularına
-- göre yeniden düzenlendi:
--   #1 Negatif bakiye BEFORE trigger (kasa/banka)
--   #2 Atomik hesap_virman() fonksiyonu
--   #3 tahsilat_makbuzu / odeme_makbuzu toplam trigger'ı
--   #4 POS komisyonu otomatik hesap_hareket üretimi
--   #5 kaynak_belge_tipi + kaynak_belge_id CHECK constraint
--   #6 cek_senet_durum_guncelle() atomik fonksiyonu
--   #10 hesap_hareket_kaydet kur kontrolü sıkılaştırıldı
--
-- PHP v1'deki `hesaplar` + `hareket` + `cek_senet` magic integer tablosu
-- yerine:
--   • Her hareket açık enum
--   • Her hareket para birimi + kur + ana para karşılığı taşır
--   • Her hareket modül 10 yevmiye fişine bağlanabilir
--   • Çek/senet ayrı durum makinesi, atomik durum geçişi
--   • Tahsilat/Ödeme makbuzu başlık+satır (çoklu yöntem) + trigger toplam
--   • Vardiya bazlı kasa açılış/kapanış
--   • POS özel alanlar (komisyon oranı, komisyon hesabı, valör)
-- ============================================================

-- ----------------------------------------------------------------
-- HESAP: Kasa / banka / POS / e-cüzdan / çek-senet portföyü
-- ----------------------------------------------------------------
CREATE TABLE hesap (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'kasa',
        'banka',
        'pos',              -- kredi kartı sanal pos hesabı
        'kredi_karti',      -- firma kredi kartı (eksi bakiye normaldir)
        'e_cuzdan',         -- PayPal, Stripe, Param, iyzico bakiye
        'cek_portfoy',      -- alınan çek/senet portföy "hesabı"
        'senet_portfoy',
        'pazaryeri_alacak', -- Trendyol/HB bekleyen net tutar
        'diger'
    )),
    -- Lokasyon
    firma_id        bigint REFERENCES firma(id),
    magaza_id       bigint REFERENCES magaza(id),
    -- Banka bilgileri (banka/POS için)
    banka_adi       varchar(100),
    sube            varchar(100),
    hesap_no        varchar(50),
    iban            varchar(34),
    swift_kod       varchar(20),
    -- POS için özel alanlar (Sorun #7)
    pos_saglayici   varchar(50),                          -- 'param', 'iyzico', 'stripe', 'payu'
    pos_terminal_id varchar(100),
    pos_komisyon_orani numeric(7, 4) NOT NULL DEFAULT 0,  -- varsayılan çekim komisyonu (%)
    pos_komisyon_hesap_id bigint,                         -- FK hesap_plani(id) — modül 10'da eklenir
    pos_blokeli_gun int NOT NULL DEFAULT 0,               -- POS parası kaç gün sonra net hesaba düşer
    pos_net_hesap_id bigint REFERENCES hesap(id),         -- POS net tahsilatın aktarılacağı hesap (banka)
    -- Para birimi
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Muhasebe entegrasyonu
    muhasebe_hesap_id bigint,                             -- FK modül 10 sonunda eklenir
    -- Bakiye
    baslangic_bakiye numeric(18, 4) NOT NULL DEFAULT 0,
    -- NOT: mevcut_bakiye computed değil; `hesap_bakiye_hesapla()` fonksiyonu
    -- veya `vw_hesap_bakiye` view'i kullanılır (tutarlılık garantisi).
    -- Limitler
    negatif_bakiye_izin boolean NOT NULL DEFAULT false,
    limit_tutar     numeric(18, 4),
    -- Sıralama / aktiflik
    sira            int NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    silen_kullanici_id bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hesap_tip ON hesap(tip) WHERE silindi_mi = false;
CREATE INDEX idx_hesap_magaza ON hesap(magaza_id) WHERE silindi_mi = false;
CREATE INDEX idx_hesap_aktif ON hesap(aktif_mi) WHERE silindi_mi = false;

CREATE TRIGGER trg_hesap_guncelleme
    BEFORE UPDATE ON hesap
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- HESAP_HAREKET: Tüm para giriş/çıkış hareketleri
-- ----------------------------------------------------------------
-- NOT: `yevmiye_fis_id` FK modül 10 yüklendikten sonra eklenir.
CREATE TABLE hesap_hareket (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    -- Hedef hesap
    hesap_id        bigint NOT NULL REFERENCES hesap(id),
    -- Tarihler
    tarih           timestamptz NOT NULL DEFAULT now(),
    valor_tarihi    date,                                -- bankada para ne zaman kullanılabilir
    evrak_tarihi    date,                                -- evrak üzerindeki tarih
    -- Yön
    tip             varchar(10) NOT NULL CHECK (tip IN ('giris', 'cikis')),
    -- İşlem türü (PHP v1'deki IslemTuru magic int'in yerine)
    tur             varchar(30) NOT NULL CHECK (tur IN (
        'tahsilat',         -- Müşteriden tahsilat
        'odeme',            -- Tedarikçiye ödeme
        'gider',            -- Masraf/gider
        'gelir',            -- Faiz, kira, diğer gelir
        'virman_cikis',     -- Hesaplar arası transfer - kaynaktan çıkış
        'virman_giris',     -- Hesaplar arası transfer - hedefe giriş
        'devir',            -- Açılış devir bakiyesi
        'ucret_komisyon',   -- Banka/POS komisyon, dosya masrafı
        'faiz',             -- Banka faizi
        'kur_farki',        -- Değerleme kur farkı
        'dekont',           -- Borç/alacak dekontu (nakit olmayan)
        'cek_hareket',      -- Çek portföy giriş/çıkış
        'senet_hareket',    -- Senet portföy giriş/çıkış
        'iade',             -- Müşteri iadesi nakit geri
        'duzeltme'          -- Manuel düzeltme
    )),
    -- Tutar (hesap para biriminde)
    tutar           numeric(18, 4) NOT NULL CHECK (tutar > 0),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    ana_para_karsiligi numeric(18, 4) NOT NULL,          -- firma ana para biriminde
    -- Cari (tahsilat/ödeme/dekont için)
    cari_id         bigint REFERENCES cari(id),
    -- Kaynak belge (sipariş, fatura, iade, makbuz, vs.)
    kaynak_belge_tipi varchar(30) CHECK (kaynak_belge_tipi IN (
        'siparis', 'fatura', 'iade', 'tahsilat_makbuzu', 'odeme_makbuzu',
        'cek_senet', 'kasa_acilis_kapanis', 'virman', 'gider', 'pos_komisyon',
        'pazaryeri_takas', 'serbest'
    )),
    kaynak_belge_id bigint,
    -- İki ayağı olan işlemler (virman) için eş hareket
    es_hareket_id   bigint REFERENCES hesap_hareket(id),
    -- Referanslar
    dekont_no       varchar(100),                        -- banka dekont no
    referans_no     varchar(100),                        -- POS işlem no, EFT ref
    aciklama        text,
    -- Lokasyon / kullanıcı
    magaza_id       bigint REFERENCES magaza(id),
    kasa_id         bigint REFERENCES kasa(id),
    vardiya_id      bigint,                              -- kasa_acilis_kapanis(id) — FK aşağıda
    -- Muhasebe bağı
    yevmiye_fis_id  bigint,                              -- FK modül 10 sonunda
    -- Aktif/pasif (soft cancel)
    aktif_mi        boolean NOT NULL DEFAULT true,
    iptal_tarihi    timestamptz,
    iptal_nedeni    text,
    iptal_eden_kullanici_id bigint REFERENCES kullanici(id),
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Sorun #5: polymorphic FK için bütünlük: tip ve id beraber NULL
    -- veya beraber NOT NULL olmalı ('serbest' tipi hariç dokümantasyon ile işlenir)
    CONSTRAINT chk_hesap_hareket_kaynak_butunluk CHECK (
        (kaynak_belge_tipi IS NULL AND kaynak_belge_id IS NULL)
        OR (kaynak_belge_tipi IS NOT NULL AND (kaynak_belge_id IS NOT NULL
            OR kaynak_belge_tipi IN ('serbest', 'gider', 'pos_komisyon', 'virman')))
    )
);
CREATE INDEX idx_hesap_hareket_hesap_tarih ON hesap_hareket(hesap_id, tarih DESC) WHERE aktif_mi = true;
CREATE INDEX idx_hesap_hareket_cari ON hesap_hareket(cari_id, tarih DESC) WHERE cari_id IS NOT NULL AND aktif_mi = true;
CREATE INDEX idx_hesap_hareket_kaynak ON hesap_hareket(kaynak_belge_tipi, kaynak_belge_id) WHERE kaynak_belge_id IS NOT NULL;
CREATE INDEX idx_hesap_hareket_tur ON hesap_hareket(tur);
CREATE INDEX idx_hesap_hareket_tarih ON hesap_hareket(tarih DESC);
CREATE INDEX idx_hesap_hareket_yevmiye ON hesap_hareket(yevmiye_fis_id) WHERE yevmiye_fis_id IS NOT NULL;

CREATE TRIGGER trg_hesap_hareket_guncelleme
    BEFORE UPDATE ON hesap_hareket
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SORUN #1 (eleştirmen): Negatif bakiye kontrolü — AFTER INSERT trigger
-- ----------------------------------------------------------------
-- Kasa için eksiye düşme kesinlikle yasak. Banka için `negatif_bakiye_izin`
-- bayrağına göre. Kredi kartı ve pazaryeri_alacak tiplerinde negatif normaldir
-- ve kontrol atlanır.
CREATE OR REPLACE FUNCTION hesap_hareket_negatif_kontrol()
RETURNS TRIGGER AS $$
DECLARE
    v_tip varchar(20);
    v_izin boolean;
    v_bakiye numeric(18, 4);
    v_baslangic numeric(18, 4);
BEGIN
    -- Sadece çıkış hareketlerinde kontrol yap
    IF NEW.tip <> 'cikis' OR NEW.aktif_mi = false THEN
        RETURN NEW;
    END IF;

    SELECT tip, negatif_bakiye_izin, baslangic_bakiye
    INTO v_tip, v_izin, v_baslangic
    FROM hesap WHERE id = NEW.hesap_id FOR UPDATE;

    -- Kredi kartı ve pazaryeri alacak hesaplarında negatif normaldir
    IF v_tip IN ('kredi_karti', 'pazaryeri_alacak') THEN
        RETURN NEW;
    END IF;

    -- Banka/e_cuzdan/pos için izin bayrağı varsa kontrol atla
    IF v_tip IN ('banka', 'e_cuzdan', 'pos') AND v_izin = true THEN
        RETURN NEW;
    END IF;

    -- Kasa her zaman kontrol edilir (izin bayrağı olsa bile — nakit kasada
    -- fiziksel olarak eksi olamaz).
    -- Güncel bakiyeyi hesapla (bu hareket dahil)
    SELECT v_baslangic
        + COALESCE(SUM(CASE WHEN tip = 'giris' THEN tutar ELSE -tutar END), 0)
    INTO v_bakiye
    FROM hesap_hareket
    WHERE hesap_id = NEW.hesap_id AND aktif_mi = true;

    IF v_bakiye < 0 THEN
        RAISE EXCEPTION 'Hesap bakiyesi negatife dusuyor: hesap_id=%, tip=%, bakiye=% (tutar=% cikis)',
            NEW.hesap_id, v_tip, v_bakiye, NEW.tutar;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hesap_hareket_negatif_kontrol
    AFTER INSERT ON hesap_hareket
    FOR EACH ROW EXECUTE FUNCTION hesap_hareket_negatif_kontrol();

-- ----------------------------------------------------------------
-- TAHSILAT_MAKBUZU: Müşteriden alınan tahsilat belgesi
-- ----------------------------------------------------------------
-- Bir müşteri 10.000 TL öderken: 3.000 nakit + 4.000 kredi kartı +
-- 3.000 çek. Tek makbuz, üç satır, üç hesap_hareket kaydı.
CREATE TABLE tahsilat_makbuzu (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    makbuz_no       varchar(50) UNIQUE NOT NULL,
    cari_id         bigint NOT NULL REFERENCES cari(id),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    kasa_id         bigint REFERENCES kasa(id),
    makbuz_tarihi   timestamptz NOT NULL DEFAULT now(),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    -- Toplamlar (trigger ile hesaplanır — Sorun #3)
    toplam_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    kaynak_siparis_id bigint REFERENCES siparis(id),
    kaynak_fatura_id bigint REFERENCES fatura(id),
    durum           varchar(20) NOT NULL DEFAULT 'kayit' CHECK (durum IN (
        'taslak', 'kayit', 'iptal'
    )),
    iptal_tarihi    timestamptz,
    iptal_nedeni    text,
    aciklama        text,
    yevmiye_fis_id  bigint,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tahsilat_makbuzu_cari ON tahsilat_makbuzu(cari_id, makbuz_tarihi DESC);
CREATE INDEX idx_tahsilat_makbuzu_siparis ON tahsilat_makbuzu(kaynak_siparis_id) WHERE kaynak_siparis_id IS NOT NULL;
CREATE INDEX idx_tahsilat_makbuzu_fatura ON tahsilat_makbuzu(kaynak_fatura_id) WHERE kaynak_fatura_id IS NOT NULL;

CREATE TRIGGER trg_tahsilat_makbuzu_guncelleme
    BEFORE UPDATE ON tahsilat_makbuzu
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE tahsilat_makbuzu_satir (
    id              bigserial PRIMARY KEY,
    tahsilat_makbuzu_id bigint NOT NULL REFERENCES tahsilat_makbuzu(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    odeme_yontemi   varchar(30) NOT NULL CHECK (odeme_yontemi IN (
        'nakit', 'kredi_karti', 'havale_eft', 'cek', 'senet',
        'e_cuzdan', 'sadakat_puan', 'hediye_kart', 'mahsup', 'diger'
    )),
    hesap_id        bigint REFERENCES hesap(id),          -- mahsup için nullable
    tutar           numeric(18, 4) NOT NULL CHECK (tutar > 0),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    -- Kredi kartı
    kk_taksit_sayisi int,
    kk_komisyon_orani numeric(7, 4),
    kk_komisyon_tutari numeric(18, 4),
    kk_referans_no  varchar(100),
    -- Çek/Senet bağlantısı
    cek_senet_id    bigint,
    -- Üretilen hareket
    hesap_hareket_id bigint REFERENCES hesap_hareket(id),
    -- Üretilen komisyon hareketi (POS komisyonu için — Sorun #4)
    komisyon_hareket_id bigint REFERENCES hesap_hareket(id),
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_tahsilat_satir_hesap CHECK (
        odeme_yontemi = 'mahsup' OR hesap_id IS NOT NULL
    )
);
CREATE INDEX idx_tahsilat_makbuzu_satir_makbuz ON tahsilat_makbuzu_satir(tahsilat_makbuzu_id);

-- ----------------------------------------------------------------
-- SORUN #3: Makbuz toplam trigger (tahsilat)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION tahsilat_makbuzu_toplam_hesapla()
RETURNS TRIGGER AS $$
DECLARE
    v_makbuz_id bigint;
BEGIN
    v_makbuz_id := COALESCE(NEW.tahsilat_makbuzu_id, OLD.tahsilat_makbuzu_id);
    UPDATE tahsilat_makbuzu SET
        toplam_tutar = COALESCE(
            (SELECT SUM(tutar) FROM tahsilat_makbuzu_satir WHERE tahsilat_makbuzu_id = v_makbuz_id), 0
        ),
        guncelleme_tarihi = now()
    WHERE id = v_makbuz_id;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tahsilat_makbuzu_toplam
    AFTER INSERT OR UPDATE OR DELETE ON tahsilat_makbuzu_satir
    FOR EACH ROW EXECUTE FUNCTION tahsilat_makbuzu_toplam_hesapla();

-- ----------------------------------------------------------------
-- ODEME_MAKBUZU: Tedarikçiye yapılan ödeme belgesi
-- ----------------------------------------------------------------
CREATE TABLE odeme_makbuzu (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    makbuz_no       varchar(50) UNIQUE NOT NULL,
    cari_id         bigint NOT NULL REFERENCES cari(id),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    makbuz_tarihi   timestamptz NOT NULL DEFAULT now(),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    toplam_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    kaynak_siparis_id bigint REFERENCES siparis(id),
    kaynak_fatura_id bigint REFERENCES fatura(id),
    durum           varchar(20) NOT NULL DEFAULT 'kayit' CHECK (durum IN (
        'taslak', 'kayit', 'iptal'
    )),
    iptal_tarihi    timestamptz,
    iptal_nedeni    text,
    aciklama        text,
    yevmiye_fis_id  bigint,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_odeme_makbuzu_cari ON odeme_makbuzu(cari_id, makbuz_tarihi DESC);

CREATE TRIGGER trg_odeme_makbuzu_guncelleme
    BEFORE UPDATE ON odeme_makbuzu
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE odeme_makbuzu_satir (
    id              bigserial PRIMARY KEY,
    odeme_makbuzu_id bigint NOT NULL REFERENCES odeme_makbuzu(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    odeme_yontemi   varchar(30) NOT NULL CHECK (odeme_yontemi IN (
        'nakit', 'havale_eft', 'cek', 'senet', 'kredi_karti',
        'e_cuzdan', 'mahsup', 'diger'
    )),
    hesap_id        bigint REFERENCES hesap(id),
    tutar           numeric(18, 4) NOT NULL CHECK (tutar > 0),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    cek_senet_id    bigint,
    hesap_hareket_id bigint REFERENCES hesap_hareket(id),
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_odeme_satir_hesap CHECK (
        odeme_yontemi = 'mahsup' OR hesap_id IS NOT NULL
    )
);
CREATE INDEX idx_odeme_makbuzu_satir_makbuz ON odeme_makbuzu_satir(odeme_makbuzu_id);

-- ----------------------------------------------------------------
-- SORUN #3: Makbuz toplam trigger (ödeme)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION odeme_makbuzu_toplam_hesapla()
RETURNS TRIGGER AS $$
DECLARE
    v_makbuz_id bigint;
BEGIN
    v_makbuz_id := COALESCE(NEW.odeme_makbuzu_id, OLD.odeme_makbuzu_id);
    UPDATE odeme_makbuzu SET
        toplam_tutar = COALESCE(
            (SELECT SUM(tutar) FROM odeme_makbuzu_satir WHERE odeme_makbuzu_id = v_makbuz_id), 0
        ),
        guncelleme_tarihi = now()
    WHERE id = v_makbuz_id;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_odeme_makbuzu_toplam
    AFTER INSERT OR UPDATE OR DELETE ON odeme_makbuzu_satir
    FOR EACH ROW EXECUTE FUNCTION odeme_makbuzu_toplam_hesapla();

-- ----------------------------------------------------------------
-- KASA_ACILIS_KAPANIS: Vardiya bazlı kasa sayımı
-- ----------------------------------------------------------------
CREATE TABLE kasa_acilis_kapanis (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    magaza_id       bigint NOT NULL REFERENCES magaza(id),
    kasa_id         bigint NOT NULL REFERENCES kasa(id),
    hesap_id        bigint NOT NULL REFERENCES hesap(id),
    kullanici_id    bigint NOT NULL REFERENCES kullanici(id),
    vardiya_baslangic timestamptz NOT NULL DEFAULT now(),
    vardiya_bitis   timestamptz,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    baslangic_nakit numeric(18, 4) NOT NULL DEFAULT 0,
    beklenen_nakit  numeric(18, 4),
    sayilan_nakit   numeric(18, 4),
    fark            numeric(18, 4) GENERATED ALWAYS AS (
        COALESCE(sayilan_nakit, 0) - COALESCE(beklenen_nakit, 0)
    ) STORED,
    toplam_tahsilat numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_odeme    numeric(18, 4) NOT NULL DEFAULT 0,
    islem_sayisi    int NOT NULL DEFAULT 0,
    durum           varchar(20) NOT NULL DEFAULT 'acik' CHECK (durum IN (
        'acik', 'kapali', 'onaylanmis', 'iptal'
    )),
    kapanis_aciklama text,
    onaylayan_kullanici_id bigint REFERENCES kullanici(id),
    onay_tarihi     timestamptz,
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kasa_acilis_kapanis_kasa ON kasa_acilis_kapanis(kasa_id, vardiya_baslangic DESC);
CREATE INDEX idx_kasa_acilis_kapanis_durum ON kasa_acilis_kapanis(durum);
CREATE UNIQUE INDEX unq_kasa_acilis_kapanis_acik ON kasa_acilis_kapanis(kasa_id)
    WHERE durum = 'acik';

CREATE TRIGGER trg_kasa_acilis_kapanis_guncelleme
    BEFORE UPDATE ON kasa_acilis_kapanis
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- vardiya FK (Sorun #7 yardımcı): hesap_hareket.vardiya_id → kasa_acilis_kapanis(id)
ALTER TABLE hesap_hareket
    ADD CONSTRAINT fk_hesap_hareket_vardiya
    FOREIGN KEY (vardiya_id) REFERENCES kasa_acilis_kapanis(id);

CREATE TABLE kasa_acilis_kapanis_kalem (
    id              bigserial PRIMARY KEY,
    kasa_acilis_kapanis_id bigint NOT NULL REFERENCES kasa_acilis_kapanis(id) ON DELETE CASCADE,
    kupur_tipi      varchar(20) NOT NULL CHECK (kupur_tipi IN ('banknot', 'madeni_para', 'ceki_senet')),
    kupur_degeri    numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    adet            int NOT NULL DEFAULT 0,
    toplam          numeric(18, 4) GENERATED ALWAYS AS (kupur_degeri * adet) STORED
);
CREATE INDEX idx_kasa_acilis_kapanis_kalem_vardiya ON kasa_acilis_kapanis_kalem(kasa_acilis_kapanis_id);

-- ----------------------------------------------------------------
-- CEK_SENET: Çek ve senet yönetimi
-- ----------------------------------------------------------------
CREATE TABLE cek_senet (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    tip             varchar(10) NOT NULL CHECK (tip IN ('cek', 'senet')),
    pozisyon        varchar(10) NOT NULL CHECK (pozisyon IN ('alinan', 'verilen')),
    evrak_no        varchar(50) NOT NULL,
    banka_adi       varchar(100),
    sube            varchar(100),
    sube_kodu       varchar(20),
    hesap_no        varchar(50),
    iban            varchar(34),
    tanzim_tarihi   date NOT NULL,
    vade_tarihi     date NOT NULL,
    basim_tarihi    date,
    tutar           numeric(18, 4) NOT NULL CHECK (tutar > 0),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    muhatap_cari_id bigint REFERENCES cari(id),
    muhatap_ad      varchar(300),
    muhatap_vergi_no varchar(50),
    muhatap_tckn    varchar(20),
    keside_yeri     varchar(100),
    ciranta         text,
    durum           varchar(30) NOT NULL DEFAULT 'portfoyde' CHECK (durum IN (
        'portfoyde', 'verildi', 'bankada_tahsile', 'bankada_teminat',
        'ciro_edildi', 'takasta', 'tahsil_edildi', 'karsiliksiz',
        'protesto', 'iade_edildi', 'iptal'
    )),
    durum_tarihi    timestamptz NOT NULL DEFAULT now(),
    hesap_id        bigint REFERENCES hesap(id),
    kaynak_belge_tipi varchar(30),
    kaynak_belge_id bigint,
    magaza_id       bigint REFERENCES magaza(id),
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cek_senet_muhatap ON cek_senet(muhatap_cari_id);
CREATE INDEX idx_cek_senet_vade ON cek_senet(vade_tarihi) WHERE durum IN ('portfoyde', 'bankada_tahsile', 'bankada_teminat');
CREATE INDEX idx_cek_senet_durum ON cek_senet(durum);
CREATE INDEX idx_cek_senet_tip_pozisyon ON cek_senet(tip, pozisyon);
CREATE UNIQUE INDEX unq_cek_senet_evrak_no ON cek_senet(tip, banka_adi, evrak_no)
    WHERE banka_adi IS NOT NULL;

CREATE TRIGGER trg_cek_senet_guncelleme
    BEFORE UPDATE ON cek_senet
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

ALTER TABLE tahsilat_makbuzu_satir ADD CONSTRAINT fk_tahsilat_satir_cek_senet
    FOREIGN KEY (cek_senet_id) REFERENCES cek_senet(id);
ALTER TABLE odeme_makbuzu_satir ADD CONSTRAINT fk_odeme_satir_cek_senet
    FOREIGN KEY (cek_senet_id) REFERENCES cek_senet(id);

-- ----------------------------------------------------------------
-- CEK_SENET_HAREKET: Durum değişiklik audit trail
-- ----------------------------------------------------------------
CREATE TABLE cek_senet_hareket (
    id              bigserial PRIMARY KEY,
    cek_senet_id    bigint NOT NULL REFERENCES cek_senet(id) ON DELETE CASCADE,
    eski_durum      varchar(30),
    yeni_durum      varchar(30) NOT NULL,
    eski_hesap_id   bigint REFERENCES hesap(id),
    yeni_hesap_id   bigint REFERENCES hesap(id),
    hesap_hareket_id bigint REFERENCES hesap_hareket(id),
    ciro_edilen_cari_id bigint REFERENCES cari(id),
    aciklama        text,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cek_senet_hareket_evrak ON cek_senet_hareket(cek_senet_id, olusturma_tarihi DESC);

-- ----------------------------------------------------------------
-- TAKSIT_PLANI: Vadeli satışta taksitlendirme
-- ----------------------------------------------------------------
CREATE TABLE taksit_plani (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kaynak_belge_tipi varchar(20) NOT NULL CHECK (kaynak_belge_tipi IN ('siparis', 'fatura', 'serbest')),
    kaynak_belge_id bigint,
    cari_id         bigint NOT NULL REFERENCES cari(id),
    toplam_tutar    numeric(18, 4) NOT NULL CHECK (toplam_tutar > 0),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    taksit_sayisi   int NOT NULL CHECK (taksit_sayisi > 0),
    baslangic_tarihi date NOT NULL,
    periyot_ay      int NOT NULL DEFAULT 1,
    durum           varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'aktif', 'tamamlandi', 'iptal'
    )),
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_taksit_plani_cari ON taksit_plani(cari_id);
CREATE INDEX idx_taksit_plani_kaynak ON taksit_plani(kaynak_belge_tipi, kaynak_belge_id);

CREATE TRIGGER trg_taksit_plani_guncelleme
    BEFORE UPDATE ON taksit_plani
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE taksit_plani_satir (
    id              bigserial PRIMARY KEY,
    taksit_plani_id bigint NOT NULL REFERENCES taksit_plani(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    vade_tarihi     date NOT NULL,
    tutar           numeric(18, 4) NOT NULL CHECK (tutar > 0),
    odenen_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    odeme_tarihi    timestamptz,
    durum           varchar(20) NOT NULL DEFAULT 'beklemede' CHECK (durum IN (
        'beklemede', 'kismi_odendi', 'odendi', 'gecikmis', 'iptal'
    )),
    tahsilat_makbuzu_id bigint REFERENCES tahsilat_makbuzu(id),
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (taksit_plani_id, sira)
);
CREATE INDEX idx_taksit_plani_satir_vade ON taksit_plani_satir(vade_tarihi) WHERE durum IN ('beklemede', 'kismi_odendi', 'gecikmis');

-- ----------------------------------------------------------------
-- VIEW: Hesap güncel bakiye
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_hesap_bakiye AS
SELECT
    h.id                        AS hesap_id,
    h.kod,
    h.ad,
    h.tip,
    h.para_birimi_kod,
    h.baslangic_bakiye,
    COALESCE(SUM(CASE WHEN hh.tip = 'giris' THEN hh.tutar ELSE 0 END), 0) AS toplam_giris,
    COALESCE(SUM(CASE WHEN hh.tip = 'cikis' THEN hh.tutar ELSE 0 END), 0) AS toplam_cikis,
    h.baslangic_bakiye
        + COALESCE(SUM(CASE WHEN hh.tip = 'giris' THEN hh.tutar ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN hh.tip = 'cikis' THEN hh.tutar ELSE 0 END), 0)
        AS guncel_bakiye,
    MAX(hh.tarih) AS son_hareket_tarihi
FROM hesap h
LEFT JOIN hesap_hareket hh
    ON hh.hesap_id = h.id
    AND hh.aktif_mi = true
WHERE h.silindi_mi = false
GROUP BY h.id;

-- ----------------------------------------------------------------
-- VIEW: Cari bakiye (ödeme modülü açısından)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_cari_bakiye AS
WITH fatura_ozet AS (
    SELECT
        cari_id,
        SUM(CASE WHEN tip IN ('satis') THEN odenecek_tutar ELSE 0 END)
            - SUM(CASE WHEN tip IN ('iade_satis') THEN odenecek_tutar ELSE 0 END)
            - SUM(CASE WHEN tip IN ('alis') THEN odenecek_tutar ELSE 0 END)
            + SUM(CASE WHEN tip IN ('iade_alis') THEN odenecek_tutar ELSE 0 END)
            AS fatura_borc_net
    FROM fatura
    WHERE silindi_mi = false AND durum != 'iptal' AND cari_id IS NOT NULL
    GROUP BY cari_id
),
tahsilat_ozet AS (
    SELECT cari_id, SUM(tutar) AS toplam_tahsilat
    FROM hesap_hareket
    WHERE aktif_mi = true AND cari_id IS NOT NULL AND tur = 'tahsilat'
    GROUP BY cari_id
),
odeme_ozet AS (
    SELECT cari_id, SUM(tutar) AS toplam_odeme
    FROM hesap_hareket
    WHERE aktif_mi = true AND cari_id IS NOT NULL AND tur = 'odeme'
    GROUP BY cari_id
)
SELECT
    c.id                            AS cari_id,
    c.kod,
    COALESCE(c.unvan, c.ad || ' ' || c.soyad) AS ad,
    c.para_birimi_kod,
    COALESCE(f.fatura_borc_net, 0)  AS fatura_net,
    COALESCE(t.toplam_tahsilat, 0)  AS tahsilat,
    COALESCE(o.toplam_odeme, 0)     AS odeme,
    COALESCE(f.fatura_borc_net, 0) - COALESCE(t.toplam_tahsilat, 0) + COALESCE(o.toplam_odeme, 0)
        AS bakiye
FROM cari c
LEFT JOIN fatura_ozet f ON f.cari_id = c.id
LEFT JOIN tahsilat_ozet t ON t.cari_id = c.id
LEFT JOIN odeme_ozet o ON o.cari_id = c.id
WHERE c.silindi_mi = false;

-- ----------------------------------------------------------------
-- VIEW: Taksit efektif durum (Sorun #7 — gecikmiş otomatik)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_taksit_durum AS
SELECT
    ts.*,
    CASE
        WHEN ts.durum = 'beklemede' AND ts.vade_tarihi < CURRENT_DATE THEN 'gecikmis'
        ELSE ts.durum
    END AS efektif_durum,
    (ts.vade_tarihi - CURRENT_DATE) AS kalan_gun
FROM taksit_plani_satir ts;

-- ----------------------------------------------------------------
-- VIEW: Vadesi yaklaşan çek/senet (30 gün içinde)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_vadesi_yaklasan_cek AS
SELECT
    cs.id,
    cs.tip,
    cs.pozisyon,
    cs.evrak_no,
    cs.banka_adi,
    cs.vade_tarihi,
    (cs.vade_tarihi - CURRENT_DATE) AS kalan_gun,
    cs.tutar,
    cs.para_birimi_kod,
    cs.durum,
    c.id    AS muhatap_cari_id,
    COALESCE(c.unvan, c.ad || ' ' || c.soyad, cs.muhatap_ad) AS muhatap_ad
FROM cek_senet cs
LEFT JOIN cari c ON c.id = cs.muhatap_cari_id
WHERE cs.silindi_mi = false
  AND cs.durum IN ('portfoyde', 'bankada_tahsile', 'bankada_teminat', 'verildi')
  AND cs.vade_tarihi BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
ORDER BY cs.vade_tarihi;

-- ================================================================
-- FONKSIYONLAR
-- ================================================================

-- ----------------------------------------------------------------
-- hesap_bakiye_hesapla: Belirli tarihte hesap bakiyesi
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hesap_bakiye_hesapla(
    p_hesap_id bigint,
    p_tarih    timestamptz DEFAULT now()
) RETURNS numeric AS $$
DECLARE
    v_baslangic numeric(18, 4);
    v_giris numeric(18, 4);
    v_cikis numeric(18, 4);
BEGIN
    SELECT baslangic_bakiye INTO v_baslangic FROM hesap WHERE id = p_hesap_id;
    IF v_baslangic IS NULL THEN
        RAISE EXCEPTION 'Hesap bulunamadi: %', p_hesap_id;
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN tip = 'giris' THEN tutar ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tip = 'cikis' THEN tutar ELSE 0 END), 0)
    INTO v_giris, v_cikis
    FROM hesap_hareket
    WHERE hesap_id = p_hesap_id
      AND aktif_mi = true
      AND tarih <= p_tarih;

    RETURN v_baslangic + v_giris - v_cikis;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- hesap_hareket_kaydet: Tek bacaklı hareket + otomatik yevmiye
-- ----------------------------------------------------------------
-- Sorun #10: Dövizli hareket için kur kontrolü sıkı. Kur bilinmiyorsa
-- ve para_cevir fallback da başarısız olursa sessizce yanlış ana_para
-- yazmak yerine EXCEPTION.
CREATE OR REPLACE FUNCTION hesap_hareket_kaydet(
    p_hesap_id      bigint,
    p_tip           varchar,
    p_tur           varchar,
    p_tutar         numeric,
    p_para_birimi_kod char(3),
    p_kur           numeric DEFAULT 1,
    p_cari_id       bigint DEFAULT NULL,
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_aciklama      text DEFAULT NULL,
    p_tarih         timestamptz DEFAULT now(),
    p_kullanici_id  bigint DEFAULT NULL,
    p_magaza_id     bigint DEFAULT NULL,
    p_kasa_id       bigint DEFAULT NULL,
    p_otomatik_yevmiye boolean DEFAULT true
) RETURNS bigint AS $$
DECLARE
    v_hareket_id bigint;
    v_fis_id bigint;
    v_ana_para numeric;
    v_ana_para_kod char(3);
BEGIN
    -- Ana para birimi sistem ayarından
    SELECT varsayilan_para_birimi INTO v_ana_para_kod FROM sistem_ayar WHERE id = 1;
    IF v_ana_para_kod IS NULL THEN v_ana_para_kod := 'TRY'; END IF;

    IF p_para_birimi_kod = v_ana_para_kod THEN
        v_ana_para := p_tutar;
    ELSE
        -- Önce para_cevir dene
        BEGIN
            v_ana_para := para_cevir(p_tutar, p_para_birimi_kod, v_ana_para_kod, p_tarih::date);
        EXCEPTION WHEN OTHERS THEN
            -- Fallback: çağrıcı kuru geçmiş mi?
            IF p_kur IS NULL OR p_kur <= 0 OR p_kur = 1 THEN
                RAISE EXCEPTION 'Dovizli hareket icin kur bilinmiyor: tutar=% para=% (cagriciya kur gecirilmelidir)',
                    p_tutar, p_para_birimi_kod;
            END IF;
            v_ana_para := p_tutar * p_kur;
        END;
    END IF;

    INSERT INTO hesap_hareket (
        hesap_id, tarih, tip, tur, tutar, para_birimi_kod, kur, ana_para_karsiligi,
        cari_id, kaynak_belge_tipi, kaynak_belge_id, aciklama,
        magaza_id, kasa_id, olusturan_kullanici_id
    ) VALUES (
        p_hesap_id, p_tarih, p_tip, p_tur, p_tutar, p_para_birimi_kod, p_kur, v_ana_para,
        p_cari_id, p_kaynak_belge_tipi, p_kaynak_belge_id, p_aciklama,
        p_magaza_id, p_kasa_id, p_kullanici_id
    )
    RETURNING id INTO v_hareket_id;

    IF p_otomatik_yevmiye THEN
        BEGIN
            SELECT yevmiye_otomatik_olustur('hesap_hareket', v_hareket_id) INTO v_fis_id;
            UPDATE hesap_hareket SET yevmiye_fis_id = v_fis_id WHERE id = v_hareket_id;
        EXCEPTION WHEN undefined_function THEN
            NULL;  -- modül 10 henüz yüklenmemiş
        END;
    END IF;

    RETURN v_hareket_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- SORUN #2: hesap_virman() — atomik iki bacaklı transfer
-- ----------------------------------------------------------------
-- Tek transaction içinde:
--   1. Kaynak hesabı kilitle
--   2. Negatif bakiye kontrolü (trigger zaten yapacak — burada önceden uyarı)
--   3. Çıkış hareketi kaydı (es_hareket_id NULL ilk)
--   4. Hedef hesabı kilitle
--   5. Giriş hareketi kaydı
--   6. İki hareketi birbirine bağla (es_hareket_id)
--   7. Tek yevmiye fişi (kaynak hesap / hedef hesap) üret
CREATE OR REPLACE FUNCTION hesap_virman(
    p_kaynak_hesap_id bigint,
    p_hedef_hesap_id  bigint,
    p_tutar           numeric,
    p_para_birimi_kod char(3),
    p_kur             numeric DEFAULT 1,
    p_aciklama        text DEFAULT NULL,
    p_tarih           timestamptz DEFAULT now(),
    p_kullanici_id    bigint DEFAULT NULL
) RETURNS TABLE(cikis_hareket_id bigint, giris_hareket_id bigint, yevmiye_fis_id bigint) AS $$
DECLARE
    v_kaynak RECORD;
    v_hedef RECORD;
    v_cikis_id bigint;
    v_giris_id bigint;
    v_fis_id bigint;
    v_ana_para numeric;
    v_ana_para_kod char(3);
BEGIN
    IF p_kaynak_hesap_id = p_hedef_hesap_id THEN
        RAISE EXCEPTION 'Virman: kaynak ve hedef hesap ayni olamaz (%)', p_kaynak_hesap_id;
    END IF;
    IF p_tutar IS NULL OR p_tutar <= 0 THEN
        RAISE EXCEPTION 'Virman tutari pozitif olmalidir: %', p_tutar;
    END IF;

    -- Deterministik kilit sıralaması (deadlock önlemi)
    IF p_kaynak_hesap_id < p_hedef_hesap_id THEN
        SELECT * INTO v_kaynak FROM hesap WHERE id = p_kaynak_hesap_id FOR UPDATE;
        SELECT * INTO v_hedef  FROM hesap WHERE id = p_hedef_hesap_id  FOR UPDATE;
    ELSE
        SELECT * INTO v_hedef  FROM hesap WHERE id = p_hedef_hesap_id  FOR UPDATE;
        SELECT * INTO v_kaynak FROM hesap WHERE id = p_kaynak_hesap_id FOR UPDATE;
    END IF;

    IF v_kaynak.id IS NULL THEN
        RAISE EXCEPTION 'Virman: kaynak hesap bulunamadi: %', p_kaynak_hesap_id;
    END IF;
    IF v_hedef.id IS NULL THEN
        RAISE EXCEPTION 'Virman: hedef hesap bulunamadi: %', p_hedef_hesap_id;
    END IF;

    -- Ana para karşılığı
    SELECT varsayilan_para_birimi INTO v_ana_para_kod FROM sistem_ayar WHERE id = 1;
    IF v_ana_para_kod IS NULL THEN v_ana_para_kod := 'TRY'; END IF;
    IF p_para_birimi_kod = v_ana_para_kod THEN
        v_ana_para := p_tutar;
    ELSE
        BEGIN
            v_ana_para := para_cevir(p_tutar, p_para_birimi_kod, v_ana_para_kod, p_tarih::date);
        EXCEPTION WHEN OTHERS THEN
            v_ana_para := p_tutar * p_kur;
        END;
    END IF;

    -- 1) ÇIKIŞ hareketi (kaynak hesap)
    INSERT INTO hesap_hareket (
        hesap_id, tarih, tip, tur, tutar, para_birimi_kod, kur, ana_para_karsiligi,
        kaynak_belge_tipi, aciklama, olusturan_kullanici_id
    ) VALUES (
        p_kaynak_hesap_id, p_tarih, 'cikis', 'virman_cikis', p_tutar,
        p_para_birimi_kod, p_kur, v_ana_para,
        'virman', COALESCE(p_aciklama, 'Virman cikis'), p_kullanici_id
    )
    RETURNING id INTO v_cikis_id;

    -- 2) GİRİŞ hareketi (hedef hesap)
    INSERT INTO hesap_hareket (
        hesap_id, tarih, tip, tur, tutar, para_birimi_kod, kur, ana_para_karsiligi,
        kaynak_belge_tipi, es_hareket_id, aciklama, olusturan_kullanici_id
    ) VALUES (
        p_hedef_hesap_id, p_tarih, 'giris', 'virman_giris', p_tutar,
        p_para_birimi_kod, p_kur, v_ana_para,
        'virman', v_cikis_id, COALESCE(p_aciklama, 'Virman giris'), p_kullanici_id
    )
    RETURNING id INTO v_giris_id;

    -- 3) İki bacak arasındaki bağ (çıkışa hedef giriş id'si)
    UPDATE hesap_hareket SET es_hareket_id = v_giris_id WHERE id = v_cikis_id;

    -- 4) Tek yevmiye fişi üret (modül 10 varsa)
    BEGIN
        SELECT yevmiye_virman_fisi_olustur(v_cikis_id, v_giris_id) INTO v_fis_id;
        UPDATE hesap_hareket SET yevmiye_fis_id = v_fis_id
            WHERE id IN (v_cikis_id, v_giris_id);
    EXCEPTION WHEN undefined_function THEN
        v_fis_id := NULL;  -- modül 10 yüklü değil
    END;

    cikis_hareket_id := v_cikis_id;
    giris_hareket_id := v_giris_id;
    yevmiye_fis_id := v_fis_id;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- SORUN #6: cek_senet_durum_guncelle() — atomik durum geçişi
-- ----------------------------------------------------------------
-- Çek durum geçişi + hesap_hareket + cek_senet_hareket tek transaction.
CREATE OR REPLACE FUNCTION cek_senet_durum_guncelle(
    p_cek_senet_id    bigint,
    p_yeni_durum      varchar,
    p_hedef_hesap_id  bigint DEFAULT NULL,
    p_ciro_cari_id    bigint DEFAULT NULL,
    p_aciklama        text DEFAULT NULL,
    p_kullanici_id    bigint DEFAULT NULL,
    p_tarih           timestamptz DEFAULT now()
) RETURNS bigint AS $$
DECLARE
    v_cek RECORD;
    v_hareket_id bigint;
BEGIN
    SELECT * INTO v_cek FROM cek_senet WHERE id = p_cek_senet_id FOR UPDATE;
    IF v_cek.id IS NULL THEN
        RAISE EXCEPTION 'Cek/senet bulunamadi: %', p_cek_senet_id;
    END IF;

    -- Durum geçişi
    UPDATE cek_senet SET
        durum = p_yeni_durum,
        durum_tarihi = p_tarih,
        hesap_id = COALESCE(p_hedef_hesap_id, hesap_id)
    WHERE id = p_cek_senet_id;

    -- Tahsil edildiyse hesap_hareket üret
    IF p_yeni_durum = 'tahsil_edildi' AND p_hedef_hesap_id IS NOT NULL THEN
        v_hareket_id := hesap_hareket_kaydet(
            p_hesap_id      := p_hedef_hesap_id,
            p_tip           := CASE WHEN v_cek.pozisyon = 'alinan' THEN 'giris' ELSE 'cikis' END,
            p_tur           := 'cek_hareket',
            p_tutar         := v_cek.tutar,
            p_para_birimi_kod := v_cek.para_birimi_kod,
            p_kur           := v_cek.kur,
            p_cari_id       := v_cek.muhatap_cari_id,
            p_kaynak_belge_tipi := 'cek_senet',
            p_kaynak_belge_id := p_cek_senet_id,
            p_aciklama      := COALESCE(p_aciklama, v_cek.tip || ' tahsili: ' || v_cek.evrak_no),
            p_tarih         := p_tarih,
            p_kullanici_id  := p_kullanici_id
        );
    END IF;

    -- Audit kaydı
    INSERT INTO cek_senet_hareket (
        cek_senet_id, eski_durum, yeni_durum,
        eski_hesap_id, yeni_hesap_id, hesap_hareket_id,
        ciro_edilen_cari_id, aciklama, kullanici_id
    ) VALUES (
        p_cek_senet_id, v_cek.durum, p_yeni_durum,
        v_cek.hesap_id, p_hedef_hesap_id, v_hareket_id,
        p_ciro_cari_id, p_aciklama, p_kullanici_id
    );

    RETURN p_cek_senet_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- SORUN #4 + #7: pos_tahsilat_kaydet() — POS komisyonu otomatik
-- ----------------------------------------------------------------
-- POS tahsilatı alındığında:
--   a) POS hesabına brüt tutar girer
--   b) Komisyon tutarı hesaplanır
--   c) Komisyon ayrı çıkış hareketi olarak düşer (tur=ucret_komisyon)
--   d) Yevmiye fişinde:
--      102 BANKA (net)      borç
--      653 KOMISYON (komisyon) borç
--        120 ALICILAR (brüt)    alacak
-- Burada sadece hareket üretiyoruz; yevmiye üretimi modül 10 tarafında
-- `yevmiye_pos_tahsilat_fisi_olustur` üzerinden tamamlanır.
CREATE OR REPLACE FUNCTION pos_tahsilat_kaydet(
    p_pos_hesap_id    bigint,
    p_brut_tutar      numeric,
    p_cari_id         bigint,
    p_para_birimi_kod char(3) DEFAULT NULL,
    p_kur             numeric DEFAULT 1,
    p_taksit_sayisi   int DEFAULT 1,
    p_referans_no     varchar DEFAULT NULL,
    p_aciklama        text DEFAULT NULL,
    p_tarih           timestamptz DEFAULT now(),
    p_kullanici_id    bigint DEFAULT NULL
) RETURNS TABLE(brut_hareket_id bigint, komisyon_hareket_id bigint, yevmiye_fis_id bigint) AS $$
DECLARE
    v_hesap RECORD;
    v_komisyon_orani numeric;
    v_komisyon_tutari numeric(18, 4);
    v_brut_id bigint;
    v_kom_id bigint;
    v_fis_id bigint;
    v_para char(3);
BEGIN
    SELECT * INTO v_hesap FROM hesap WHERE id = p_pos_hesap_id FOR UPDATE;
    IF v_hesap.id IS NULL THEN
        RAISE EXCEPTION 'POS hesabi bulunamadi: %', p_pos_hesap_id;
    END IF;
    IF v_hesap.tip <> 'pos' THEN
        RAISE EXCEPTION 'Hesap POS tipinde degil: tip=%', v_hesap.tip;
    END IF;

    v_para := COALESCE(p_para_birimi_kod, v_hesap.para_birimi_kod);
    v_komisyon_orani := COALESCE(v_hesap.pos_komisyon_orani, 0);
    v_komisyon_tutari := ROUND(p_brut_tutar * v_komisyon_orani / 100.0, 4);

    -- 1) Brüt POS giriş hareketi
    INSERT INTO hesap_hareket (
        hesap_id, tarih, tip, tur, tutar, para_birimi_kod, kur, ana_para_karsiligi,
        cari_id, kaynak_belge_tipi, referans_no, aciklama, olusturan_kullanici_id
    ) VALUES (
        p_pos_hesap_id, p_tarih, 'giris', 'tahsilat', p_brut_tutar,
        v_para, p_kur, p_brut_tutar * p_kur,
        p_cari_id, 'serbest', p_referans_no,
        COALESCE(p_aciklama, 'POS brut tahsilat (taksit ' || p_taksit_sayisi || ')'),
        p_kullanici_id
    )
    RETURNING id INTO v_brut_id;

    -- 2) Komisyon çıkış hareketi (varsa)
    IF v_komisyon_tutari > 0 THEN
        INSERT INTO hesap_hareket (
            hesap_id, tarih, tip, tur, tutar, para_birimi_kod, kur, ana_para_karsiligi,
            kaynak_belge_tipi, kaynak_belge_id, aciklama, olusturan_kullanici_id
        ) VALUES (
            p_pos_hesap_id, p_tarih, 'cikis', 'ucret_komisyon', v_komisyon_tutari,
            v_para, p_kur, v_komisyon_tutari * p_kur,
            'pos_komisyon', v_brut_id,
            'POS komisyonu (%' || v_komisyon_orani || ')',
            p_kullanici_id
        )
        RETURNING id INTO v_kom_id;
    END IF;

    -- 3) Yevmiye fişi (modül 10 varsa)
    BEGIN
        SELECT yevmiye_pos_tahsilat_fisi_olustur(v_brut_id, v_kom_id) INTO v_fis_id;
        UPDATE hesap_hareket SET yevmiye_fis_id = v_fis_id
            WHERE id IN (v_brut_id, v_kom_id);
    EXCEPTION WHEN undefined_function THEN
        v_fis_id := NULL;
    END;

    brut_hareket_id := v_brut_id;
    komisyon_hareket_id := v_kom_id;
    yevmiye_fis_id := v_fis_id;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- NOT: hesap_hareket.yevmiye_fis_id ve hesap.muhasebe_hesap_id FK'leri
-- modül 10 sonunda eklenir.
-- ----------------------------------------------------------------
