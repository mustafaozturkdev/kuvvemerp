-- Kuvvem v2 — Yetki Seed
-- PHP v1 parity + v2 ek yetkiler
-- Her yetki: kod (benzersiz), modul, eylem, ad, aciklama, riskli_mi

INSERT INTO yetki (kod, modul, eylem, ad, aciklama, riskli_mi) VALUES
-- SISTEM
('sistem.ayar.goruntule',    'sistem',    'goruntule',  'Sistem Ayarlarini Goruntule',    'Firma bilgileri ve sistem ayarlarini goruntuler',   false),
('sistem.ayar.duzenle',      'sistem',    'duzenle',    'Sistem Ayarlarini Duzenle',      'Firma bilgileri ve sistem ayarlarini degistirir',    true),

-- KULLANICI
('kullanici.yonet',          'kullanici', 'yonet',      'Kullanici Yonetimi',             'Kullanici CRUD + aktiflik + sifre sifirlama',        true),

-- ROL & YETKI
('rol.yonet',                'rol',       'yonet',      'Rol ve Yetki Yonetimi',          'Rol olustur, duzenle, yetki ata',                    true),

-- MAGAZA / SUBE
('magaza.goruntule',         'magaza',    'goruntule',  'Subeleri Goruntule',             'Sube/magaza listesi ve detay',                       false),
('magaza.yonet',             'magaza',    'yonet',      'Sube Yonetimi',                  'Sube olustur, duzenle, kapat',                       true),

-- CARI
('cari.goruntule',           'cari',      'goruntule',  'Carileri Goruntule',             'Musteri/tedarikci listesi ve detay',                 false),
('cari.olustur',             'cari',      'olustur',    'Yeni Cari Olustur',              'Musteri veya tedarikci kaydi olusturur',             false),
('cari.duzenle',             'cari',      'duzenle',    'Cari Bilgilerini Duzenle',       'Mevcut cari kayitlarini gunceller',                  false),
('cari.sil',                 'cari',      'sil',        'Cari Sil (Pasif Yap)',           'Cari kaydi pasif yapar',                             true),
('cari.ekstre.goruntule',    'cari',      'ekstre',     'Cari Ekstre Goruntule',          'Borc/alacak hareketi ve ekstre',                     false),

-- URUN
('urun.goruntule',           'urun',      'goruntule',  'Urunleri Goruntule',             'Urun listesi, detay, stok durumu',                   false),
('urun.olustur',             'urun',      'olustur',    'Yeni Urun Olustur',              'Urun kaydi + varyant + fiyat',                       false),
('urun.duzenle',             'urun',      'duzenle',    'Urun Bilgilerini Duzenle',       'Mevcut urun bilgilerini gunceller',                  false),
('urun.fiyat.duzenle',       'urun',      'fiyat',      'Urun Fiyatlarini Duzenle',       'Satis/alis fiyatlarini degistirir',                  true),
('urun.sil',                 'urun',      'sil',        'Urun Sil (Pasif Yap)',           'Urun kaydi pasif yapar',                             true),

-- STOK
('stok.goruntule',           'stok',      'goruntule',  'Stok Durumunu Goruntule',        'Magaza bazli stok miktarlari',                       false),
('stok.transfer',            'stok',      'transfer',   'Stok Transferi Yap',             'Magazalar arasi stok transferi',                     false),
('stok.sayim',               'stok',      'sayim',      'Stok Sayimi Yap',                'Fiziksel stok sayimi ve duzeltme',                   true),

-- SIPARIS / FATURA — PHP'deki FaturaKesmeYetkisi karsiligi
('siparis.goruntule',        'siparis',   'goruntule',  'Siparisleri Goruntule',          'Satis/alis siparis listesi ve detay',                false),
('siparis.olustur',          'siparis',   'olustur',    'Yeni Siparis Olustur',           'Satis, alis, iade siparisi',                         false),
('siparis.duzenle',          'siparis',   'duzenle',    'Siparis Duzenle',                'Mevcut siparis bilgilerini gunceller',                false),
('siparis.iptal',            'siparis',   'iptal',      'Siparis Iptal Et',               'Siparisi iptal eder',                                true),
('fatura.kes',               'fatura',    'kes',        'Fatura Kes',                     'Satis/alis faturasi keser (PHP: FaturaKesmeYetkisi)', true),
('fatura.goruntule',         'fatura',    'goruntule',  'Faturalari Goruntule',           'Kesilen fatura listesi ve detay',                    false),

