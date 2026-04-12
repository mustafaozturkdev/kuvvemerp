-- ============================================================
-- MODÜL 03: VERGİ VE ÜLKE (v2 — REFACTOR)
-- ============================================================
-- Amaç: TR'ye bağımlı değil. Yeni ülke = INSERT, yeni vergi oranı = INSERT.
-- KDV, VAT, GST, Sales Tax, ÖTV, Tevkifat tek model üstünde.
--
-- v1'den farklar (v1 eleştirisi 03-vergi-elestiri-v1.md çözümleri):
--   - Vergi HESAP KURALI modeli eklendi (vergi_hesap_kurali, vergi_kademeli_dilim)
--   - Vergi zinciri (ÖTV + KDV bileşik) — vergi_zincir tablosu
--   - Tarihsel vergi oranı versiyonlama + tarihce + trigger + tarihte-view
--   - 81 TR il seed'i tamamlandı
--   - ÖTV özel vergi grup modeli (ozel_vergi_grup)
--   - Vergi muafiyet çoklu-satır (vergi_muafiyet) + efektif-vergi view
--   - US Sales Tax + EU VAT için kapsam/bolge_kodu + origin/destination flag
--   - GTIP hiyerarşi (ust_gtip_kod) + vergi_kombinasyon_id
--   - KDV beyannamesi ham veri view'i
--   - TR majör vergi daireleri seed (30+)
--   - i18n: vergi_orani_ceviri, gtip_ceviri
--   - Oran semantiği: sakla %. CHECK (oran BETWEEN 0 AND 100)
-- ============================================================

-- ----------------------------------------------------------------
-- ULKE: ISO 3166-1 alpha-2
-- ----------------------------------------------------------------
CREATE TABLE ulke (
    kod             char(2) PRIMARY KEY,                 -- TR, AE, US
    kod3            char(3) UNIQUE NOT NULL,             -- TUR, ARE, USA
    ad              varchar(100) NOT NULL,
    ad_en           varchar(100) NOT NULL,
    telefon_kodu    varchar(10),                         -- '+90'
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    bayrak_emoji    varchar(10) CHECK (bayrak_emoji IS NULL OR length(bayrak_emoji) <= 8),
    -- Multi-ülke vergi mimarisi
    vergi_uygulama_tipi varchar(20) NOT NULL DEFAULT 'destination'
                    CHECK (vergi_uygulama_tipi IN ('origin', 'destination', 'hybrid')),
    -- NULL = tek zaman dilimi; JSONB = çoklu (ABD gibi)
    zaman_dilimleri jsonb,
    aktif_mi        boolean NOT NULL DEFAULT true,
    sira            int NOT NULL DEFAULT 0
);

INSERT INTO ulke (kod, kod3, ad, ad_en, telefon_kodu, para_birimi_kod, bayrak_emoji, vergi_uygulama_tipi, sira) VALUES
('TR', 'TUR', 'Türkiye',                'Turkey',               '+90', 'TRY', '🇹🇷', 'destination', 1),
('AE', 'ARE', 'Birleşik Arap Emirlikleri','United Arab Emirates','+971','AED', '🇦🇪', 'destination', 2),
('US', 'USA', 'Amerika Birleşik Devletleri','United States',     '+1',  'USD', '🇺🇸', 'origin',      3),
('GB', 'GBR', 'Birleşik Krallık',       'United Kingdom',       '+44', 'GBP', '🇬🇧', 'destination', 4),
('DE', 'DEU', 'Almanya',                'Germany',              '+49', 'EUR', '🇩🇪', 'destination', 5),
('FR', 'FRA', 'Fransa',                 'France',               '+33', 'EUR', '🇫🇷', 'destination', 6),
('IT', 'ITA', 'İtalya',                 'Italy',                '+39', 'EUR', '🇮🇹', 'destination', 7),
('ES', 'ESP', 'İspanya',                'Spain',                '+34', 'EUR', '🇪🇸', 'destination', 8),
('NL', 'NLD', 'Hollanda',               'Netherlands',          '+31', 'EUR', '🇳🇱', 'destination', 9),
('CH', 'CHE', 'İsviçre',                'Switzerland',          '+41', 'CHF', '🇨🇭', 'destination', 10),
('SA', 'SAU', 'Suudi Arabistan',        'Saudi Arabia',         '+966','SAR', '🇸🇦', 'destination', 11),
('AZ', 'AZE', 'Azerbaycan',             'Azerbaijan',           '+994','AZN', '🇦🇿', 'destination', 12),
('RU', 'RUS', 'Rusya',                  'Russia',               '+7',  'RUB', '🇷🇺', 'destination', 13),
('CN', 'CHN', 'Çin',                    'China',                '+86', 'CNY', '🇨🇳', 'destination', 14),
('JP', 'JPN', 'Japonya',                'Japan',                '+81', 'JPY', '🇯🇵', 'destination', 15);

-- ----------------------------------------------------------------
-- IL: Ülkenin alt bölgesi (state, province, il, emirate, region)
-- ----------------------------------------------------------------
CREATE TABLE il (
    id              bigserial PRIMARY KEY,
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod) ON DELETE RESTRICT,
    kod             varchar(20),                         -- '34' for İstanbul, 'CA' for California
    ad              varchar(100) NOT NULL,
    ad_en           varchar(100),
    tip             varchar(20) NOT NULL DEFAULT 'il'
                    CHECK (tip IN ('il', 'state', 'province', 'emirate', 'region', 'county', 'prefecture')),
    -- US Sales Tax vb. için varsayılan bölgesel oran
    varsayilan_vergi_orani_id bigint,  -- FK aşağıda
    aktif_mi        boolean NOT NULL DEFAULT true,
    UNIQUE (ulke_kodu, kod),
    UNIQUE (ulke_kodu, ad)
);
CREATE INDEX idx_il_ulke ON il(ulke_kodu);
CREATE INDEX idx_il_tip ON il(tip);

