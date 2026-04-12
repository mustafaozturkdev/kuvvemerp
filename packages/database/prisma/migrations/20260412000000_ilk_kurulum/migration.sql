-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "plan" (
    "id" BIGSERIAL NOT NULL,
    "kod" VARCHAR(50) NOT NULL,
    "ad" VARCHAR(100) NOT NULL,
    "aciklama" TEXT,
    "aylik_ucret" DECIMAL(18,4) NOT NULL,
    "yillik_ucret" DECIMAL(18,4) NOT NULL,
    "para_birimi_kod" CHAR(3) NOT NULL DEFAULT 'TRY',
    "max_magaza" INTEGER,
    "max_kullanici" INTEGER,
    "max_urun" INTEGER,
    "max_aylik_siparis" INTEGER,
    "max_aylik_api_cagri" INTEGER,
    "max_disk_mb" INTEGER,
    "ozellikler" JSONB NOT NULL DEFAULT '{}',
    "sira" INTEGER NOT NULL DEFAULT 0,
    "populer_mi" BOOLEAN NOT NULL DEFAULT false,
    "aktif_mi" BOOLEAN NOT NULL DEFAULT true,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncelleme_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "ad" VARCHAR(200) NOT NULL,
    "db_adi" VARCHAR(100) NOT NULL,
    "db_sunucu" VARCHAR(200),
    "db_sema_versiyonu" VARCHAR(20),
    "plan_id" BIGINT NOT NULL,
    "durum" VARCHAR(20) NOT NULL DEFAULT 'deneme',
    "deneme_baslangic" TIMESTAMPTZ(6),
    "deneme_bitis" TIMESTAMPTZ(6),
    "askiya_alma_tarihi" TIMESTAMPTZ(6),
    "askiya_alma_nedeni" TEXT,
    "iptal_tarihi" TIMESTAMPTZ(6),
    "iptal_nedeni" TEXT,
    "varsayilan_dil" CHAR(2) NOT NULL DEFAULT 'tr',
    "varsayilan_para_birimi" CHAR(3) NOT NULL DEFAULT 'TRY',
    "zaman_dilimi" VARCHAR(50) NOT NULL DEFAULT 'Europe/Istanbul',
    "ulke_kodu" CHAR(2) NOT NULL DEFAULT 'TR',
    "iletisim_email" CITEXT NOT NULL,
    "iletisim_telefon" VARCHAR(30),
    "iletisim_yetkili_ad" VARCHAR(200),
    "notlar" TEXT,
    "etiketler" TEXT[],
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncelleme_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domain" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" CITEXT NOT NULL,
    "tip" VARCHAR(30) NOT NULL,
    "cloudflare_zone_id" VARCHAR(100),
    "cloudflare_hostname_id" VARCHAR(100),
    "ssl_durum" VARCHAR(20) NOT NULL DEFAULT 'beklemede',
    "dogrulama_durum" VARCHAR(20) NOT NULL DEFAULT 'beklemede',
    "dogrulama_tokeni" VARCHAR(100),
    "dogrulama_yontemi" VARCHAR(20),
    "son_dogrulama_denemesi" TIMESTAMPTZ(6),
    "varsayilan_mi" BOOLEAN NOT NULL DEFAULT false,
    "aktif_mi" BOOLEAN NOT NULL DEFAULT true,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_kullanici" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "sifre_hash" VARCHAR(255) NOT NULL,
    "ad" VARCHAR(100) NOT NULL,
    "soyad" VARCHAR(100) NOT NULL,
    "telefon" VARCHAR(30),
    "avatar_url" TEXT,
    "rol" VARCHAR(20) NOT NULL,
    "iki_faktor_aktif" BOOLEAN NOT NULL DEFAULT false,
    "iki_faktor_secret" VARCHAR(100),
    "son_giris_tarihi" TIMESTAMPTZ(6),
    "son_giris_ip" INET,
    "aktif_mi" BOOLEAN NOT NULL DEFAULT true,
    "silindi_mi" BOOLEAN NOT NULL DEFAULT false,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncelleme_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_kullanici_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_kullanici_tenant" (
    "platform_kullanici_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rol" VARCHAR(50) NOT NULL,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_kullanici_tenant_pkey" PRIMARY KEY ("platform_kullanici_id","tenant_id")
);

