-- ============================================================
-- MODUL 16: ENTEGRASYON (Webhook + Kargo + Bildirim + E-Fatura Kuyruk)
-- ============================================================
-- Tum outbound entegrasyonlar icin merkezi altyapi.
--
-- Kapsam:
--   * Webhook endpoint (tenant 3rd party URL'leri) + event kuyrugu + gonderim
--   * Kargo firma master + tenant baglantilari + gonderi + durum logu + tarife
--   * Bildirim provider (SMS/Email/WhatsApp) + sablon + gonderim logu
--   * E-fatura kuyrugu (TR'ye ozel) + GIB mukellef cache
--   * API cagri logu (outbound, partition hazir)
--   * Webhook yayinlama + retry backoff altyapisi
--
-- Entegrasyon:
--   * siparis / fatura    (modul 08) — webhook event kaynagi
--   * fatura              (modul 08) — e-fatura kuyruk kaynagi
--   * cari                (modul 05) — kargo gonderi alicisi, bildirim hedefi
--   * kullanici           (modul 01) — API cagrisi kim yaptiysa
--   * para_birimi         (modul 02) — kargo ucreti
--
-- Tasarim kararlari:
--   1) API anahtar + secret MUTLAK encrypted (bytea) — plain text YASAK.
--   2) Webhook HMAC secret hash'lenmis. Gonderim sirasinda app katmani
--      ham secret'i bilinca HMAC hesaplar — DB'de plain tutmayiz.
--   3) webhook_event state machine (bekliyor/gonderiliyor/basarili/hata/iptal).
--   4) webhook_gonderim exponential backoff: 1m, 5m, 15m, 1h, 6h, 24h (6 deneme).
--   5) Kargo gonderi polymorphic kaynak (siparis/irsaliye/iade) CHECK ile.
--   6) Bildirim sablonu degisken listesi (text[]) — {{ad}}, {{siparis_no}} gibi.
--   7) api_cagri_log partition hazirligi (YIL bazli, PARTITION BY RANGE).
--   8) E-fatura kuyruk: fatura 1-1, idempotent (unique fatura_id), retry limit.
--   9) GIB mukellef cache (vergi_no unique) — e-fatura mi e-arsiv mi kararı.
-- ============================================================


-- ============================================================
-- WEBHOOK (OUTBOUND)
-- ============================================================

-- ----------------------------------------------------------------
-- WEBHOOK_ENDPOINT: Tenant'in 3rd party webhook URL'leri
-- ----------------------------------------------------------------
CREATE TABLE webhook_endpoint (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    url                 text NOT NULL,
    -- HMAC secret: plain text YASAK. Hash'lenmis sakla.
    -- App katmani anahtari olusturur, kullaniciya bir kerelik gosterir,
    -- DB'ye SADECE hash'i saklar (SHA-256).
    secret_hash         varchar(255) NOT NULL,
    secret_on_ek        varchar(20),                         -- "whsec_XXX..." ilk 8 karakter preview
    -- Hangi event'leri dinler
    event_filtre        text[] NOT NULL DEFAULT '{}',        -- ['siparis.olustu', 'fatura.kesildi']
    -- Ayarlar
    zaman_asimi_saniye  int NOT NULL DEFAULT 10,
    maksimum_deneme     int NOT NULL DEFAULT 6,
    ssl_dogrulama       boolean NOT NULL DEFAULT true,
    ek_headerlar        jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Istatistik (denormalize, hizli dashboard icin)
    toplam_gonderim     bigint NOT NULL DEFAULT 0,
    basarili_sayisi     bigint NOT NULL DEFAULT 0,
    hata_sayisi         bigint NOT NULL DEFAULT 0,
    son_basari_zamani   timestamptz,
    son_hata_zamani     timestamptz,
    son_hata_mesaji     text,
    -- Rate limit
    dakika_basi_limit   int,                                 -- NULL = sinirsiz
    -- Durum
    aktif_mi            boolean NOT NULL DEFAULT true,
    dondurulmus_mu      boolean NOT NULL DEFAULT false,      -- cok hata => otomatik dondur
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    silinme_tarihi      timestamptz,
    silen_kullanici_id  bigint REFERENCES kullanici(id),
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (zaman_asimi_saniye BETWEEN 1 AND 60),
    CHECK (maksimum_deneme BETWEEN 1 AND 20)
);
CREATE INDEX idx_webhook_endpoint_aktif
    ON webhook_endpoint (aktif_mi)
    WHERE aktif_mi = true AND silindi_mi = false;
CREATE INDEX idx_webhook_endpoint_event_filtre
    ON webhook_endpoint USING gin (event_filtre);