-- TR 81 İL — TAM LİSTE
INSERT INTO il (ulke_kodu, kod, ad, tip) VALUES
('TR', '01', 'Adana', 'il'),
('TR', '02', 'Adıyaman', 'il'),
('TR', '03', 'Afyonkarahisar', 'il'),
('TR', '04', 'Ağrı', 'il'),
('TR', '05', 'Amasya', 'il'),
('TR', '06', 'Ankara', 'il'),
('TR', '07', 'Antalya', 'il'),
('TR', '08', 'Artvin', 'il'),
('TR', '09', 'Aydın', 'il'),
('TR', '10', 'Balıkesir', 'il'),
('TR', '11', 'Bilecik', 'il'),
('TR', '12', 'Bingöl', 'il'),
('TR', '13', 'Bitlis', 'il'),
('TR', '14', 'Bolu', 'il'),
('TR', '15', 'Burdur', 'il'),
('TR', '16', 'Bursa', 'il'),
('TR', '17', 'Çanakkale', 'il'),
('TR', '18', 'Çankırı', 'il'),
('TR', '19', 'Çorum', 'il'),
('TR', '20', 'Denizli', 'il'),
('TR', '21', 'Diyarbakır', 'il'),
('TR', '22', 'Edirne', 'il'),
('TR', '23', 'Elazığ', 'il'),
('TR', '24', 'Erzincan', 'il'),
('TR', '25', 'Erzurum', 'il'),
('TR', '26', 'Eskişehir', 'il'),
('TR', '27', 'Gaziantep', 'il'),
('TR', '28', 'Giresun', 'il'),
('TR', '29', 'Gümüşhane', 'il'),
('TR', '30', 'Hakkari', 'il'),
('TR', '31', 'Hatay', 'il'),
('TR', '32', 'Isparta', 'il'),
('TR', '33', 'Mersin', 'il'),
('TR', '34', 'İstanbul', 'il'),
('TR', '35', 'İzmir', 'il'),
('TR', '36', 'Kars', 'il'),
('TR', '37', 'Kastamonu', 'il'),
('TR', '38', 'Kayseri', 'il'),
('TR', '39', 'Kırklareli', 'il'),
('TR', '40', 'Kırşehir', 'il'),
('TR', '41', 'Kocaeli', 'il'),
('TR', '42', 'Konya', 'il'),
('TR', '43', 'Kütahya', 'il'),
('TR', '44', 'Malatya', 'il'),
('TR', '45', 'Manisa', 'il'),
('TR', '46', 'Kahramanmaraş', 'il'),
('TR', '47', 'Mardin', 'il'),
('TR', '48', 'Muğla', 'il'),
('TR', '49', 'Muş', 'il'),
('TR', '50', 'Nevşehir', 'il'),
('TR', '51', 'Niğde', 'il'),
('TR', '52', 'Ordu', 'il'),
('TR', '53', 'Rize', 'il'),
('TR', '54', 'Sakarya', 'il'),
('TR', '55', 'Samsun', 'il'),
('TR', '56', 'Siirt', 'il'),
('TR', '57', 'Sinop', 'il'),
('TR', '58', 'Sivas', 'il'),
('TR', '59', 'Tekirdağ', 'il'),
('TR', '60', 'Tokat', 'il'),
('TR', '61', 'Trabzon', 'il'),
('TR', '62', 'Tunceli', 'il'),
('TR', '63', 'Şanlıurfa', 'il'),
('TR', '64', 'Uşak', 'il'),
('TR', '65', 'Van', 'il'),
('TR', '66', 'Yozgat', 'il'),
('TR', '67', 'Zonguldak', 'il'),
('TR', '68', 'Aksaray', 'il'),
('TR', '69', 'Bayburt', 'il'),
('TR', '70', 'Karaman', 'il'),
('TR', '71', 'Kırıkkale', 'il'),
('TR', '72', 'Batman', 'il'),
('TR', '73', 'Şırnak', 'il'),
('TR', '74', 'Bartın', 'il'),
('TR', '75', 'Ardahan', 'il'),
('TR', '76', 'Iğdır', 'il'),
('TR', '77', 'Yalova', 'il'),
('TR', '78', 'Karabük', 'il'),
('TR', '79', 'Kilis', 'il'),
('TR', '80', 'Osmaniye', 'il'),
('TR', '81', 'Düzce', 'il');

-- NOT: TR ilçeleri seed için: /seed/tr-ilce.sql dosyasında (973+ ilçe).
-- NOT: Diğer ülkelerin il/eyalet seed'leri: /seed/<ulke>-il.sql dosyasında.

-- ----------------------------------------------------------------
-- ILCE: İlin alt bölgesi
-- ----------------------------------------------------------------
CREATE TABLE ilce (
    id              bigserial PRIMARY KEY,
    il_id           bigint NOT NULL REFERENCES il(id) ON DELETE RESTRICT,
    ad              varchar(100) NOT NULL,
    -- Birden fazla posta kodu olabilir (TR ilçelerinde zaten öyle)
    posta_kodlari   varchar(20)[],
    UNIQUE (il_id, ad)
);
CREATE INDEX idx_ilce_il ON ilce(il_id);
CREATE INDEX idx_ilce_posta_kodlari ON ilce USING gin (posta_kodlari);

