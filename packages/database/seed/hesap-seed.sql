-- Kuvvem v2 — Ödeme Araçları Demo Seed
-- 5 varsayılan grup + 7 demo hesap (her tipten en az 1)

BEGIN;

-- ────────────────────────────────────────────────
-- 5 VARSAYILAN HESAP GRUBU
-- ────────────────────────────────────────────────

INSERT INTO hesap_grup (kod, ad, aciklama, ikon, renk, sira, aktif_mi) VALUES
('NAKIT',  'Nakit',         'Nakit kasaları',                   'Banknote',   '#22C55E', 1, true),
('BANKA',  'Banka',         'Banka hesapları',                  'Building2',  '#3B82F6', 2, true),
('KART',   'Kredi Kartı',   'Firma harcama kartları',           'CreditCard', '#A855F7', 3, true),
('POS',    'POS / Sanal',   'POS cihazları ve sanal POSlar',    'Smartphone', '#F59E0B', 4, true),
('ONLINE', 'Online / Pazar','E-cüzdan ve pazaryeri alacakları', 'Globe',      '#EC4899', 5, true)
ON CONFLICT (kod) DO NOTHING;

-- ────────────────────────────────────────────────
-- 7 DEMO ÖDEME ARACI (her tipten)
-- Not: magazalar JSON içinde Merkez Mağaza (id=3) referans alınıyor
-- ────────────────────────────────────────────────

INSERT INTO hesap (
    kod, ad, tip, grup_id, para_birimi_kod,
    magazalar, ayarlar,
    banka_adi, sube, hesap_no, iban, swift_kod,
    pos_saglayici, pos_komisyon_orani, pos_blokeli_gun,
    baslangic_bakiye, negatif_bakiye_izin, limit_tutar,
    varsayilan_mi, sira, aktif_mi
) VALUES
-- 1) Ana Kasa (TRY)
(
    'KASA-TRY-01', 'Ana Kasa (TL)', 'kasa',
    (SELECT id FROM hesap_grup WHERE kod = 'NAKIT'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"sayimZorunlu": true, "otomatikYuvarla": false}'::jsonb,
    NULL, NULL, NULL, NULL, NULL,
    NULL, 0, 0,
    10000, false, NULL,
    true, 1, true
),
-- 2) USD Kasa
(
    'KASA-USD-01', 'USD Kasa', 'kasa',
    (SELECT id FROM hesap_grup WHERE kod = 'NAKIT'),
    'USD',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"sayimZorunlu": true}'::jsonb,
    NULL, NULL, NULL, NULL, NULL,
    NULL, 0, 0,
    500, false, NULL,
    false, 2, true
),
-- 3) Garanti Banka Hesabı (TRY)
(
    'BANKA-TRY-01', 'Garanti Ana Hesap', 'banka',
    (SELECT id FROM hesap_grup WHERE kod = 'BANKA'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    NULL,
    'Garanti BBVA', 'Kadıköy Şubesi', '6123456', 'TR330006200119000006672315', 'TGBATRIS',
    NULL, 0, 0,
    50000, false, NULL,
    true, 1, true
),
-- 4) Şirket Platinum Kredi Kartı
(
    'KART-TRY-01', 'Şirket Platinum Kartı', 'kredi_karti',
    (SELECT id FROM hesap_grup WHERE kod = 'KART'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"kartSonDortHane": "4567", "ekstreKesimGunu": 5, "sonOdemeGunu": 25}'::jsonb,
    'Yapı Kredi', NULL, NULL, NULL, NULL,
    NULL, 0, 0,
    0, true, 50000,
    true, 1, true
),
-- 5) İyzico Sanal POS
(
    'POS-TRY-01', 'İyzico Sanal POS', 'pos',
    (SELECT id FROM hesap_grup WHERE kod = 'POS'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"posAltTipi": "sanal", "entegrasyonTipi": "api", "komisyonTipi": "yuzde", "testModu": true, "desteklenenKartlar": {"visa": true, "mastercard": true, "amex": false, "troy": true}}'::jsonb,
    'Denizbank', NULL, NULL, NULL, NULL,
    'iyzico', 2.49, 1,
    0, false, NULL,
    true, 1, true
),
-- 6) Pavo Fiziksel POS (Tezgah)
(
    'POS-TRY-02', 'Tezgah POS (Pavo)', 'pos',
    (SELECT id FROM hesap_grup WHERE kod = 'POS'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"posAltTipi": "fiziksel", "cihazMarkasi": "PAVO", "cihazSeriNo": "PV-12345", "entegrasyonTipi": "manuel", "komisyonTipi": "yuzde"}'::jsonb,
    'İş Bankası', NULL, NULL, NULL, NULL,
    'param', 2.15, 1,
    0, false, NULL,
    false, 2, true
),
-- 7) Çek Portföyü
(
    'CEK-TRY-01', 'Alınan Çekler Portföyü', 'cek_portfoy',
    (SELECT id FROM hesap_grup WHERE kod = 'ONLINE'),
    'TRY',
    '{"magazaIdler":[3],"varsayilanMagazaId":3}'::jsonb,
    '{"otomatikUyari": true, "vadeUyariGun": 7}'::jsonb,
    NULL, NULL, NULL, NULL, NULL,
    NULL, 0, 0,
    0, false, NULL,
    true, 1, true
)
ON CONFLICT (kod) DO NOTHING;

COMMIT;

-- Özet
SELECT
    hg.ad AS grup,
    h.kod,
    h.ad,
    h.tip,
    h.para_birimi_kod,
    h.baslangic_bakiye,
    h.varsayilan_mi,
    h.magazalar
FROM hesap h
LEFT JOIN hesap_grup hg ON hg.id = h.grup_id
WHERE h.silindi_mi = false
ORDER BY hg.sira, h.sira;
