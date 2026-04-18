-- Kuvvem v2 — Urun Modulu Yetkileri
-- Tarih: 2026-04-18

INSERT INTO yetki (kod, modul, eylem, ad, aciklama, riskli_mi) VALUES
-- URUN — Temel CRUD
('urun.goruntule',      'urun', 'goruntule',      'Urunleri Goruntule',             'Urun listesi ve detayini gorme',                  false),
('urun.olustur',        'urun', 'olustur',        'Yeni Urun Olustur',               'Tekli ve varyantli urun kaydi',                   false),
('urun.duzenle',        'urun', 'duzenle',        'Urun Duzenle',                    'Mevcut urun bilgilerini gunceller',               false),
('urun.sil',            'urun', 'sil',            'Urun Sil',                        'Urunu pasif/silme islemi',                        true),
-- URUN — Toplu / ozel islemler
('urun.ice-aktar',      'urun', 'ice-aktar',      'Ice Aktar (Excel/CSV)',           'Toplu urun ice aktarimi',                         true),
('urun.toplu-islem',    'urun', 'toplu-islem',    'Toplu Urun Islemi',               'Secili urunlere toplu guncelleme (durum, kategori, marka, bayraklar)', true),
('urun.fiyat-guncelle', 'urun', 'fiyat-guncelle', 'Fiyat Guncelle',                   'Urun fiyatlarinda tekli/toplu degisiklik',        true),
('urun.etiket-yazdir',  'urun', 'etiket-yazdir',  'Etiket/Barkod Yazdir',            'Urun etiketi ve barkod ciktisi',                  false),
-- URUN — Varyant / resim / ozellik
('urun.varyant-yonet',  'urun', 'varyant-yonet',  'Varyant Yonet',                    'Urun varyantlarini (renk, beden, vb.) yonetir',   false),
('urun.resim-yonet',    'urun', 'resim-yonet',    'Resim Yonet',                      'Urun resim ve galerilerini yonetir',              false),
('urun.pazaryeri-yonet',  'urun', 'pazaryeri-yonet',  'Pazaryeri Eslestirme',           'Pazaryeri urun eslesmelerini yonetir',                 true),
('urun.stok-ayarla',      'urun', 'stok-ayarla',      'Stok Ayarla',                     'Magaza bazli stok degerlerini manuel duzenler',        true),
-- URUN — Ozel goruntuleme yetkileri
('urun.maliyet-goruntule','urun', 'maliyet-goruntule','Maliyet Fiyati Goruntule',        'Alis/maliyet fiyatlarini gorme yetkisi (gizli bilgi)', true)
ON CONFLICT (kod) DO NOTHING;

-- Patron rolune tum urun yetkilerini ata
INSERT INTO rol_yetki (rol_id, yetki_id)
SELECT r.id, y.id
FROM rol r, yetki y
WHERE r.kod = 'patron'
  AND y.modul = 'urun'
ON CONFLICT (rol_id, yetki_id) DO NOTHING;

-- ────────────────────────────────────────────────
-- Dogrulama ozeti
-- ────────────────────────────────────────────────
SELECT 'Urun yetki toplami:' AS bilgi, COUNT(*)::text AS deger
FROM yetki WHERE modul = 'urun'
UNION ALL
SELECT 'Patron rolune atanan:', COUNT(*)::text
FROM rol_yetki ry
JOIN rol r ON r.id = ry.rol_id
JOIN yetki y ON y.id = ry.yetki_id
WHERE r.kod = 'patron' AND y.modul = 'urun'
UNION ALL
SELECT 'Olmasi beklenen:', '13';
