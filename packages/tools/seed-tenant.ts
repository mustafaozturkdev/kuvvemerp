/**
 * seed-tenant.ts — Tenant DB'ye baslangic verisi ekler.
 *
 * Kullanim:
 *   npx tsx seed-tenant.ts --slug pilot --email admin@pilot.kuvvem.com --sifre Test1234!
 *
 * Sifre argon2id ile runtime'da hashlenir — sabit hash git'e gitmez.
 */
import { execSync } from 'node:child_process';
import argon2 from 'argon2';

// ----------------------------------------------------------------
// CLI args
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
const slug = args['slug'] || 'pilot';
const email = args['email'] || `admin@${slug}.kuvvem.com`;
const sifre = args['sifre'] || 'Test1234!';
const dbAdi = `kuvvem_t_${slug}`;

const masterUrl = process.env['DATABASE_URL_MASTER'];
if (!masterUrl) {
  console.error('DATABASE_URL_MASTER env degiskeni bulunamadi.');
  process.exit(1);
}
const urlMatch = masterUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
if (!urlMatch) { console.error('DATABASE_URL_MASTER parse edilemedi.'); process.exit(1); }
const [, pgUser, pgPass, pgHost, pgPort] = urlMatch;

function psqlExec(db: string, sql: string): string {
  return execSync(
    `psql -U ${pgUser} -h ${pgHost} -p ${pgPort} -d ${db} -t -c "${sql.replace(/"/g, '\\"')}"`,
    { env: { ...process.env, PGPASSWORD: pgPass }, encoding: 'utf-8' },
  ).trim();
}

async function main() {
  console.log(`\n[seed] Tenant seed baslatiliyor: ${dbAdi}`);

  // 1. Argon2id hash üret (runtime — git'e gitmez)
  const sifreHash = await argon2.hash(sifre, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  console.log(`[seed] Sifre hashlendi (argon2id)`);

  // 2. Firma
  psqlExec(dbAdi, `
    INSERT INTO firma (kod, unvan, kisa_ad, firma_tipi, ulke_kodu, para_birimi_kod)
    VALUES ('PILOT', 'Pilot Mağaza Ltd. Şti.', 'Pilot Mağaza', 'ana_sirket', 'TR', 'TRY')
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Firma eklendi`);

  // 3. Kullanıcı (hash runtime'da üretildi)
  const escapedHash = sifreHash.replace(/'/g, "''");
  psqlExec(dbAdi, `
    INSERT INTO kullanici (email, sifre_hash, ad, soyad, dil, zaman_dilimi)
    VALUES ('${email}', '${escapedHash}', 'Admin', 'Pilot', 'tr', 'Europe/Istanbul')
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Kullanici eklendi: ${email}`);

  // 4. Kullanıcı-Rol (patron)
  psqlExec(dbAdi, `
    INSERT INTO kullanici_rol (kullanici_id, rol_id)
    SELECT k.id, r.id FROM kullanici k, rol r
    WHERE k.email = '${email}' AND r.kod = 'patron'
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Kullanici-Rol iliskisi eklendi`);

  // 5. Mağaza
  psqlExec(dbAdi, `
    INSERT INTO magaza (firma_id, kod, ad, tip, ulke_kodu, para_birimi_kod)
    SELECT f.id, 'MERKEZ', 'Merkez Mağaza', 'magaza', 'TR', 'TRY'
    FROM firma f WHERE f.kod = 'PILOT'
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Magaza eklendi`);

  // 6. Kullanıcı-Mağaza
  psqlExec(dbAdi, `
    INSERT INTO kullanici_magaza (kullanici_id, magaza_id, varsayilan_mi)
    SELECT k.id, m.id, true FROM kullanici k, magaza m
    WHERE k.email = '${email}' AND m.kod = 'MERKEZ'
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Kullanici-Magaza iliskisi eklendi`);

  // 7. Kasa
  psqlExec(dbAdi, `
    INSERT INTO kasa (magaza_id, kod, ad, tip, aktif_mi)
    SELECT m.id, 'KASA-1', 'Ana Kasa', 'fiziksel_pos', true
    FROM magaza m WHERE m.kod = 'MERKEZ'
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Kasa eklendi`);

  // 8. Hesap
  psqlExec(dbAdi, `
    INSERT INTO hesap (kod, ad, tip, firma_id, magaza_id, para_birimi_kod, baslangic_bakiye, aktif_mi)
    SELECT 'KASA-1', 'Merkez Kasa', 'kasa', f.id, m.id, 'TRY', 0, true
    FROM firma f, magaza m WHERE f.kod = 'PILOT' AND m.kod = 'MERKEZ'
    ON CONFLICT DO NOTHING;
  `);
  console.log(`[seed] Hesap eklendi`);

  // 9. Doğrulama
  const sonuc = psqlExec(dbAdi, `
    SELECT json_build_object(
      'firma', (SELECT count(*) FROM firma),
      'kullanici', (SELECT count(*) FROM kullanici),
      'magaza', (SELECT count(*) FROM magaza),
      'kasa', (SELECT count(*) FROM kasa),
      'hesap', (SELECT count(*) FROM hesap),
      'rol', (SELECT count(*) FROM rol)
    );
  `);
  console.log(`[seed] Dogrulama: ${sonuc}`);
  console.log(`[seed] Tenant seed tamamlandi!\n`);
}

main().catch((err) => {
  console.error('\n[seed] HATA:', err.message || err);
  process.exit(1);
});