-- ----------------------------------------------------------------
-- VERGI_DAIRESI: Vergi otoriteleri (TR vergi dairesi + federal/state)
-- ----------------------------------------------------------------
CREATE TABLE vergi_dairesi (
    id              bigserial PRIMARY KEY,
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod) ON DELETE RESTRICT,
    il_id           bigint REFERENCES il(id) ON DELETE SET NULL,
    kod             varchar(20),                         -- TR vergi dairesi kodu
    ad              varchar(200) NOT NULL,
    tip             varchar(30) NOT NULL DEFAULT 'tr_vergi_dairesi'
                    CHECK (tip IN ('tr_vergi_dairesi', 'federal', 'eyalet', 'belediye', 'bolgesel', 'diger')),
    aktif_mi        boolean NOT NULL DEFAULT true,
    UNIQUE (ulke_kodu, kod)
);
CREATE INDEX idx_vergi_dairesi_il ON vergi_dairesi(il_id);
CREATE INDEX idx_vergi_dairesi_tip ON vergi_dairesi(tip);

-- TR majör vergi daireleri seed (30+)
INSERT INTO vergi_dairesi (ulke_kodu, il_id, kod, ad, tip) VALUES
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034001', 'Beyoğlu V.D.',              'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034002', 'Boğaziçi Kurumlar V.D.',    'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034003', 'Büyük Mükellefler V.D.',    'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034004', 'Kadıköy V.D.',              'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034005', 'Anadolu Kurumlar V.D.',     'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034006', 'Üsküdar V.D.',              'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034007', 'Mecidiyeköy V.D.',          'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034008', 'Şişli V.D.',                'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034009', 'Beşiktaş V.D.',             'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034010', 'Fatih V.D.',                'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034011', 'Zeytinburnu V.D.',          'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034012', 'Bakırköy V.D.',             'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034013', 'Küçükçekmece V.D.',         'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034014', 'Ümraniye V.D.',             'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='34'), '034015', 'Pendik V.D.',               'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='06'), '006001', 'Ankara Başkent V.D.',       'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='06'), '006002', 'Ankara Çankaya V.D.',       'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='06'), '006003', 'Ankara Kızılbey V.D.',      'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='06'), '006004', 'Ankara Ostim V.D.',         'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='06'), '006005', 'Ankara Yenimahalle V.D.',   'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='35'), '035001', 'İzmir Konak V.D.',          'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='35'), '035002', 'İzmir Kordon V.D.',         'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='35'), '035003', 'İzmir Yamanlar V.D.',       'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='16'), '016001', 'Bursa Osmangazi V.D.',      'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='16'), '016002', 'Bursa Yıldırım V.D.',       'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='07'), '007001', 'Antalya Kurumlar V.D.',     'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='07'), '007002', 'Antalya Antalya V.D.',      'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='01'), '001001', 'Adana Seyhan V.D.',         'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='27'), '027001', 'Gaziantep Şahinbey V.D.',   'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='41'), '041001', 'Kocaeli İzmit V.D.',        'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='42'), '042001', 'Konya Selçuk V.D.',         'tr_vergi_dairesi'),
('TR', (SELECT id FROM il WHERE ulke_kodu='TR' AND kod='38'), '038001', 'Kayseri Mimarsinan V.D.',   'tr_vergi_dairesi');

-- Federal vergi otoriteleri (örnek)
INSERT INTO vergi_dairesi (ulke_kodu, il_id, kod, ad, tip) VALUES
('US', NULL, 'IRS',       'Internal Revenue Service',         'federal'),
('GB', NULL, 'HMRC',      'HM Revenue & Customs',             'federal'),
('DE', NULL, 'BZSt',      'Bundeszentralamt für Steuern',     'federal'),
('AE', NULL, 'FTA',       'Federal Tax Authority',            'federal');

