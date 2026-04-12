-- ============================================================
-- MODÜL 10: ÇİFT GİRİŞLİ MUHASEBE (TR Tekdüzen Hesap Planı)
-- ============================================================
-- REFACTOR v2 — Eleştirmen raporu (10-muhasebe-elestiri-v1)
-- bulgularına göre yeniden düzenlendi:
--   #1 Borç=Alacak DB trigger'ı (yevmiye_satir AFTER + fis BEFORE UPDATE)
--   #2 Çoklu KDV oranı: 391.01/10/20 alt hesaplar + fatura_kalem_vergi'den
--      oran bazlı gruplama
--   #3 Satış maliyet kaydı (621/153) satış faturasında otomatik
--   #4 vw_bilanco_ozet grup bazlı + vw_bilanco_detay ayrıştırma
--   #5 donem_kapat() + donem_ac() fonksiyonları
--   #7 muhasebe_ayar_eslesme tablosu — hesap kodları artık konfigüre
--   Ayrıca: mizan_snapshot_olustur, yevmiye_virman_fisi_olustur,
--   yevmiye_pos_tahsilat_fisi_olustur, kayit_girilebilir kontrolü trigger,
--   kur_farki_hesapla, iade kaynak branch.
--
-- PHP v1'de yoktu — sadece "hareket" tablosu vardı. v2'de
-- profesyonel çift girişli muhasebe doğuştan:
--   • TR Tekdüzen Hesap Planı (seed — alt hesaplarla)
--   • Hiyerarşik hesap_plani
--   • Yevmiye fişi + satır (SUM(borç)=SUM(alacak) DB garantili)
--   • Masraf merkezi
--   • Dönem yönetimi + açılış/kapanış fonksiyonları
--   • Mizan / bilanço / gelir tablosu view'ları
--   • Belgelerden otomatik yevmiye üretimi (konfigüre edilebilir hesaplar)
-- ============================================================

-- ----------------------------------------------------------------
-- HESAP_PLANI: Hiyerarşik, TR Tekdüzen standardı
-- ----------------------------------------------------------------
CREATE TABLE hesap_plani (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(300) NOT NULL,
    ad_en           varchar(300),
    ust_hesap_id    bigint REFERENCES hesap_plani(id),
    seviye          smallint NOT NULL CHECK (seviye BETWEEN 1 AND 7),
    tip             varchar(20) NOT NULL CHECK (tip IN (
        'aktif', 'pasif', 'gelir', 'gider', 'maliyet', 'sonuc', 'nazim'
    )),
    grup            varchar(40) CHECK (grup IN (
        'donen_varlik', 'duran_varlik',
        'kisa_vade_yabanci_kaynak', 'uzun_vade_yabanci_kaynak',
        'oz_kaynak', 'gelir_tablosu', 'maliyet', 'nazim'
    )),
    normal_bakiye   varchar(10) NOT NULL CHECK (normal_bakiye IN ('borc', 'alacak')),
    kullanim_tipi   varchar(20) NOT NULL DEFAULT 'ana' CHECK (kullanim_tipi IN (
        'anahtar', 'ana', 'alt', 'yardimci'
    )),
    para_birimi_kod char(3) REFERENCES para_birimi(kod),
    doviz_takipli_mi boolean NOT NULL DEFAULT false,
    aktif_mi        boolean NOT NULL DEFAULT true,
    sistem_hesabi_mi boolean NOT NULL DEFAULT false,
    kayit_girilebilir_mi boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    guncelleyen_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hesap_plani_ust ON hesap_plani(ust_hesap_id);
CREATE INDEX idx_hesap_plani_tip ON hesap_plani(tip);
CREATE INDEX idx_hesap_plani_grup ON hesap_plani(grup);
CREATE INDEX idx_hesap_plani_kod_prefix ON hesap_plani(kod varchar_pattern_ops);

CREATE TRIGGER trg_hesap_plani_guncelleme
    BEFORE UPDATE ON hesap_plani
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- SEED: TR Tekdüzen Hesap Planı
-- ----------------------------------------------------------------
-- SINIF 1 — Dönen Varlıklar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('1', 'Dönen Varlıklar', 'aktif', 'donen_varlik', 'borc', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('10', 'Hazır Değerler', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false),
('11', 'Menkul Kıymetler', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false),
('12', 'Ticari Alacaklar', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false),
('13', 'Diğer Alacaklar', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false),
('15', 'Stoklar', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false),
('19', 'Diğer Dönen Varlıklar', 'aktif', 'donen_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='1'), true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('100', 'Kasa', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='10'), true),
('101', 'Alınan Çekler', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='10'), true),
('102', 'Bankalar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='10'), true),
('103', 'Verilen Çekler ve Ödeme Emirleri (-)', 'aktif', 'donen_varlik', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='10'), true),
('108', 'Diğer Hazır Değerler', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='10'), true),
('110', 'Hisse Senetleri', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='11'), true),
('120', 'Alıcılar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('121', 'Alacak Senetleri', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('126', 'Verilen Depozito ve Teminatlar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('127', 'Diğer Ticari Alacaklar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('128', 'Şüpheli Ticari Alacaklar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('129', 'Şüpheli Ticari Alacaklar Karşılığı (-)', 'aktif', 'donen_varlik', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='12'), true),
('131', 'Ortaklardan Alacaklar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='13'), true),
('136', 'Diğer Çeşitli Alacaklar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='13'), true),
('150', 'İlk Madde ve Malzeme', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('151', 'Yarı Mamüller', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('152', 'Mamüller', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('153', 'Ticari Mallar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('157', 'Diğer Stoklar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('159', 'Verilen Sipariş Avansları', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='15'), true),
('180', 'Gelecek Aylara Ait Giderler', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true),
('191', 'İndirilecek KDV', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true),
('192', 'Diğer KDV', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true),
('193', 'Peşin Ödenen Vergiler ve Fonlar', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true),
('195', 'İş Avansları', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true),
('196', 'Personel Avansları', 'aktif', 'donen_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='19'), true);

-- Alt hesap örnekleri (Sorun #11) — kayit_girilebilir_mi = true
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id) VALUES
('100.01', 'Merkez Kasa', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='100')),
('100.02', 'Şube Kasa', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='100')),
('102.01', 'Banka - TL', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='102')),
('102.02', 'Banka - USD', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='102')),
('120.01', 'Yurt İçi Alıcılar', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='120')),
('120.02', 'Yurt Dışı Alıcılar', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='120'));

-- KDV alt hesapları (Sorun #2) — oran bazlı ayrım
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id) VALUES
('191.01', 'İndirilecek KDV %1',  'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='191')),
('191.10', 'İndirilecek KDV %10', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='191')),
('191.20', 'İndirilecek KDV %20', 'aktif', 'donen_varlik', 'borc', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='191'));

