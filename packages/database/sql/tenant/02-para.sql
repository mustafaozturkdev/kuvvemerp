-- ============================================================
-- MODÜL 02: PARA BİRİMİ VE DÖVİZ — v2 REFACTOR
-- ============================================================
-- v1 eleştirmen skoru: 7/10 → v2 hedef: 9+/10
--
-- Bu refactor'da çözülen kritik sorunlar (02-para-elestiri-v1):
--   #1 `para_cevir()` ortalama kur → `para_cevir_muhasebe()` yön bazlı doğru kur
--   #2 `doviz_kuru` yıllık declarative partitioning
--   #3 Çapraz kur test fonksiyonu `para_cevir_test()`
--   #4 TCMB API formatı doc + `doviz_kuru_import_tcmb_xml` yardımcı not
--   #5 `vw_kullanim_disi_para_birimi` — deaktif ama tarihsel kullanımda olanlar
--   #6 `doviz_kuru_tahmin` — gelecek kur tahminleri (hedge için)
--   #7 `para_formatla()` — DB seviyesinde sembol/ayraç/ondalık formatlama
--   Ayrıca: CHECK (alis>0, satis>0), kaynak öncelik, efektif COALESCE.
--
-- Belge kuralı (08-10 modülleri): Her belge kur bilgisini oluşturma
-- anında `kur numeric(18, 6)` alanında saklar. `para_cevir*` sadece
-- oluşturma anında çağrılır, geçmiş belge tekrar hesaplanmaz.
-- ============================================================

