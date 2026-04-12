-- ============================================================
-- MODUL 12: E-TICARET (KENDI STOREFRONT) (v2 REFACTOR)
-- ============================================================
-- Kuvvem'in kendi B2C/B2B storefront'u (Astro/Next frontend'le birlikte).
-- Sepet, favoriler, kupon, kampanya, yorum, SEO sayfalari, banner.
--
-- Entegrasyon noktalari:
--   - Modul 01: kullanici (admin), sistem_ayar
--   - Modul 04: magaza (sepet hangi magazadan sevk)
--   - Modul 05: cari (portal_aktif — musteri kimligi)
--   - Modul 06: urun, urun_varyant, kategori, fiyat_listesi
--   - Modul 07: urun_stok_rezervasyon (sadece checkout + auth'lu sepet)
--   - Modul 08: siparis, iade_sebep
--
-- v1 -> v2 Degisiklikler (Elestirmen v1 bulgularina yanit):
--   #1 Sepet toplam trigger — sepet_toplam_hesapla()
--   #2 Kupon coklu semantik — sepet_kupon junction + yeni kolonlar (kategori/marka/urun filtreleri)
--   #3 Turkce karakter temizligi — katalog ve renk_temasi normalize edildi
--   #4 Anonim sepet rezervasyon politikasi — sepet.rezervasyon_aktif_mi + yorum bloklari
--   #5 Kampanya kural motoru JSONB schema CHECK
--   #6 Urun yorum moderasyonu — red sebep lookup + dogrulanmis_alici_mi trigger
--   #7 SEO modeli — ceviri tablolari (eticaret_sayfa_ceviri + eticaret_blog_yazi_ceviri)
--   #8 Sepet abandonment — cleanup politikasi
--   #9 Arama optimizasyonu — eticaret_populer_arama view
--   #10 urun_yorum_durum_log (audit trail)
--   #11 favori partial unique indexler
--   #12 kupon yuzde/tutar ayri kolonlar
-- ============================================================

-- ----------------------------------------------------------------
-- SEPET: Anonim (cookie/session) + Kimlikli (cari_id) sepetler
-- v1 Sorun #4: Anonim sepet rezervasyon yapmaz.
-- ----------------------------------------------------------------
CREATE TABLE sepet (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    oturum_anahtari varchar(120),
    -- Sevk / para
    magaza_id       bigint REFERENCES magaza(id),
    para_birimi_kod char(3) NOT NULL REFERENCES para_birimi(kod),
    fiyat_listesi_id bigint REFERENCES fiyat_listesi(id),
    dil_kodu        char(2) NOT NULL DEFAULT 'tr',
    -- Musteri etkilesimi
    ip_adresi       inet,
    kullanici_ajani text,
    utm_kaynak      varchar(100),
    utm_medyum      varchar(100),
    utm_kampanya    varchar(100),
    referans_url    text,
    -- Adresler
    fatura_adres_id bigint REFERENCES cari_adres(id) ON DELETE SET NULL,
    sevk_adres_id   bigint REFERENCES cari_adres(id) ON DELETE SET NULL,
    -- Durum
    durum           varchar(20) NOT NULL DEFAULT 'aktif' CHECK (durum IN (
        'aktif', 'terkedildi', 'donusturuldu', 'birlestirildi', 'iptal'
    )),
    donusturulen_siparis_id bigint REFERENCES siparis(id) ON DELETE SET NULL,
    birlestirilen_sepet_id bigint REFERENCES sepet(id) ON DELETE SET NULL,
    -- Rezervasyon politikasi (v1 Sorun #4)
    rezervasyon_aktif_mi boolean NOT NULL DEFAULT false,
    -- Toplamlar (sepet_toplam_hesapla trigger ile otomatik — v1 Sorun #1)
    ara_toplam      numeric(18, 4) NOT NULL DEFAULT 0,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kupon_iskonto   numeric(18, 4) NOT NULL DEFAULT 0,
    kampanya_iskonto numeric(18, 4) NOT NULL DEFAULT 0,
    kargo_tutari    numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL DEFAULT 0,
    -- Notlar
    musteri_notu    text,
    ic_notlar       text,
    -- Aktivite
    son_aktivite    timestamptz NOT NULL DEFAULT now(),
    son_kullanim_tarihi timestamptz,
    terkedilme_email_gonderildi_mi boolean NOT NULL DEFAULT false,
    terkedilme_email_zamani timestamptz,
    -- Audit
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (cari_id IS NOT NULL OR oturum_anahtari IS NOT NULL),
    -- v1 Sorun #4: Anonim sepet rezervasyon yapamaz
    CHECK (rezervasyon_aktif_mi = false OR cari_id IS NOT NULL)
);
CREATE INDEX idx_sepet_cari ON sepet(cari_id) WHERE silindi_mi = false AND durum = 'aktif';
CREATE UNIQUE INDEX unq_sepet_oturum_aktif ON sepet(oturum_anahtari)
    WHERE durum = 'aktif' AND oturum_anahtari IS NOT NULL AND silindi_mi = false;
CREATE INDEX idx_sepet_durum_aktivite ON sepet(durum, son_aktivite DESC);
CREATE INDEX idx_sepet_terkedilmis ON sepet(son_aktivite)
    WHERE durum = 'aktif' AND terkedilme_email_gonderildi_mi = false;
CREATE INDEX idx_sepet_son_kullanim ON sepet(son_kullanim_tarihi) WHERE durum = 'aktif';
-- Cleanup icin: anonim sepetler icin kisa TTL, auth sepetler uzun TTL
CREATE INDEX idx_sepet_temizleme_anonim
    ON sepet(son_aktivite)
    WHERE durum = 'aktif' AND cari_id IS NULL AND silindi_mi = false;
CREATE INDEX idx_sepet_temizleme_auth
    ON sepet(son_aktivite)
    WHERE durum = 'aktif' AND cari_id IS NOT NULL AND silindi_mi = false;

CREATE TRIGGER trg_sepet_guncelleme
    BEFORE UPDATE ON sepet
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

COMMENT ON TABLE sepet IS
'Anonim (oturum_anahtari) veya auth (cari_id) sepet. REZERVASYON POLITIKASI: Sadece cari_id NOT NULL sepetler urun_stok_rezervasyon yaratabilir (CHECK ile zorlanmistir). Anonim sepet goruntuleme amacli, stok kilidi yaratmaz. Cleanup: anonim 7 gun, auth 30 gun.';

-- ----------------------------------------------------------------
-- SEPET_KALEM
-- NOT: Rezervasyon yaratma mantigi Modul 07 stok_rezerve_et ile yapilir.
-- Rezervasyon sadece checkout adiminda VE sepet.rezervasyon_aktif_mi=true icin.
-- ----------------------------------------------------------------
CREATE TABLE sepet_kalem (
    id              bigserial PRIMARY KEY,
    sepet_id        bigint NOT NULL REFERENCES sepet(id) ON DELETE CASCADE,
    urun_varyant_id bigint NOT NULL REFERENCES urun_varyant(id) ON DELETE RESTRICT,
    sira            int NOT NULL DEFAULT 0,
    miktar          numeric(15, 4) NOT NULL CHECK (miktar > 0),
    birim_fiyat     numeric(18, 4) NOT NULL,
    liste_fiyati    numeric(18, 4),
    para_birimi_kod char(3) REFERENCES para_birimi(kod),  -- sepet override (v1 iyilestirme)
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    kdv_orani       numeric(5, 2),
    kdv_tutari      numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_tutar    numeric(18, 4) NOT NULL,
    -- Kampanya bagi (kupon artik sepet_kupon junction)
    kampanya_id     bigint,                                 -- FK asagida kampanya olusunca
    -- Stok rezervasyonu (modul 07)
    rezervasyon_id  bigint REFERENCES urun_stok_rezervasyon(id) ON DELETE SET NULL,
    -- Snapshot
    urun_ad         varchar(500),
    varyant_ad      varchar(300),
    urun_resim_url  text,
    musteri_notu    text,
    ozellestirme    jsonb,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sepet_id, urun_varyant_id)
);
CREATE INDEX idx_sepet_kalem_sepet ON sepet_kalem(sepet_id);
CREATE INDEX idx_sepet_kalem_varyant ON sepet_kalem(urun_varyant_id);
CREATE INDEX idx_sepet_kalem_rezervasyon ON sepet_kalem(rezervasyon_id) WHERE rezervasyon_id IS NOT NULL;

CREATE TRIGGER trg_sepet_kalem_guncelleme
    BEFORE UPDATE ON sepet_kalem
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- FUNCTION + TRIGGER: sepet_toplam_hesapla (v1 Sorun #1)
-- sepet_kalem her degistiginde sepet header'ini yeniden hesaplar.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION sepet_toplam_hesapla() RETURNS trigger AS $$
DECLARE
    v_sepet_id bigint;
    v_ara_toplam numeric(18, 4);
    v_kdv numeric(18, 4);
    v_iskonto numeric(18, 4);
    v_toplam numeric(18, 4);
BEGIN
    v_sepet_id := COALESCE(NEW.sepet_id, OLD.sepet_id);

    SELECT
        COALESCE(SUM((miktar * birim_fiyat) - iskonto_tutari - kdv_tutari), 0),
        COALESCE(SUM(kdv_tutari), 0),
        COALESCE(SUM(iskonto_tutari), 0),
        COALESCE(SUM(toplam_tutar), 0)
      INTO v_ara_toplam, v_kdv, v_iskonto, v_toplam
    FROM sepet_kalem
    WHERE sepet_id = v_sepet_id;

    UPDATE sepet
    SET ara_toplam = v_ara_toplam,
        kdv_tutari = v_kdv,
        iskonto_tutari = v_iskonto,
        toplam_tutar = v_toplam + COALESCE(kargo_tutari, 0)
                       - COALESCE(kupon_iskonto, 0)
                       - COALESCE(kampanya_iskonto, 0),
        son_aktivite = now(),
        guncelleme_tarihi = now()
    WHERE id = v_sepet_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sepet_kalem_toplam
    AFTER INSERT OR UPDATE OR DELETE ON sepet_kalem
    FOR EACH ROW EXECUTE FUNCTION sepet_toplam_hesapla();

-- ----------------------------------------------------------------
-- FAVORI / WISHLIST
-- v1 Sorun #7 (orta): partial unique indexler
-- ----------------------------------------------------------------
CREATE TABLE favori_liste (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    ad              varchar(100) NOT NULL DEFAULT 'Favorilerim',
    varsayilan_mi   boolean NOT NULL DEFAULT false,
    paylasim_token  varchar(100) UNIQUE,
    gizli_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cari_id, ad)
);
CREATE INDEX idx_favori_liste_cari ON favori_liste(cari_id);

CREATE TRIGGER trg_favori_liste_guncelleme
    BEFORE UPDATE ON favori_liste
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE favori (
    id              bigserial PRIMARY KEY,
    favori_liste_id bigint NOT NULL REFERENCES favori_liste(id) ON DELETE CASCADE,
    cari_id         bigint NOT NULL REFERENCES cari(id) ON DELETE CASCADE,
    urun_id         bigint REFERENCES urun(id) ON DELETE CASCADE,
    urun_varyant_id bigint REFERENCES urun_varyant(id) ON DELETE CASCADE,
    not_            text,
    fiyat_alarm_tutari numeric(18, 4),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (urun_id IS NOT NULL OR urun_varyant_id IS NOT NULL)
);
CREATE INDEX idx_favori_cari ON favori(cari_id);
CREATE INDEX idx_favori_liste ON favori(favori_liste_id);
CREATE INDEX idx_favori_varyant ON favori(urun_varyant_id) WHERE urun_varyant_id IS NOT NULL;
CREATE INDEX idx_favori_urun ON favori(urun_id) WHERE urun_id IS NOT NULL;
CREATE UNIQUE INDEX unq_favori_liste_varyant
    ON favori(favori_liste_id, urun_varyant_id)
    WHERE urun_varyant_id IS NOT NULL;
CREATE UNIQUE INDEX unq_favori_liste_urun
    ON favori(favori_liste_id, urun_id)
    WHERE urun_varyant_id IS NULL AND urun_id IS NOT NULL;

-- ----------------------------------------------------------------
-- ETICARET_KATEGORI_GORUNUM (v1 Sorun #6: Turkce karakter temizligi)
-- ----------------------------------------------------------------
CREATE TABLE eticaret_kategori_gorunum (
    id              bigserial PRIMARY KEY,
    kategori_id     bigint NOT NULL UNIQUE REFERENCES kategori(id) ON DELETE CASCADE,
    eticaret_aktif_mi boolean NOT NULL DEFAULT true,
    vitrin_oncelik  int NOT NULL DEFAULT 0,
    banner_resim_url text,
    mobil_banner_resim_url text,
    vitrin_resim_url text,
    vitrin_baslik   varchar(200),
    vitrin_alt_baslik varchar(300),
    renk_temasi     varchar(20),                            -- v2: renk_temasi (Turkce karakter temizligi)
    sayfa_duzeni    varchar(30) NOT NULL DEFAULT 'izgara' CHECK (sayfa_duzeni IN (
        'izgara', 'liste', 'vitrin', 'katalog', 'ozel'      -- v2: katalog
    )),
    sayfa_basi_urun int NOT NULL DEFAULT 24,
    varsayilan_siralama varchar(30) DEFAULT 'populer',
    filtre_ayar     jsonb DEFAULT '{}',
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eticaret_kategori_gorunum_oncelik
    ON eticaret_kategori_gorunum(vitrin_oncelik) WHERE eticaret_aktif_mi = true;

CREATE TRIGGER trg_eticaret_kategori_gorunum_guncelleme
    BEFORE UPDATE ON eticaret_kategori_gorunum
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- KUPON (v1 Sorun #2 + #8): Yeni kolonlar, ayri yuzde/tutar alanlari,
-- kategori/marka/urun filtreleri
-- ----------------------------------------------------------------
CREATE TABLE kupon (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    tip             varchar(30) NOT NULL CHECK (tip IN (
        'yuzde', 'sabit_tutar', 'kargo_bedava', 'kademeli', 'hediye_urun', 'ikinci_urun_indirim'
    )),
    -- v1 Sorun #8: Yuzde ve tutar ayri kolonlar
    iskonto_yuzde   numeric(5, 2),                          -- tip='yuzde' icin
    iskonto_tutari  numeric(18, 4),                         -- tip='sabit_tutar' icin
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    -- Tutar esikleri
    minimum_sepet_tutari numeric(18, 4),
    minimum_urun_sayisi int,                                -- v1 refactor: sepette min urun
    maksimum_indirim numeric(18, 4),
    -- Gecerlilik
    gecerli_baslangic timestamptz,
    gecerli_bitis   timestamptz,
    -- Kullanim semantigi (v1 Sorun #2)
    kullanim_tipi   varchar(30) NOT NULL DEFAULT 'cok_sefer_per_musteri' CHECK (kullanim_tipi IN (
        'tek_sefer', 'cok_sefer_per_musteri', 'sinirsiz'
    )),
    kullanim_limit_toplam int,
    kullanim_limit_per_musteri int NOT NULL DEFAULT 1,
    mevcut_kullanim int NOT NULL DEFAULT 0,
    -- Musteri segmenti
    ilk_alisveris_mi boolean NOT NULL DEFAULT false,
    sadece_yeni_musteri_mi boolean NOT NULL DEFAULT false,
    sadece_kayitli_musteri_mi boolean NOT NULL DEFAULT false,
    -- Filtreler (array — basit ve sorgu dostu)
    gecerli_kategori_idler bigint[],
    gecerli_marka_idler    bigint[],
    gecerli_urun_idler     bigint[],
    haric_urun_idler       bigint[],
    cari_grup_filtre       jsonb DEFAULT '{}',
    cari_filtre            jsonb DEFAULT '{}',
    -- Kombinasyon (v1 refactor)
    bilesik_kullanim_mi    boolean NOT NULL DEFAULT false,  -- diger kuponlarla birlesik mi
    indirimli_urunlerde_gecerli_mi boolean NOT NULL DEFAULT true,
    -- Dagitim
    gorunur_mu      boolean NOT NULL DEFAULT true,
    -- Audit
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (kullanim_limit_toplam IS NULL OR kullanim_limit_toplam > 0),
    CHECK (gecerli_baslangic IS NULL OR gecerli_bitis IS NULL OR gecerli_baslangic < gecerli_bitis),
    -- v1 Sorun #8: Tip ile deger alani tutarliligi
    CHECK (
        (tip = 'yuzde' AND iskonto_yuzde IS NOT NULL AND iskonto_yuzde > 0 AND iskonto_yuzde <= 100) OR
        (tip = 'sabit_tutar' AND iskonto_tutari IS NOT NULL AND iskonto_tutari > 0) OR
        (tip IN ('kargo_bedava', 'kademeli', 'hediye_urun', 'ikinci_urun_indirim'))
    )
);
CREATE INDEX idx_kupon_aktif ON kupon(aktif_mi, gecerli_baslangic, gecerli_bitis) WHERE silindi_mi = false;
CREATE INDEX idx_kupon_kod ON kupon(kod) WHERE silindi_mi = false;
CREATE INDEX idx_kupon_kategori ON kupon USING gin (gecerli_kategori_idler);
CREATE INDEX idx_kupon_marka ON kupon USING gin (gecerli_marka_idler);

CREATE TRIGGER trg_kupon_guncelleme
    BEFORE UPDATE ON kupon
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SEPET_KUPON (v1 Sorun #2): Coklu kupon junction
-- Artik sepet.kupon_id YOK. Bir sepete N kupon eklenebilir (bilesik_kullanim_mi ile).
-- ----------------------------------------------------------------
CREATE TABLE sepet_kupon (
    id              bigserial PRIMARY KEY,
    sepet_id        bigint NOT NULL REFERENCES sepet(id) ON DELETE CASCADE,
    kupon_id        bigint NOT NULL REFERENCES kupon(id) ON DELETE RESTRICT,
    iskonto_tutari  numeric(18, 4) NOT NULL DEFAULT 0,
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sepet_id, kupon_id)
);
CREATE INDEX idx_sepet_kupon_sepet ON sepet_kupon(sepet_id);
CREATE INDEX idx_sepet_kupon_kupon ON sepet_kupon(kupon_id);

-- ----------------------------------------------------------------
-- KUPON_KULLANIM
-- ----------------------------------------------------------------
CREATE TABLE kupon_kullanim (
    id              bigserial PRIMARY KEY,
    kupon_id        bigint NOT NULL REFERENCES kupon(id) ON DELETE CASCADE,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    sepet_id        bigint REFERENCES sepet(id) ON DELETE SET NULL,
    siparis_id      bigint REFERENCES siparis(id) ON DELETE SET NULL,
    iskonto_tutari  numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    ip_adresi       inet,
    durum           varchar(20) NOT NULL DEFAULT 'kullanildi' CHECK (durum IN (
        'kullanildi', 'iptal_edildi', 'geri_alindi'
    )),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kupon_kullanim_kupon ON kupon_kullanim(kupon_id);
CREATE INDEX idx_kupon_kullanim_cari ON kupon_kullanim(cari_id);
CREATE INDEX idx_kupon_kullanim_siparis ON kupon_kullanim(siparis_id);
-- v1 bonus: tek_sefer kuponlar icin cari+kupon UNIQUE (partial)
CREATE UNIQUE INDEX unq_kupon_kullanim_tek_sefer
    ON kupon_kullanim(kupon_id, cari_id)
    WHERE durum = 'kullanildi' AND cari_id IS NOT NULL;

-- ----------------------------------------------------------------
-- VIEW: vw_kupon_etkin — Kupon bir sepet icin etkin mi (hizli on-kontrol)
-- Asil validation app katmaninda (butun sartlari degerlendirir).
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_kupon_etkin AS
SELECT
    k.id,
    k.kod,
    k.ad,
    k.tip,
    k.iskonto_yuzde,
    k.iskonto_tutari,
    k.minimum_sepet_tutari,
    k.minimum_urun_sayisi,
    k.maksimum_indirim,
    k.gecerli_baslangic,
    k.gecerli_bitis,
    k.kullanim_tipi,
    k.bilesik_kullanim_mi,
    k.gecerli_kategori_idler,
    k.gecerli_marka_idler,
    k.gecerli_urun_idler,
    k.haric_urun_idler,
    k.mevcut_kullanim,
    k.kullanim_limit_toplam,
    (k.kullanim_limit_toplam IS NULL OR k.mevcut_kullanim < k.kullanim_limit_toplam) AS limit_musait_mi
FROM kupon k
WHERE k.aktif_mi = true
  AND k.silindi_mi = false
  AND (k.gecerli_baslangic IS NULL OR k.gecerli_baslangic <= now())
  AND (k.gecerli_bitis IS NULL OR k.gecerli_bitis > now());

-- ----------------------------------------------------------------
-- KAMPANYA: Kural motoru tabanli
-- ----------------------------------------------------------------
CREATE TABLE kampanya (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    tip             varchar(30) NOT NULL CHECK (tip IN (
        'urun', 'kategori', 'marka', 'sepet', 'kargo', 'hediye', 'bogo', 'kademeli_sepet'
    )),
    oncelik         int NOT NULL DEFAULT 100,
    baslangic       timestamptz,
    bitis           timestamptz,
    kanal           varchar(30) NOT NULL DEFAULT 'tumu' CHECK (kanal IN (
        'tumu', 'eticaret', 'b2b', 'perakende', 'pazaryeri'
    )),
    cari_grup_filtre jsonb DEFAULT '{}',
    kullanim_limit_toplam int,
    kullanim_limit_per_musteri int,
    mevcut_kullanim int NOT NULL DEFAULT 0,
    baska_kampanyayla_mi boolean NOT NULL DEFAULT false,
    stack_mi        boolean NOT NULL DEFAULT false,
    banner_goster_mi boolean NOT NULL DEFAULT false,
    banner_metin    varchar(300),
    banner_resim_url text,
    -- A/B test (v1 iyilestirme)
    test_grubu      varchar(30),
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kampanya_aktif_tarih
    ON kampanya(aktif_mi, baslangic, bitis) WHERE silindi_mi = false;
CREATE INDEX idx_kampanya_oncelik ON kampanya(oncelik) WHERE aktif_mi = true AND silindi_mi = false;

CREATE TRIGGER trg_kampanya_guncelleme
    BEFORE UPDATE ON kampanya
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- sepet_kalem -> kampanya FK
ALTER TABLE sepet_kalem
    ADD CONSTRAINT fk_sepet_kalem_kampanya
    FOREIGN KEY (kampanya_id) REFERENCES kampanya(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- KAMPANYA_KURAL: Kural motoru — kosullar
-- v1 Sorun #5: kosul_jsonb icin format CHECK
-- ----------------------------------------------------------------
CREATE TABLE kampanya_kural (
    id              bigserial PRIMARY KEY,
    kampanya_id     bigint NOT NULL REFERENCES kampanya(id) ON DELETE CASCADE,
    kosul_tipi      varchar(50) NOT NULL CHECK (kosul_tipi IN (
        'sepet_tutari_min', 'sepet_tutari_max',
        'urun_adet_min', 'urun_adet_max',
        'urun_var', 'kategori_var', 'marka_var',
        'cari_grup', 'cari_etiket', 'ilk_alisveris',
        'tarih_araligi', 'gun_saat', 'ulke', 'il', 'posta_kodu',
        'odeme_yontemi', 'kupon_kod', 'sepette_urun_kombinasyonu'
    )),
    kosul_jsonb     jsonb NOT NULL,
    operator        varchar(10) NOT NULL DEFAULT 've' CHECK (operator IN ('ve', 'veya')),
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    -- v1 Sorun #5: JSON format dogrulama
    CHECK (jsonb_typeof(kosul_jsonb) = 'object')
);
CREATE INDEX idx_kampanya_kural_kampanya ON kampanya_kural(kampanya_id);

COMMENT ON TABLE kampanya_kural IS
'kosul_jsonb formati (kosul_tipi bazli):
- sepet_tutari_min: {"tutar": 500, "para_birimi": "TRY"}
- sepet_tutari_max: {"tutar": 5000, "para_birimi": "TRY"}
- urun_adet_min: {"adet": 3}
- urun_var: {"urun_idler": [1,2,3]}
- kategori_var: {"kategori_idler": [10,20]}
- marka_var: {"marka_idler": [5]}
- cari_grup: {"grup_idler": [1,2]}
- tarih_araligi: {"baslangic": "2026-01-01", "bitis": "2026-12-31"}
- gun_saat: {"gunler": [1,2,3], "baslangic": "09:00", "bitis": "18:00"}
- ulke: {"ulke_kodlari": ["TR"]}
- il: {"il_idler": [34]}
- odeme_yontemi: {"yontemler": ["kart", "havale"]}
- sepette_urun_kombinasyonu: {"kombinasyon": [[1,2],[3,4]]}';

-- FUNCTION: kampanya_kural_dogrula — Temel format kontrolu
CREATE OR REPLACE FUNCTION kampanya_kural_dogrula(p_kural_id bigint)
RETURNS boolean AS $$
DECLARE
    v_kural record;
BEGIN
    SELECT * INTO v_kural FROM kampanya_kural WHERE id = p_kural_id;

    IF v_kural.id IS NULL THEN
        RETURN false;
    END IF;

    CASE v_kural.kosul_tipi
        WHEN 'sepet_tutari_min', 'sepet_tutari_max' THEN
            RETURN (v_kural.kosul_jsonb ? 'tutar') AND (v_kural.kosul_jsonb ? 'para_birimi');
        WHEN 'urun_adet_min', 'urun_adet_max' THEN
            RETURN v_kural.kosul_jsonb ? 'adet';
        WHEN 'urun_var' THEN
            RETURN v_kural.kosul_jsonb ? 'urun_idler' AND jsonb_typeof(v_kural.kosul_jsonb->'urun_idler') = 'array';
        WHEN 'kategori_var' THEN
            RETURN v_kural.kosul_jsonb ? 'kategori_idler' AND jsonb_typeof(v_kural.kosul_jsonb->'kategori_idler') = 'array';
        WHEN 'marka_var' THEN
            RETURN v_kural.kosul_jsonb ? 'marka_idler';
        WHEN 'tarih_araligi' THEN
            RETURN (v_kural.kosul_jsonb ? 'baslangic') AND (v_kural.kosul_jsonb ? 'bitis');
        ELSE
            RETURN true;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- KAMPANYA_AKSIYON
-- ----------------------------------------------------------------
CREATE TABLE kampanya_aksiyon (
    id              bigserial PRIMARY KEY,
    kampanya_id     bigint NOT NULL REFERENCES kampanya(id) ON DELETE CASCADE,
    aksiyon_tipi    varchar(50) NOT NULL CHECK (aksiyon_tipi IN (
        'yuzde_indirim', 'sabit_indirim', 'ucretsiz_kargo',
        'hediye_urun', 'ikinci_urun_indirim', 'kademeli_indirim',
        'puan_kazandir', 'sabit_fiyat_yap', 'kargo_yuzde_indirim'
    )),
    aksiyon_jsonb   jsonb NOT NULL,
    hedef           varchar(30) NOT NULL DEFAULT 'sepet' CHECK (hedef IN (
        'sepet', 'kalem', 'kategori', 'marka', 'urun', 'kargo'
    )),
    maksimum_indirim numeric(18, 4),
    sira            int NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(aksiyon_jsonb) = 'object')
);
CREATE INDEX idx_kampanya_aksiyon_kampanya ON kampanya_aksiyon(kampanya_id);

-- ----------------------------------------------------------------
-- KAMPANYA_KULLANIM
-- ----------------------------------------------------------------
CREATE TABLE kampanya_kullanim (
    id              bigserial PRIMARY KEY,
    kampanya_id     bigint NOT NULL REFERENCES kampanya(id) ON DELETE CASCADE,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    sepet_id        bigint REFERENCES sepet(id) ON DELETE SET NULL,
    siparis_id      bigint REFERENCES siparis(id) ON DELETE SET NULL,
    iskonto_tutari  numeric(18, 4) NOT NULL,
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kampanya_kullanim_kampanya ON kampanya_kullanim(kampanya_id);
CREATE INDEX idx_kampanya_kullanim_cari ON kampanya_kullanim(cari_id);
CREATE INDEX idx_kampanya_kullanim_siparis ON kampanya_kullanim(siparis_id);

-- ----------------------------------------------------------------
-- URUN_YORUM (v1 Sorun #6: moderasyon tamamlanmasi)
-- ----------------------------------------------------------------
CREATE TABLE urun_yorum_red_sebebi (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    sira            int NOT NULL DEFAULT 0
);

INSERT INTO urun_yorum_red_sebebi (kod, ad, sira) VALUES
('hakaret',        'Hakaret/kufur icerir',              10),
('spam',           'Spam/reklam',                       20),
('alakasiz',       'Urunle alakasiz',                   30),
('kisisel_veri',   'Kisisel veri icerir',               40),
('yanlis_bilgi',   'Yanlis/yaniltici bilgi',            50),
('kopya_icerik',   'Kopya icerik',                      60),
('dogrulanmamis',  'Dogrulanmis alici degil',           70),
('diger',          'Diger',                             99);

CREATE TABLE urun_yorum (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    urun_varyant_id bigint REFERENCES urun_varyant(id) ON DELETE SET NULL,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    siparis_id      bigint REFERENCES siparis(id) ON DELETE SET NULL,
    yildiz          smallint NOT NULL CHECK (yildiz BETWEEN 1 AND 5),
    baslik          varchar(200),
    icerik          text,
    alt_puanlar     jsonb,
    resim_urller    text[],
    -- Dogrulanmis alici (trigger ile otomatik)
    dogrulanmis_alici_mi boolean NOT NULL DEFAULT false,
    -- Moderasyon
    moderasyon_durumu varchar(20) NOT NULL DEFAULT 'onayda' CHECK (moderasyon_durumu IN (
        'onayda', 'onaylanmis', 'reddedilmis', 'spam', 'arsivlendi'
    )),
    red_sebebi_id   bigint REFERENCES urun_yorum_red_sebebi(id),
    red_aciklama    text,
    moderator_id    bigint REFERENCES kullanici(id),
    moderasyon_tarihi timestamptz,
    -- Etkilesim
    yardimli_sayisi int NOT NULL DEFAULT 0,
    yardimsiz_sayisi int NOT NULL DEFAULT 0,
    -- Satici cevabi
    saticinin_cevabi text,
    saticinin_cevap_tarihi timestamptz,
    saticinin_cevap_kullanici_id bigint REFERENCES kullanici(id),
    dil_kodu        char(2) NOT NULL DEFAULT 'tr',
    ip_adresi       inet,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_yorum_urun_onay ON urun_yorum(urun_id, moderasyon_durumu) WHERE silindi_mi = false;
CREATE INDEX idx_urun_yorum_cari ON urun_yorum(cari_id);
CREATE INDEX idx_urun_yorum_durum ON urun_yorum(moderasyon_durumu) WHERE silindi_mi = false;

CREATE TRIGGER trg_urun_yorum_guncelleme
    BEFORE UPDATE ON urun_yorum
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- FUNCTION + TRIGGER: urun_yorum_dogrulama_kontrol (v1 Sorun #6)
-- Yorum INSERT'te, bu cari bu urunu satin almis mi otomatik kontrol et.
CREATE OR REPLACE FUNCTION urun_yorum_dogrulama_kontrol() RETURNS trigger AS $$
BEGIN
    IF NEW.cari_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM siparis s
            JOIN siparis_kalem sk ON sk.siparis_id = s.id
            JOIN urun_varyant uv ON uv.id = sk.urun_varyant_id
            WHERE s.cari_id = NEW.cari_id
              AND uv.urun_id = NEW.urun_id
              AND s.durum IN ('teslim_edildi', 'tamamlandi')
              AND s.silindi_mi = false
        ) THEN
            NEW.dogrulanmis_alici_mi := true;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_urun_yorum_dogrulama
    BEFORE INSERT ON urun_yorum
    FOR EACH ROW EXECUTE FUNCTION urun_yorum_dogrulama_kontrol();

-- ----------------------------------------------------------------
-- URUN_YORUM_DURUM_LOG (v1 Sorun #10): Moderasyon audit trail
-- ----------------------------------------------------------------
CREATE TABLE urun_yorum_durum_log (
    id              bigserial PRIMARY KEY,
    urun_yorum_id   bigint NOT NULL REFERENCES urun_yorum(id) ON DELETE CASCADE,
    eski_durum      varchar(20),
    yeni_durum      varchar(20) NOT NULL,
    red_sebebi_id   bigint REFERENCES urun_yorum_red_sebebi(id),
    aciklama        text,
    kullanici_id    bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_yorum_durum_log_yorum
    ON urun_yorum_durum_log(urun_yorum_id, olusturma_tarihi DESC);

CREATE OR REPLACE FUNCTION urun_yorum_durum_log_trg() RETURNS trigger AS $$
BEGIN
    IF NEW.moderasyon_durumu IS DISTINCT FROM OLD.moderasyon_durumu THEN
        INSERT INTO urun_yorum_durum_log (
            urun_yorum_id, eski_durum, yeni_durum, red_sebebi_id, aciklama, kullanici_id
        ) VALUES (
            NEW.id, OLD.moderasyon_durumu, NEW.moderasyon_durumu,
            NEW.red_sebebi_id, NEW.red_aciklama, NEW.moderator_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_urun_yorum_durum_log
    AFTER UPDATE ON urun_yorum
    FOR EACH ROW EXECUTE FUNCTION urun_yorum_durum_log_trg();

-- ----------------------------------------------------------------
-- URUN_SORU
-- ----------------------------------------------------------------
CREATE TABLE urun_soru (
    id              bigserial PRIMARY KEY,
    urun_id         bigint NOT NULL REFERENCES urun(id) ON DELETE CASCADE,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    soru            text NOT NULL,
    cevap           text,
    cevaplayan_kullanici_id bigint REFERENCES kullanici(id),
    cevap_tarihi    timestamptz,
    durum           varchar(20) NOT NULL DEFAULT 'beklemede' CHECK (durum IN (
        'beklemede', 'cevaplandi', 'gizli', 'reddedilmis'
    )),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_urun_soru_urun ON urun_soru(urun_id, durum);

-- ----------------------------------------------------------------
-- ETICARET_SAYFA_TIP (v1 Sorun #9): Dinamik tip lookup
-- ----------------------------------------------------------------
CREATE TABLE eticaret_sayfa_tip (
    id              bigserial PRIMARY KEY,
    kod             varchar(50) UNIQUE NOT NULL CHECK (kod ~ '^[a-z][a-z0-9_]+$'),
    ad              varchar(200) NOT NULL,
    aciklama        text,
    sistem_mi       boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    sira            int NOT NULL DEFAULT 0
);

INSERT INTO eticaret_sayfa_tip (kod, ad, sistem_mi, sira) VALUES
('statik',             'Statik Sayfa',              true,  10),
('kvkk',               'KVKK/GDPR',                 true,  20),
('mesafeli_sozlesme',  'Mesafeli Satis Sozlesmesi', true,  30),
('teslimat',           'Teslimat Bilgileri',        true,  40),
('iade',               'Iade ve Degisim',           true,  50),
('gizlilik',           'Gizlilik Politikasi',       true,  60),
('sss',                'Sikca Sorulan Sorular',     true,  70),
('hakkimizda',         'Hakkimizda',                true,  80),
('iletisim',           'Iletisim',                  true,  90),
('b2b_sozlesme',       'B2B Sozlesme',              false, 100);

-- ----------------------------------------------------------------
-- ETICARET_SAYFA + ETICARET_SAYFA_CEVIRI (v1 Sorun #7)
-- ----------------------------------------------------------------
CREATE TABLE eticaret_sayfa (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    slug            varchar(200) NOT NULL UNIQUE,
    sayfa_tip_id    bigint NOT NULL REFERENCES eticaret_sayfa_tip(id),
    icerik_tipi     varchar(20) NOT NULL DEFAULT 'html' CHECK (icerik_tipi IN ('html', 'markdown', 'json_block')),
    kapak_resim_url text,
    -- SEO genel
    sitemap_dahil_mi boolean NOT NULL DEFAULT true,
    sitemap_oncelik  numeric(3, 2) DEFAULT 0.5,
    sitemap_degisim_sikligi varchar(20) CHECK (sitemap_degisim_sikligi IN ('always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never')),
    -- Yayin
    yayinlanmis_mi  boolean NOT NULL DEFAULT false,
    yayin_tarihi    timestamptz,
    yayindan_kaldirma_tarihi timestamptz,
    -- Audit
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eticaret_sayfa_yayinlanmis
    ON eticaret_sayfa(yayinlanmis_mi, sayfa_tip_id) WHERE yayinlanmis_mi = true;

CREATE TRIGGER trg_eticaret_sayfa_guncelleme
    BEFORE UPDATE ON eticaret_sayfa
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Ceviri tablosu (i18n)
CREATE TABLE eticaret_sayfa_ceviri (
    id              bigserial PRIMARY KEY,
    sayfa_id        bigint NOT NULL REFERENCES eticaret_sayfa(id) ON DELETE CASCADE,
    dil_kodu        char(2) NOT NULL,
    baslik          varchar(300) NOT NULL,
    kisa_ozet       varchar(500),
    icerik          text NOT NULL,
    -- SEO per-dil
    seo_baslik      varchar(300),
    seo_aciklama    text,
    seo_anahtar_kelimeler text[],
    og_resim_url    text,
    canonical_url   varchar(500),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sayfa_id, dil_kodu)
);
CREATE INDEX idx_eticaret_sayfa_ceviri_dil
    ON eticaret_sayfa_ceviri(dil_kodu, sayfa_id);

CREATE TRIGGER trg_eticaret_sayfa_ceviri_guncelleme
    BEFORE UPDATE ON eticaret_sayfa_ceviri
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- ETICARET_BLOG_YAZI + ETICARET_BLOG_YAZI_CEVIRI (v1 Sorun #7)
-- ----------------------------------------------------------------
CREATE TABLE eticaret_blog_yazi (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    slug            varchar(200) NOT NULL UNIQUE,
    icerik_tipi     varchar(20) NOT NULL DEFAULT 'html' CHECK (icerik_tipi IN ('html', 'markdown')),
    kapak_resim_url text,
    yazar_kullanici_id bigint REFERENCES kullanici(id),
    kategoriler     text[],
    etiketler       text[],
    ilgili_urun_idler bigint[],
    -- SEO genel
    sitemap_dahil_mi boolean NOT NULL DEFAULT true,
    sitemap_oncelik  numeric(3, 2) DEFAULT 0.5,
    -- Yayin
    yayinlanmis_mi  boolean NOT NULL DEFAULT false,
    yayin_tarihi    timestamptz,
    goruntuleme_sayisi bigint NOT NULL DEFAULT 0,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eticaret_blog_yayin ON eticaret_blog_yazi(yayinlanmis_mi, yayin_tarihi DESC);
CREATE INDEX idx_eticaret_blog_etiketler ON eticaret_blog_yazi USING gin(etiketler);

CREATE TRIGGER trg_eticaret_blog_yazi_guncelleme
    BEFORE UPDATE ON eticaret_blog_yazi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

CREATE TABLE eticaret_blog_yazi_ceviri (
    id              bigserial PRIMARY KEY,
    yazi_id         bigint NOT NULL REFERENCES eticaret_blog_yazi(id) ON DELETE CASCADE,
    dil_kodu        char(2) NOT NULL,
    baslik          varchar(300) NOT NULL,
    ozet            varchar(1000),
    icerik          text NOT NULL,
    seo_baslik      varchar(300),
    seo_aciklama    text,
    seo_anahtar_kelimeler text[],
    og_resim_url    text,
    canonical_url   varchar(500),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (yazi_id, dil_kodu)
);
CREATE INDEX idx_eticaret_blog_yazi_ceviri_dil
    ON eticaret_blog_yazi_ceviri(dil_kodu, yazi_id);

CREATE TRIGGER trg_eticaret_blog_yazi_ceviri_guncelleme
    BEFORE UPDATE ON eticaret_blog_yazi_ceviri
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- ETICARET_BANNER
-- ----------------------------------------------------------------
CREATE TABLE eticaret_banner (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50),
    ad              varchar(200) NOT NULL,
    dil_kodu        char(2) NOT NULL DEFAULT 'tr',
    konum           varchar(50) NOT NULL CHECK (konum IN (
        'anasayfa_slider', 'anasayfa_banner', 'kategori_banner', 'kampanya_sayfasi',
        'arama_banner', 'popup', 'duyuru_bandi', 'footer_banner'
    )),
    kategori_id     bigint REFERENCES kategori(id) ON DELETE SET NULL,
    baslik          varchar(300),
    alt_baslik      varchar(300),
    metin           text,
    buton_metin     varchar(100),
    link_url        varchar(500),
    link_hedef      varchar(20) NOT NULL DEFAULT '_self',
    resim_url       text NOT NULL,
    mobil_resim_url text,
    tablet_resim_url text,
    video_url       text,
    cihaz           varchar(20) NOT NULL DEFAULT 'tumu' CHECK (cihaz IN ('tumu', 'masaustu', 'mobil', 'tablet')),
    baslangic_tarihi timestamptz,
    bitis_tarihi    timestamptz,
    sira            int NOT NULL DEFAULT 0,
    goruntuleme_sayisi bigint NOT NULL DEFAULT 0,
    tiklama_sayisi  bigint NOT NULL DEFAULT 0,
    aktif_mi        boolean NOT NULL DEFAULT true,
    silindi_mi      boolean NOT NULL DEFAULT false,
    silinme_tarihi  timestamptz,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eticaret_banner_konum_aktif
    ON eticaret_banner(konum, sira) WHERE aktif_mi = true AND silindi_mi = false;
CREATE INDEX idx_eticaret_banner_kategori ON eticaret_banner(kategori_id)
    WHERE kategori_id IS NOT NULL AND aktif_mi = true;

CREATE TRIGGER trg_eticaret_banner_guncelleme
    BEFORE UPDATE ON eticaret_banner
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- ETICARET_HABER_BULTENI_ABONE
-- ----------------------------------------------------------------
CREATE TABLE eticaret_haber_bulteni_abone (
    id              bigserial PRIMARY KEY,
    email           citext UNIQUE NOT NULL,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    ad              varchar(200),
    dil_kodu        char(2) NOT NULL DEFAULT 'tr',
    kaynak          varchar(50),
    onay_verildi_mi boolean NOT NULL DEFAULT false,
    onay_tarihi     timestamptz,
    cift_opt_in_token varchar(100),
    abonelikten_cikti_mi boolean NOT NULL DEFAULT false,
    abonelikten_cikis_tarihi timestamptz,
    etiketler       text[],
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_haber_bulteni_aktif ON eticaret_haber_bulteni_abone(email)
    WHERE onay_verildi_mi = true AND abonelikten_cikti_mi = false;

-- ----------------------------------------------------------------
-- ETICARET_ARAMA_LOG + populer arama view (v1 Sorun #9)
-- ----------------------------------------------------------------
CREATE TABLE eticaret_arama_log (
    id              bigserial PRIMARY KEY,
    arama_terim     varchar(500) NOT NULL,
    cari_id         bigint REFERENCES cari(id) ON DELETE SET NULL,
    oturum_anahtari varchar(120),
    sonuc_sayisi    int,
    tiklanan_urun_id bigint REFERENCES urun(id) ON DELETE SET NULL,
    sonuc_yok_mu    boolean NOT NULL DEFAULT false,
    dil_kodu        char(2) NOT NULL DEFAULT 'tr',
    ip_adresi       inet,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eticaret_arama_log_terim ON eticaret_arama_log USING gin (arama_terim gin_trgm_ops);
CREATE INDEX idx_eticaret_arama_log_sonuc_yok ON eticaret_arama_log(arama_terim)
    WHERE sonuc_yok_mu = true;
CREATE INDEX idx_eticaret_arama_log_tarih ON eticaret_arama_log(olusturma_tarihi DESC);
CREATE INDEX idx_eticaret_arama_log_cari ON eticaret_arama_log(cari_id) WHERE cari_id IS NOT NULL;

-- Populer arama view (son 30 gun)
CREATE OR REPLACE VIEW vw_eticaret_populer_arama AS
SELECT
    lower(arama_terim)           AS arama_terim,
    COUNT(*)                     AS arama_sayisi,
    COUNT(DISTINCT COALESCE(cari_id::text, oturum_anahtari)) AS benzersiz_kullanici,
    SUM(CASE WHEN sonuc_yok_mu THEN 1 ELSE 0 END) AS sonucsuz_sayisi,
    COUNT(*) FILTER (WHERE tiklanan_urun_id IS NOT NULL) AS tiklama_sayisi,
    MAX(olusturma_tarihi)        AS son_arama
FROM eticaret_arama_log
WHERE olusturma_tarihi > now() - interval '30 days'
GROUP BY lower(arama_terim)
ORDER BY arama_sayisi DESC;

-- ----------------------------------------------------------------
-- VIEW: vw_urun_yorum_ozet
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_urun_yorum_ozet AS
SELECT
    urun_id,
    COUNT(*)                            AS yorum_sayisi,
    ROUND(AVG(yildiz)::numeric, 2)      AS ortalama_yildiz,
    COUNT(*) FILTER (WHERE yildiz = 5)  AS bes_yildiz,
    COUNT(*) FILTER (WHERE yildiz = 4)  AS dort_yildiz,
    COUNT(*) FILTER (WHERE yildiz = 3)  AS uc_yildiz,
    COUNT(*) FILTER (WHERE yildiz = 2)  AS iki_yildiz,
    COUNT(*) FILTER (WHERE yildiz = 1)  AS bir_yildiz,
    COUNT(*) FILTER (WHERE dogrulanmis_alici_mi = true) AS dogrulanmis_sayisi
FROM urun_yorum
WHERE moderasyon_durumu = 'onaylanmis' AND silindi_mi = false
GROUP BY urun_id;

-- ----------------------------------------------------------------
-- VIEW: vw_terkedilen_sepet (v1 Sorun #8 genisletildi)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_terkedilen_sepet AS
SELECT
    s.id                AS sepet_id,
    s.public_id,
    s.cari_id,
    c.portal_email      AS musteri_email,
    c.unvan             AS musteri_unvan,
    s.toplam_tutar,
    s.para_birimi_kod,
    s.son_aktivite,
    s.terkedilme_email_gonderildi_mi,
    s.terkedilme_email_zamani,
    (SELECT COUNT(*) FROM sepet_kalem sk WHERE sk.sepet_id = s.id) AS kalem_sayisi,
    extract(epoch FROM (now() - s.son_aktivite)) / 3600 AS saat_terkedilmis,
    CASE
        WHEN s.cari_id IS NULL THEN 'anonim'
        ELSE 'auth'
    END                 AS sepet_tipi
FROM sepet s
LEFT JOIN cari c ON c.id = s.cari_id
WHERE s.durum = 'aktif'
  AND s.silindi_mi = false
  AND s.son_aktivite < now() - interval '1 hour'
  AND EXISTS (SELECT 1 FROM sepet_kalem sk WHERE sk.sepet_id = s.id)
  -- Yalnizca kimligi bilinen (hedefi olan) sepetler email alabilir
  AND s.cari_id IS NOT NULL;

-- ============================================================
-- ENTEGRASYON + OPERASYON NOTLARI
-- ============================================================
-- 1. REZERVASYON POLITIKASI (v1 Sorun #4):
--    - Anonim sepet (cari_id IS NULL) KESINLIKLE rezervasyon yaratmaz.
--    - Auth sepet, sadece `rezervasyon_aktif_mi=true` yapildiginda rezervasyon
--      tutar. Bu flag checkout adiminda true yapilir.
--    - CHECK constraint (rezervasyon_aktif_mi = false OR cari_id IS NOT NULL)
--      anonim sepet rezervasyonunu DB seviyesinde onler.
--
-- 2. CLEANUP CRON (v1 Sorun #8 — modul 16):
--    - Anonim sepet: son_aktivite < now() - interval '7 days' -> soft delete
--    - Auth sepet:   son_aktivite < now() - interval '30 days' -> terkedildi
--    - idx_sepet_temizleme_anonim / idx_sepet_temizleme_auth index'leri bu
--      cron job icin.
--
-- 3. SEPET TOPLAM:
--    - sepet_toplam_hesapla trigger sepet_kalem AFTER INSERT/UPDATE/DELETE'te
--      calisir. Kargo + kupon + kampanya iskontolarini header'da hesaplar.
--    - Kupon/kampanya iskontosu degistiginde app katmani sepet UPDATE ile
--      kupon_iskonto/kampanya_iskonto kolonlarini guncellemeli; toplam_tutar
--      sepet_kalem tetikleyicisiyle veya yeni kayit eklenince yeniden hesaplanir.
--
-- 4. KUPON VALIDATION (v1 Sorun #2):
--    - vw_kupon_etkin hizli on-kontrol. Asil validation app katmaninda:
--      (a) sepet toplam >= minimum_sepet_tutari
--      (b) sepete gecerli_kategori_idler'den urun var mi
--      (c) haric_urun_idler bos mi
--      (d) kullanim_limit_toplam / kullanim_limit_per_musteri asilmiyor mu
--      (e) bilesik_kullanim_mi=false ise baska kupon sepette yok mu
--      (f) ilk_alisveris_mi / sadece_yeni_musteri_mi kontrol
--
-- 5. KAMPANYA KURAL MOTORU (v1 Sorun #5):
--    - kampanya_kural.kosul_jsonb formati tablo yorumunda.
--    - CHECK constraint jsonb object olmasini zorlar.
--    - kampanya_kural_dogrula() fonksiyonu ile temel format test.
--    - Ileri validation: app katmaninda Zod/TypeScript schema.
