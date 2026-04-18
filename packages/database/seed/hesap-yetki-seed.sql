-- Ödeme Araçları (Hesap) modülü yetkileri

INSERT INTO yetki (kod, modul, eylem, ad, aciklama, riskli_mi) VALUES
('hesap.goruntule', 'hesap', 'goruntule', 'Ödeme Araçlarını Görüntüle', 'Kasa, banka, POS, kart ve diğer ödeme araçlarını görüntüler', false),
('hesap.olustur',   'hesap', 'olustur',   'Yeni Ödeme Aracı Oluştur',  'Yeni kasa, banka hesabı, POS vb. tanımlar',                 false),
('hesap.duzenle',   'hesap', 'duzenle',   'Ödeme Aracı Düzenle',        'Mevcut ödeme aracı bilgilerini günceller',                  false),
('hesap.sil',       'hesap', 'sil',       'Ödeme Aracı Sil',            'Ödeme aracı kaydını pasife alır veya siler',                true)
ON CONFLICT (kod) DO NOTHING;

-- Admin rolüne (Sistem Yöneticisi) hepsini ata
INSERT INTO rol_yetki (rol_id, yetki_id)
SELECT r.id, y.id
FROM rol r, yetki y
WHERE r.kod = 'patron'
  AND y.kod IN ('hesap.goruntule', 'hesap.olustur', 'hesap.duzenle', 'hesap.sil')
ON CONFLICT (rol_id, yetki_id) DO NOTHING;

-- Özet
SELECT 'Yetki sayısı:' AS bilgi, COUNT(*) AS deger FROM yetki WHERE modul = 'hesap'
UNION ALL
SELECT 'Admin rol ataması:', COUNT(*) FROM rol_yetki ry
JOIN rol r ON r.id = ry.rol_id
JOIN yetki y ON y.id = ry.yetki_id
WHERE r.kod = 'patron' AND y.modul = 'hesap';
