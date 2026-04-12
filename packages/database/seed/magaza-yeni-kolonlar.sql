-- Kuvvem v2 — Magaza tablosu PHP parity kolonları
-- Gun 4: Sube/Magaza yonetimi zenginlestirme
-- IF NOT EXISTS ile guvenli — tekrar calistirilabilir

ALTER TABLE magaza ADD COLUMN IF NOT EXISTS il_adi VARCHAR(50);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS ilce_adi VARCHAR(50);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS cep VARCHAR(30);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS ip VARCHAR(50);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS instagram VARCHAR(100);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS e_fatura_on_ek VARCHAR(3);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS e_arsiv_on_ek VARCHAR(3);
ALTER TABLE magaza ADD COLUMN IF NOT EXISTS harita TEXT;