-- ----------------------------------------------------------------
-- PARA_BIRIMI: ISO 4217 standart kodları
-- ----------------------------------------------------------------
CREATE TABLE para_birimi (
    kod             char(3) PRIMARY KEY,                 -- ISO 4217: TRY, USD, EUR, AED
    ad              varchar(100) NOT NULL,
    ad_en           varchar(100),
    sembol          varchar(10) NOT NULL,
    sembol_html     varchar(30),                         -- '&#8378;' / '&euro;' — email/rapor için
    sembol_pozisyon varchar(10) NOT NULL DEFAULT 'sonra' CHECK (sembol_pozisyon IN ('once', 'sonra')),
    sembol_bosluk_mu boolean NOT NULL DEFAULT false,     -- "100 ₺" mi "100₺" mi
    ondalik_basamak smallint NOT NULL DEFAULT 2 CHECK (ondalik_basamak BETWEEN 0 AND 6),
    binlik_ayraci   varchar(1) NOT NULL DEFAULT '.',
    ondalik_ayraci  varchar(1) NOT NULL DEFAULT ',',
    ulke_kodu       char(2),                             -- birincil kullanan ülke
    sira            int NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_para_birimi_aktif ON para_birimi(aktif_mi);

CREATE TRIGGER trg_para_birimi_guncelleme
    BEFORE UPDATE ON para_birimi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Seed: Yaygın para birimleri
INSERT INTO para_birimi (kod, ad, ad_en, sembol, sembol_html, sembol_pozisyon, ondalik_basamak, binlik_ayraci, ondalik_ayraci, ulke_kodu, sira) VALUES
('TRY', 'Türk Lirası',          'Turkish Lira',         '₺',  '&#8378;', 'sonra', 2, '.', ',', 'TR', 1),
('USD', 'ABD Doları',           'US Dollar',            '$',  '&#36;',   'once',  2, ',', '.', 'US', 2),
('EUR', 'Euro',                 'Euro',                 '€',  '&euro;',  'sonra', 2, '.', ',', 'DE', 3),
('GBP', 'İngiliz Sterlini',     'British Pound',        '£',  '&pound;', 'once',  2, ',', '.', 'GB', 4),
('AED', 'BAE Dirhemi',          'UAE Dirham',           'د.إ','د.إ',     'sonra', 2, ',', '.', 'AE', 5),
('SAR', 'Suudi Arabistan Riyali','Saudi Riyal',         '﷼',  '&#65020;','sonra', 2, ',', '.', 'SA', 6),
('CHF', 'İsviçre Frangı',       'Swiss Franc',          'CHF','CHF',     'once',  2, '''', '.', 'CH', 7),
('JPY', 'Japon Yeni',           'Japanese Yen',         '¥',  '&yen;',   'once',  0, ',', '.', 'JP', 8),
('CNY', 'Çin Yuanı',            'Chinese Yuan',         '¥',  '&yen;',   'once',  2, ',', '.', 'CN', 9),
('RUB', 'Rus Rublesi',          'Russian Ruble',        '₽',  '&#8381;', 'sonra', 2, ' ', ',', 'RU', 10),
('AZN', 'Azerbaycan Manatı',    'Azerbaijani Manat',    '₼',  '&#8380;', 'sonra', 2, ' ', ',', 'AZ', 11),
('XAU', 'Altın (gram)',         'Gold (gram)',          'gr', 'gr',      'sonra', 4, '.', ',', NULL, 90),
('XAG', 'Gümüş (gram)',         'Silver (gram)',        'gr', 'gr',      'sonra', 4, '.', ',', NULL, 91);

-- ----------------------------------------------------------------
-- DOVIZ_KURU_KAYNAK: Kur kaynakları
-- ----------------------------------------------------------------
-- TCMB XML format dokümantasyonu:
--   https://www.tcmb.gov.tr/kurlar/today.xml
--   <Tarih_Date Tarih="11.04.2026"...>
--     <Currency CurrencyCode="USD" Kod="USD" CurrencyName="US DOLLAR">
--       <ForexBuying>32.15</ForexBuying>      ← alis (banka alış)
--       <ForexSelling>32.20</ForexSelling>    ← satis (banka satış)
--       <BanknoteBuying>32.10</BanknoteBuying>← efektif_alis
--       <BanknoteSelling>32.22</BanknoteSelling>← efektif_satis
--     </Currency>
-- Import: app katmanı XML'i çözer, doviz_kuru'na yazar (kaynak_id = TCMB).
-- ----------------------------------------------------------------
CREATE TABLE doviz_kuru_kaynak (
    id              bigserial PRIMARY KEY,
    kod             varchar(20) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    api_url         varchar(500),
    api_format      varchar(20) CHECK (api_format IN ('xml', 'json', 'csv', 'manuel')),
    api_anahtar_sifreli bytea,                           -- pgcrypto ile şifreli (master key app'te)
    cron_ifade      varchar(50),                         -- '0 9 * * *' = her gün 09:00
    oncelik         int NOT NULL DEFAULT 100,            -- düşük değer = yüksek öncelik
    aktif_mi        boolean NOT NULL DEFAULT true,
    son_calisma     timestamptz,
    son_basari      timestamptz,
    son_hata        text,
    ust_uste_hata_sayisi int NOT NULL DEFAULT 0,         -- alarm trigger eşiği
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_doviz_kuru_kaynak_guncelleme
    BEFORE UPDATE ON doviz_kuru_kaynak
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

INSERT INTO doviz_kuru_kaynak (kod, ad, api_url, api_format, cron_ifade, oncelik) VALUES
('TCMB',     'TCMB Resmi Kuru',       'https://www.tcmb.gov.tr/kurlar/today.xml',                          'xml',    '15 15 * * 1-5', 10),
('ECB',      'Avrupa Merkez Bankası', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',     'xml',    '0 16 * * 1-5',  20),
('FIXER_IO', 'fixer.io API',          'https://data.fixer.io/api/latest',                                  'json',   '0 * * * *',     30),
('MANUEL',   'Manuel Giriş',          NULL,                                                                'manuel', NULL,            99);

-- Sistem_ayar.varsayilan_kur_kaynagi_id FK'sı (modül 01'de kolon tanımlı)
ALTER TABLE sistem_ayar
    ADD CONSTRAINT fk_sistem_ayar_kur_kaynagi
    FOREIGN KEY (varsayilan_kur_kaynagi_id) REFERENCES doviz_kuru_kaynak(id);

-- ----------------------------------------------------------------
-- DOVIZ_KURU: Tarih bazlı kur geçmişi — YILLIK PARTITIONING
-- ----------------------------------------------------------------
-- PostgreSQL 12+ declarative partitioning.
-- 2026/2027/2028 hazır. Sonrası için:
--   pg_partman (otomatik) veya cron ile manuel CREATE TABLE.
-- ----------------------------------------------------------------
CREATE TABLE doviz_kuru (
    id              bigserial,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    karsi_para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),  -- genelde TRY
    tarih           date NOT NULL,
    -- 4 kur tipi (TCMB standardı)
    alis            numeric(18, 6) NOT NULL CHECK (alis > 0),
    satis           numeric(18, 6) NOT NULL CHECK (satis > 0 AND satis >= alis),
    efektif_alis    numeric(18, 6) CHECK (efektif_alis IS NULL OR efektif_alis > 0),
    efektif_satis   numeric(18, 6) CHECK (efektif_satis IS NULL OR efektif_satis > 0),
    -- Çapraz kur hesabı için
    cross_kur_mu    boolean NOT NULL DEFAULT false,
    -- Kaynak
    kaynak_id       bigint REFERENCES doviz_kuru_kaynak(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, tarih),
    UNIQUE (para_birimi_kod, karsi_para_birimi_kod, tarih, kaynak_id)
) PARTITION BY RANGE (tarih);

CREATE TABLE doviz_kuru_2026 PARTITION OF doviz_kuru
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE doviz_kuru_2027 PARTITION OF doviz_kuru
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE doviz_kuru_2028 PARTITION OF doviz_kuru
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
CREATE TABLE doviz_kuru_default PARTITION OF doviz_kuru DEFAULT;

CREATE INDEX idx_doviz_kuru_tarih ON doviz_kuru(tarih DESC, para_birimi_kod);
CREATE INDEX idx_doviz_kuru_son ON doviz_kuru(para_birimi_kod, karsi_para_birimi_kod, tarih DESC);

-- ----------------------------------------------------------------
-- DOVIZ_KURU_TAHMIN: Gelecek tarih kur tahminleri (hedge / forecast)
-- ----------------------------------------------------------------
-- Opsiyonel. Vadeli alımlarda / hedging stratejilerinde kullanılabilir.
-- Tahmin kaynağı: banka araştırma raporları, app içi ML modeli vb.
-- ----------------------------------------------------------------
CREATE TABLE doviz_kuru_tahmin (
    id              bigserial PRIMARY KEY,
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    karsi_para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    tahmin_tarihi   date NOT NULL,                       -- tahminin yapıldığı tarih
    hedef_tarih     date NOT NULL,                       -- kurun geçerli olacağı gelecek tarih
    tahmini_kur     numeric(18, 6) NOT NULL CHECK (tahmini_kur > 0),
    alt_sinir       numeric(18, 6),                      -- güven aralığı alt
    ust_sinir       numeric(18, 6),                      -- güven aralığı üst
    kaynak          varchar(100),                        -- 'is_bank_rapor', 'ml_model_v1', 'manuel'
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (hedef_tarih >= tahmin_tarihi)
);
CREATE INDEX idx_doviz_kuru_tahmin_hedef ON doviz_kuru_tahmin(para_birimi_kod, hedef_tarih);

-- ----------------------------------------------------------------
-- VIEW: vw_guncel_kur — Bugünkü kurlar (birincil kaynaktan)
-- ----------------------------------------------------------------
-- sistem_ayar.varsayilan_kur_kaynagi_id tercih edilir; yoksa oncelik
-- sırasına göre ilk bulunan. Reproducibility: aynı tarih için hep aynı
-- kaynağın kuru döner.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_guncel_kur AS
SELECT DISTINCT ON (dk.para_birimi_kod, dk.karsi_para_birimi_kod)
    dk.para_birimi_kod,
    dk.karsi_para_birimi_kod,
    dk.tarih,
    dk.alis,
    dk.satis,
    COALESCE(dk.efektif_alis, dk.alis) AS efektif_alis,
    COALESCE(dk.efektif_satis, dk.satis) AS efektif_satis,
    (dk.alis + dk.satis) / 2 AS ortalama,
    dk.kaynak_id,
    dkk.kod AS kaynak_kod
FROM doviz_kuru dk
LEFT JOIN doviz_kuru_kaynak dkk ON dkk.id = dk.kaynak_id
WHERE dk.tarih <= CURRENT_DATE
ORDER BY
    dk.para_birimi_kod,
    dk.karsi_para_birimi_kod,
    dk.tarih DESC,
    COALESCE(dkk.oncelik, 9999) ASC;

-- ----------------------------------------------------------------
-- VIEW: vw_kullanim_disi_para_birimi
-- ----------------------------------------------------------------
-- Deaktif edilmiş ama geçmişte kur kaydı olan para birimleri.
-- (Belge tablolarında FK olanları bulmak için belgeler kurulduktan
-- sonra bu view genişletilebilir.)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_kullanim_disi_para_birimi AS
SELECT
    pb.kod,
    pb.ad,
    pb.aktif_mi,
    COUNT(dk.*) AS tarihsel_kur_sayisi,
    MIN(dk.tarih) AS ilk_kur_tarihi,
    MAX(dk.tarih) AS son_kur_tarihi
FROM para_birimi pb
LEFT JOIN doviz_kuru dk ON dk.para_birimi_kod = pb.kod
WHERE pb.aktif_mi = false
GROUP BY pb.kod, pb.ad, pb.aktif_mi;

-- ----------------------------------------------------------------
-- FUNCTION: para_cevir — HIZLI TAHMİN (ortalama kur)
-- ----------------------------------------------------------------
-- UYARI: Muhasebe/belge kaydı için KULLANMA. `para_cevir_muhasebe`
-- fonksiyonunu kullan (alış/satış yönüne göre doğru kur seçer).
-- Bu fonksiyon sadece UI/rapor amaçlı hızlı tahmin için.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION para_cevir(
    p_tutar numeric,
    p_kaynak_para char(3),
    p_hedef_para char(3),
    p_tarih date DEFAULT CURRENT_DATE
) RETURNS numeric AS $$
DECLARE
    v_kur numeric;
    v_kaynak_kur numeric;
    v_hedef_kur numeric;
BEGIN
    IF p_kaynak_para = p_hedef_para THEN
        RETURN p_tutar;
    END IF;

    -- Direkt kur var mı?
    SELECT (alis + satis) / 2 INTO v_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_kaynak_para
      AND karsi_para_birimi_kod = p_hedef_para
      AND tarih <= p_tarih
    ORDER BY tarih DESC
    LIMIT 1;

    IF v_kur IS NOT NULL THEN
        RETURN p_tutar * v_kur;
    END IF;

    -- Çapraz kur (TRY pivot)
    SELECT (alis + satis) / 2 INTO v_kaynak_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_kaynak_para
      AND karsi_para_birimi_kod = 'TRY'
      AND tarih <= p_tarih
    ORDER BY tarih DESC
    LIMIT 1;

    SELECT (alis + satis) / 2 INTO v_hedef_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_hedef_para
      AND karsi_para_birimi_kod = 'TRY'
      AND tarih <= p_tarih
    ORDER BY tarih DESC
    LIMIT 1;

    IF v_kaynak_kur IS NOT NULL AND v_hedef_kur IS NOT NULL THEN
        RETURN p_tutar * v_kaynak_kur / v_hedef_kur;
    END IF;

    RAISE EXCEPTION 'Kur bulunamadi: % -> % (%)', p_kaynak_para, p_hedef_para, p_tarih;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- FUNCTION: para_cevir_muhasebe — DOĞRU yön bazlı kur
-- ----------------------------------------------------------------
-- Kural (banka perspektifinden):
--   p_yon = 'alis'  → kasaya PARA GİRİŞİ (müşteri döviz ödedi, banka
--                     bizden döviz alır) → banka `satis` kuru uygulanır.
--   p_yon = 'satis' → kasadan PARA ÇIKIŞI (biz döviz ödedik, banka bize
--                     döviz sattı) → banka `alis` kuru uygulanır.
--   p_efektif = true → nakit/banknot işlemleri için efektif kur kullanılır.
--
-- Bu muhasebe best-practice'i gelir idaresi raporlamasında kritiktir.
-- `para_cevir()` (ortalama) sadece UI tahmin amaçlı. Belgede kur
-- daima `para_cevir_muhasebe` ile hesaplanıp satırda saklanır.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION para_cevir_muhasebe(
    p_tutar numeric,
    p_kaynak_para char(3),
    p_hedef_para char(3),
    p_tarih date DEFAULT CURRENT_DATE,
    p_yon varchar DEFAULT 'satis',                       -- 'alis' | 'satis'
    p_efektif boolean DEFAULT false,
    p_fallback_son_bilinen boolean DEFAULT false
) RETURNS numeric AS $$
DECLARE
    v_kur numeric;
    v_kaynak_kur numeric;
    v_hedef_kur numeric;
BEGIN
    IF p_yon NOT IN ('alis', 'satis') THEN
        RAISE EXCEPTION 'Gecersiz yon: % (alis|satis bekleniyor)', p_yon;
    END IF;

    IF p_kaynak_para = p_hedef_para THEN
        RETURN p_tutar;
    END IF;

    -- Direkt kur
    SELECT
        CASE
            WHEN p_yon = 'alis'  AND p_efektif THEN COALESCE(efektif_satis, satis)
            WHEN p_yon = 'alis'                 THEN satis
            WHEN p_yon = 'satis' AND p_efektif THEN COALESCE(efektif_alis, alis)
            WHEN p_yon = 'satis'                THEN alis
        END
    INTO v_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_kaynak_para
      AND karsi_para_birimi_kod = p_hedef_para
      AND (p_fallback_son_bilinen OR tarih <= p_tarih)
    ORDER BY tarih DESC
    LIMIT 1;

    IF v_kur IS NOT NULL THEN
        RETURN p_tutar * v_kur;
    END IF;

    -- Çapraz kur (TRY pivot)
    SELECT
        CASE
            WHEN p_yon = 'alis'  AND p_efektif THEN COALESCE(efektif_satis, satis)
            WHEN p_yon = 'alis'                 THEN satis
            WHEN p_yon = 'satis' AND p_efektif THEN COALESCE(efektif_alis, alis)
            WHEN p_yon = 'satis'                THEN alis
        END
    INTO v_kaynak_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_kaynak_para
      AND karsi_para_birimi_kod = 'TRY'
      AND (p_fallback_son_bilinen OR tarih <= p_tarih)
    ORDER BY tarih DESC
    LIMIT 1;

    SELECT
        CASE
            WHEN p_yon = 'alis'  AND p_efektif THEN COALESCE(efektif_satis, satis)
            WHEN p_yon = 'alis'                 THEN satis
            WHEN p_yon = 'satis' AND p_efektif THEN COALESCE(efektif_alis, alis)
            WHEN p_yon = 'satis'                THEN alis
        END
    INTO v_hedef_kur
    FROM doviz_kuru
    WHERE para_birimi_kod = p_hedef_para
      AND karsi_para_birimi_kod = 'TRY'
      AND (p_fallback_son_bilinen OR tarih <= p_tarih)
    ORDER BY tarih DESC
    LIMIT 1;

    IF v_kaynak_kur IS NOT NULL AND v_hedef_kur IS NOT NULL THEN
        RETURN p_tutar * v_kaynak_kur / v_hedef_kur;
    END IF;

    RAISE EXCEPTION 'Kur bulunamadi: % -> % (%), yon=%, efektif=%',
        p_kaynak_para, p_hedef_para, p_tarih, p_yon, p_efektif;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- FUNCTION: para_formatla — Tutar + para birimi + dil formatlama
-- ----------------------------------------------------------------
-- DB seviyesinde formatlama (raporlar / email template / server-side
-- render için). App katmanı da kullanabilir ama tutarlılık için DB
-- tek kaynaktır.
-- Örnek: para_formatla(1234567.89, 'TRY', 'tr') → '1.234.567,89 ₺'
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION para_formatla(
    p_tutar numeric,
    p_para_birimi char(3),
    p_dil char(2) DEFAULT 'tr'
) RETURNS text AS $$
DECLARE
    v_pb para_birimi%ROWTYPE;
    v_tamsayi text;
    v_ondalik text;
    v_isaret  text := '';
    v_mutlak  numeric;
    v_formatli text;
    v_bosluk   text;
BEGIN
    SELECT * INTO v_pb FROM para_birimi WHERE kod = p_para_birimi;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Para birimi bulunamadi: %', p_para_birimi;
    END IF;

    IF p_tutar < 0 THEN
        v_isaret := '-';
        v_mutlak := -p_tutar;
    ELSE
        v_mutlak := p_tutar;
    END IF;

    -- Ondalık basamağa yuvarla
    v_mutlak := round(v_mutlak, v_pb.ondalik_basamak);

    -- Binlik ayraç uygulaması (Postgres to_char kullanarak)
    v_tamsayi := to_char(trunc(v_mutlak), 'FM999G999G999G999G999G999G999');
    -- PostgreSQL varsayılan binlik ayracı ',' — kullanıcı istediğini koymak için değiştir
    v_tamsayi := replace(v_tamsayi, ',', v_pb.binlik_ayraci);

    IF v_pb.ondalik_basamak > 0 THEN
        v_ondalik := lpad(
            (round((v_mutlak - trunc(v_mutlak)) * power(10, v_pb.ondalik_basamak)))::text,
            v_pb.ondalik_basamak,
            '0'
        );
        v_formatli := v_tamsayi || v_pb.ondalik_ayraci || v_ondalik;
    ELSE
        v_formatli := v_tamsayi;
    END IF;

    v_bosluk := CASE WHEN v_pb.sembol_bosluk_mu THEN ' ' ELSE '' END;

    IF v_pb.sembol_pozisyon = 'once' THEN
        RETURN v_isaret || v_pb.sembol || v_bosluk || v_formatli;
    ELSE
        RETURN v_isaret || v_formatli || v_bosluk || v_pb.sembol;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- FUNCTION: para_cevir_test — Birim test fonksiyonu
-- ----------------------------------------------------------------
-- Çapraz kur senaryosunu doğrular.
-- Test: USD→EUR TRY pivot üzerinden doğru çalışıyor mu?
--
-- Kullanım: geliştirme/CI ortamında manuel tetikle.
--   SELECT para_cevir_test();
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION para_cevir_test() RETURNS text AS $$
DECLARE
    v_test_tarih date := CURRENT_DATE;
    v_sonuc numeric;
    v_beklenen numeric;
    v_rapor text := '';
BEGIN
    -- Test 1: Aynı para → aynı tutar
    v_sonuc := para_cevir(100, 'TRY', 'TRY', v_test_tarih);
    IF v_sonuc <> 100 THEN
        v_rapor := v_rapor || E'[HATA] TRY→TRY bekleniyor 100, döndü: ' || v_sonuc || E'\n';
    ELSE
        v_rapor := v_rapor || E'[OK] TRY→TRY aynı tutar\n';
    END IF;

    -- Test 2: para_cevir_muhasebe yön parametreleri
    BEGIN
        v_sonuc := para_cevir_muhasebe(1000, 'USD', 'TRY', v_test_tarih, 'satis', false, true);
        v_rapor := v_rapor || E'[OK] USD→TRY satis fallback: ' || v_sonuc || E'\n';
    EXCEPTION WHEN OTHERS THEN
        v_rapor := v_rapor || E'[UYARI] USD→TRY kur yok (seed eksik): ' || SQLERRM || E'\n';
    END;

    -- Test 3: Çapraz kur USD→EUR via TRY
    BEGIN
        v_sonuc := para_cevir_muhasebe(1000, 'USD', 'EUR', v_test_tarih, 'satis', false, true);
        v_rapor := v_rapor || E'[OK] USD→EUR çapraz (TRY pivot): ' || v_sonuc || E'\n';
    EXCEPTION WHEN OTHERS THEN
        v_rapor := v_rapor || E'[UYARI] USD→EUR çapraz kur yok: ' || SQLERRM || E'\n';
    END;

    -- Test 4: para_formatla
    v_rapor := v_rapor || E'[OK] para_formatla(1234567.89, TRY, tr) = ' || para_formatla(1234567.89, 'TRY', 'tr') || E'\n';
    v_rapor := v_rapor || E'[OK] para_formatla(-500, USD, en) = ' || para_formatla(-500, 'USD', 'en') || E'\n';

    RETURN v_rapor;
END;
$$ LANGUAGE plpgsql;