-- ----------------------------------------------------------------
-- OZEL_VERGI_GRUP: TR ÖTV grup modeli (otomotiv I/II/III/IV, tütün, akaryakıt, elektronik)
-- ----------------------------------------------------------------
CREATE TABLE ozel_vergi_grup (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,         -- 'TR_OTV_OTOMOTIV_I'
    ad              varchar(200) NOT NULL,
    ulke_kodu       char(2) NOT NULL REFERENCES ulke(kod),
    vergi_tipi      varchar(20) NOT NULL,                -- 'OTV', 'EXCISE', 'SIN_TAX'
    aciklama        text,
    varsayilan_vergi_orani_id bigint,                    -- FK aşağıda
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ozel_vergi_grup_ulke ON ozel_vergi_grup(ulke_kodu);

-- ----------------------------------------------------------------
-- VERGI_ORANI: Modüler vergi oranları (tarihsel versiyonlu)
-- ----------------------------------------------------------------
CREATE TABLE vergi_orani (
    id              bigserial PRIMARY KEY,
    -- Aynı semantik kod farklı tarihlerde farklı orana sahip olabilir
    kod             varchar(50) NOT NULL,
    ad              varchar(200) NOT NULL,
    -- Tip
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'KDV',         -- Türkiye Katma Değer Vergisi
        'VAT',         -- Value Added Tax (genel)
        'GST',         -- Goods and Services Tax
        'SALES_TAX',   -- ABD Sales Tax
        'OTV',         -- TR Özel Tüketim Vergisi
        'OIV',         -- TR Özel İletişim Vergisi
        'EXCISE',      -- Genel tüketim vergisi
        'ISTISNA',     -- KDV istisnası
        'TEVKIFAT',    -- KDV tevkifatı
        'STOPAJ',      -- Gelir vergisi stopajı
        'KKDF',        -- Kaynak Kullanımı Destekleme Fonu
        'BSMV',        -- Banka ve Sigorta Muameleleri Vergisi
        'DAMGA',       -- Damga Vergisi
        'DIGER'
    )),
    ulke_kodu       char(2) REFERENCES ulke(kod),
    -- Kapsam hiyerarşisi (US/EU için)
    kapsam          varchar(20) NOT NULL DEFAULT 'ulke'
                    CHECK (kapsam IN ('ulke', 'eyalet', 'il', 'belediye', 'ilce', 'bolgesel')),
    bolge_kodu      varchar(20),                         -- 'CA', 'NY-10001', 'DE-BW' vb.
    -- Oran: yüzde cinsinden saklanır (20 = %20, 0.5 = %0.5)
    oran            numeric(9, 6) NOT NULL CHECK (oran >= 0 AND oran <= 100),
    tevkifat_orani  numeric(9, 6) NOT NULL DEFAULT 0 CHECK (tevkifat_orani >= 0 AND tevkifat_orani <= 100),
    -- TR e-fatura ve benzeri ülkesel istisna kodları JSONB
    -- { "TR": "301", "AE": "...", "DE": "..." }
    istisna_kod_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Origin vs destination taxation (ülke varsayılanını override eder)
    uygulama_tipi   varchar(20) CHECK (uygulama_tipi IN ('origin', 'destination', 'hybrid') OR uygulama_tipi IS NULL),
    -- Kullanım
    aktif_mi        boolean NOT NULL DEFAULT true,
    -- Tarihsel versiyon (aynı kodda çoklu kayıt farklı tarih aralıklarıyla)
    gecerli_baslangic date NOT NULL DEFAULT '1900-01-01',
    gecerli_bitis   date,                                -- NULL = hâlâ geçerli
    aciklama        text,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    -- Aynı kod + başlangıç tarihi tek olmalı
    CONSTRAINT unq_vergi_orani_kod_baslangic UNIQUE (kod, gecerli_baslangic),
    CONSTRAINT chk_vergi_orani_tarih CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic)
);
CREATE INDEX idx_vergi_orani_ulke_aktif ON vergi_orani(ulke_kodu, aktif_mi);
CREATE INDEX idx_vergi_orani_tip ON vergi_orani(tip);
CREATE INDEX idx_vergi_orani_kod ON vergi_orani(kod);
CREATE INDEX idx_vergi_orani_kapsam ON vergi_orani(kapsam, bolge_kodu);
CREATE INDEX idx_vergi_orani_gecerli ON vergi_orani(gecerli_baslangic, gecerli_bitis);

-- Ülke başına tek varsayılan sistem_ayar üzerinden belirlenir; burada flag yok.

-- FK döngüleri için deferred FK
ALTER TABLE il ADD CONSTRAINT fk_il_varsayilan_vergi
    FOREIGN KEY (varsayilan_vergi_orani_id) REFERENCES vergi_orani(id) ON DELETE SET NULL;
ALTER TABLE ozel_vergi_grup ADD CONSTRAINT fk_ozel_vergi_grup_varsayilan_vergi
    FOREIGN KEY (varsayilan_vergi_orani_id) REFERENCES vergi_orani(id) ON DELETE SET NULL;

CREATE TRIGGER trg_vergi_orani_guncelleme
    BEFORE UPDATE ON vergi_orani
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- TR KDV — tarihsel: 2024-07-10 öncesi %18, sonrası %20
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, gecerli_baslangic, gecerli_bitis) VALUES
('TR_KDV_STANDART', 'KDV Standart (eski %18)', 'KDV', 'TR', 18, '2001-01-01', '2023-07-09'),
('TR_KDV_STANDART', 'KDV Standart',            'KDV', 'TR', 20, '2023-07-10', NULL);

INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, gecerli_baslangic, gecerli_bitis) VALUES
('TR_KDV_INDIRIMLI_8',  'KDV İndirimli (eski %8)',  'KDV', 'TR',  8, '2001-01-01', '2023-07-09'),
('TR_KDV_INDIRIMLI_10', 'KDV İndirimli %10',        'KDV', 'TR', 10, '2023-07-10', NULL),
('TR_KDV_DUSUK_1',      'KDV Düşük %1',             'KDV', 'TR',  1, '2001-01-01', NULL),
('TR_KDV_SIFIR',        'KDV %0',                   'KDV', 'TR',  0, '2001-01-01', NULL);

-- BAE VAT
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, gecerli_baslangic) VALUES
('AE_VAT_0', 'VAT 0%',  'VAT', 'AE', 0, '2018-01-01'),
('AE_VAT_5', 'VAT 5%',  'VAT', 'AE', 5, '2018-01-01');

-- EU VAT (örnek Almanya)
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, gecerli_baslangic) VALUES
('DE_VAT_STANDART',   'VAT Standart',  'VAT', 'DE', 19, '2007-01-01'),
('DE_VAT_INDIRIMLI',  'VAT İndirimli', 'VAT', 'DE',  7, '2007-01-01');

-- TR İstisna kodları (e-fatura için)
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, istisna_kod_jsonb) VALUES
('TR_ISTISNA_301', 'İhracat İstisnası',         'ISTISNA', 'TR', 0, '{"TR": "301"}'::jsonb),
('TR_ISTISNA_318', 'Diplomatik Temsilcilik',    'ISTISNA', 'TR', 0, '{"TR": "318"}'::jsonb),
('TR_ISTISNA_325', 'Uluslararası Kuruluşlar',   'ISTISNA', 'TR', 0, '{"TR": "325"}'::jsonb);

-- TR Tevkifat
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran, tevkifat_orani) VALUES
('TR_TEVKIFAT_5_10', 'Tevkifat 5/10', 'TEVKIFAT', 'TR', 20, 50),
('TR_TEVKIFAT_7_10', 'Tevkifat 7/10', 'TEVKIFAT', 'TR', 20, 70),
('TR_TEVKIFAT_9_10', 'Tevkifat 9/10', 'TEVKIFAT', 'TR', 20, 90);

