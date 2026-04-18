-- Kuvvem v2 — Marka + Kategori Demo Seed

BEGIN;

-- ────────────────────────────────────────────────
-- MARKA + MODEL
-- ────────────────────────────────────────────────

INSERT INTO marka (kod, ad, aciklama, ulke_kodu, eticaret_aktif, b2b_aktif, sira) VALUES
('NIKE',     'Nike',         'Spor giyim ve ayakkabı',         'US', true,  true, 1),
('ADIDAS',   'Adidas',       'Spor giyim ve ayakkabı',         'DE', true,  true, 2),
('APPLE',    'Apple',        'Teknoloji ve elektronik',         'US', true,  false, 3),
('SAMSUNG',  'Samsung',      'Teknoloji ve beyaz eşya',         NULL, true,  true, 4),
('FORD',     'Ford',         'Otomotiv',                        'US', false, true, 5),
('LCWAIKIKI','LC Waikiki',   'Tekstil ve giyim',                'TR', true,  true, 6)
ON CONFLICT (kod) DO NOTHING;

-- Apple modelleri (telefon)
INSERT INTO marka_model (marka_id, kod, ad, uretim_yili, sira) VALUES
((SELECT id FROM marka WHERE kod='APPLE'), 'IP15PM', 'iPhone 15 Pro Max', 2024, 1),
((SELECT id FROM marka WHERE kod='APPLE'), 'IP15P',  'iPhone 15 Pro',     2024, 2),
((SELECT id FROM marka WHERE kod='APPLE'), 'IP15',   'iPhone 15',         2024, 3),
((SELECT id FROM marka WHERE kod='APPLE'), 'IP14',   'iPhone 14',         2023, 4),
-- Samsung modelleri
((SELECT id FROM marka WHERE kod='SAMSUNG'), 'GS24U', 'Galaxy S24 Ultra', 2024, 1),
((SELECT id FROM marka WHERE kod='SAMSUNG'), 'GS24',  'Galaxy S24',       2024, 2),
((SELECT id FROM marka WHERE kod='SAMSUNG'), 'GA55',  'Galaxy A55',       2024, 3),
-- Ford modelleri (servis araç)
((SELECT id FROM marka WHERE kod='FORD'), 'TR350',  'Transit 350',       2024, 1),
((SELECT id FROM marka WHERE kod='FORD'), 'TRC',    'Transit Custom',    2024, 2),
((SELECT id FROM marka WHERE kod='FORD'), 'CMAX',   'Connect Max',       2023, 3)
ON CONFLICT (marka_id, ad) DO NOTHING;

-- ────────────────────────────────────────────────
-- KATEGORİ AĞACI (3 seviye)
-- ────────────────────────────────────────────────

-- Kök kategoriler
INSERT INTO kategori (kod, ad, aciklama, ust_kategori_id, seviye, ikon, renk, eticaret_aktif, b2b_aktif, sira) VALUES
('ELEKTRONIK', 'Elektronik', 'Telefon, bilgisayar, ses ve görüntü',  NULL, 1, 'Smartphone', '#3B82F6', true, true, 1),
('GIYIM',       'Giyim',     'Kadın, erkek, çocuk giyim ve ayakkabı', NULL, 1, 'Shirt',      '#EC4899', true, true, 2),
('OTOMOTIV',    'Otomotiv',  'Yedek parça ve aksesuar',               NULL, 1, 'Car',        '#F59E0B', false, true, 3),
('GIDA',        'Gıda',       'Temel gıda ve içecek',                  NULL, 1, 'Apple',      '#22C55E', true, false, 4)
ON CONFLICT (kod) DO NOTHING;

-- Elektronik alt kategoriler
INSERT INTO kategori (kod, ad, ust_kategori_id, seviye, eticaret_aktif, b2b_aktif, sira) VALUES
('ELK_TELEFON', 'Telefon',     (SELECT id FROM kategori WHERE kod='ELEKTRONIK'), 2, true, true, 1),
('ELK_BILGISAYAR', 'Bilgisayar', (SELECT id FROM kategori WHERE kod='ELEKTRONIK'), 2, true, true, 2),
('ELK_TV', 'TV & Ses',          (SELECT id FROM kategori WHERE kod='ELEKTRONIK'), 2, true, true, 3)
ON CONFLICT (kod) DO NOTHING;

-- Telefon alt alt
INSERT INTO kategori (kod, ad, ust_kategori_id, seviye, eticaret_aktif, b2b_aktif, sira) VALUES
('ELK_TEL_AKILLI', 'Akıllı Telefon', (SELECT id FROM kategori WHERE kod='ELK_TELEFON'), 3, true, true, 1),
('ELK_TEL_AKSES',  'Telefon Aksesuar', (SELECT id FROM kategori WHERE kod='ELK_TELEFON'), 3, true, true, 2)
ON CONFLICT (kod) DO NOTHING;

-- Giyim alt
INSERT INTO kategori (kod, ad, ust_kategori_id, seviye, eticaret_aktif, b2b_aktif, sira) VALUES
('GIY_KADIN',  'Kadın',  (SELECT id FROM kategori WHERE kod='GIYIM'), 2, true, true, 1),
('GIY_ERKEK',  'Erkek',  (SELECT id FROM kategori WHERE kod='GIYIM'), 2, true, true, 2),
('GIY_COCUK',  'Çocuk',  (SELECT id FROM kategori WHERE kod='GIYIM'), 2, true, true, 3)
ON CONFLICT (kod) DO NOTHING;

-- Erkek alt alt
INSERT INTO kategori (kod, ad, ust_kategori_id, seviye, eticaret_aktif, b2b_aktif, sira) VALUES
('GIY_ERK_TSORT',   'T-Shirt',    (SELECT id FROM kategori WHERE kod='GIY_ERKEK'), 3, true, true, 1),
('GIY_ERK_PANTOLON','Pantolon',   (SELECT id FROM kategori WHERE kod='GIY_ERKEK'), 3, true, true, 2),
('GIY_ERK_AYAKKABI','Ayakkabı',   (SELECT id FROM kategori WHERE kod='GIY_ERKEK'), 3, true, true, 3)
ON CONFLICT (kod) DO NOTHING;

COMMIT;

SELECT 'Marka:', COUNT(*) FROM marka WHERE silindi_mi=false
UNION ALL SELECT 'Marka modeli:', COUNT(*) FROM marka_model WHERE silindi_mi=false
UNION ALL SELECT 'Kategori (kök):', COUNT(*) FROM kategori WHERE ust_kategori_id IS NULL AND silindi_mi=false
UNION ALL SELECT 'Kategori (toplam):', COUNT(*) FROM kategori WHERE silindi_mi=false;
