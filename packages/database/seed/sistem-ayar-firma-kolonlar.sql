-- Kuvvem v2 — SistemAyar tablosu firma alanlari (K3 fix)
-- PHP v1 parity: firma iletisim, konum, vergi bilgileri
-- IF NOT EXISTS ile guvenli — tekrar calistirilabilir

ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS kisa_ad VARCHAR(100);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS sahip_adi VARCHAR(200);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS email citext;
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS bildirim_email citext;
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS telefon VARCHAR(30);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS cep VARCHAR(30);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS faks VARCHAR(30);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS il VARCHAR(50);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS ilce VARCHAR(50);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS adres TEXT;
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS vergi_dairesi VARCHAR(100);
ALTER TABLE sistem_ayar ADD COLUMN IF NOT EXISTS vergi_no VARCHAR(50);