-- SINIF 2 — Duran Varlıklar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('2', 'Duran Varlıklar', 'aktif', 'duran_varlik', 'borc', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('25', 'Maddi Duran Varlıklar', 'aktif', 'duran_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='2'), true, false),
('26', 'Maddi Olmayan Duran Varlıklar', 'aktif', 'duran_varlik', 'borc', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='2'), true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('250', 'Arazi ve Arsalar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('252', 'Binalar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('253', 'Tesis, Makine ve Cihazlar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('254', 'Taşıtlar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('255', 'Demirbaşlar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('257', 'Birikmiş Amortismanlar (-)', 'aktif', 'duran_varlik', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='25'), true),
('260', 'Haklar', 'aktif', 'duran_varlik', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='26'), true),
('268', 'Birikmiş Amortismanlar (-)', 'aktif', 'duran_varlik', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='26'), true);

-- SINIF 3 — Kısa Vadeli Yabancı Kaynaklar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('3', 'Kısa Vadeli Yabancı Kaynaklar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('30', 'Mali Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='3'), true, false),
('32', 'Ticari Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='3'), true, false),
('33', 'Diğer Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='3'), true, false),
('36', 'Ödenecek Vergi ve Diğer Yükümlülükler', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='3'), true, false),
('39', 'Diğer Kısa Vadeli Yabancı Kaynaklar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 2, 'anahtar', (SELECT id FROM hesap_plani WHERE kod='3'), true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('300', 'Banka Kredileri', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='30'), true),
('303', 'Uzun Vadeli Kredilerin Anapara Taksitleri ve Faizleri', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='30'), true),
('320', 'Satıcılar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='32'), true),
('321', 'Borç Senetleri', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='32'), true),
('326', 'Alınan Depozito ve Teminatlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='32'), true),
('329', 'Diğer Ticari Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='32'), true),
('331', 'Ortaklara Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='33'), true),
('335', 'Personele Borçlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='33'), true),
('340', 'Alınan Sipariş Avansları', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='33'), true),
('360', 'Ödenecek Vergi ve Fonlar', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='36'), true),
('361', 'Ödenecek Sosyal Güvenlik Kesintileri', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='36'), true),
('391', 'Hesaplanan KDV', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='39'), true),
('392', 'Diğer KDV', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='39'), true);

-- KDV oran bazlı alt hesaplar (Sorun #2)
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id) VALUES
('391.01', 'Hesaplanan KDV %1',  'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='391')),
('391.10', 'Hesaplanan KDV %10', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='391')),
('391.20', 'Hesaplanan KDV %20', 'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='391')),
('392.00', 'Hesaplanan ÖTV',     'pasif', 'kisa_vade_yabanci_kaynak', 'alacak', 4, 'alt', (SELECT id FROM hesap_plani WHERE kod='392'));

-- SINIF 4 — Uzun Vadeli Yabancı Kaynaklar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('4', 'Uzun Vadeli Yabancı Kaynaklar', 'pasif', 'uzun_vade_yabanci_kaynak', 'alacak', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('400', 'Banka Kredileri', 'pasif', 'uzun_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='4'), true),
('420', 'Satıcılar', 'pasif', 'uzun_vade_yabanci_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='4'), true);

-- SINIF 5 — Öz Kaynaklar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('5', 'Öz Kaynaklar', 'pasif', 'oz_kaynak', 'alacak', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('500', 'Sermaye', 'pasif', 'oz_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true),
('540', 'Yasal Yedekler', 'pasif', 'oz_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true),
('570', 'Geçmiş Yıllar Kârları', 'pasif', 'oz_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true),
('580', 'Geçmiş Yıllar Zararları (-)', 'pasif', 'oz_kaynak', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true),
('590', 'Dönem Net Kârı', 'pasif', 'oz_kaynak', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true),
('591', 'Dönem Net Zararı (-)', 'pasif', 'oz_kaynak', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='5'), true);

-- SINIF 6 — Gelir Tablosu Hesapları
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('6', 'Gelir Tablosu Hesapları', 'gelir', 'gelir_tablosu', 'alacak', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('600', 'Yurt İçi Satışlar', 'gelir', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('601', 'Yurt Dışı Satışlar', 'gelir', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('602', 'Diğer Gelirler', 'gelir', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('610', 'Satıştan İadeler (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('611', 'Satış İskontoları (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('621', 'Satılan Ticari Malların Maliyeti (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('632', 'Genel Yönetim Giderleri (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('642', 'Faiz Gelirleri', 'gelir', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('646', 'Kambiyo Kârları', 'gelir', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('653', 'Komisyon Giderleri (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('656', 'Kambiyo Zararları (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('660', 'Kısa Vadeli Borçlanma Giderleri (-)', 'gider', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('690', 'Dönem Kârı veya Zararı', 'sonuc', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('691', 'Dönem Kârı Vergi ve Diğer Yasal Yükümlülük Karşılıkları (-)', 'sonuc', 'gelir_tablosu', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true),
('692', 'Dönem Net Kârı veya Zararı', 'sonuc', 'gelir_tablosu', 'alacak', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='6'), true);

-- SINIF 7 — Maliyet Hesapları
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('7', 'Maliyet Hesapları', 'maliyet', 'maliyet', 'borc', 1, 'anahtar', true, false);

INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, ust_hesap_id, sistem_hesabi_mi) VALUES
('770', 'Genel Yönetim Giderleri', 'maliyet', 'maliyet', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='7'), true),
('760', 'Pazarlama Satış ve Dağıtım Giderleri', 'maliyet', 'maliyet', 'borc', 3, 'ana', (SELECT id FROM hesap_plani WHERE kod='7'), true);

-- SINIF 9 — Nazım Hesaplar
INSERT INTO hesap_plani (kod, ad, tip, grup, normal_bakiye, seviye, kullanim_tipi, sistem_hesabi_mi, kayit_girilebilir_mi) VALUES
('9', 'Nazım Hesaplar', 'nazim', 'nazim', 'borc', 1, 'anahtar', true, false);

-- ----------------------------------------------------------------
-- SORUN #7: MUHASEBE_AYAR_ESLESME — konfigüre edilebilir hesap kodları
-- ----------------------------------------------------------------
-- `yevmiye_otomatik_olustur` artık hardcoded '120', '600', '391' yerine
-- bu tablodan okur. Multi-firma ve vergi oranı bazlı override destekli.
CREATE TABLE muhasebe_ayar_eslesme (
    id              bigserial PRIMARY KEY,
    eslesme_kodu    varchar(100) NOT NULL,   -- 'satis_geliri', 'satis_alicilar', 'satis_kdv', 'alis_cogs'
    ad              varchar(200) NOT NULL,
    aciklama        text,
    hesap_plani_id  bigint NOT NULL REFERENCES hesap_plani(id),
    -- Opsiyonel koşul filtresi (JSONB) — aynı kod için birden fazla eşleşme
    -- olursa öncelikle koşul eşleşenleri seç. Örn: {"vergi_tipi":"KDV","oran":20}
    kosul_filtre    jsonb,
    oncelik         int NOT NULL DEFAULT 0,
    firma_id        bigint REFERENCES firma(id),  -- NULL = tüm firmalar
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_muhasebe_ayar_eslesme_kod ON muhasebe_ayar_eslesme(eslesme_kodu) WHERE aktif_mi = true;
CREATE INDEX idx_muhasebe_ayar_eslesme_firma ON muhasebe_ayar_eslesme(firma_id);

CREATE TRIGGER trg_muhasebe_ayar_eslesme_guncelleme
    BEFORE UPDATE ON muhasebe_ayar_eslesme
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- Seed: Minimum 20 standart eşleşme
INSERT INTO muhasebe_ayar_eslesme (eslesme_kodu, ad, hesap_plani_id) VALUES
-- Kasa / Banka / Çek
('kasa_varsayilan',       'Kasa (varsayılan)',       (SELECT id FROM hesap_plani WHERE kod='100')),
('banka_varsayilan',      'Banka (varsayılan)',      (SELECT id FROM hesap_plani WHERE kod='102')),
('pos_varsayilan',        'POS (varsayılan)',        (SELECT id FROM hesap_plani WHERE kod='108')),
('alinan_cek_portfoy',    'Alınan Çek Portföyü',     (SELECT id FROM hesap_plani WHERE kod='101')),
('verilen_cek_portfoy',   'Verilen Çek Portföyü',    (SELECT id FROM hesap_plani WHERE kod='103')),
('alacak_senedi',         'Alacak Senetleri',        (SELECT id FROM hesap_plani WHERE kod='121')),
-- Cari
('satis_alicilar',        'Satış → Alıcılar',        (SELECT id FROM hesap_plani WHERE kod='120')),
('alis_saticilar',        'Alış → Satıcılar',        (SELECT id FROM hesap_plani WHERE kod='320')),
-- Gelir / Gider
('satis_geliri',          'Satış Geliri (Yurt İçi)', (SELECT id FROM hesap_plani WHERE kod='600')),
('satis_geliri_yurtdisi', 'Satış Geliri (Yurt Dışı)',(SELECT id FROM hesap_plani WHERE kod='601')),
('satis_iade',            'Satıştan İadeler',        (SELECT id FROM hesap_plani WHERE kod='610')),
('satis_iskonto',         'Satış İskontoları',       (SELECT id FROM hesap_plani WHERE kod='611')),
-- Maliyet (COGS)
('ticari_mal_stok',       'Ticari Mallar (Stok)',    (SELECT id FROM hesap_plani WHERE kod='153')),
('satilan_mal_maliyeti',  'Satılan Ticari Mal Mal.', (SELECT id FROM hesap_plani WHERE kod='621')),
-- Giderler
('genel_gider',           'Genel Yönetim Giderleri', (SELECT id FROM hesap_plani WHERE kod='770')),
('komisyon_gideri',       'Komisyon Giderleri',      (SELECT id FROM hesap_plani WHERE kod='653')),
('kur_farki_gelir',       'Kambiyo Kârları',         (SELECT id FROM hesap_plani WHERE kod='646')),
('kur_farki_gider',       'Kambiyo Zararları',       (SELECT id FROM hesap_plani WHERE kod='656')),
-- Dönem sonu
('donem_kar_zarar',       'Dönem Kârı/Zararı',       (SELECT id FROM hesap_plani WHERE kod='690')),
('donem_net_kar',         'Dönem Net Kârı',          (SELECT id FROM hesap_plani WHERE kod='590')),
('donem_net_zarar',       'Dönem Net Zararı',        (SELECT id FROM hesap_plani WHERE kod='591'));

-- KDV oran bazlı eşleşmeler (kosul_filtre kullanımı)
INSERT INTO muhasebe_ayar_eslesme (eslesme_kodu, ad, hesap_plani_id, kosul_filtre, oncelik) VALUES
('satis_kdv', 'Satış KDV %1',  (SELECT id FROM hesap_plani WHERE kod='391.01'), '{"vergi_tipi":"KDV","oran":1}'::jsonb, 10),
('satis_kdv', 'Satış KDV %10', (SELECT id FROM hesap_plani WHERE kod='391.10'), '{"vergi_tipi":"KDV","oran":10}'::jsonb, 10),
('satis_kdv', 'Satış KDV %20', (SELECT id FROM hesap_plani WHERE kod='391.20'), '{"vergi_tipi":"KDV","oran":20}'::jsonb, 10),
('satis_kdv', 'Satış KDV (varsayılan)', (SELECT id FROM hesap_plani WHERE kod='391'), NULL, 0),
('satis_otv', 'Satış ÖTV',     (SELECT id FROM hesap_plani WHERE kod='392.00'), '{"vergi_tipi":"OTV"}'::jsonb, 10),
('alis_kdv',  'Alış KDV %1',   (SELECT id FROM hesap_plani WHERE kod='191.01'), '{"vergi_tipi":"KDV","oran":1}'::jsonb, 10),
('alis_kdv',  'Alış KDV %10',  (SELECT id FROM hesap_plani WHERE kod='191.10'), '{"vergi_tipi":"KDV","oran":10}'::jsonb, 10),
('alis_kdv',  'Alış KDV %20',  (SELECT id FROM hesap_plani WHERE kod='191.20'), '{"vergi_tipi":"KDV","oran":20}'::jsonb, 10),
('alis_kdv',  'Alış KDV (varsayılan)',  (SELECT id FROM hesap_plani WHERE kod='191'), NULL, 0);

-- Yardımcı: eşleşme çözüm fonksiyonu
CREATE OR REPLACE FUNCTION muhasebe_hesap_kodu_bul(
    p_eslesme_kodu varchar,
    p_vergi_tipi   varchar DEFAULT NULL,
    p_oran         numeric DEFAULT NULL,
    p_firma_id     bigint  DEFAULT NULL
) RETURNS varchar AS $$
DECLARE
    v_hesap_id bigint;
    v_kod varchar;
BEGIN
    SELECT me.hesap_plani_id INTO v_hesap_id
    FROM muhasebe_ayar_eslesme me
    WHERE me.eslesme_kodu = p_eslesme_kodu
      AND me.aktif_mi = true
      AND (me.firma_id IS NULL OR me.firma_id = p_firma_id)
      AND (
          me.kosul_filtre IS NULL
          OR (
              (p_vergi_tipi IS NULL OR me.kosul_filtre->>'vergi_tipi' IS NULL
                OR me.kosul_filtre->>'vergi_tipi' = p_vergi_tipi)
              AND
              (p_oran IS NULL OR me.kosul_filtre->>'oran' IS NULL
                OR (me.kosul_filtre->>'oran')::numeric = p_oran)
          )
      )
    ORDER BY
        (me.kosul_filtre IS NOT NULL)::int DESC,  -- koşullu öncelikli
        me.oncelik DESC,
        me.id ASC
    LIMIT 1;

    IF v_hesap_id IS NULL THEN
        RAISE EXCEPTION 'Muhasebe eslesmesi bulunamadi: eslesme_kodu=% (vergi_tipi=% oran=%)',
            p_eslesme_kodu, p_vergi_tipi, p_oran;
    END IF;

    SELECT kod INTO v_kod FROM hesap_plani WHERE id = v_hesap_id;
    RETURN v_kod;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------
-- MASRAF_MERKEZI: Departman/proje/şube bazlı
-- ----------------------------------------------------------------
CREATE TABLE masraf_merkezi (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    kod             varchar(50) UNIQUE NOT NULL,
    ad              varchar(200) NOT NULL,
    tip             varchar(20) NOT NULL CHECK (tip IN ('departman', 'proje', 'sube', 'urun_grup', 'diger')),
    ust_merkez_id   bigint REFERENCES masraf_merkezi(id),
    magaza_id       bigint REFERENCES magaza(id),
    firma_id        bigint REFERENCES firma(id),
    aciklama        text,
    aktif_mi        boolean NOT NULL DEFAULT true,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_masraf_merkezi_ust ON masraf_merkezi(ust_merkez_id);

CREATE TRIGGER trg_masraf_merkezi_guncelleme
    BEFORE UPDATE ON masraf_merkezi
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- MUHASEBE_DONEM: Mali yıl / dönem yönetimi
-- ----------------------------------------------------------------
CREATE TABLE muhasebe_donem (
    id              bigserial PRIMARY KEY,
    donem_kodu      varchar(20) UNIQUE NOT NULL,
    ad              varchar(100) NOT NULL,
    baslangic_tarihi date NOT NULL,
    bitis_tarihi    date NOT NULL,
    durum           varchar(20) NOT NULL DEFAULT 'acik' CHECK (durum IN (
        'acik', 'kapali', 'kilitli'
    )),
    kapanis_tarihi  timestamptz,
    kapayan_kullanici_id bigint REFERENCES kullanici(id),
    aciklama        text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
    CHECK (bitis_tarihi >= baslangic_tarihi)
);
CREATE INDEX idx_muhasebe_donem_tarih ON muhasebe_donem(baslangic_tarihi, bitis_tarihi);
CREATE INDEX idx_muhasebe_donem_durum ON muhasebe_donem(durum);

CREATE TRIGGER trg_muhasebe_donem_guncelleme
    BEFORE UPDATE ON muhasebe_donem
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

INSERT INTO muhasebe_donem (donem_kodu, ad, baslangic_tarihi, bitis_tarihi) VALUES
('2026', '2026 Mali Yılı', '2026-01-01', '2026-12-31');

-- ----------------------------------------------------------------
-- YEVMIYE_FIS_SEQ (Sorun #8) — race condition önlemi
-- ----------------------------------------------------------------
CREATE SEQUENCE yevmiye_fis_seq START 1;

-- ----------------------------------------------------------------
-- YEVMIYE_FIS: Defter-i Kebir başlık kaydı
-- ----------------------------------------------------------------
CREATE TABLE yevmiye_fis (
    id              bigserial PRIMARY KEY,
    public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    fis_no          varchar(50) UNIQUE NOT NULL,
    fis_tipi        varchar(20) NOT NULL CHECK (fis_tipi IN (
        'acilis', 'mahsup', 'tahsil', 'tediye', 'kapanis', 'duzeltme'
    )),
    tarih           date NOT NULL,
    aciklama        text,
    durum           varchar(20) NOT NULL DEFAULT 'taslak' CHECK (durum IN (
        'taslak', 'kayit', 'kontrol_edilmis', 'kilitli', 'iptal'
    )),
    kaynak_belge_tipi varchar(30),
    kaynak_belge_id bigint,
    donem_id        bigint NOT NULL REFERENCES muhasebe_donem(id),
    para_birimi_kod char(3) NOT NULL DEFAULT 'TRY' REFERENCES para_birimi(kod),
    toplam_borc     numeric(18, 4) NOT NULL DEFAULT 0,
    toplam_alacak   numeric(18, 4) NOT NULL DEFAULT 0,
    olusturan_kullanici_id bigint REFERENCES kullanici(id),
    kontrol_eden_kullanici_id bigint REFERENCES kullanici(id),
    kontrol_tarihi  timestamptz,
    kilit_tarihi    timestamptz,
    iptal_tarihi    timestamptz,
    iptal_nedeni    text,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_yevmiye_fis_tarih ON yevmiye_fis(tarih DESC);
CREATE INDEX idx_yevmiye_fis_durum ON yevmiye_fis(durum);
CREATE INDEX idx_yevmiye_fis_donem ON yevmiye_fis(donem_id);
CREATE INDEX idx_yevmiye_fis_kaynak ON yevmiye_fis(kaynak_belge_tipi, kaynak_belge_id) WHERE kaynak_belge_id IS NOT NULL;
CREATE INDEX idx_yevmiye_fis_no_trgm ON yevmiye_fis USING gin (fis_no gin_trgm_ops);

CREATE TRIGGER trg_yevmiye_fis_guncelleme
    BEFORE UPDATE ON yevmiye_fis
    FOR EACH ROW EXECUTE FUNCTION guncelle_guncelleme_tarihi();

-- ----------------------------------------------------------------
-- YEVMIYE_SATIR: Borç/alacak satırları
-- ----------------------------------------------------------------
CREATE TABLE yevmiye_satir (
    id              bigserial PRIMARY KEY,
    fis_id          bigint NOT NULL REFERENCES yevmiye_fis(id) ON DELETE CASCADE,
    sira            int NOT NULL,
    hesap_id        bigint NOT NULL REFERENCES hesap_plani(id),
    aciklama        text,
    borc            numeric(18, 4) NOT NULL DEFAULT 0 CHECK (borc >= 0),
    alacak          numeric(18, 4) NOT NULL DEFAULT 0 CHECK (alacak >= 0),
    CONSTRAINT chk_yevmiye_satir_borc_xor_alacak
        CHECK ((borc > 0 AND alacak = 0) OR (borc = 0 AND alacak > 0)),
    doviz_borc      numeric(18, 4),
    doviz_alacak    numeric(18, 4),
    para_birimi_kod char(3) NOT NULL DEFAULT 'TRY' REFERENCES para_birimi(kod),
    kur             numeric(18, 6) NOT NULL DEFAULT 1,
    cari_id         bigint REFERENCES cari(id),
    hesap_operasyonel_id bigint REFERENCES hesap(id),
    masraf_merkezi_id bigint REFERENCES masraf_merkezi(id),
    miktar          numeric(18, 4),
    belge_no        varchar(100),
    belge_tarihi    date,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fis_id, sira)
);
CREATE INDEX idx_yevmiye_satir_fis ON yevmiye_satir(fis_id);
CREATE INDEX idx_yevmiye_satir_hesap ON yevmiye_satir(hesap_id);
CREATE INDEX idx_yevmiye_satir_cari ON yevmiye_satir(cari_id) WHERE cari_id IS NOT NULL;
CREATE INDEX idx_yevmiye_satir_masraf ON yevmiye_satir(masraf_merkezi_id) WHERE masraf_merkezi_id IS NOT NULL;

-- ----------------------------------------------------------------
-- TRIGGER: Yevmiye fiş toplam güncelleme
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_fis_toplam_hesapla()
RETURNS TRIGGER AS $$
DECLARE
    v_fis_id bigint;
BEGIN
    v_fis_id := COALESCE(NEW.fis_id, OLD.fis_id);
    UPDATE yevmiye_fis SET
        toplam_borc   = COALESCE((SELECT SUM(borc) FROM yevmiye_satir WHERE fis_id = v_fis_id), 0),
        toplam_alacak = COALESCE((SELECT SUM(alacak) FROM yevmiye_satir WHERE fis_id = v_fis_id), 0),
        guncelleme_tarihi = now()
    WHERE id = v_fis_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_satir_toplam_insert
    AFTER INSERT OR UPDATE OR DELETE ON yevmiye_satir
    FOR EACH ROW EXECUTE FUNCTION yevmiye_fis_toplam_hesapla();

-- ----------------------------------------------------------------
-- SORUN #1 (KRİTİK): Borç=Alacak DB-level trigger
-- ----------------------------------------------------------------
-- yevmiye_satir AFTER INSERT/UPDATE/DELETE sonrası ilgili fişin
-- durumu 'kayit' veya üstüne ise KESİN denge kontrolü. Denge bozuksa
-- EXCEPTION — çift girişli muhasebenin temel invaryantıdır.
-- Ek olarak BEFORE UPDATE trigger: fiş durumu 'kayit'/'kontrol_edilmis'/
-- 'kilitli'e geçerken de kontrol.
CREATE OR REPLACE FUNCTION yevmiye_fis_denge_kontrol_satir()
RETURNS TRIGGER AS $$
DECLARE
    v_fis_id bigint;
    v_fis RECORD;
    v_borc numeric(18, 4);
    v_alacak numeric(18, 4);
BEGIN
    v_fis_id := COALESCE(NEW.fis_id, OLD.fis_id);
    SELECT * INTO v_fis FROM yevmiye_fis WHERE id = v_fis_id;
    IF v_fis.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Taslak/iptal durumlarında denge kontrolü zorunlu değil
    IF v_fis.durum NOT IN ('kayit', 'kontrol_edilmis', 'kilitli') THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(borc), 0),
        COALESCE(SUM(alacak), 0)
    INTO v_borc, v_alacak
    FROM yevmiye_satir WHERE fis_id = v_fis_id;

    IF v_borc <> v_alacak THEN
        RAISE EXCEPTION 'Yevmiye fisi dengesi bozuk: borc=%, alacak=% (fis_id=%, durum=%)',
            v_borc, v_alacak, v_fis_id, v_fis.durum;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_satir_denge
    AFTER INSERT OR UPDATE OR DELETE ON yevmiye_satir
    FOR EACH ROW EXECUTE FUNCTION yevmiye_fis_denge_kontrol_satir();

-- BEFORE UPDATE fiş denge trigger
CREATE OR REPLACE FUNCTION yevmiye_fis_denge_kontrol()
RETURNS TRIGGER AS $$
BEGIN
    -- 'kayit', 'kontrol_edilmis' veya 'kilitli' durumuna geçerken denge zorunlu
    IF NEW.durum IN ('kayit', 'kontrol_edilmis', 'kilitli')
       AND NEW.toplam_borc <> NEW.toplam_alacak THEN
        RAISE EXCEPTION 'Yevmiye fisi dengesi bozuk: borc=%, alacak=% (fis_id=%)',
            NEW.toplam_borc, NEW.toplam_alacak, NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_fis_denge
    BEFORE UPDATE ON yevmiye_fis
    FOR EACH ROW EXECUTE FUNCTION yevmiye_fis_denge_kontrol();

-- ----------------------------------------------------------------
-- TRIGGER: Kapanmış dönemde yazma yasak
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_donem_kontrol()
RETURNS TRIGGER AS $$
DECLARE
    v_donem_durum varchar(20);
BEGIN
    SELECT durum INTO v_donem_durum FROM muhasebe_donem WHERE id = NEW.donem_id;
    IF v_donem_durum IS NULL THEN
        RAISE EXCEPTION 'Muhasebe donemi bulunamadi: %', NEW.donem_id;
    END IF;
    IF TG_OP = 'INSERT' AND v_donem_durum IN ('kapali', 'kilitli') THEN
        RAISE EXCEPTION 'Kapali/kilitli donemde yeni yevmiye fisi kaydedilemez (donem_id=%)', NEW.donem_id;
    END IF;
    IF TG_OP = 'UPDATE' AND v_donem_durum = 'kilitli' AND OLD.durum = 'kilitli' THEN
        RAISE EXCEPTION 'Kilitli donem fisi guncellenemez (fis_id=%)', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_fis_donem_kontrol
    BEFORE INSERT OR UPDATE ON yevmiye_fis
    FOR EACH ROW EXECUTE FUNCTION yevmiye_donem_kontrol();

-- ----------------------------------------------------------------
-- TRIGGER: Kilitli fişe satır ekleme yasak
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_satir_kilit_kontrol()
RETURNS TRIGGER AS $$
DECLARE
    v_fis_durum varchar(20);
BEGIN
    SELECT durum INTO v_fis_durum FROM yevmiye_fis
    WHERE id = COALESCE(NEW.fis_id, OLD.fis_id);
    IF v_fis_durum IN ('kilitli', 'iptal') THEN
        RAISE EXCEPTION 'Kilitli/iptal yevmiye fisine satir eklenemez/degistirilemez (fis_id=%)',
            COALESCE(NEW.fis_id, OLD.fis_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_satir_kilit
    BEFORE INSERT OR UPDATE OR DELETE ON yevmiye_satir
    FOR EACH ROW EXECUTE FUNCTION yevmiye_satir_kilit_kontrol();

-- ----------------------------------------------------------------
-- TRIGGER: hesap_plani.kayit_girilebilir_mi = false olan hesaba kayıt yasak
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_satir_hesap_kontrol()
RETURNS TRIGGER AS $$
DECLARE
    v_kayit_mi boolean;
    v_kod varchar;
BEGIN
    SELECT kayit_girilebilir_mi, kod INTO v_kayit_mi, v_kod
    FROM hesap_plani WHERE id = NEW.hesap_id;
    IF v_kayit_mi = false THEN
        RAISE EXCEPTION 'Hesap plani kodu (%) kayit girilemez (sinif/grup seviyesi)', v_kod;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yevmiye_satir_hesap_kontrol
    BEFORE INSERT OR UPDATE ON yevmiye_satir
    FOR EACH ROW EXECUTE FUNCTION yevmiye_satir_hesap_kontrol();

-- ----------------------------------------------------------------
-- MIZAN_SNAPSHOT
-- ----------------------------------------------------------------
CREATE TABLE mizan_snapshot (
    id              bigserial PRIMARY KEY,
    donem_id        bigint NOT NULL REFERENCES muhasebe_donem(id),
    periyot         varchar(20) NOT NULL CHECK (periyot IN ('aylik', 'ceyreklik', 'yillik')),
    periyot_tarih   date NOT NULL,
    hesap_id        bigint NOT NULL REFERENCES hesap_plani(id),
    devir_borc      numeric(18, 4) NOT NULL DEFAULT 0,
    devir_alacak    numeric(18, 4) NOT NULL DEFAULT 0,
    donem_borc      numeric(18, 4) NOT NULL DEFAULT 0,
    donem_alacak    numeric(18, 4) NOT NULL DEFAULT 0,
    bakiye_borc     numeric(18, 4) NOT NULL DEFAULT 0,
    bakiye_alacak   numeric(18, 4) NOT NULL DEFAULT 0,
    olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
    UNIQUE (donem_id, periyot, periyot_tarih, hesap_id)
);
CREATE INDEX idx_mizan_snapshot_donem ON mizan_snapshot(donem_id, periyot_tarih);

-- ----------------------------------------------------------------
-- VIEW: Hesap bakiye muhasebe (Sorun #10 join fix)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_hesap_bakiye_muhasebe AS
SELECT
    hp.id           AS hesap_plani_id,
    hp.kod,
    hp.ad,
    hp.tip,
    hp.grup,
    hp.normal_bakiye,
    COALESCE(SUM(ys.borc), 0)   AS toplam_borc,
    COALESCE(SUM(ys.alacak), 0) AS toplam_alacak,
    COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0) AS net_borc_alacak,
    CASE hp.normal_bakiye
        WHEN 'borc'   THEN COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0)
        WHEN 'alacak' THEN COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0)
    END AS bakiye
FROM hesap_plani hp
LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    AND EXISTS (SELECT 1 FROM yevmiye_fis yf WHERE yf.id = ys.fis_id
                 AND yf.durum NOT IN ('taslak', 'iptal'))
WHERE hp.aktif_mi = true
GROUP BY hp.id;

-- ----------------------------------------------------------------
-- VIEW: Mizan
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_mizan AS
SELECT
    hp.kod,
    hp.ad,
    hp.tip,
    hp.grup,
    COALESCE(SUM(ys.borc), 0)   AS borc_toplam,
    COALESCE(SUM(ys.alacak), 0) AS alacak_toplam,
    GREATEST(COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0), 0) AS borc_bakiye,
    GREATEST(COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0), 0) AS alacak_bakiye
FROM hesap_plani hp
LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    AND EXISTS (SELECT 1 FROM yevmiye_fis yf WHERE yf.id = ys.fis_id
                 AND yf.durum NOT IN ('taslak', 'iptal'))
WHERE hp.aktif_mi = true
  AND hp.kullanim_tipi IN ('ana', 'alt', 'yardimci')
GROUP BY hp.id, hp.kod, hp.ad, hp.tip, hp.grup
ORDER BY hp.kod;

-- ----------------------------------------------------------------
-- VIEW: Bilanço (Sorun #4) — vw_bilanco_ozet grup bazlı + vw_bilanco_detay
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_bilanco_detay AS
SELECT
    hp.grup,
    hp.tip,
    hp.kod,
    hp.ad,
    SUM(CASE hp.normal_bakiye
        WHEN 'borc'   THEN COALESCE(ys.borc, 0) - COALESCE(ys.alacak, 0)
        WHEN 'alacak' THEN COALESCE(ys.alacak, 0) - COALESCE(ys.borc, 0)
    END) AS bakiye
FROM hesap_plani hp
LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    AND EXISTS (SELECT 1 FROM yevmiye_fis yf WHERE yf.id = ys.fis_id
                 AND yf.durum NOT IN ('taslak', 'iptal'))
WHERE hp.tip IN ('aktif', 'pasif')
  AND hp.aktif_mi = true
  AND hp.kullanim_tipi IN ('ana', 'alt', 'yardimci')
GROUP BY hp.id, hp.grup, hp.tip, hp.kod, hp.ad
ORDER BY hp.kod;

CREATE OR REPLACE VIEW vw_bilanco_ozet AS
SELECT
    tip,
    grup,
    CASE grup
        WHEN 'donen_varlik'              THEN 'I. DÖNEN VARLIKLAR'
        WHEN 'duran_varlik'              THEN 'II. DURAN VARLIKLAR'
        WHEN 'kisa_vade_yabanci_kaynak'  THEN 'I. KISA VADELİ YABANCI KAYNAKLAR'
        WHEN 'uzun_vade_yabanci_kaynak'  THEN 'II. UZUN VADELİ YABANCI KAYNAKLAR'
        WHEN 'oz_kaynak'                 THEN 'III. ÖZ KAYNAKLAR'
    END AS grup_adi,
    SUM(bakiye) AS bakiye,
    CASE WHEN tip = 'aktif' THEN 1 ELSE 2 END AS aktif_pasif_sira
FROM vw_bilanco_detay
GROUP BY tip, grup
ORDER BY aktif_pasif_sira, grup;

-- Geriye dönük uyumluluk
CREATE OR REPLACE VIEW vw_bilanco AS SELECT * FROM vw_bilanco_ozet;

-- ----------------------------------------------------------------
-- VIEW: Gelir Tablosu
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_gelir_tablosu AS
SELECT
    hp.kod,
    hp.ad,
    hp.tip,
    SUM(CASE
        WHEN hp.tip = 'gelir'  THEN COALESCE(ys.alacak, 0) - COALESCE(ys.borc, 0)
        WHEN hp.tip = 'gider'  THEN COALESCE(ys.borc, 0)   - COALESCE(ys.alacak, 0)
        WHEN hp.tip = 'sonuc'  THEN COALESCE(ys.alacak, 0) - COALESCE(ys.borc, 0)
        ELSE 0
    END) AS tutar
FROM hesap_plani hp
LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    AND EXISTS (SELECT 1 FROM yevmiye_fis yf WHERE yf.id = ys.fis_id
                 AND yf.durum NOT IN ('taslak', 'iptal'))
WHERE hp.grup = 'gelir_tablosu'
  AND hp.aktif_mi = true
  AND hp.kullanim_tipi IN ('ana', 'alt', 'yardimci')
GROUP BY hp.id, hp.kod, hp.ad, hp.tip
ORDER BY hp.kod;

-- ================================================================
-- FONKSIYONLAR
-- ================================================================

-- ----------------------------------------------------------------
-- yevmiye_fis_olustur: Boş fiş oluştur (Sorun #8 sequence ile)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_fis_olustur(
    p_fis_tipi  varchar,
    p_aciklama  text,
    p_tarih     date DEFAULT CURRENT_DATE,
    p_kaynak_belge_tipi varchar DEFAULT NULL,
    p_kaynak_belge_id bigint DEFAULT NULL,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_fis_id bigint;
    v_donem_id bigint;
    v_fis_no varchar;
    v_seq bigint;
BEGIN
    SELECT id INTO v_donem_id FROM muhasebe_donem
    WHERE p_tarih BETWEEN baslangic_tarihi AND bitis_tarihi
    ORDER BY id DESC LIMIT 1;

    IF v_donem_id IS NULL THEN
        RAISE EXCEPTION 'Tarih icin acik muhasebe donemi yok: %', p_tarih;
    END IF;

    v_seq := nextval('yevmiye_fis_seq');
    v_fis_no := 'YEV-' || EXTRACT(YEAR FROM p_tarih) || '-' || LPAD(v_seq::text, 6, '0');

    INSERT INTO yevmiye_fis (
        fis_no, fis_tipi, tarih, aciklama, durum, donem_id,
        kaynak_belge_tipi, kaynak_belge_id, olusturan_kullanici_id
    ) VALUES (
        v_fis_no, p_fis_tipi, p_tarih, p_aciklama, 'taslak', v_donem_id,
        p_kaynak_belge_tipi, p_kaynak_belge_id, p_kullanici_id
    )
    RETURNING id INTO v_fis_id;

    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- yevmiye_satir_ekle: Satır ekle
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_satir_ekle(
    p_fis_id        bigint,
    p_hesap_kodu    varchar,
    p_borc          numeric,
    p_alacak        numeric,
    p_aciklama      text DEFAULT NULL,
    p_cari_id       bigint DEFAULT NULL,
    p_hesap_operasyonel_id bigint DEFAULT NULL,
    p_masraf_merkezi_id bigint DEFAULT NULL,
    p_para_birimi_kod char(3) DEFAULT 'TRY',
    p_kur           numeric DEFAULT 1
) RETURNS bigint AS $$
DECLARE
    v_satir_id bigint;
    v_hesap_id bigint;
    v_sira int;
BEGIN
    SELECT id INTO v_hesap_id FROM hesap_plani WHERE kod = p_hesap_kodu;
    IF v_hesap_id IS NULL THEN
        RAISE EXCEPTION 'Hesap plani kodu bulunamadi: %', p_hesap_kodu;
    END IF;

    SELECT COALESCE(MAX(sira), 0) + 1 INTO v_sira
    FROM yevmiye_satir WHERE fis_id = p_fis_id;

    INSERT INTO yevmiye_satir (
        fis_id, sira, hesap_id, aciklama, borc, alacak,
        para_birimi_kod, kur, cari_id, hesap_operasyonel_id, masraf_merkezi_id
    ) VALUES (
        p_fis_id, v_sira, v_hesap_id, p_aciklama,
        COALESCE(p_borc, 0), COALESCE(p_alacak, 0),
        p_para_birimi_kod, p_kur, p_cari_id, p_hesap_operasyonel_id, p_masraf_merkezi_id
    )
    RETURNING id INTO v_satir_id;

    RETURN v_satir_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- yevmiye_fis_kontrol_et: Borç=Alacak doğrulaması + durum geçişi
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION yevmiye_fis_kontrol_et(
    p_fis_id        bigint,
    p_kullanici_id  bigint DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
    v_toplam_borc numeric;
    v_toplam_alacak numeric;
    v_satir_sayisi int;
BEGIN
    SELECT COALESCE(SUM(borc), 0), COALESCE(SUM(alacak), 0), COUNT(*)
    INTO v_toplam_borc, v_toplam_alacak, v_satir_sayisi
    FROM yevmiye_satir WHERE fis_id = p_fis_id;

    IF v_satir_sayisi < 2 THEN
        RAISE EXCEPTION 'Yevmiye fisinde en az 2 satir olmalidir (fis_id=%)', p_fis_id;
    END IF;
    IF v_toplam_borc <> v_toplam_alacak THEN
        RAISE EXCEPTION 'Borc (%) ve Alacak (%) dengesiz (fis_id=%)',
            v_toplam_borc, v_toplam_alacak, p_fis_id;
    END IF;

    UPDATE yevmiye_fis SET
        durum = 'kontrol_edilmis',
        kontrol_eden_kullanici_id = p_kullanici_id,
        kontrol_tarihi = now()
    WHERE id = p_fis_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Taslak fişi 'kayit' durumuna çeviren yardımcı
CREATE OR REPLACE FUNCTION yevmiye_fis_kaydet(p_fis_id bigint)
RETURNS boolean AS $$
BEGIN
    UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = p_fis_id;
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- hesap_bakiye_donem
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION hesap_bakiye_donem(
    p_hesap_plani_id bigint,
    p_baslangic     date,
    p_bitis         date
) RETURNS TABLE (borc numeric, alacak numeric, bakiye numeric) AS $$
    SELECT
        COALESCE(SUM(ys.borc), 0)   AS borc,
        COALESCE(SUM(ys.alacak), 0) AS alacak,
        CASE hp.normal_bakiye
            WHEN 'borc'   THEN COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0)
            WHEN 'alacak' THEN COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0)
        END AS bakiye
    FROM hesap_plani hp
    LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    LEFT JOIN yevmiye_fis yf ON yf.id = ys.fis_id
    WHERE hp.id = p_hesap_plani_id
      AND yf.durum NOT IN ('taslak', 'iptal')
      AND yf.tarih BETWEEN p_baslangic AND p_bitis
    GROUP BY hp.id, hp.normal_bakiye;
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------
-- yevmiye_otomatik_olustur: Belgeden otomatik yevmiye üret
-- ----------------------------------------------------------------
-- REFACTOR v2 (Sorun #2, #3, #7):
--   • hesap kodları muhasebe_ayar_eslesme'den okunur (hardcoded yok)
--   • çoklu KDV oranı: fatura_kalem_vergi gruplanır
--   • satış faturasında 621/153 COGS satırları otomatik
CREATE OR REPLACE FUNCTION yevmiye_otomatik_olustur(
    p_kaynak_tipi   varchar,
    p_kaynak_id     bigint
) RETURNS bigint AS $$
DECLARE
    v_fis_id bigint;
    v_fatura RECORD;
    v_hareket RECORD;
    v_vergi RECORD;
    v_cogs_toplam numeric(18, 4);
    v_kod_kasa varchar;
    v_kod_banka varchar;
    v_kod_pos varchar;
    v_kod_alicilar varchar;
    v_kod_saticilar varchar;
    v_kod_satis varchar;
    v_kod_satis_yurtdisi varchar;
    v_kod_stok varchar;
    v_kod_cogs varchar;
    v_kod_iade varchar;
    v_kod_kdv varchar;
    v_hesap_kodu varchar;
    v_cari_ulke char(2);
BEGIN
    ------------------------------------------------------------
    -- 1) FATURA
    ------------------------------------------------------------
    IF p_kaynak_tipi = 'fatura' THEN
        SELECT f.*, c.ulke_kodu
        INTO v_fatura
        FROM fatura f
        LEFT JOIN cari c ON c.id = f.cari_id
        WHERE f.id = p_kaynak_id;

        IF v_fatura.id IS NULL THEN
            RAISE EXCEPTION 'Fatura bulunamadi: %', p_kaynak_id;
        END IF;

        v_cari_ulke := v_fatura.ulke_kodu;
        v_kod_alicilar    := muhasebe_hesap_kodu_bul('satis_alicilar', NULL, NULL, v_fatura.firma_id);
        v_kod_saticilar   := muhasebe_hesap_kodu_bul('alis_saticilar', NULL, NULL, v_fatura.firma_id);
        v_kod_satis       := muhasebe_hesap_kodu_bul('satis_geliri', NULL, NULL, v_fatura.firma_id);
        v_kod_satis_yurtdisi := muhasebe_hesap_kodu_bul('satis_geliri_yurtdisi', NULL, NULL, v_fatura.firma_id);
        v_kod_stok        := muhasebe_hesap_kodu_bul('ticari_mal_stok', NULL, NULL, v_fatura.firma_id);
        v_kod_cogs        := muhasebe_hesap_kodu_bul('satilan_mal_maliyeti', NULL, NULL, v_fatura.firma_id);
        v_kod_iade        := muhasebe_hesap_kodu_bul('satis_iade', NULL, NULL, v_fatura.firma_id);

        v_fis_id := yevmiye_fis_olustur(
            'mahsup',
            'Fatura: ' || v_fatura.fatura_no,
            v_fatura.fatura_tarihi,
            'fatura',
            v_fatura.id,
            v_fatura.olusturan_kullanici_id
        );

        -- --------------------------------------------------
        -- SATIŞ FATURASI
        -- --------------------------------------------------
        IF v_fatura.tip = 'satis' THEN
            -- 120 ALICILAR (borç) — toplam
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_alicilar,
                v_fatura.toplam_tutar, 0,
                'Alıcılar borç - ' || v_fatura.fatura_no,
                v_fatura.cari_id, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);

            -- 600 / 601 SATIŞ GELİRİ (alacak) — matrah (ara_toplam - iskonto)
            PERFORM yevmiye_satir_ekle(
                v_fis_id,
                CASE WHEN v_cari_ulke IS NOT NULL AND v_cari_ulke <> 'TR'
                     THEN v_kod_satis_yurtdisi ELSE v_kod_satis END,
                0, v_fatura.ara_toplam - v_fatura.iskonto_tutari,
                'Satış geliri', NULL, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);

            -- Sorun #2: KDV oran bazlı alt hesaplar
            FOR v_vergi IN
                SELECT
                    fkv.vergi_tipi,
                    fkv.oran,
                    SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) AS net_tutar
                FROM fatura_kalem fk
                JOIN fatura_kalem_vergi fkv ON fkv.fatura_kalem_id = fk.id
                WHERE fk.fatura_id = v_fatura.id
                GROUP BY fkv.vergi_tipi, fkv.oran
                HAVING SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) > 0
            LOOP
                IF v_vergi.vergi_tipi = 'KDV' THEN
                    v_hesap_kodu := muhasebe_hesap_kodu_bul('satis_kdv', 'KDV', v_vergi.oran, v_fatura.firma_id);
                ELSIF v_vergi.vergi_tipi = 'OTV' THEN
                    v_hesap_kodu := muhasebe_hesap_kodu_bul('satis_otv', 'OTV', v_vergi.oran, v_fatura.firma_id);
                ELSE
                    v_hesap_kodu := '392'; -- diğer vergi genel
                END IF;
                PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                    0, v_vergi.net_tutar,
                    'Hesaplanan ' || v_vergi.vergi_tipi || ' %' || v_vergi.oran,
                    NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END LOOP;

            -- Sorun #3: COGS satırları (621 borç / 153 alacak)
            -- Maliyet bilgisi siparis_kalem.toplam_maliyet üzerinden gelir.
            SELECT COALESCE(SUM(sk.toplam_maliyet), 0)
            INTO v_cogs_toplam
            FROM fatura_kalem fk
            LEFT JOIN siparis_kalem sk ON sk.id = fk.siparis_kalem_id
            WHERE fk.fatura_id = v_fatura.id;

            IF v_cogs_toplam > 0 THEN
                PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_cogs,
                    v_cogs_toplam, 0,
                    'Satılan ticari mal maliyeti - ' || v_fatura.fatura_no,
                    NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
                PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_stok,
                    0, v_cogs_toplam,
                    'Stok çıkışı - ' || v_fatura.fatura_no,
                    NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END IF;

        ELSIF v_fatura.tip = 'alis' THEN
            -- 153 TİCARİ MALLAR (borç)
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_stok,
                v_fatura.ara_toplam - v_fatura.iskonto_tutari, 0,
                'Ticari mal alımı', NULL, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);

            -- Alış KDV'leri oran bazlı
            FOR v_vergi IN
                SELECT fkv.vergi_tipi, fkv.oran,
                       SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) AS net_tutar
                FROM fatura_kalem fk
                JOIN fatura_kalem_vergi fkv ON fkv.fatura_kalem_id = fk.id
                WHERE fk.fatura_id = v_fatura.id
                GROUP BY fkv.vergi_tipi, fkv.oran
                HAVING SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) > 0
            LOOP
                IF v_vergi.vergi_tipi = 'KDV' THEN
                    v_hesap_kodu := muhasebe_hesap_kodu_bul('alis_kdv', 'KDV', v_vergi.oran, v_fatura.firma_id);
                ELSE
                    v_hesap_kodu := '192';
                END IF;
                PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                    v_vergi.net_tutar, 0,
                    'İndirilecek ' || v_vergi.vergi_tipi || ' %' || v_vergi.oran,
                    NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END LOOP;

            -- 320 SATICILAR (alacak)
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_saticilar,
                0, v_fatura.toplam_tutar,
                'Satıcılar alacak - ' || v_fatura.fatura_no,
                v_fatura.cari_id, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);

        ELSIF v_fatura.tip = 'iade_satis' THEN
            -- 610 SATIŞTAN İADE (borç) + KDV geri
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_iade,
                v_fatura.ara_toplam - v_fatura.iskonto_tutari, 0,
                'Satıştan iade', NULL, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);
            FOR v_vergi IN
                SELECT fkv.vergi_tipi, fkv.oran,
                       SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) AS net_tutar
                FROM fatura_kalem fk
                JOIN fatura_kalem_vergi fkv ON fkv.fatura_kalem_id = fk.id
                WHERE fk.fatura_id = v_fatura.id
                GROUP BY fkv.vergi_tipi, fkv.oran
                HAVING SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) > 0
            LOOP
                v_hesap_kodu := muhasebe_hesap_kodu_bul('satis_kdv', v_vergi.vergi_tipi, v_vergi.oran, v_fatura.firma_id);
                PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                    v_vergi.net_tutar, 0,
                    'KDV iade %' || v_vergi.oran, NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END LOOP;
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_alicilar,
                0, v_fatura.toplam_tutar,
                'Alıcılar iade - ' || v_fatura.fatura_no,
                v_fatura.cari_id, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);
            -- İade COGS geri (153 borç / 621 alacak)
            SELECT COALESCE(SUM(sk.toplam_maliyet), 0)
            INTO v_cogs_toplam
            FROM fatura_kalem fk
            LEFT JOIN siparis_kalem sk ON sk.id = fk.siparis_kalem_id
            WHERE fk.fatura_id = v_fatura.id;
            IF v_cogs_toplam > 0 THEN
                PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_stok,
                    v_cogs_toplam, 0, 'Stok iade geri', NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
                PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_cogs,
                    0, v_cogs_toplam, 'COGS geri', NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END IF;

        ELSIF v_fatura.tip = 'iade_alis' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_saticilar,
                v_fatura.toplam_tutar, 0,
                'Satıcılar iade', v_fatura.cari_id, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_stok,
                0, v_fatura.ara_toplam - v_fatura.iskonto_tutari,
                'Ticari mal iade', NULL, NULL, NULL,
                v_fatura.para_birimi_kod, v_fatura.kur);
            FOR v_vergi IN
                SELECT fkv.vergi_tipi, fkv.oran,
                       SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) AS net_tutar
                FROM fatura_kalem fk
                JOIN fatura_kalem_vergi fkv ON fkv.fatura_kalem_id = fk.id
                WHERE fk.fatura_id = v_fatura.id
                GROUP BY fkv.vergi_tipi, fkv.oran
                HAVING SUM(fkv.tutar - COALESCE(fkv.tevkifat_tutari, 0)) > 0
            LOOP
                v_hesap_kodu := muhasebe_hesap_kodu_bul('alis_kdv', v_vergi.vergi_tipi, v_vergi.oran, v_fatura.firma_id);
                PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                    0, v_vergi.net_tutar,
                    'İnd. KDV iade %' || v_vergi.oran, NULL, NULL, NULL,
                    v_fatura.para_birimi_kod, v_fatura.kur);
            END LOOP;
        END IF;

        -- Taslaktan kayit'a çevir → denge triggerı kontrol eder
        UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;
        RETURN v_fis_id;
    END IF;

    ------------------------------------------------------------
    -- 2) HESAP HAREKET
    ------------------------------------------------------------
    IF p_kaynak_tipi = 'hesap_hareket' THEN
        SELECT hh.*, h.muhasebe_hesap_id, h.tip AS hesap_tip,
               hp.kod AS hesap_muhasebe_kodu, h.firma_id AS hesap_firma_id
        INTO v_hareket
        FROM hesap_hareket hh
        JOIN hesap h ON h.id = hh.hesap_id
        LEFT JOIN hesap_plani hp ON hp.id = h.muhasebe_hesap_id
        WHERE hh.id = p_kaynak_id;

        IF v_hareket.id IS NULL THEN
            RAISE EXCEPTION 'Hesap hareket bulunamadi: %', p_kaynak_id;
        END IF;

        v_hesap_kodu := COALESCE(v_hareket.hesap_muhasebe_kodu,
            CASE v_hareket.hesap_tip
                WHEN 'kasa' THEN muhasebe_hesap_kodu_bul('kasa_varsayilan', NULL, NULL, v_hareket.hesap_firma_id)
                WHEN 'banka' THEN muhasebe_hesap_kodu_bul('banka_varsayilan', NULL, NULL, v_hareket.hesap_firma_id)
                WHEN 'pos' THEN muhasebe_hesap_kodu_bul('pos_varsayilan', NULL, NULL, v_hareket.hesap_firma_id)
                WHEN 'cek_portfoy' THEN muhasebe_hesap_kodu_bul('alinan_cek_portfoy', NULL, NULL, v_hareket.hesap_firma_id)
                WHEN 'senet_portfoy' THEN muhasebe_hesap_kodu_bul('alacak_senedi', NULL, NULL, v_hareket.hesap_firma_id)
                ELSE '108'
            END);

        v_kod_alicilar  := muhasebe_hesap_kodu_bul('satis_alicilar', NULL, NULL, v_hareket.hesap_firma_id);
        v_kod_saticilar := muhasebe_hesap_kodu_bul('alis_saticilar', NULL, NULL, v_hareket.hesap_firma_id);

        v_fis_id := yevmiye_fis_olustur(
            CASE WHEN v_hareket.tip = 'giris' THEN 'tahsil' ELSE 'tediye' END,
            COALESCE(v_hareket.aciklama, v_hareket.tur || ' hareketi'),
            v_hareket.tarih::date,
            'hesap_hareket',
            v_hareket.id,
            v_hareket.olusturan_kullanici_id
        );

        IF v_hareket.tur = 'tahsilat' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                v_hareket.tutar, 0, 'Tahsilat', NULL, v_hareket.hesap_id, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_alicilar,
                0, v_hareket.tutar, 'Müşteri tahsilat',
                v_hareket.cari_id, NULL, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);

        ELSIF v_hareket.tur = 'odeme' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_saticilar,
                v_hareket.tutar, 0, 'Satıcıya ödeme',
                v_hareket.cari_id, NULL, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                0, v_hareket.tutar, 'Ödeme çıkışı', NULL, v_hareket.hesap_id, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);

        ELSIF v_hareket.tur = 'gider' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id,
                muhasebe_hesap_kodu_bul('genel_gider', NULL, NULL, v_hareket.hesap_firma_id),
                v_hareket.tutar, 0, 'Gider', NULL, NULL, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                0, v_hareket.tutar, 'Gider ödemesi', NULL, v_hareket.hesap_id, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);

        ELSIF v_hareket.tur = 'gelir' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                v_hareket.tutar, 0, 'Gelir girişi', NULL, v_hareket.hesap_id, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, '602',
                0, v_hareket.tutar, 'Diğer gelir', NULL, NULL, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);

        ELSIF v_hareket.tur = 'ucret_komisyon' THEN
            PERFORM yevmiye_satir_ekle(v_fis_id,
                muhasebe_hesap_kodu_bul('komisyon_gideri', NULL, NULL, v_hareket.hesap_firma_id),
                v_hareket.tutar, 0, 'Komisyon gideri', NULL, NULL, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap_kodu,
                0, v_hareket.tutar, 'Komisyon kesinti', NULL, v_hareket.hesap_id, NULL,
                v_hareket.para_birimi_kod, v_hareket.kur);

        ELSE
            -- Virman, dekont, kur_farki vs. özel fonksiyonlar tarafından üretilir
            UPDATE yevmiye_fis SET durum = 'iptal' WHERE id = v_fis_id;
            RETURN NULL;
        END IF;

        UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;
        RETURN v_fis_id;
    END IF;

    ------------------------------------------------------------
    -- 3) İADE (modül 08 iade tablosu)
    ------------------------------------------------------------
    IF p_kaynak_tipi = 'iade' THEN
        -- İade belgesi üzerinden fatura branch'ına benzer akış.
        -- İade tablosunun kendi yapısı modül 08'de tanımlı; burada kısa devre:
        RAISE NOTICE 'iade kaynagi icin yevmiye uretimi modul 08 ile senkronize edilmeli';
        RETURN NULL;
    END IF;

    RAISE EXCEPTION 'Desteklenmeyen kaynak tipi: %', p_kaynak_tipi;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- yevmiye_virman_fisi_olustur: hesap_virman tarafından çağrılır