CREATE TRIGGER trg_webhook_endpoint_guncelleme
    BEFORE UPDATE ON webhook_endpoint
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- WEBHOOK_EVENT: Yayinlanacak event'ler (siparis.olustu, fatura.kesildi)
-- ----------------------------------------------------------------
CREATE TABLE webhook_event (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    event_tipi          varchar(100) NOT NULL,               -- 'siparis.olustu'
    event_versiyon      varchar(10) NOT NULL DEFAULT 'v1',
    -- Kaynak
    kaynak_belge_tipi   varchar(50),                         -- 'siparis', 'fatura', ...
    kaynak_belge_id     bigint,
    -- Payload
    payload             jsonb NOT NULL,
    -- Durum (event seviyesi; her endpoint icin ayri gonderim webhook_gonderim'de)
    durum               varchar(20) NOT NULL DEFAULT 'bekliyor' CHECK (durum IN (
        'bekliyor',             -- Kuyrukta
        'gonderiliyor',         -- Worker isliyor
        'basarili',             -- Tum hedeflere basari
        'kismi_basarili',       -- Bazi hedeflere basari
        'hata',                 -- Tum denemeler basarisiz
        'iptal'
    )),
    -- Zamanlama
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    ilk_denemede_gonderim boolean NOT NULL DEFAULT true,     -- scheduled mi anlik mi
    planlanan_zaman     timestamptz,
    islenme_tarihi      timestamptz,
    -- Metadata
    metadata            jsonb,
    olusturan_kullanici_id bigint REFERENCES kullanici(id)
);
CREATE INDEX idx_webhook_event_durum_plan
    ON webhook_event (durum, planlanan_zaman)
    WHERE durum = 'bekliyor';
CREATE INDEX idx_webhook_event_kaynak
    ON webhook_event (kaynak_belge_tipi, kaynak_belge_id);
CREATE INDEX idx_webhook_event_tip_tarih
    ON webhook_event (event_tipi, olusturma_tarihi DESC);


-- ----------------------------------------------------------------
-- WEBHOOK_GONDERIM: Her endpoint icin tum denemeler (audit trail)
-- ----------------------------------------------------------------
CREATE TABLE webhook_gonderim (
    id                  bigserial PRIMARY KEY,
    event_id            bigint NOT NULL REFERENCES webhook_event(id) ON DELETE CASCADE,
    endpoint_id         bigint NOT NULL REFERENCES webhook_endpoint(id) ON DELETE CASCADE,
    deneme_sirasi       int NOT NULL DEFAULT 1,
    -- Istek
    istek_url           text NOT NULL,
    istek_headerlar     jsonb,
    istek_body          text,
    -- Yanit
    http_status         int,
    response_headerlar  jsonb,
    response_body       text,
    response_sure_ms    int,
    -- Sonuc
    basarili_mi         boolean,
    hata_mesaji         text,
    -- Retry
    sonraki_deneme      timestamptz,                         -- exponential backoff hedefi
    -- Audit
    gonderim_zamani     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, endpoint_id, deneme_sirasi)
);
CREATE INDEX idx_webhook_gonderim_event ON webhook_gonderim (event_id);
CREATE INDEX idx_webhook_gonderim_endpoint_basari
    ON webhook_gonderim (endpoint_id, basarili_mi, gonderim_zamani DESC);
CREATE INDEX idx_webhook_gonderim_retry
    ON webhook_gonderim (sonraki_deneme)
    WHERE basarili_mi = false AND sonraki_deneme IS NOT NULL;


-- ============================================================
-- KARGO ENTEGRASYONLARI
-- ============================================================

-- ----------------------------------------------------------------
-- KARGO_FIRMA: Master liste (tenant degil, global seed)
-- ----------------------------------------------------------------
CREATE TABLE kargo_firma (
    id                  bigserial PRIMARY KEY,
    kod                 varchar(30) UNIQUE NOT NULL,         -- 'yurtici', 'mng', 'aras', 'ptt', 'sendeo', 'hepsijet', 'dhl', 'fedex', 'ups'
    ad                  varchar(100) NOT NULL,
    uluslararasi_mi     boolean NOT NULL DEFAULT false,
    logo_url            text,
    web_sitesi          varchar(255),
    takip_url_sablon    varchar(500),                        -- 'https://kargoku.com/takip?no={takip_no}'
    api_dokuman_url     varchar(500),
    -- Aktif
    aktif_mi            boolean NOT NULL DEFAULT true,
    sira                int NOT NULL DEFAULT 0,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);

-- Seed TR kargo firmalari
INSERT INTO kargo_firma (kod, ad, takip_url_sablon, sira) VALUES
('yurtici',    'Yurtici Kargo',  'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={takip_no}', 1),
('mng',        'MNG Kargo',      'https://service.mngkargo.com.tr/iys/?takipNo={takip_no}',                           2),
('aras',       'Aras Kargo',     'https://kargotakip.araskargo.com.tr/?code={takip_no}',                              3),
('ptt',        'PTT Kargo',      'https://gonderitakip.ptt.gov.tr/?q={takip_no}',                                     4),
('sendeo',     'Sendeo',         'https://app.sendeo.com.tr/takip/{takip_no}',                                        5),
('hepsijet',   'HepsiJet',       'https://hepsijet.com/gonderi-takip?takipNo={takip_no}',                             6),
('surat',      'Surat Kargo',    'https://suratkargo.com.tr/KargoTakip?kargoTakipNo={takip_no}',                      7),
('ups',        'UPS',            'https://www.ups.com/track?tracknum={takip_no}',                                     8),
('dhl',        'DHL',            'https://www.dhl.com/tr-tr/home/tracking.html?tracking-id={takip_no}',               9),
('fedex',      'FedEx',          'https://www.fedex.com/fedextrack/?trknbr={takip_no}',                              10);

UPDATE kargo_firma SET uluslararasi_mi = true WHERE kod IN ('ups', 'dhl', 'fedex');


