/**
 * Master DB seed — baslangic plan + demo tenant + platform admin.
 * Calistirma: pnpm db:seed
 */
import { PrismaClient } from '../node_modules/.prisma/master/index.js';
import argon2 from 'argon2';

const master = new PrismaClient();

async function main() {
  // Plan'lar (idempotent upsert)
  const starter = await master.plan.upsert({
    where: { kod: 'starter' },
    update: {},
    create: {
      kod: 'starter',
      ad: 'Starter',
      aylikUcret: '29',
      yillikUcret: '290',
      maxMagaza: 1,
      maxKullanici: 3,
      maxUrun: 500,
      ozellikler: { eticaret: false, pazaryeri: false, muhasebe: false },
      sira: 1,
    },
  });

  await master.plan.upsert({
    where: { kod: 'business' },
    update: {},
    create: {
      kod: 'business',
      ad: 'Business',
      aylikUcret: '99',
      yillikUcret: '990',
      maxMagaza: 5,
      maxKullanici: 15,
      maxUrun: 10000,
      ozellikler: { eticaret: true, pazaryeri: false, muhasebe: true },
      sira: 2,
    },
  });

  await master.plan.upsert({
    where: { kod: 'pro' },
    update: {},
    create: {
      kod: 'pro',
      ad: 'Pro',
      aylikUcret: '299',
      yillikUcret: '2990',
      maxMagaza: 20,
      maxKullanici: 50,
      ozellikler: { eticaret: true, pazaryeri: true, muhasebe: true },
      sira: 3,
    },
  });

  // Demo tenant
  const demoTenant = await master.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      slug: 'demo',
      ad: 'Demo Magaza',
      dbAdi: 'kuvvem_tenant_demo',
      planId: starter.id,
      durum: 'deneme',
      iletisimEmail: 'demo@kuvvem.local',
      denemeBaslangic: new Date(),
      denemeBitis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Subdomain
  await master.tenantDomain.upsert({
    where: { domain: 'demo.kuvvem.local' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      domain: 'demo.kuvvem.local',
      tip: 'subdomain',
      sslDurum: 'aktif',
      dogrulamaDurum: 'dogrulandi',
      aktifMi: true,
      varsayilanMi: true,
    },
  });

  // Abonelik
  const mevcutAbonelik = await master.abonelik.findFirst({
    where: { tenantId: demoTenant.id },
  });
  if (!mevcutAbonelik) {
    await master.abonelik.create({
      data: {
        tenantId: demoTenant.id,
        planId: starter.id,
        durum: 'deneme',
        baslangicTarihi: new Date(),
      },
    });
  }

  // Platform admin — sifre runtime'da hashleniyor (sabit hash git'e gitmez)
  const adminSifre = process.env['PLATFORM_ADMIN_SIFRE'] || 'Admin123456!';
  const sifreHash = await argon2.hash(adminSifre, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await master.platformKullanici.upsert({
    where: { email: 'admin@kuvvem.local' },
    update: {},
    create: {
      email: 'admin@kuvvem.local',
      sifreHash,
      ad: 'Platform',
      soyad: 'Admin',
      rol: 'platform_admin',
      aktifMi: true,
    },
  });

  console.log('[seed] Master DB seed tamamlandi.');
  console.log('[seed] Platform admin: admin@kuvvem.local / (PLATFORM_ADMIN_SIFRE veya Admin123456!)');
}

main()
  .catch((err) => {
    console.error('[seed] Hata:', err);
    process.exit(1);
  })
  .finally(async () => {
    await master.$disconnect();
  });