-- TOPTAN SATIS — PHP'deki ToptanSatisAcikKapali karsiligi
('toptan.satis',             'siparis',   'toptan',     'Toptan Satis Yapabilir',         'Toptan fiyat ve miktarla satis (PHP: ToptanSatisAcikKapali)', false),

-- TEKLIF — PHP'deki TeklifAcikKapali karsiligi
('teklif.goruntule',         'teklif',    'goruntule',  'Teklifleri Goruntule',           'Teklif listesi ve detay',                            false),
('teklif.olustur',           'teklif',    'olustur',    'Yeni Teklif Olustur',            'Teklif olusturur (PHP: TeklifAcikKapali)',            false),

-- FINANS
('finans.goruntule',         'finans',    'goruntule',  'Finansal Verileri Goruntule',    'Hesap, hareket, tahsilat/odeme listesi',             false),
('finans.tahsilat',          'finans',    'tahsilat',   'Tahsilat / Odeme Yap',           'Kasa hareketi olusturur',                            false),
('finans.hesap.yonet',       'finans',    'hesap',      'Hesap Yonetimi',                 'Kasa/banka hesabi olustur/duzenle',                  true),
('finans.gider',             'finans',    'gider',      'Gider Kaydi Olustur',            'Gider fis/fatura kaydeder',                          false),

-- MUHASEBE
('muhasebe.goruntule',       'muhasebe',  'goruntule',  'Muhasebe Goruntule',             'Yevmiye fisi, mizan goruntuler',                     false),
('muhasebe.fis.olustur',     'muhasebe',  'fis',        'Yevmiye Fisi Olustur',           'Manuel yevmiye fisi girer',                          true),

-- RAPOR
('rapor.goruntule',          'rapor',     'goruntule',  'Raporlari Goruntule',            'Satis, stok, finans raporlari',                      false),
('rapor.excel.indir',        'rapor',     'excel',      'Excel Rapor Indir',              'Verileri Excel olarak export eder',                  false),

-- ETICARET
('eticaret.goruntule',       'eticaret',  'goruntule',  'E-Ticaret Siparislerini Gor',   'Online siparis listesi ve detay',                    false),
('eticaret.yonet',           'eticaret',  'yonet',      'E-Ticaret Yonetimi',            'Siparis durumu guncelle, kargo ata',                 false),

-- PAZARYERI
('pazaryeri.goruntule',      'pazaryeri', 'goruntule',  'Pazaryeri Goruntule',            'Pazaryeri siparis ve urun eslesmesi',                false),
('pazaryeri.yonet',          'pazaryeri', 'yonet',      'Pazaryeri Yonetimi',             'Pazaryeri entegrasyon ve esleme yonetimi',            false),

-- CRM
('crm.goruntule',            'crm',       'goruntule',  'CRM Goruntule',                  'Firsat, aktivite, gorev listesi',                    false),
('crm.yonet',                'crm',       'yonet',      'CRM Yonetimi',                   'Firsat, aktivite, gorev olustur/duzenle',            false),

-- DEMIRBAS
('demirbas.goruntule',       'demirbas',  'goruntule',  'Demirbas Goruntule',             'Demirbas listesi ve detay',                          false),
('demirbas.yonet',           'demirbas',  'yonet',      'Demirbas Yonetimi',              'Demirbas ekle, duzenle, bakim kaydi',                false),

-- PERSONEL
('personel.goruntule',       'personel',  'goruntule',  'Personeli Goruntule',            'Personel listesi ve detay',                          false),
('personel.yonet',           'personel',  'yonet',      'Personel Yonetimi',              'Personel CRUD + maas + odeme',                       true)

ON CONFLICT (kod) DO NOTHING;