-- ----------------------------------------------------------------
-- KARGO_BAGLANTI: Tenant'in kargo firma API baglantisi
-- Plain text secret YASAK. Tum sifreli alanlar bytea.
-- ----------------------------------------------------------------
CREATE TABLE kargo_baglanti (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kargo_firma_id      bigint NOT NULL REFERENCES kargo_firma(id) ON DELETE RESTRICT,
    magaza_id           bigint REFERENCES magaza(id),        -- NULL = tum magazalar
    ad                  varchar(200) NOT NULL,
    -- Kimlik
    musteri_no          varchar(100),
    kullanici_adi       varchar(100),
    -- Sifreli credentials (PLAIN YASAK)
    sifre_enc           bytea,
    api_anahtar_enc     bytea,
    api_secret_enc      bytea,
    token_enc           bytea,
    token_son_gecerlilik timestamptz,
    -- Ayar
    baglanti_ayar       jsonb NOT NULL DEFAULT '{}'::jsonb,
    test_modu_mu        boolean NOT NULL DEFAULT false,
    -- Durum
    durum               varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'aktif', 'pasif', 'hata', 'test'
    )),
    son_baglanti_testi  timestamptz,
    son_baglanti_sonuc  varchar(20),
    son_hata_mesaji     text,
    -- Varsayilanlar
    varsayilan_mi       boolean NOT NULL DEFAULT false,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kargo_baglanti_firma ON kargo_baglanti (kargo_firma_id);
CREATE INDEX idx_kargo_baglanti_magaza ON kargo_baglanti (magaza_id) WHERE magaza_id IS NOT NULL;
CREATE UNIQUE INDEX unq_kargo_baglanti_varsayilan
    ON kargo_baglanti (kargo_firma_id, COALESCE(magaza_id, 0))
    WHERE varsayilan_mi = true;

