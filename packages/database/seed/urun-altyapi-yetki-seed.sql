-- Kuvvem v2 — Ürün Altyapısı Yetkileri

INSERT INTO yetki (kod, modul, eylem, ad, aciklama, riskli_mi) VALUES
-- MARKA
('marka.goruntule', 'marka', 'goruntule', 'Markaları Görüntüle',       'Marka ve model listesi/detayı',                 false),
('marka.olustur',   'marka', 'olustur',   'Yeni Marka/Model Oluştur',  'Marka ve alt model tanımlar',                   false),
('marka.duzenle',   'marka', 'duzenle',   'Marka/Model Düzenle',        'Mevcut marka/model bilgilerini günceller',      false),
('marka.sil',       'marka', 'sil',       'Marka/Model Sil',            'Marka ve modelleri kaldırır',                   true),
-- KATEGORİ
('kategori.goruntule', 'kategori', 'goruntule', 'Kategorileri Görüntüle', 'Kategori ağacı ve detayı',                     false),
('kategori.olustur',   'kategori', 'olustur',   'Yeni Kategori Oluştur',   'Kategori ve alt kategori tanımlar',            false),
('kategori.duzenle',   'kategori', 'duzenle',   'Kategori Düzenle',         'Kategori bilgileri, taşıma, sıralama',         false),
('kategori.sil',       'kategori', 'sil',       'Kategori Sil',             'Kategori yapısını kaldırır',                   true)
ON CONFLICT (kod) DO NOTHING;

-- Patron rolüne tümünü ata
INSERT INTO rol_yetki (rol_id, yetki_id)
SELECT r.id, y.id
FROM rol r, yetki y
WHERE r.kod = 'patron'
  AND y.modul IN ('marka', 'kategori')
ON CONFLICT (rol_id, yetki_id) DO NOTHING;

SELECT 'Yetki toplamı:', COUNT(*) FROM yetki WHERE modul IN ('marka', 'kategori')
UNION ALL
SELECT 'Patron rolüne atanan:', COUNT(*) FROM rol_yetki ry
JOIN rol r ON r.id = ry.rol_id
JOIN yetki y ON y.id = ry.yetki_id
WHERE r.kod = 'patron' AND y.modul IN ('marka', 'kategori');