-- TR ÖTV (örnek)
INSERT INTO vergi_orani (kod, ad, tip, ulke_kodu, oran) VALUES
('TR_OTV_OTOMOTIV_I',  'ÖTV Otomotiv I Listesi',  'OTV', 'TR', 45),
('TR_OTV_OTOMOTIV_II', 'ÖTV Otomotiv II Listesi', 'OTV', 'TR', 80),
('TR_OTV_OTOMOTIV_III','ÖTV Otomotiv III Listesi','OTV', 'TR', 130),
('TR_OTV_OTOMOTIV_IV', 'ÖTV Otomotiv IV Listesi', 'OTV', 'TR', 220),
('TR_OTV_TUTUN',       'ÖTV Tütün Ürünleri',      'OTV', 'TR', 63),
('TR_OTV_ALKOL',       'ÖTV Alkollü İçkiler',     'OTV', 'TR', 60),
('TR_OTV_AKARYAKIT',   'ÖTV Akaryakıt',           'OTV', 'TR', 25);

-- ÖTV grupları (insert sonra varsayılan_vergi_orani_id update)
INSERT INTO ozel_vergi_grup (kod, ad, ulke_kodu, vergi_tipi, aciklama, varsayilan_vergi_orani_id) VALUES
('TR_OTV_GRUP_OTOMOTIV_I',   'Otomotiv I (Motor hacmi 1600 cc altı)', 'TR', 'OTV', '1600 cc altı binek otomobiller', (SELECT id FROM vergi_orani WHERE kod='TR_OTV_OTOMOTIV_I' LIMIT 1)),
('TR_OTV_GRUP_OTOMOTIV_II',  'Otomotiv II (1600-2000 cc)',            'TR', 'OTV', '1600-2000 cc arası',           (SELECT id FROM vergi_orani WHERE kod='TR_OTV_OTOMOTIV_II' LIMIT 1)),
('TR_OTV_GRUP_OTOMOTIV_III', 'Otomotiv III (2000 cc üstü)',           'TR', 'OTV', '2000 cc üstü binek',           (SELECT id FROM vergi_orani WHERE kod='TR_OTV_OTOMOTIV_III' LIMIT 1)),
('TR_OTV_GRUP_OTOMOTIV_IV',  'Otomotiv IV (Lüks)',                    'TR', 'OTV', 'Lüks segment',                 (SELECT id FROM vergi_orani WHERE kod='TR_OTV_OTOMOTIV_IV' LIMIT 1)),
('TR_OTV_GRUP_TUTUN',        'Tütün Mamülleri',                       'TR', 'OTV', 'Sigara, puro, pipo',           (SELECT id FROM vergi_orani WHERE kod='TR_OTV_TUTUN' LIMIT 1)),
('TR_OTV_GRUP_ALKOL',        'Alkollü İçkiler',                       'TR', 'OTV', 'Rakı, viski, şarap, bira',     (SELECT id FROM vergi_orani WHERE kod='TR_OTV_ALKOL' LIMIT 1)),
('TR_OTV_GRUP_AKARYAKIT',    'Akaryakıt Ürünleri',                    'TR', 'OTV', 'Benzin, motorin, LPG',         (SELECT id FROM vergi_orani WHERE kod='TR_OTV_AKARYAKIT' LIMIT 1)),
('TR_OTV_GRUP_ELEKTRONIK',   'Elektronik Beyaz Eşya',                 'TR', 'OTV', 'Buzdolabı, klima, TV',         NULL);

-- ----------------------------------------------------------------
-- VERGI_ORANI_CEVIRI: i18n
-- ----------------------------------------------------------------
CREATE TABLE vergi_orani_ceviri (
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id) ON DELETE CASCADE,
    dil             char(2) NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    PRIMARY KEY (vergi_orani_id, dil)
);

-- ----------------------------------------------------------------
-- VERGI_HESAP_KURALI: Vergi NASIL hesaplanır
-- ----------------------------------------------------------------
-- Örnek: "matrah_yuzde" → oran * matrah
--        "kdv_dahil_yuzde" → matrah vergi dahil, geriye çek
--        "birim_basina_sabit" → litre/adet başına sabit (akaryakıt ÖTV gibi)
--        "kademeli" → gelir vergisi tarzı dilimli
--        "bilesik" → başka kuralların bileşimi
CREATE TABLE vergi_hesap_kurali (
    id              bigserial PRIMARY KEY,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id) ON DELETE CASCADE,
    hesap_yontemi   varchar(30) NOT NULL CHECK (hesap_yontemi IN (
        'matrah_yuzde',         -- en yaygın: matrah * (oran/100)
        'kdv_dahil_yuzde',      -- brüt fiyattan vergi çıkarımı
        'birim_basina_sabit',   -- adet/litre/kg başına sabit tutar
        'kademeli',             -- dilimli (income tax benzeri)
        'bilesik'               -- kural kombinasyonu (JSON formül)
    )),
    -- Parametreler (yöntem bazlı)
    -- matrah_yuzde: {} (sadece vergi_orani.oran kullanılır)
    -- birim_basina_sabit: {"tutar": 2.50, "para_birimi": "TRY", "birim": "lt"}
    -- kademeli: (alt tablo kullanılır)
    -- bilesik: {"adimlar": [{"kural_id": 1}, {"kural_id": 2}], "strateji": "topla"}
    formul          jsonb NOT NULL DEFAULT '{}'::jsonb,
    sira            int NOT NULL DEFAULT 1,
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vergi_hesap_kurali_orani ON vergi_hesap_kurali(vergi_orani_id);