-- ----------------------------------------------------------------
-- İki hesap hareketi (çıkış + giriş) → tek yevmiye fişi (hedef hesap borç,
-- kaynak hesap alacak).
CREATE OR REPLACE FUNCTION yevmiye_virman_fisi_olustur(
    p_cikis_hareket_id bigint,
    p_giris_hareket_id bigint
) RETURNS bigint AS $$
DECLARE
    v_cikis RECORD;
    v_giris RECORD;
    v_fis_id bigint;
    v_kod_cikis varchar;
    v_kod_giris varchar;
BEGIN
    SELECT hh.*, h.muhasebe_hesap_id, h.tip AS hesap_tip,
           hp.kod AS hesap_muhasebe_kodu, h.firma_id
    INTO v_cikis
    FROM hesap_hareket hh
    JOIN hesap h ON h.id = hh.hesap_id
    LEFT JOIN hesap_plani hp ON hp.id = h.muhasebe_hesap_id
    WHERE hh.id = p_cikis_hareket_id;

    SELECT hh.*, h.muhasebe_hesap_id, h.tip AS hesap_tip,
           hp.kod AS hesap_muhasebe_kodu, h.firma_id
    INTO v_giris
    FROM hesap_hareket hh
    JOIN hesap h ON h.id = hh.hesap_id
    LEFT JOIN hesap_plani hp ON hp.id = h.muhasebe_hesap_id
    WHERE hh.id = p_giris_hareket_id;

    v_kod_cikis := COALESCE(v_cikis.hesap_muhasebe_kodu,
        muhasebe_hesap_kodu_bul(
            CASE v_cikis.hesap_tip
                WHEN 'kasa' THEN 'kasa_varsayilan'
                WHEN 'banka' THEN 'banka_varsayilan'
                ELSE 'banka_varsayilan'
            END, NULL, NULL, v_cikis.firma_id));
    v_kod_giris := COALESCE(v_giris.hesap_muhasebe_kodu,
        muhasebe_hesap_kodu_bul(
            CASE v_giris.hesap_tip
                WHEN 'kasa' THEN 'kasa_varsayilan'
                WHEN 'banka' THEN 'banka_varsayilan'
                ELSE 'banka_varsayilan'
            END, NULL, NULL, v_giris.firma_id));

    v_fis_id := yevmiye_fis_olustur(
        'mahsup',
        'Virman: ' || v_cikis.hesap_id || ' -> ' || v_giris.hesap_id,
        v_cikis.tarih::date,
        'virman',
        v_cikis.id,
        v_cikis.olusturan_kullanici_id
    );

    PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_giris,
        v_cikis.tutar, 0, 'Virman giriş', NULL, v_giris.hesap_id, NULL,
        v_cikis.para_birimi_kod, v_cikis.kur);
    PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_cikis,
        0, v_cikis.tutar, 'Virman çıkış', NULL, v_cikis.hesap_id, NULL,
        v_cikis.para_birimi_kod, v_cikis.kur);

    UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;
    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- yevmiye_pos_tahsilat_fisi_olustur: pos_tahsilat_kaydet tarafından çağrılır