CREATE TRIGGER trg_kargo_baglanti_guncelleme
    BEFORE UPDATE ON kargo_baglanti
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- KARGO_GONDERI: Gonderi kaydi
-- ----------------------------------------------------------------
CREATE TABLE kargo_gonderi (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    baglanti_id         bigint NOT NULL REFERENCES kargo_baglanti(id) ON DELETE RESTRICT,
    kargo_firma_id      bigint NOT NULL REFERENCES kargo_firma(id),
    -- Kaynak belge (polymorphic)
    kaynak_belge_tipi   varchar(20) NOT NULL CHECK (kaynak_belge_tipi IN (
        'siparis', 'irsaliye', 'iade', 'transfer', 'manuel'
    )),
    kaynak_belge_id     bigint,
    -- Takip
    takip_no            varchar(100) UNIQUE,
    barkod              varchar(100),
    referans_no         varchar(100),                        -- kendi referansimiz
    -- Durum
    durum               varchar(30) NOT NULL DEFAULT 'hazirlaniyor' CHECK (durum IN (
        'hazirlaniyor',         -- Etiket olusturulacak
        'etiket_olusturuldu',   -- Barkod/etiket hazir
        'alindi',               -- Kargo kuryesi aldi
        'yolda',
        'transferde',
        'dagitimda',
        'teslim_edildi',
        'teslim_edilemedi',
        'iade_ediliyor',
        'iade_edildi',
        'iptal',
        'hata'
    )),
    -- Tarihler
    gonderim_tarihi     timestamptz,
    beklenen_teslim_tarihi date,
    gercek_teslim_tarihi timestamptz,
    iade_tarihi         timestamptz,
    -- Alici (snapshot)
    alici_ad            varchar(200) NOT NULL,
    alici_telefon       varchar(30),
    alici_email         citext,
    alici_adres         jsonb NOT NULL,                      -- {ulke, il, ilce, mahalle, sokak, bina_no, posta_kodu, ...}
    alici_vergi_no      varchar(50),
    -- Urun
    paket_sayisi        int NOT NULL DEFAULT 1,
    agirlik_kg          numeric(10, 3),
    hacim_dm3           numeric(12, 4),                      -- desi
    kargo_tipi          varchar(20),                         -- 'standart', 'hizli', 'ayni_gun', 'ertesi_gun'
    odeme_tipi          varchar(20) NOT NULL DEFAULT 'gonderen' CHECK (odeme_tipi IN (
        'gonderen', 'alici', 'karsi_odemeli', 'anlasmali'
    )),
    -- Ucret
    ucret               numeric(18, 4),
    sigorta_tutari      numeric(18, 4),
    kapida_odeme_tutari numeric(18, 4),
    para_birimi_kod     char(3) REFERENCES para_birimi(kod),
    -- Raw API verisi
    istek_payload       jsonb,
    yanit_payload       jsonb,
    raw_data            jsonb,
    -- Etiket PDF
    etiket_url          text,
    -- Soft delete + audit
    silindi_mi          boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kargo_gonderi_kaynak ON kargo_gonderi (kaynak_belge_tipi, kaynak_belge_id);
CREATE INDEX idx_kargo_gonderi_takip_no ON kargo_gonderi (takip_no) WHERE takip_no IS NOT NULL;
CREATE INDEX idx_kargo_gonderi_durum ON kargo_gonderi (durum) WHERE silindi_mi = false;
CREATE INDEX idx_kargo_gonderi_baglanti ON kargo_gonderi (baglanti_id);

CREATE TRIGGER trg_kargo_gonderi_guncelleme
    BEFORE UPDATE ON kargo_gonderi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- KARGO_DURUM_LOG: Kargo durum gecmisi (webhook'tan gelen)
-- ----------------------------------------------------------------
CREATE TABLE kargo_durum_log (
    id                  bigserial PRIMARY KEY,
    gonderi_id          bigint NOT NULL REFERENCES kargo_gonderi(id) ON DELETE CASCADE,
    durum               varchar(30) NOT NULL,
    durum_aciklama      text,
    konum               varchar(200),
    kargo_firma_tarih   timestamptz,                         -- kargo firmasinin bildirdigi
    alindi_tarih        timestamptz NOT NULL DEFAULT now(),
    raw_data            jsonb
);
CREATE INDEX idx_kargo_durum_log_gonderi ON kargo_durum_log (gonderi_id, kargo_firma_tarih DESC);


-- ----------------------------------------------------------------
-- KARGO_UCRET_TARIFE: Kg/desi bazli tarife (tenant ozel)
-- ----------------------------------------------------------------
CREATE TABLE kargo_ucret_tarife (
    id                  bigserial PRIMARY KEY,
    baglanti_id         bigint NOT NULL REFERENCES kargo_baglanti(id) ON DELETE CASCADE,
    ad                  varchar(200) NOT NULL,
    -- Baslangic / bitis agirlik (kg) VEYA desi
    min_agirlik_kg      numeric(10, 3),
    max_agirlik_kg      numeric(10, 3),
    min_desi            numeric(10, 3),
    max_desi            numeric(10, 3),
    -- Lokasyon (ulke/il bazli)
    gonderi_ulke_kod    char(2),
    gonderi_il_id       bigint REFERENCES il(id),
    alici_ulke_kod      char(2),
    alici_il_id         bigint REFERENCES il(id),
    -- Ucret
    sabit_ucret         numeric(18, 4) NOT NULL,
    kg_basi_ek_ucret    numeric(18, 4) NOT NULL DEFAULT 0,
    desi_basi_ek_ucret  numeric(18, 4) NOT NULL DEFAULT 0,
    para_birimi_kod     char(3) NOT NULL REFERENCES para_birimi(kod),
    -- Gecerlilik
    gecerli_baslangic   date NOT NULL DEFAULT CURRENT_DATE,
    gecerli_bitis       date,
    aktif_mi            boolean NOT NULL DEFAULT true,
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kargo_ucret_tarife_baglanti ON kargo_ucret_tarife (baglanti_id);

CREATE TRIGGER trg_kargo_ucret_tarife_guncelleme
    BEFORE UPDATE ON kargo_ucret_tarife
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ============================================================
-- BILDIRIM (SMS / EMAIL / WHATSAPP / PUSH)
-- ============================================================

-- ----------------------------------------------------------------
-- BILDIRIM_PROVIDER: Saglayicilar (Netgsm, Twilio, SendGrid, ...)
-- ----------------------------------------------------------------
CREATE TABLE bildirim_provider (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod                 varchar(50) NOT NULL,                -- 'netgsm', 'iletimerkezi', 'twilio', 'mailgun', 'sendgrid', 'smtp'
    ad                  varchar(200) NOT NULL,
    tip                 varchar(20) NOT NULL CHECK (tip IN (
        'sms', 'email', 'whatsapp', 'push', 'telegram'
    )),
    -- Sifreli credentials
    api_anahtar_enc     bytea,
    api_secret_enc      bytea,
    kullanici_adi       varchar(100),
    sifre_enc           bytea,
    -- Ayar
    ayar                jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {from_email, from_name, smtp_host, ...}
    gonderen_bilgisi    varchar(200),                        -- 'KUVVEM', '+905xx...'
    test_modu_mu        boolean NOT NULL DEFAULT false,
    -- Limitler (denormalize, hizli quota kontrol)
    aylik_gonderim_limit int,
    bu_ay_gonderim_sayisi int NOT NULL DEFAULT 0,
    son_sayac_sifirlama date NOT NULL DEFAULT CURRENT_DATE,
    -- Durum
    varsayilan_mi       boolean NOT NULL DEFAULT false,
    aktif_mi            boolean NOT NULL DEFAULT true,
    silindi_mi          boolean NOT NULL DEFAULT false,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bildirim_provider_tip_aktif
    ON bildirim_provider (tip, aktif_mi)
    WHERE aktif_mi = true AND silindi_mi = false;
CREATE UNIQUE INDEX unq_bildirim_provider_varsayilan_tip
    ON bildirim_provider (tip)
    WHERE varsayilan_mi = true AND silindi_mi = false;

CREATE TRIGGER trg_bildirim_provider_guncelleme
    BEFORE UPDATE ON bildirim_provider
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- BILDIRIM_SABLON: Email/SMS icerik sablonu
-- ----------------------------------------------------------------
CREATE TABLE bildirim_sablon (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod                 varchar(100) NOT NULL,               -- 'siparis_onay', 'sifre_sifirlama'
    ad                  varchar(200) NOT NULL,
    aciklama            text,
    tip                 varchar(20) NOT NULL CHECK (tip IN (
        'email', 'sms', 'whatsapp', 'push'
    )),
    dil_kodu            char(2) NOT NULL DEFAULT 'tr',
    -- Icerik
    konu                varchar(500),
    icerik_html         text,
    icerik_text         text,
    -- Degisken tanimi
    -- ornek: ['ad', 'siparis_no', 'toplam_tutar', 'takip_linki']
    degisken_listesi    text[] NOT NULL DEFAULT '{}',
    ornek_veri          jsonb,                               -- preview icin
    -- Varsayilan provider (NULL = sistem varsayilani)
    provider_id         bigint REFERENCES bildirim_provider(id),
    -- Kategori
    kategori            varchar(50),                         -- 'islem', 'pazarlama', 'bildirim'
    pazarlama_mi        boolean NOT NULL DEFAULT false,      -- KVKK onay kontrolu
    -- Toggle
    aktif_mi            boolean NOT NULL DEFAULT true,
    silindi_mi          boolean NOT NULL DEFAULT false,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kod, tip, dil_kodu)
);
CREATE INDEX idx_bildirim_sablon_kod ON bildirim_sablon (kod) WHERE silindi_mi = false;

CREATE TRIGGER trg_bildirim_sablon_guncelleme
    BEFORE UPDATE ON bildirim_sablon
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- BILDIRIM_GONDERIM: Gonderim logu
-- ----------------------------------------------------------------
CREATE TABLE bildirim_gonderim (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    provider_id         bigint NOT NULL REFERENCES bildirim_provider(id) ON DELETE RESTRICT,
    sablon_id           bigint REFERENCES bildirim_sablon(id),
    tip                 varchar(20) NOT NULL,
    -- Hedef
    cari_id             bigint REFERENCES cari(id),
    kullanici_id        bigint REFERENCES kullanici(id),
    alici              varchar(500) NOT NULL,                -- email veya telefon
    -- Icerik (render edilmis)
    konu                varchar(500),
    icerik              text,
    degisken_degerler   jsonb,
    -- Kaynak
    kaynak_belge_tipi   varchar(50),
    kaynak_belge_id     bigint,
    -- Durum
    durum               varchar(20) NOT NULL DEFAULT 'kuyrukta' CHECK (durum IN (
        'kuyrukta',
        'gonderiliyor',
        'gonderildi',
        'teslim_edildi',
        'okundu',
        'basarisiz',
        'iptal',
        'spam'
    )),
    gonderim_zamani     timestamptz,
    teslim_zamani       timestamptz,
    okunma_zamani       timestamptz,
    -- Provider yanit
    provider_mesaj_id   varchar(200),                        -- sent.msg.id
    hata_mesaji         text,
    provider_response   jsonb,
    -- Maliyet
    birim_ucret         numeric(10, 4),
    para_birimi_kod     char(3) REFERENCES para_birimi(kod),
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bildirim_gonderim_cari ON bildirim_gonderim (cari_id) WHERE cari_id IS NOT NULL;
CREATE INDEX idx_bildirim_gonderim_durum ON bildirim_gonderim (durum);
CREATE INDEX idx_bildirim_gonderim_tarih ON bildirim_gonderim (olusturma_tarihi DESC);
CREATE INDEX idx_bildirim_gonderim_kaynak ON bildirim_gonderim (kaynak_belge_tipi, kaynak_belge_id);


-- ============================================================
-- E-FATURA KUYRUK (TR'YE OZEL)
-- ============================================================

-- ----------------------------------------------------------------
-- EFATURA_KUYRUK: Fatura GIB'e gonderim kuyrugu
-- ----------------------------------------------------------------
CREATE TABLE efatura_kuyruk (
    id                  bigserial PRIMARY KEY,
    public_id           uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    fatura_id           bigint NOT NULL UNIQUE,              -- FK modul 08 (polymorphic DB'ye bagimli)
    senaryo             varchar(20) NOT NULL DEFAULT 'TEMELFATURA' CHECK (senaryo IN (
        'TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA', 'EIRSALIYE'
    )),
    -- Durum state machine
    durum               varchar(20) NOT NULL DEFAULT 'bekliyor' CHECK (durum IN (
        'bekliyor',             -- Kuyrukta
        'hazirlaniyor',         -- UBL-TR XML olusturuluyor
        'gonderiliyor',         -- GIB'e gonderiliyor
        'gonderildi',           -- Gonderildi, GIB yaniti bekleniyor
        'kabul',                -- GIB kabul etti
        'red',                  -- GIB reddetti
        'kabul_bekliyor',       -- Alici kabul/red bekleniyor (ticari fatura)
        'alici_kabul',
        'alici_red',
        'hata',                 -- Teknik hata
        'iptal'
    )),
    -- Deneme
    deneme_sayisi       int NOT NULL DEFAULT 0,
    maksimum_deneme     int NOT NULL DEFAULT 5,
    son_deneme          timestamptz,
    sonraki_deneme      timestamptz,
    hata_mesaji         text,
    -- GIB yaniti
    gib_uuid            varchar(100),
    gib_envanter_no     varchar(100),
    gib_gonderim_zamani timestamptz,
    gib_cevap_zamani    timestamptz,
    gib_response        jsonb,
    -- XML/PDF
    ubl_xml             text,                                -- UBL-TR XML
    pdf_url             text,
    -- Alici
    alici_vergi_no      varchar(50),
    alici_etiket        varchar(200),                        -- 'urn:mail:defaultgb@...'
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi   timestamptz NOT NULL DEFAULT now(),
    CHECK (deneme_sayisi >= 0 AND deneme_sayisi <= maksimum_deneme + 1)
);
CREATE INDEX idx_efatura_kuyruk_durum_plan
    ON efatura_kuyruk (durum, sonraki_deneme)
    WHERE durum IN ('bekliyor', 'hata');
CREATE INDEX idx_efatura_kuyruk_fatura ON efatura_kuyruk (fatura_id);
CREATE INDEX idx_efatura_kuyruk_gib_uuid ON efatura_kuyruk (gib_uuid) WHERE gib_uuid IS NOT NULL;

CREATE TRIGGER trg_efatura_kuyruk_guncelleme
    BEFORE UPDATE ON efatura_kuyruk
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();


-- ----------------------------------------------------------------
-- EFATURA_MUKELLEF: GIB mukellef cache
-- ----------------------------------------------------------------
CREATE TABLE efatura_mukellef (
    id                  bigserial PRIMARY KEY,
    vergi_no            varchar(50) UNIQUE NOT NULL,
    unvan               varchar(500),
    -- E-fatura mi / e-arsiv mi
    e_fatura_mukellef_mi boolean NOT NULL DEFAULT false,
    e_fatura_etiket     varchar(300),                        -- 'urn:mail:defaultgb@foo.com.tr'
    e_arsiv_mukellef_mi boolean NOT NULL DEFAULT false,
    e_irsaliye_mukellef_mi boolean NOT NULL DEFAULT false,
    -- Durum tarihi
    e_fatura_baslangic  date,
    -- Adres (GIB'den)
    adres               text,
    il                  varchar(100),
    ilce                varchar(100),
    posta_kodu          varchar(20),
    -- Cache meta
    son_guncelleme      timestamptz NOT NULL DEFAULT now(),
    kaynak              varchar(50) NOT NULL DEFAULT 'GIB',
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_efatura_mukellef_e_fatura
    ON efatura_mukellef (e_fatura_mukellef_mi)
    WHERE e_fatura_mukellef_mi = true;


-- ============================================================
-- API CAGRI LOGU
-- ============================================================

-- ----------------------------------------------------------------
-- API_CAGRI_LOG: Outbound API cagrilarinin logu
-- Yil bazli partition hazirligi (v1: tek tablo, v2+: RANGE partition).
-- ----------------------------------------------------------------
CREATE TABLE api_cagri_log (
    id                  bigserial,
    public_id           uuid NOT NULL DEFAULT gen_random_uuid(),
    servis_kod          varchar(50) NOT NULL,                -- 'yurtici_kargo', 'gib_efatura', 'param_pos'
    endpoint            varchar(500) NOT NULL,
    http_method         varchar(10) NOT NULL,
    -- Istek
    istek_headerlar     jsonb,
    istek_payload       jsonb,
    istek_boyut_byte    int,
    -- Yanit
    http_status         int,
    response_headerlar  jsonb,
    response_body       text,
    response_boyut_byte int,
    sure_ms             int,
    -- Sonuc
    hata                boolean NOT NULL DEFAULT false,
    hata_mesaji         text,
    retry_sayisi        int NOT NULL DEFAULT 0,
    -- Kaynak
    kaynak_belge_tipi   varchar(50),
    kaynak_belge_id     bigint,
    kullanici_id        bigint REFERENCES kullanici(id),
    ip_adresi           inet,
    -- Audit
    olusturma_tarihi    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, olusturma_tarihi)
) PARTITION BY RANGE (olusturma_tarihi);

CREATE INDEX idx_api_cagri_log_servis_tarih
    ON api_cagri_log (servis_kod, olusturma_tarihi DESC);
CREATE INDEX idx_api_cagri_log_hata
    ON api_cagri_log (olusturma_tarihi DESC)
    WHERE hata = true;
CREATE INDEX idx_api_cagri_log_kaynak
    ON api_cagri_log (kaynak_belge_tipi, kaynak_belge_id);

-- Baslangic partition'lari (2026, 2027)
CREATE TABLE api_cagri_log_2026 PARTITION OF api_cagri_log
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE api_cagri_log_2027 PARTITION OF api_cagri_log
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');


-- ============================================================
-- FONKSIYONLAR
-- ============================================================

-- ----------------------------------------------------------------
-- webhook_yayinla: Event ekle + ilgili endpoint'lere gonderim kuyrugu
-- App katmani bunu siparis/fatura/stok trigger'larindan cagiracak.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_yayinla(
    p_event_tipi varchar,
    p_kaynak_tipi varchar,
    p_kaynak_id bigint,
    p_payload jsonb,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_event_id bigint;
    v_endpoint record;
BEGIN
    INSERT INTO webhook_event (
        event_tipi, kaynak_belge_tipi, kaynak_belge_id,
        payload, durum, olusturan_kullanici_id
    ) VALUES (
        p_event_tipi, p_kaynak_tipi, p_kaynak_id,
        p_payload, 'bekliyor', p_kullanici_id
    ) RETURNING id INTO v_event_id;

    -- Bu event'e abone tum aktif endpointler icin pending satir
    FOR v_endpoint IN
        SELECT id FROM webhook_endpoint
        WHERE aktif_mi = true
          AND dondurulmus_mu = false
          AND silindi_mi = false
          AND (event_filtre = '{}' OR p_event_tipi = ANY(event_filtre))
    LOOP
        INSERT INTO webhook_gonderim (
            event_id, endpoint_id, deneme_sirasi,
            istek_url, sonraki_deneme
        ) VALUES (
            v_event_id, v_endpoint.id, 1,
            '',  -- app katmani dolduracak
            now()
        );
    END LOOP;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- webhook_retry_hesapla: Exponential backoff
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_retry_hesapla(
    p_deneme_sirasi int
) RETURNS timestamptz AS $$
BEGIN
    -- 1m, 5m, 15m, 1h, 6h, 24h
    RETURN now() + CASE p_deneme_sirasi
        WHEN 1 THEN interval '1 minute'
        WHEN 2 THEN interval '5 minutes'
        WHEN 3 THEN interval '15 minutes'
        WHEN 4 THEN interval '1 hour'
        WHEN 5 THEN interval '6 hours'
        ELSE interval '24 hours'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ----------------------------------------------------------------
-- kargo_gonderi_olustur: Iskelet kayit olusturur
-- Asil API cagrisi app katmaninda yapilir ve takip_no/etiket_url guncellenir.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION kargo_gonderi_olustur(
    p_kaynak_belge_tipi varchar,
    p_kaynak_belge_id bigint,
    p_kargo_baglanti_id bigint,
    p_alici_ad varchar,
    p_alici_telefon varchar,
    p_alici_adres jsonb,
    p_agirlik_kg numeric DEFAULT NULL,
    p_hacim_dm3 numeric DEFAULT NULL,
    p_ucret numeric DEFAULT NULL,
    p_para_birimi char(3) DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_gonderi_id bigint;
    v_firma_id bigint;
    v_referans varchar;
BEGIN
    SELECT kargo_firma_id INTO v_firma_id
    FROM kargo_baglanti WHERE id = p_kargo_baglanti_id;

    IF v_firma_id IS NULL THEN
        RAISE EXCEPTION 'Kargo baglantisi bulunamadi: %', p_kargo_baglanti_id;
    END IF;

    v_referans := 'KRG-' || to_char(now(), 'YYYYMMDD') || '-' ||
                  lpad(nextval('kargo_gonderi_id_seq')::text, 8, '0');

    INSERT INTO kargo_gonderi (
        baglanti_id, kargo_firma_id,
        kaynak_belge_tipi, kaynak_belge_id,
        referans_no, durum,
        alici_ad, alici_telefon, alici_adres,
        agirlik_kg, hacim_dm3,
        ucret, para_birimi_kod,
        olusturan_kullanici_id
    ) VALUES (
        p_kargo_baglanti_id, v_firma_id,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        v_referans, 'hazirlaniyor',
        p_alici_ad, p_alici_telefon, p_alici_adres,
        p_agirlik_kg, p_hacim_dm3,
        p_ucret, p_para_birimi,
        p_kullanici_id
    ) RETURNING id INTO v_gonderi_id;

    RETURN v_gonderi_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- bildirim_gonder: Gonderim isteği kuyrugu (worker isleyecek)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION bildirim_gonder(
    p_sablon_kod varchar,
    p_alici varchar,
    p_degiskenler jsonb DEFAULT '{}'::jsonb,
    p_cari_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL,
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_dil_kodu char(2) DEFAULT 'tr',
    p_provider_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_sablon record;
    v_provider_id bigint;
    v_gonderim_id bigint;
    v_kvkk_onay boolean;
BEGIN
    -- Sablon bul
    SELECT id, tip, konu, icerik_html, icerik_text, provider_id, pazarlama_mi
      INTO v_sablon
    FROM bildirim_sablon
    WHERE kod = p_sablon_kod AND dil_kodu = p_dil_kodu
      AND aktif_mi = true AND silindi_mi = false
    LIMIT 1;

    IF v_sablon.id IS NULL THEN
        RAISE EXCEPTION 'Bildirim sablonu bulunamadi: % (%)', p_sablon_kod, p_dil_kodu;
    END IF;

    -- KVKK onay kontrolu (pazarlama sablonlari icin)
    IF v_sablon.pazarlama_mi AND p_cari_id IS NOT NULL THEN
        SELECT
            CASE v_sablon.tip
                WHEN 'email' THEN pazarlama_email_onay
                WHEN 'sms' THEN pazarlama_sms_onay
                ELSE true
            END
          INTO v_kvkk_onay
        FROM cari WHERE id = p_cari_id;

        IF NOT COALESCE(v_kvkk_onay, false) THEN
            RAISE EXCEPTION 'KVKK: cari pazarlama iletisimine onay vermemis (cari=%)', p_cari_id;
        END IF;
    END IF;

    -- Provider (explicit veya sablon veya tip varsayilani)
    v_provider_id := COALESCE(
        p_provider_id,
        v_sablon.provider_id,
        (SELECT id FROM bildirim_provider
         WHERE tip = v_sablon.tip AND varsayilan_mi = true
           AND aktif_mi = true AND silindi_mi = false
         LIMIT 1)
    );

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Uygun bildirim provider bulunamadi (tip=%)', v_sablon.tip;
    END IF;

    INSERT INTO bildirim_gonderim (
        provider_id, sablon_id, tip,
        cari_id, alici,
        konu, icerik, degisken_degerler,
        kaynak_belge_tipi, kaynak_belge_id,
        durum, olusturan_kullanici_id
    ) VALUES (
        v_provider_id, v_sablon.id, v_sablon.tip,
        p_cari_id, p_alici,
        v_sablon.konu, COALESCE(v_sablon.icerik_html, v_sablon.icerik_text), p_degiskenler,
        p_kaynak_belge_tipi, p_kaynak_belge_id,
        'kuyrukta', p_kullanici_id
    ) RETURNING id INTO v_gonderim_id;

    RETURN v_gonderim_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- efatura_kuyruga_ekle: Fatura icin e-fatura kuyrugu olustur
-- Idempotent: ayni fatura_id icin UNIQUE, DO NOTHING.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION efatura_kuyruga_ekle(
    p_fatura_id bigint,
    p_senaryo varchar DEFAULT 'TEMELFATURA',
    p_alici_vergi_no varchar DEFAULT NULL,
    p_alici_etiket varchar DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_kuyruk_id bigint;
BEGIN
    INSERT INTO efatura_kuyruk (
        fatura_id, senaryo, durum, sonraki_deneme,
        alici_vergi_no, alici_etiket,
        olusturan_kullanici_id
    ) VALUES (
        p_fatura_id, p_senaryo, 'bekliyor', now(),
        p_alici_vergi_no, p_alici_etiket,
        p_kullanici_id
    )
    ON CONFLICT (fatura_id) DO UPDATE
    SET durum = CASE
            WHEN efatura_kuyruk.durum IN ('red', 'hata') THEN 'bekliyor'
            ELSE efatura_kuyruk.durum
        END,
        deneme_sayisi = 0,
        sonraki_deneme = now(),
        guncelleme_tarihi = now()
    RETURNING id INTO v_kuyruk_id;

    RETURN v_kuyruk_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VIEW'LAR
-- ============================================================

-- ----------------------------------------------------------------
-- vw_webhook_endpoint_saglik: Endpoint basari orani
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_webhook_endpoint_saglik AS
SELECT
    we.id,
    we.public_id,
    we.ad,
    we.url,
    we.aktif_mi,
    we.dondurulmus_mu,
    we.toplam_gonderim,
    we.basarili_sayisi,
    we.hata_sayisi,
    CASE
        WHEN we.toplam_gonderim = 0 THEN NULL
        ELSE ROUND(100.0 * we.basarili_sayisi / we.toplam_gonderim, 2)
    END AS basari_orani,
    we.son_basari_zamani,
    we.son_hata_zamani,
    we.son_hata_mesaji,
    -- Son 24 saat stat
    (SELECT COUNT(*) FROM webhook_gonderim wg
     WHERE wg.endpoint_id = we.id AND wg.gonderim_zamani >= now() - interval '24 hours') AS son_24s_gonderim,
    (SELECT COUNT(*) FROM webhook_gonderim wg
     WHERE wg.endpoint_id = we.id AND wg.gonderim_zamani >= now() - interval '24 hours' AND wg.basarili_mi = false) AS son_24s_hata
FROM webhook_endpoint we
WHERE we.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_kargo_gonderi_aktif: Teslim edilmemis gonderiler
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_kargo_gonderi_aktif AS
SELECT
    kg.id,
    kg.public_id,
    kg.takip_no,
    kg.referans_no,
    kg.kaynak_belge_tipi,
    kg.kaynak_belge_id,
    kg.durum,
    kg.gonderim_tarihi,
    kg.beklenen_teslim_tarihi,
    kg.alici_ad,
    kg.alici_telefon,
    kg.alici_adres,
    kf.kod AS kargo_firma_kod,
    kf.ad AS kargo_firma_ad,
    REPLACE(kf.takip_url_sablon, '{takip_no}', COALESCE(kg.takip_no, '')) AS takip_url,
    kg.paket_sayisi,
    kg.agirlik_kg,
    EXTRACT(EPOCH FROM (now() - kg.gonderim_tarihi)) / 86400 AS yolda_gun
FROM kargo_gonderi kg
JOIN kargo_firma kf ON kf.id = kg.kargo_firma_id
WHERE kg.durum NOT IN ('teslim_edildi', 'iade_edildi', 'iptal', 'hata')
  AND kg.silindi_mi = false;


-- ----------------------------------------------------------------
-- vw_efatura_kuyruk_ozet: Dashboard
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_efatura_kuyruk_ozet AS
SELECT
    durum,
    COUNT(*) AS fatura_sayisi,
    MIN(olusturma_tarihi) AS en_eski,
    MAX(olusturma_tarihi) AS en_yeni,
    SUM(CASE WHEN deneme_sayisi >= maksimum_deneme THEN 1 ELSE 0 END) AS max_deneme_asmis
FROM efatura_kuyruk
GROUP BY durum;


-- ----------------------------------------------------------------
-- vw_bildirim_gunluk_istatistik
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_bildirim_gunluk_istatistik AS
SELECT
    date_trunc('day', olusturma_tarihi)::date AS gun,
    tip,
    provider_id,
    COUNT(*) AS toplam,
    COUNT(*) FILTER (WHERE durum = 'teslim_edildi') AS teslim,
    COUNT(*) FILTER (WHERE durum = 'basarisiz') AS basarisiz,
    COUNT(*) FILTER (WHERE durum = 'okundu') AS okundu,
    SUM(birim_ucret) AS toplam_ucret
FROM bildirim_gonderim
WHERE olusturma_tarihi >= now() - interval '30 days'
GROUP BY 1, 2, 3;


-- ============================================================
-- NOTLAR:
--   * Webhook payload imzalama app katmaninda — DB sadece kuyruk.
--     HMAC icin endpoint secret plain text TUTULMAZ, app katmani
--     anahtari yonetir (env var veya KMS).
--   * Kargo webhook (inbound durum guncelleme) api/kontrol katmaninda
--     kargo_durum_log + kargo_gonderi UPDATE calisir.
--   * api_cagri_log partition maintenance icin pg_partman veya cron
--     her yil 1 Kasim'da yeni partition olusturmali.
--
-- PHP v1'de YOK, v2'de EKLENDI:
--   * Merkezi webhook kuyrugu + retry altyapisi
--   * Kargo tarife tablosu (kg/desi bazli)
--   * Bildirim sablon sistemi + KVKK onay kontrolu
--   * E-fatura kuyruk state machine (10 durum)
--   * GIB mukellef cache
--   * API cagri log (yillik partition, hata index)
--   * Encrypted credentials (bytea) — plain text YASAK
-- ============================================================