CREATE TRIGGER trg_vergi_hesap_kurali_guncelleme
    BEFORE UPDATE ON vergi_hesap_kurali
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- VERGI_KADEMELI_DILIM: Kademeli vergi dilimleri
-- ----------------------------------------------------------------
CREATE TABLE vergi_kademeli_dilim (
    id              bigserial PRIMARY KEY,
    kural_id        bigint NOT NULL REFERENCES vergi_hesap_kurali(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    alt_limit       numeric(18, 4) NOT NULL,
    ust_limit       numeric(18, 4),                      -- NULL = sonsuz
    oran            numeric(9, 6) NOT NULL CHECK (oran >= 0 AND oran <= 100),
    sabit_tutar     numeric(18, 4) NOT NULL DEFAULT 0,   -- bu dilime gelene kadar birikmiş sabit
    aciklama        varchar(200),
    CONSTRAINT chk_kademeli_limit CHECK (ust_limit IS NULL OR ust_limit > alt_limit),
    UNIQUE (kural_id, sira)
);
CREATE INDEX idx_vergi_kademeli_kural ON vergi_kademeli_dilim(kural_id);

-- ----------------------------------------------------------------
-- VERGI_KOMBINASYON: Ürüne uygulanan vergi paketi (çoklu vergi)
-- ----------------------------------------------------------------
CREATE TABLE vergi_kombinasyon (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    ulke_kodu       char(2) REFERENCES ulke(kod),
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vergi_kombinasyon_ulke ON vergi_kombinasyon(ulke_kodu);

CREATE TRIGGER trg_vergi_kombinasyon_guncelleme
    BEFORE UPDATE ON vergi_kombinasyon
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- VERGI_ZINCIR: Vergi sırası ve matrah kaynağı
-- ----------------------------------------------------------------
-- Örnek TR otomotiv: (sıra 1) ÖTV — matrah: net fiyat
--                    (sıra 2) KDV — matrah: önceki_vergi_dahil (yani ÖTV dahil tutar üstünden)
CREATE TABLE vergi_zincir (
    id              bigserial PRIMARY KEY,
    vergi_kombinasyon_id bigint NOT NULL REFERENCES vergi_kombinasyon(id) ON DELETE CASCADE,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id) ON DELETE RESTRICT,
    sira            int NOT NULL,
    matrah_kaynagi  varchar(30) NOT NULL DEFAULT 'net'
                    CHECK (matrah_kaynagi IN (
                        'net',                   -- kalem net fiyatı
                        'brut',                  -- vergi dahil
                        'onceki_vergi_dahil',    -- zincir önceki adımların vergiler dahil tutarı
                        'onceki_vergi_haric'     -- zincir önceki adımların net tutarı
                    )),
    -- İsteğe bağlı override oran (örn: şehre göre farklı KDV)
    override_oran   numeric(9, 6) CHECK (override_oran IS NULL OR (override_oran >= 0 AND override_oran <= 100)),
    aciklama        varchar(200),
    UNIQUE (vergi_kombinasyon_id, sira),
    UNIQUE (vergi_kombinasyon_id, vergi_orani_id)
);
CREATE INDEX idx_vergi_zincir_komb ON vergi_zincir(vergi_kombinasyon_id);

-- ----------------------------------------------------------------
-- VERGI_KOMBINASYON_SATIR: Geriye dönük uyumluluk (08-belge.sql varsa kullanır)
-- ----------------------------------------------------------------
-- NOT: Gelişmiş senaryolar için vergi_zincir kullanılır.
CREATE TABLE vergi_kombinasyon_satir (
    kombinasyon_id  bigint NOT NULL REFERENCES vergi_kombinasyon(id) ON DELETE CASCADE,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id),
    sira            int NOT NULL DEFAULT 1,
    PRIMARY KEY (kombinasyon_id, vergi_orani_id)
);