-- ----------------------------------------------------------------
-- Brüt POS tahsilatı:
--   102 BANKA (net) borç
--   653 KOMISYON GIDERI (komisyon) borç
--     120 ALICILAR (brüt) alacak
CREATE OR REPLACE FUNCTION yevmiye_pos_tahsilat_fisi_olustur(
    p_brut_hareket_id bigint,
    p_komisyon_hareket_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_brut RECORD;
    v_kom  RECORD;
    v_fis_id bigint;
    v_kod_pos varchar;
    v_kod_alicilar varchar;
    v_kod_komisyon varchar;
    v_net_tutar numeric(18, 4);
    v_kom_tutar numeric(18, 4);
BEGIN
    SELECT hh.*, h.firma_id, h.muhasebe_hesap_id, hp.kod AS hesap_muhasebe_kodu
    INTO v_brut
    FROM hesap_hareket hh
    JOIN hesap h ON h.id = hh.hesap_id
    LEFT JOIN hesap_plani hp ON hp.id = h.muhasebe_hesap_id
    WHERE hh.id = p_brut_hareket_id;

    v_kom_tutar := 0;
    IF p_komisyon_hareket_id IS NOT NULL THEN
        SELECT * INTO v_kom FROM hesap_hareket WHERE id = p_komisyon_hareket_id;
        v_kom_tutar := v_kom.tutar;
    END IF;
    v_net_tutar := v_brut.tutar - v_kom_tutar;

    v_kod_pos      := COALESCE(v_brut.hesap_muhasebe_kodu,
                       muhasebe_hesap_kodu_bul('pos_varsayilan', NULL, NULL, v_brut.firma_id));
    v_kod_alicilar := muhasebe_hesap_kodu_bul('satis_alicilar', NULL, NULL, v_brut.firma_id);
    v_kod_komisyon := muhasebe_hesap_kodu_bul('komisyon_gideri', NULL, NULL, v_brut.firma_id);

    v_fis_id := yevmiye_fis_olustur(
        'tahsil',
        'POS tahsilat: ' || v_brut.tutar,
        v_brut.tarih::date,
        'hesap_hareket',
        v_brut.id,
        v_brut.olusturan_kullanici_id
    );

    PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_pos,
        v_net_tutar, 0, 'POS net tahsilat', NULL, v_brut.hesap_id, NULL,
        v_brut.para_birimi_kod, v_brut.kur);
    IF v_kom_tutar > 0 THEN
        PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_komisyon,
            v_kom_tutar, 0, 'POS komisyonu', NULL, NULL, NULL,
            v_brut.para_birimi_kod, v_brut.kur);
    END IF;
    PERFORM yevmiye_satir_ekle(v_fis_id, v_kod_alicilar,
        0, v_brut.tutar, 'POS brüt alıcılar', v_brut.cari_id, NULL, NULL,
        v_brut.para_birimi_kod, v_brut.kur);

    UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;
    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- mizan_snapshot_olustur (Sorun #13)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION mizan_snapshot_olustur(
    p_donem_id bigint,
    p_periyot  varchar,
    p_tarih    date
) RETURNS int AS $$
DECLARE
    v_count int := 0;
    v_donem RECORD;