-- CreateTable
CREATE TABLE "abonelik" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "durum" VARCHAR(20) NOT NULL,
    "yenileme_tipi" VARCHAR(20) NOT NULL DEFAULT 'aylik',
    "baslangic_tarihi" TIMESTAMPTZ(6) NOT NULL,
    "bitis_tarihi" TIMESTAMPTZ(6),
    "sonraki_fatura_tarihi" TIMESTAMPTZ(6),
    "iptal_tarihi" TIMESTAMPTZ(6),
    "iptal_donem_sonu_mu" BOOLEAN NOT NULL DEFAULT true,
    "iptal_nedeni" TEXT,
    "stripe_subscription_id" VARCHAR(100),
    "stripe_customer_id" VARCHAR(100),
    "indirim_kodu" VARCHAR(50),
    "indirim_orani" DECIMAL(5,2) DEFAULT 0,
    "indirim_bitis_tarihi" TIMESTAMPTZ(6),
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncelleme_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonelik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonelik_fatura" (
    "id" BIGSERIAL NOT NULL,
    "abonelik_id" BIGINT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fatura_no" VARCHAR(50) NOT NULL,
    "ara_toplam" DECIMAL(18,4) NOT NULL,
    "indirim_tutari" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vergi_tutari" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "toplam_tutar" DECIMAL(18,4) NOT NULL,
    "para_birimi_kod" CHAR(3) NOT NULL,
    "durum" VARCHAR(20) NOT NULL,
    "odeme_tarihi" TIMESTAMPTZ(6),
    "son_odeme_tarihi" TIMESTAMPTZ(6) NOT NULL,
    "odeme_yontemi" VARCHAR(50),
    "stripe_invoice_id" VARCHAR(100),
    "stripe_payment_intent_id" VARCHAR(100),
    "pdf_url" TEXT,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonelik_fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kullanim_metrik_gunluk" (
    "tarih" DATE NOT NULL,
    "tenant_id" UUID NOT NULL,
    "siparis_sayisi" INTEGER NOT NULL DEFAULT 0,
    "api_cagri_sayisi" INTEGER NOT NULL DEFAULT 0,
    "aktif_kullanici_sayisi" INTEGER NOT NULL DEFAULT 0,
    "disk_kullanimi_mb" INTEGER NOT NULL DEFAULT 0,
    "urun_sayisi" INTEGER NOT NULL DEFAULT 0,
    "magaza_sayisi" INTEGER NOT NULL DEFAULT 0,
    "ciro_try" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "kullanim_metrik_gunluk_pkey" PRIMARY KEY ("tarih","tenant_id")
);

-- CreateTable
CREATE TABLE "platform_log" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID,
    "seviye" VARCHAR(10) NOT NULL,
    "kategori" VARCHAR(50) NOT NULL,
    "mesaj" TEXT NOT NULL,
    "metadata" JSONB,
    "olusturma_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_backup" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tip" VARCHAR(20) NOT NULL,
    "durum" VARCHAR(20) NOT NULL,
    "dosya_yolu" TEXT,
    "dosya_boyutu_mb" DECIMAL(12,2),
    "sikistirma_orani" DECIMAL(5,2),
    "baslangic_tarihi" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bitis_tarihi" TIMESTAMPTZ(6),
    "sure_saniye" INTEGER,
    "hata_mesaji" TEXT,
    "saklama_son_tarihi" TIMESTAMPTZ(6),

    CONSTRAINT "tenant_backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_kod_key" ON "plan"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_db_adi_key" ON "tenant"("db_adi");

-- CreateIndex
CREATE INDEX "tenant_durum_idx" ON "tenant"("durum");

-- CreateIndex
CREATE INDEX "tenant_iletisim_email_idx" ON "tenant"("iletisim_email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domain_domain_key" ON "tenant_domain"("domain");

-- CreateIndex
CREATE INDEX "tenant_domain_tenant_id_idx" ON "tenant_domain"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_domain_aktif_mi_idx" ON "tenant_domain"("aktif_mi");

-- CreateIndex
CREATE UNIQUE INDEX "platform_kullanici_email_key" ON "platform_kullanici"("email");

-- CreateIndex
CREATE UNIQUE INDEX "abonelik_stripe_subscription_id_key" ON "abonelik"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "abonelik_tenant_id_idx" ON "abonelik"("tenant_id");

-- CreateIndex
CREATE INDEX "abonelik_durum_idx" ON "abonelik"("durum");

-- CreateIndex
CREATE UNIQUE INDEX "abonelik_fatura_fatura_no_key" ON "abonelik_fatura"("fatura_no");

-- CreateIndex
CREATE UNIQUE INDEX "abonelik_fatura_stripe_invoice_id_key" ON "abonelik_fatura"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "abonelik_fatura_tenant_id_idx" ON "abonelik_fatura"("tenant_id");

-- CreateIndex
CREATE INDEX "abonelik_fatura_durum_idx" ON "abonelik_fatura"("durum");

-- CreateIndex
CREATE INDEX "kullanim_metrik_gunluk_tenant_id_tarih_idx" ON "kullanim_metrik_gunluk"("tenant_id", "tarih");

-- CreateIndex
CREATE INDEX "platform_log_tenant_id_olusturma_tarihi_idx" ON "platform_log"("tenant_id", "olusturma_tarihi");

-- CreateIndex
CREATE INDEX "platform_log_kategori_olusturma_tarihi_idx" ON "platform_log"("kategori", "olusturma_tarihi");

-- CreateIndex
CREATE INDEX "platform_log_seviye_olusturma_tarihi_idx" ON "platform_log"("seviye", "olusturma_tarihi");

-- CreateIndex
CREATE INDEX "tenant_backup_tenant_id_baslangic_tarihi_idx" ON "tenant_backup"("tenant_id", "baslangic_tarihi");

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_domain" ADD CONSTRAINT "tenant_domain_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_kullanici_tenant" ADD CONSTRAINT "platform_kullanici_tenant_platform_kullanici_id_fkey" FOREIGN KEY ("platform_kullanici_id") REFERENCES "platform_kullanici"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_kullanici_tenant" ADD CONSTRAINT "platform_kullanici_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonelik" ADD CONSTRAINT "abonelik_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonelik" ADD CONSTRAINT "abonelik_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonelik_fatura" ADD CONSTRAINT "abonelik_fatura_abonelik_id_fkey" FOREIGN KEY ("abonelik_id") REFERENCES "abonelik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonelik_fatura" ADD CONSTRAINT "abonelik_fatura_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kullanim_metrik_gunluk" ADD CONSTRAINT "kullanim_metrik_gunluk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_log" ADD CONSTRAINT "platform_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_backup" ADD CONSTRAINT "tenant_backup_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

