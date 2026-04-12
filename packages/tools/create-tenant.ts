/**
 * create-tenant.ts — Yeni tenant DB olustur + 16 SQL modulunu apply et.
 *
 * Kullanim:
 *   pnpm --filter @kuvvem/tools tenant:create -- --slug pilot --ad "Pilot Magaza" --email "admin@pilot.kuvvem.com"
 *
 * Ne yapar:
 *   1. Master DB'ye tenant kaydeder
 *   2. PostgreSQL'de yeni DB olusturur (kuvvem_t_{slug})
 *   3. Extension'lari yukler
 *   4. 16 SQL dosyasini sirayla apply eder
 *   5. Subdomain kaydeder
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { PrismaClient } from '../database/node_modules/.prisma/master/index.js';

// ----------------------------------------------------------------
// CLI arg parse (basit — flag=value veya flag value)
// ----------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const slug = args['slug'];
if (!slug) {
  console.error('Kullanim: --slug <tenant-slug> [--ad "Firma Adi"] [--email "email@test.com"]');
  process.exit(1);
}

const tenantAd = args['ad'] || `${slug.charAt(0).toUpperCase() + slug.slice(1)} Magaza`;
const tenantEmail = args['email'] || `admin@${slug}.kuvvem.local`;
const dbAdi = `kuvvem_t_${slug}`;

// DB connection bilgisi (.env'den)
const masterUrl = process.env['DATABASE_URL_MASTER'];
if (!masterUrl) {
  console.error('DATABASE_URL_MASTER env degiskeni bulunamadi. .env dosyasini kontrol et.');
  process.exit(1);
}

// PostgreSQL connection info parse
const urlMatch = masterUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
if (!urlMatch) {
  console.error('DATABASE_URL_MASTER parse edilemedi.');
  process.exit(1);
}
const [, pgUser, pgPass, pgHost, pgPort] = urlMatch;

// SQL dosyalari path — repo icinde packages/database/sql/tenant/
const sqlDir = resolve(__dirname, '..', 'database', 'sql', 'tenant');

const SQL_FILES = [
  '01-sistem.sql',
  '02-para.sql',
  '03-vergi.sql',
  '04-lokasyon.sql',
  '05-cari.sql',
  '06-urun.sql',
  '07-stok.sql',
  '08-belge.sql',
  '09-odeme.sql',
  '10-muhasebe.sql',
  '11-pazaryeri.sql',
  '12-eticaret.sql',
  '13-sadakat.sql',
  '14-servis.sql',
  '15-uretim.sql',
  '16-entegrasyon.sql',
];

const EXTENSIONS = ['pgcrypto', 'pg_trgm', 'citext'];

const master = new PrismaClient();

async function main() {
  console.log(`\n[tenant] Tenant olusturuluyor: ${slug}`);
  console.log(`[tenant] DB adi: ${dbAdi}`);
  console.log(`[tenant] SQL dizini: ${sqlDir}\n`);

  // SQL dizini kontrol
  if (!existsSync(sqlDir)) {
    throw new Error(`SQL dizini bulunamadi: ${sqlDir}`);
  }

  // 1. Master DB'de plan kontrol
  const plan = await master.plan.findFirst({ where: { kod: 'starter' } });
  if (!plan) {
    throw new Error('Master DB\'de plan bulunamadi. Once seed calistir: pnpm db:seed');
  }

  // 2. Tenant kaydi (idempotent)
  const tenant = await master.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      ad: tenantAd,
      dbAdi,
      planId: plan.id,
      durum: 'deneme',
      iletisimEmail: tenantEmail,
      denemeBaslangic: new Date(),
      denemeBitis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`[tenant] Master DB tenant kaydedildi: ${tenant.id}`);

  // 3. Subdomain kaydi
  const subdomain = `${slug}.kuvvem.local`;
  await master.tenantDomain.upsert({
    where: { domain: subdomain },
    update: {},
    create: {
      tenantId: tenant.id,
      domain: subdomain,
      tip: 'subdomain',
      sslDurum: 'aktif',
      dogrulamaDurum: 'dogrulandi',
      aktifMi: true,
      varsayilanMi: true,
    },
  });

  console.log(`[tenant] Subdomain kaydedildi: ${subdomain}`);

  // 4. PostgreSQL DB olustur
  const pgEnv = { ...process.env, PGPASSWORD: pgPass };
  try {
    execSync(
      `psql -U ${pgUser} -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE DATABASE ${dbAdi} OWNER ${pgUser};"`,
      { env: pgEnv, stdio: 'pipe' },
    );
    console.log(`[tenant] DB olusturuldu: ${dbAdi}`);
  } catch (e: any) {
    if (e.stderr?.toString().includes('already exists')) {
      console.log(`[tenant] DB zaten mevcut: ${dbAdi}`);
    } else {
      throw e;
    }
  }

  // 5. Extension'lari yukle
  for (const ext of EXTENSIONS) {
    execSync(
      `psql -U ${pgUser} -h ${pgHost} -p ${pgPort} -d ${dbAdi} -c "CREATE EXTENSION IF NOT EXISTS ${ext};"`,
      { env: pgEnv, stdio: 'pipe' },
    );
  }
  console.log(`[tenant] Extension'lar yuklendi: ${EXTENSIONS.join(', ')}`);

  // 6. 16 SQL dosyasini sirayla apply
  let basarili = 0;
  let hatali = 0;

  for (const sqlFile of SQL_FILES) {
    const fullPath = join(sqlDir, sqlFile);
    if (!existsSync(fullPath)) {
      console.error(`  [!] Dosya bulunamadi: ${sqlFile}`);
      hatali++;
      continue;
    }

    try {
      execSync(
        `psql -U ${pgUser} -h ${pgHost} -p ${pgPort} -d ${dbAdi} -f "${fullPath}"`,
        { env: pgEnv, stdio: 'pipe' },
      );
      console.log(`  [ok] ${sqlFile}`);
      basarili++;
    } catch (e: any) {
      const stderr = e.stderr?.toString() || '';
      // NOTICE mesajlari hata degil
      if (e.status === 0 || !stderr.includes('ERROR')) {
        console.log(`  [ok] ${sqlFile} (notice ile)`);
        basarili++;
      } else {
        console.error(`  [!!] ${sqlFile} HATA:`);
        console.error(`       ${stderr.split('\n').slice(0, 3).join('\n       ')}`);
        hatali++;
      }
    }
  }

  // 7. Tablo sayisi dogrula
  const result = execSync(
    `psql -U ${pgUser} -h ${pgHost} -p ${pgPort} -d ${dbAdi} -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"`,
    { env: pgEnv, encoding: 'utf-8' },
  ).trim();

  console.log(`\n[tenant] Sonuc: ${basarili}/${SQL_FILES.length} modul basarili, ${hatali} hatali`);
  console.log(`[tenant] Toplam tablo sayisi: ${result}`);
  console.log(`[tenant] Tenant hazir: ${dbAdi}\n`);
}

main()
  .catch((err) => {
    console.error('\n[tenant] KRITIK HATA:', err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await master.$disconnect();
  });
