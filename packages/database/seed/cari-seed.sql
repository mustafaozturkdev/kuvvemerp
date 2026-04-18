-- Kuvvem v2 — Demo Cari Seed (20 kayit)
-- Gercekci Turkce firma/kisi bilgileri ile dolu

-- Demo icin vergi no dogrulama trigger'ini gecici devre disi birak
ALTER TABLE cari DISABLE TRIGGER trg_cari_vergi_no_dogrula;

INSERT INTO cari (kod, tip, kisi_tipi, ad, soyad, unvan, kisa_ad, vergi_no, vergi_no_tipi, para_birimi_kod, iskonto_orani, vade_gun, aktif_mi, kvkk_onay_mi, sektor) VALUES
('M-001', 'musteri',    'tuzel',  NULL,      NULL,       'Acme Tekstil Ltd. Sti.',         'Acme Tekstil',     '1234567890', 'VKN',  'TRY', 5.00, 30, true,  true,  'Tekstil'),
('M-002', 'musteri',    'tuzel',  NULL,      NULL,       'Mavi Deniz Gida A.S.',           'Mavi Deniz',       '9876543210', 'VKN',  'TRY', 3.00, 45, true,  true,  'Gida'),
('M-003', 'musteri',    'tuzel',  NULL,      NULL,       'Demir Insaat Taah. Ltd. Sti.',   'Demir Insaat',     '5678901234', 'VKN',  'TRY', 0.00, 60, true,  false, 'Insaat'),
('M-004', 'musteri',    'gercek', 'Ayse',    'Yilmaz',  NULL,                              NULL,               '12345678901','TCKN', 'TRY', 0.00,  0, false, true,  NULL),
('M-005', 'musteri',    'tuzel',  NULL,      NULL,       'Yildiz Elektronik San. Tic.',    'Yildiz Elek.',     '3456789012', 'VKN',  'TRY', 7.50, 30, true,  true,  'Elektronik'),
('T-001', 'tedarikci',  'tuzel',  NULL,      NULL,       'Atlas Ambalaj A.S.',              'Atlas Ambalaj',    '2345678901', 'VKN',  'TRY', 0.00, 30, true,  true,  'Ambalaj'),
('T-002', 'tedarikci',  'tuzel',  NULL,      NULL,       'Bosphorus Lojistik Ltd.',        'Bosphorus',        '8765432109', 'VKN',  'TRY', 2.00, 15, true,  true,  'Lojistik'),
('M-006', 'musteri',    'gercek', 'Mehmet',  'Kaya',    NULL,                              NULL,               '23456789012','TCKN', 'TRY', 0.00,  0, true,  true,  NULL),
('M-007', 'musteri',    'tuzel',  NULL,      NULL,       'Gunes Market Gida Paz. Ltd.',    'Gunes Market',     '4567890123', 'VKN',  'TRY', 4.00, 30, true,  true,  'Perakende'),
('T-003', 'tedarikci',  'tuzel',  NULL,      NULL,       'Anadolu Kimya San. A.S.',        'Anadolu Kimya',    '6789012345', 'VKN',  'TRY', 0.00, 45, true,  false, 'Kimya'),
('M-008', 'her_ikisi',  'tuzel',  NULL,      NULL,       'Karadeniz Balik Urunleri',       'Karadeniz Balik',  '7890123456', 'VKN',  'TRY', 2.50, 30, true,  true,  'Gida'),
('M-009', 'musteri',    'tuzel',  NULL,      NULL,       'Ege Zeytinyagi Koop.',           'Ege Zeytin',       '8901234567', 'VKN',  'TRY', 3.00, 60, true,  true,  'Tarim'),
('M-010', 'musteri',    'gercek', 'Fatma',   'Demir',   NULL,                              NULL,               '34567890123','TCKN', 'TRY', 0.00,  0, true,  true,  NULL),
('T-004', 'tedarikci',  'tuzel',  NULL,      NULL,       'Turk Kagit San. A.S.',           'Turk Kagit',       '0123456789', 'VKN',  'TRY', 0.00, 30, true,  true,  'Kagit'),
('M-011', 'musteri',    'tuzel',  NULL,      NULL,       'Ozcan Mobilya Dekorasyon',       'Ozcan Mobilya',    '1122334455', 'VKN',  'TRY', 5.00, 45, true,  true,  'Mobilya'),
('M-012', 'musteri',    'tuzel',  NULL,      NULL,       'Akdeniz Tur. Otel. A.S.',        'Akdeniz Turizm',   '5566778899', 'VKN',  'TRY', 8.00, 30, true,  true,  'Turizm'),
('T-005', 'tedarikci',  'tuzel',  NULL,      NULL,       'Konya Un Sanayi Ltd.',           'Konya Un',         '9988776655', 'VKN',  'TRY', 0.00, 15, true,  true,  'Gida'),
('M-013', 'musteri',    'gercek', 'Ali',     'Ozturk',  NULL,                              NULL,               '45678901234','TCKN', 'TRY', 0.00,  0, true,  false, NULL),
('M-014', 'musteri',    'tuzel',  NULL,      NULL,       'Istiklal Eczane Deposu',         'Istiklal Eczane',  '6677889900', 'VKN',  'TRY', 6.00, 60, true,  true,  'Saglik'),
('M-015', 'her_ikisi',  'tuzel',  NULL,      NULL,       'Cappadocia Hali San. A.S.',      'Cappadocia Hali',  '4433221100', 'VKN',  'USD', 10.00, 90, true,  true,  'Tekstil')
ON CONFLICT DO NOTHING;

-- Trigger'i tekrar etkinlestir
ALTER TABLE cari ENABLE TRIGGER trg_cari_vergi_no_dogrula;