BEGIN
    SELECT * INTO v_donem FROM muhasebe_donem WHERE id = p_donem_id;
    IF v_donem.id IS NULL THEN
        RAISE EXCEPTION 'Donem bulunamadi: %', p_donem_id;
    END IF;

    DELETE FROM mizan_snapshot
    WHERE donem_id = p_donem_id AND periyot = p_periyot AND periyot_tarih = p_tarih;

    INSERT INTO mizan_snapshot (
        donem_id, periyot, periyot_tarih, hesap_id,
        donem_borc, donem_alacak, bakiye_borc, bakiye_alacak
    )
    SELECT
        p_donem_id, p_periyot, p_tarih, hp.id,
        COALESCE(SUM(ys.borc), 0),
        COALESCE(SUM(ys.alacak), 0),
        GREATEST(COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0), 0),
        GREATEST(COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0), 0)
    FROM hesap_plani hp
    LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
    LEFT JOIN yevmiye_fis yf ON yf.id = ys.fis_id
        AND yf.durum NOT IN ('taslak', 'iptal')
        AND yf.tarih BETWEEN v_donem.baslangic_tarihi AND p_tarih
    WHERE hp.aktif_mi = true
      AND hp.kullanim_tipi IN ('ana', 'alt', 'yardimci')
    GROUP BY hp.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- donem_kapat: Dönem sonu kapanış fişi (Sorun #5)
-- ----------------------------------------------------------------
-- Akış:
--   1) Tüm açık fişleri kontrol et (Borç=Alacak)
--   2) Gelir hesaplarını (6xx gelir) 690 DÖNEM KAR/ZARAR'a taşı
--   3) Gider hesaplarını (6xx gider) 690'a taşı
--   4) 690 net bakiyesini 692'ye taşı
--   5) 692 → 590 (kar) veya 591 (zarar)
--   6) muhasebe_donem.durum = 'kapali'
CREATE OR REPLACE FUNCTION donem_kapat(
    p_donem_id     bigint,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_donem RECORD;
    v_fis_id bigint;
    v_hesap RECORD;
    v_gelir_toplam numeric(18, 4) := 0;
    v_gider_toplam numeric(18, 4) := 0;
    v_net numeric(18, 4);
    v_tutar numeric(18, 4);
BEGIN
    SELECT * INTO v_donem FROM muhasebe_donem WHERE id = p_donem_id FOR UPDATE;
    IF v_donem.id IS NULL THEN
        RAISE EXCEPTION 'Donem bulunamadi: %', p_donem_id;
    END IF;
    IF v_donem.durum <> 'acik' THEN
        RAISE EXCEPTION 'Donem zaten kapali/kilitli: %', v_donem.durum;
    END IF;

    -- Tüm açık fişlerin dengesi kontrol edilmeli
    IF EXISTS (
        SELECT 1 FROM yevmiye_fis
        WHERE donem_id = p_donem_id
          AND durum IN ('kayit', 'kontrol_edilmis')
          AND toplam_borc <> toplam_alacak
    ) THEN
        RAISE EXCEPTION 'Donemde dengesiz yevmiye fisi var, kapatilmadan once duzeltilmelidir';
    END IF;

    -- Kapanış fişi oluştur
    v_fis_id := yevmiye_fis_olustur(
        'kapanis',
        'Donem kapanisi: ' || v_donem.donem_kodu,
        v_donem.bitis_tarihi,
        NULL, NULL, p_kullanici_id
    );

    -- GELIR hesapları (tip='gelir') 690'a taşı
    FOR v_hesap IN
        SELECT hp.id, hp.kod,
               COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0) AS net
        FROM hesap_plani hp
        LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
        LEFT JOIN yevmiye_fis yf ON yf.id = ys.fis_id
            AND yf.durum NOT IN ('taslak', 'iptal')
            AND yf.donem_id = p_donem_id
        WHERE hp.tip = 'gelir' AND hp.aktif_mi = true
        GROUP BY hp.id, hp.kod
        HAVING COALESCE(SUM(ys.alacak), 0) - COALESCE(SUM(ys.borc), 0) > 0
    LOOP
        v_tutar := v_hesap.net;
        v_gelir_toplam := v_gelir_toplam + v_tutar;
        PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap.kod, v_tutar, 0,
            'Kapanis - gelir kapat');
    END LOOP;

    -- GIDER hesapları (tip='gider') 690'a taşı
    FOR v_hesap IN
        SELECT hp.id, hp.kod,
               COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0) AS net
        FROM hesap_plani hp
        LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
        LEFT JOIN yevmiye_fis yf ON yf.id = ys.fis_id
            AND yf.durum NOT IN ('taslak', 'iptal')
            AND yf.donem_id = p_donem_id
        WHERE hp.tip = 'gider' AND hp.aktif_mi = true
        GROUP BY hp.id, hp.kod
        HAVING COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0) > 0
    LOOP
        v_tutar := v_hesap.net;
        v_gider_toplam := v_gider_toplam + v_tutar;
        PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap.kod, 0, v_tutar,
            'Kapanis - gider kapat');
    END LOOP;

    -- Net sonuç
    v_net := v_gelir_toplam - v_gider_toplam;
    IF v_net >= 0 THEN
        -- Kar: 690 (borç) / 590 (alacak)
        PERFORM yevmiye_satir_ekle(v_fis_id, '690', v_net, 0, 'Donem net kari transfer');
        PERFORM yevmiye_satir_ekle(v_fis_id, '590', 0, v_net, 'Donem net kari');
    ELSE
        -- Zarar: 591 (borç) / 690 (alacak) — 690 zaten borç dengesinde
        PERFORM yevmiye_satir_ekle(v_fis_id, '591', -v_net, 0, 'Donem net zarari');
        PERFORM yevmiye_satir_ekle(v_fis_id, '690', 0, -v_net, 'Donem net zarari transfer');
    END IF;

    UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;

    -- Dönemi kapat
    UPDATE muhasebe_donem SET
        durum = 'kapali',
        kapanis_tarihi = now(),
        kapayan_kullanici_id = p_kullanici_id
    WHERE id = p_donem_id;

    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- donem_ac: Yeni dönem açılış fişi (devir bakiyeleri)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION donem_ac(
    p_yeni_donem_id bigint,
    p_onceki_donem_id bigint,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_yeni RECORD;
    v_fis_id bigint;
    v_hesap RECORD;
BEGIN
    SELECT * INTO v_yeni FROM muhasebe_donem WHERE id = p_yeni_donem_id;
    IF v_yeni.id IS NULL THEN
        RAISE EXCEPTION 'Yeni donem bulunamadi: %', p_yeni_donem_id;
    END IF;

    v_fis_id := yevmiye_fis_olustur(
        'acilis',
        'Donem acilis: ' || v_yeni.donem_kodu,
        v_yeni.baslangic_tarihi,
        NULL, NULL, p_kullanici_id
    );

    -- Aktif ve pasif hesap bakiyelerini devret
    FOR v_hesap IN
        SELECT hp.id, hp.kod, hp.tip,
               COALESCE(SUM(ys.borc), 0) AS b,
               COALESCE(SUM(ys.alacak), 0) AS a
        FROM hesap_plani hp
        LEFT JOIN yevmiye_satir ys ON ys.hesap_id = hp.id
        LEFT JOIN yevmiye_fis yf ON yf.id = ys.fis_id
            AND yf.durum NOT IN ('taslak', 'iptal')
            AND yf.donem_id = p_onceki_donem_id
        WHERE hp.tip IN ('aktif', 'pasif') AND hp.aktif_mi = true
        GROUP BY hp.id, hp.kod, hp.tip
        HAVING COALESCE(SUM(ys.borc), 0) - COALESCE(SUM(ys.alacak), 0) <> 0
    LOOP
        IF v_hesap.b > v_hesap.a THEN
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap.kod, v_hesap.b - v_hesap.a, 0,
                'Devir bakiyesi');
        ELSE
            PERFORM yevmiye_satir_ekle(v_fis_id, v_hesap.kod, 0, v_hesap.a - v_hesap.b,
                'Devir bakiyesi');
        END IF;
    END LOOP;

    UPDATE yevmiye_fis SET durum = 'kayit' WHERE id = v_fis_id;
    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- kur_farki_hesapla: Dövizli hesap değerleme fişi
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION kur_farki_hesapla(
    p_tarih        date,
    p_kullanici_id bigint DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
    v_fis_id bigint;
BEGIN
    v_fis_id := yevmiye_fis_olustur(
        'duzeltme',
        'Kur farki degerleme: ' || p_tarih,
        p_tarih, NULL, NULL, p_kullanici_id
    );
    -- Gerçek hesaplama doviz_takipli hesaplar üzerinden yapılır.
    -- Şimdilik boş fiş; app katmanı doldurur.
    RETURN v_fis_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- Modül 09 ↔ 10 FK bağları
-- ----------------------------------------------------------------
ALTER TABLE hesap ADD CONSTRAINT fk_hesap_muhasebe_hesap
    FOREIGN KEY (muhasebe_hesap_id) REFERENCES hesap_plani(id);

ALTER TABLE hesap ADD CONSTRAINT fk_hesap_pos_komisyon_hesap
    FOREIGN KEY (pos_komisyon_hesap_id) REFERENCES hesap_plani(id);

ALTER TABLE hesap_hareket ADD CONSTRAINT fk_hesap_hareket_yevmiye
    FOREIGN KEY (yevmiye_fis_id) REFERENCES yevmiye_fis(id);

ALTER TABLE tahsilat_makbuzu ADD CONSTRAINT fk_tahsilat_makbuzu_yevmiye
    FOREIGN KEY (yevmiye_fis_id) REFERENCES yevmiye_fis(id);

ALTER TABLE odeme_makbuzu ADD CONSTRAINT fk_odeme_makbuzu_yevmiye
    FOREIGN KEY (yevmiye_fis_id) REFERENCES yevmiye_fis(id);
