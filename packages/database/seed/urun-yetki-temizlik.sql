-- Kuvvem v2 — Urun Yetkileri Temizlik
-- Tarih: 2026-04-18
-- Aciklama:
--   01-sistem.sql ve eski yetki-seed.sql'de bulunan tutarsiz urun yetki kodlarini temizler.
--   * urun.guncelle     → urun.duzenle ile ayni islevde, duplicate (sil)
--   * urun.fiyat_degistir → urun.fiyat-guncelle ile ayni islevde (sil)
--   * urun.fiyat.duzenle → urun.fiyat-guncelle ile ayni islevde (sil)
--   * urun.maliyet_goruntule → urun.maliyet-goruntule (rename — kebab-case tutarliligi)

BEGIN;

-- 1) Rol iliskilerini once temizle (FK constraint)
DELETE FROM rol_yetki
WHERE yetki_id IN (
    SELECT id FROM yetki
    WHERE kod IN ('urun.guncelle', 'urun.fiyat_degistir', 'urun.fiyat.duzenle')
);

-- 2) Duplicate yetki kayitlarini sil
DELETE FROM yetki
WHERE kod IN ('urun.guncelle', 'urun.fiyat_degistir', 'urun.fiyat.duzenle');

-- 3) Maliyet goruntuleme yetkisini yeni koda gec (kebab-case)
UPDATE yetki
SET kod = 'urun.maliyet-goruntule',
    eylem = 'maliyet-goruntule',
    ad = 'Maliyet Fiyati Goruntule',
    aciklama = 'Alis/maliyet fiyatlarini gorme yetkisi (gizli bilgi)'
WHERE kod = 'urun.maliyet_goruntule';

COMMIT;

-- Dogrulama
SELECT 'Urun yetki toplami:' AS bilgi, COUNT(*)::text AS deger FROM yetki WHERE modul = 'urun'
UNION ALL
SELECT 'Patron rolune atanan:', COUNT(*)::text
FROM rol_yetki ry
JOIN rol r ON r.id = ry.rol_id
JOIN yetki y ON y.id = ry.yetki_id
WHERE r.kod = 'patron' AND y.modul = 'urun'
UNION ALL
SELECT 'Olmasi beklenen:', '13';

-- Tum urun yetkilerini listele (goruntulemek icin)
SELECT kod, ad, riskli_mi FROM yetki WHERE modul = 'urun' ORDER BY kod;
