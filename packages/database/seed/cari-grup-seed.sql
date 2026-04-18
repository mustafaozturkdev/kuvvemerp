-- Kuvvem v2 — Demo Cari Grup Seed

INSERT INTO cari_grup (kod, ad, aciklama, varsayilan_iskonto_orani, varsayilan_vade_gun, sira, aktif_mi) VALUES
('GRP-001', 'Perakende Musteriler',    'Bireysel alisveris yapan musteriler',     0,    0,   1, true),
('GRP-002', 'Toptan Musteriler',       'Toptan alis yapan bayiler',               5.00, 30,  2, true),
('GRP-003', 'VIP Musteriler',          'Yuksek cirolu ozel musteriler',           10.00, 60, 3, true),
('GRP-004', 'Hammadde Tedarikcileri',  'Hammadde ve yari mamul tedarikcileri',    0,    45,  4, true),
('GRP-005', 'Hizmet Tedarikcileri',    'Dis hizmet saglayicilar',                 0,    30,  5, true)
ON CONFLICT DO NOTHING;