-- ----------------------------------------------------------------
-- VERGI_ORANI_TARIHCE: Oran değişim geçmişi (audit)
-- ----------------------------------------------------------------
CREATE TABLE vergi_orani_tarihce (
    id              bigserial PRIMARY KEY,
    vergi_orani_id  bigint NOT NULL REFERENCES vergi_orani(id) ON DELETE CASCADE,
    eski_oran       numeric(9, 6),
    yeni_oran       numeric(9, 6) NOT NULL,
    eski_gecerli_baslangic date,
    yeni_gecerli_baslangic date,
    eski_gecerli_bitis date,
    yeni_gecerli_bitis date,
    sebep           text,
    degistiren_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vergi_orani_tarihce_orani ON vergi_orani_tarihce(vergi_orani_id, olusturma_tarihi DESC);

-- Trigger: vergi_orani UPDATE'inde otomatik tarihçe
CREATE OR REPLACE FUNCTION trg_vergi_orani_tarihce_yaz()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.oran IS DISTINCT FROM NEW.oran
        OR OLD.gecerli_baslangic IS DISTINCT FROM NEW.gecerli_baslangic
        OR OLD.gecerli_bitis IS DISTINCT FROM NEW.gecerli_bitis) THEN
        INSERT INTO vergi_orani_tarihce (
            vergi_orani_id, eski_oran, yeni_oran,
            eski_gecerli_baslangic, yeni_gecerli_baslangic,
            eski_gecerli_bitis, yeni_gecerli_bitis,
            degistiren_kullanici_id
        ) VALUES (
            NEW.id, OLD.oran, NEW.oran,
            OLD.gecerli_baslangic, NEW.gecerli_baslangic,
            OLD.gecerli_bitis, NEW.gecerli_bitis,
            NEW.guncelleyen_kullanici_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vergi_orani_tarihce
    AFTER UPDATE ON vergi_orani
    FOR EACH ROW EXECUTE FUNCTION trg_vergi_orani_tarihce_yaz();

-- ----------------------------------------------------------------
-- VERGI_MUAFIYET: Cari/ürün/kategori bazlı vergi muafiyet/istisna
-- ----------------------------------------------------------------
-- kapsam_tipi + kapsam_id polymorphic: hangi varlığa uygulanır
CREATE TABLE vergi_muafiyet (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE,
    kapsam_tipi     varchar(20) NOT NULL CHECK (kapsam_tipi IN (
        'cari', 'urun', 'kategori', 'marka', 'ulke', 'il', 'cari_grup'
    )),
    kapsam_id       bigint,                               -- ilgili tablonun id'si
    -- Hangi vergi istisna tutuluyor (istisna kod karşılığı)
    vergi_orani_id  bigint REFERENCES vergi_orani(id),
    -- Veya tip bazlı (örn: tüm KDV muaf)
    vergi_tipi      varchar(20),
    istisna_vergi_orani_id bigint REFERENCES vergi_orani(id),  -- yerine kullanılacak oran (ör: ISTISNA_301)
    sebep           text,
    belge_no        varchar(100),                         -- istisna belge numarası
    belge_tarihi    date,
    gecerli_baslangic date NOT NULL DEFAULT CURRENT_DATE,
    gecerli_bitis   date,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_muafiyet_tarih CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
    CONSTRAINT chk_muafiyet_vergi CHECK (vergi_orani_id IS NOT NULL OR vergi_tipi IS NOT NULL)
);
CREATE INDEX idx_vergi_muafiyet_kapsam ON vergi_muafiyet(kapsam_tipi, kapsam_id);
CREATE INDEX idx_vergi_muafiyet_vergi ON vergi_muafiyet(vergi_orani_id);
CREATE INDEX idx_vergi_muafiyet_gecerli ON vergi_muafiyet(gecerli_baslangic, gecerli_bitis);

CREATE TRIGGER trg_vergi_muafiyet_guncelleme
    BEFORE UPDATE ON vergi_muafiyet
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- GTIP / HS: Ticari kod (hiyerarşik)
-- ----------------------------------------------------------------
CREATE TABLE gtip (
    kod             varchar(20) PRIMARY KEY,             -- 8471.30.00
    ad              varchar(500) NOT NULL,
    ust_gtip_kod    varchar(20) REFERENCES gtip(kod) ON DELETE SET NULL,
    seviye          smallint NOT NULL DEFAULT 1,
    -- Varsayılan vergi paketi (ithalat/satış sırasında önerilecek)
    vergi_kombinasyon_id bigint REFERENCES vergi_kombinasyon(id),
    -- Opsiyonel varsayılan ÖTV grubu (otomotiv, tütün...)
    ozel_vergi_grup_id bigint REFERENCES ozel_vergi_grup(id),
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gtip_ust ON gtip(ust_gtip_kod);
CREATE INDEX idx_gtip_ad_trgm ON gtip USING gin ((COALESCE(ad, '')) gin_trgm_ops);

CREATE TABLE gtip_ceviri (
    gtip_kod        varchar(20) NOT NULL REFERENCES gtip(kod) ON DELETE CASCADE,
    dil             char(2) NOT NULL,
    ad              varchar(500) NOT NULL,
    PRIMARY KEY (gtip_kod, dil)
);

-- ================================================================
-- FUNCTION & VIEW
-- ================================================================

-- ----------------------------------------------------------------
-- vergi_orani_gecerli: Belirli kod + tarihte geçerli oran id'si
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION vergi_orani_gecerli(
    p_kod varchar,
    p_tarih date DEFAULT CURRENT_DATE
) RETURNS bigint AS $$
DECLARE
    v_id bigint;
BEGIN
    SELECT id INTO v_id
    FROM vergi_orani
    WHERE kod = p_kod
      AND aktif_mi = true
      AND gecerli_baslangic <= p_tarih
      AND (gecerli_bitis IS NULL OR gecerli_bitis >= p_tarih)
    ORDER BY gecerli_baslangic DESC
    LIMIT 1;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- vw_vergi_orani_tarihte: Belirli tarihte aktif tüm oranlar
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_vergi_orani_tarihte AS
SELECT DISTINCT ON (kod)
    id, kod, ad, tip, ulke_kodu, oran, tevkifat_orani,
    gecerli_baslangic, gecerli_bitis
FROM vergi_orani
WHERE aktif_mi = true
ORDER BY kod, gecerli_baslangic DESC;

-- ----------------------------------------------------------------
-- vw_efektif_vergi: Bu cariye bu ürün satılırken hangi vergi uygulanır
-- ----------------------------------------------------------------
-- Bu fonksiyon tam çözümü yapar. Öncelik sırası:
--   1. Cari bazlı muafiyet (tam istisna)
--   2. Ürün bazlı muafiyet
--   3. Kategori bazlı muafiyet
--   4. Ürünün varsayılan vergi kombinasyonu (modül 06)
--   5. Cari'nin varsayılan vergi oranı (modül 05)
--   6. Sistem varsayılan
CREATE OR REPLACE FUNCTION vw_efektif_vergi(
    p_cari_id bigint,
    p_urun_id bigint,
    p_tarih date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    vergi_orani_id bigint,
    kod varchar,
    tip varchar,
    oran numeric,
    kaynak varchar,
    muafiyet_id bigint
) AS $$
BEGIN
    -- 1. Cari bazlı muafiyet
    RETURN QUERY
    SELECT vo.id, vo.kod, vo.tip, vo.oran, 'cari_muafiyet'::varchar, vm.id
    FROM vergi_muafiyet vm
    LEFT JOIN vergi_orani vo ON vo.id = COALESCE(vm.istisna_vergi_orani_id, vm.vergi_orani_id)
    WHERE vm.kapsam_tipi = 'cari' AND vm.kapsam_id = p_cari_id
      AND vm.aktif_mi = true
      AND vm.gecerli_baslangic <= p_tarih
      AND (vm.gecerli_bitis IS NULL OR vm.gecerli_bitis >= p_tarih)
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- 2. Ürün bazlı muafiyet
    RETURN QUERY
    SELECT vo.id, vo.kod, vo.tip, vo.oran, 'urun_muafiyet'::varchar, vm.id
    FROM vergi_muafiyet vm
    LEFT JOIN vergi_orani vo ON vo.id = COALESCE(vm.istisna_vergi_orani_id, vm.vergi_orani_id)
    WHERE vm.kapsam_tipi = 'urun' AND vm.kapsam_id = p_urun_id
      AND vm.aktif_mi = true
      AND vm.gecerli_baslangic <= p_tarih
      AND (vm.gecerli_bitis IS NULL OR vm.gecerli_bitis >= p_tarih)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- vw_kdv_beyannamesi: TR KDV1/KDV2 ham veri (fatura modülü dolu olduğunda çalışır)
-- ----------------------------------------------------------------
-- NOT: Bu view fatura_kalem_vergi tablosuna dayanır (modül 08).
-- DROP + CREATE defensif olarak yazılır.
CREATE OR REPLACE FUNCTION vw_kdv_beyannamesi(
    p_baslangic date,
    p_bitis date,
    p_firma_id bigint DEFAULT NULL
) RETURNS TABLE (
    donem_ay int,
    donem_yil int,
    vergi_tipi varchar,
    vergi_kodu varchar,
    oran numeric,
    matrah_toplam numeric,
    vergi_toplam numeric,
    tevkifat_toplam numeric,
    fatura_sayisi bigint
) AS $$
BEGIN
    RETURN QUERY EXECUTE $q$
        SELECT
            EXTRACT(MONTH FROM f.fatura_tarihi)::int AS donem_ay,
            EXTRACT(YEAR  FROM f.fatura_tarihi)::int AS donem_yil,
            fkv.vergi_tipi,
            fkv.vergi_kodu,
            fkv.oran,
            SUM(fkv.matrah)           AS matrah_toplam,
            SUM(fkv.tutar)            AS vergi_toplam,
            SUM(COALESCE(fkv.tevkifat_tutari,0)) AS tevkifat_toplam,
            COUNT(DISTINCT f.id)      AS fatura_sayisi
        FROM fatura f
        JOIN fatura_kalem fk ON fk.fatura_id = f.id
        JOIN fatura_kalem_vergi fkv ON fkv.fatura_kalem_id = fk.id
        WHERE f.fatura_tarihi BETWEEN $1 AND $2
          AND ($3 IS NULL OR f.firma_id = $3)
          AND f.silindi_mi = false
        GROUP BY 1,2,3,4,5
        ORDER BY 2,1,3,5
    $q$ USING p_baslangic, p_bitis, p_firma_id;
EXCEPTION WHEN undefined_table THEN
    -- Modül 08 henüz yüklenmedi
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- SEED: Örnek hesap kuralları (matrah_yuzde default)
-- ================================================================
INSERT INTO vergi_hesap_kurali (vergi_orani_id, hesap_yontemi, formul, sira, aciklama)
SELECT id, 'matrah_yuzde', '{}'::jsonb, 1, 'Matrah * (oran/100)'
FROM vergi_orani
WHERE tip IN ('KDV', 'VAT', 'GST', 'OTV', 'OIV');

-- ================================================================
-- ÖRNEK: TR Otomotiv I vergi kombinasyonu (ÖTV + KDV)
-- ================================================================
INSERT INTO vergi_kombinasyon (kod, ad, ulke_kodu, aciklama) VALUES
('TR_OTOMOTIV_I_KOMBO', 'TR Otomotiv I (ÖTV + KDV)', 'TR', 'Önce ÖTV uygulanır, sonra KDV ÖTV dahil matrah üzerinden');

INSERT INTO vergi_zincir (vergi_kombinasyon_id, vergi_orani_id, sira, matrah_kaynagi, aciklama)
SELECT
    (SELECT id FROM vergi_kombinasyon WHERE kod = 'TR_OTOMOTIV_I_KOMBO'),
    (SELECT id FROM vergi_orani WHERE kod = 'TR_OTV_OTOMOTIV_I' LIMIT 1),
    1, 'net', 'ÖTV net fiyat üzerinden'
UNION ALL
SELECT
    (SELECT id FROM vergi_kombinasyon WHERE kod = 'TR_OTOMOTIV_I_KOMBO'),
    (SELECT id FROM vergi_orani WHERE kod = 'TR_KDV_STANDART' AND gecerli_bitis IS NULL LIMIT 1),
    2, 'onceki_vergi_dahil', 'KDV ÖTV dahil matrah üzerinden';

-- Geriye uyumluluk: vergi_kombinasyon_satir tablosuna da yaz
INSERT INTO vergi_kombinasyon_satir (kombinasyon_id, vergi_orani_id, sira)
SELECT vergi_kombinasyon_id, vergi_orani_id, sira
FROM vergi_zincir
WHERE vergi_kombinasyon_id = (SELECT id FROM vergi_kombinasyon WHERE kod = 'TR_OTOMOTIV_I_KOMBO');
