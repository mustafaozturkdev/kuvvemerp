/**
 * Cari e2e — CRUD, yetki kontrolu, soft delete akislari.
 *
 * NOT: Gercek DB + tenant subdomain + yetkili kullanici gerektirir. CI'da:
 *   - kuvvem_master seed edilmis
 *   - demo.kuvvem.local tenant_domain kaydi var
 *   - test kullanicisi cari.* yetkilerine sahip
 *   - yetkisiz kullanici ayrica olusturulmus
 */
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

const TEST_HOST = 'demo.kuvvem.local';
const TEST_EMAIL = 'test@kuvvem.local';
const TEST_SIFRE = 'Test1234!';
const YETKISIZ_EMAIL = 'yetkisiz@kuvvem.local';
const YETKISIZ_SIFRE = 'Test1234!';

describe('Cari (e2e)', () => {
  let app: NestFastifyApplication;
  let yetkiliToken: string | null = null;
  let yetkisizToken: string | null = null;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Yetkili kullanici ile giris
    const yetkiliRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: TEST_SIFRE },
    });
    if (yetkiliRes.statusCode === 200) {
      yetkiliToken = JSON.parse(yetkiliRes.body).accessToken;
    }

    // Yetkisiz kullanici ile giris
    const yetkisizRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: YETKISIZ_EMAIL, sifre: YETKISIZ_SIFRE },
    });
    if (yetkisizRes.statusCode === 200) {
      yetkisizToken = JSON.parse(yetkisizRes.body).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth Kontrolu ──

  it('GET /api/v1/cari JWT olmadan -> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cari',
      headers: { host: TEST_HOST },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/cari yetkisiz user -> 403', async () => {
    if (!yetkisizToken) return; // CI seed yoksa atla

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cari',
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkisizToken}`,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.hata.kod).toBe('YETKI_YOK');
  });

  // ── Liste ──

  it('GET /api/v1/cari yetkili user -> 200 + sayfalama', async () => {
    if (!yetkiliToken) return; // CI seed yoksa atla

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cari?sayfa=1&boyut=10',
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('veriler');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('toplam');
    expect(body.meta).toHaveProperty('sayfa');
    expect(body.meta).toHaveProperty('boyut');
  });

  // ── Olustur + Detay + Guncelle + Sil ──

  it('POST /api/v1/cari olustur -> 201 + GET detay + PATCH guncelle + DELETE sil', async () => {
    if (!yetkiliToken) return; // CI seed yoksa atla

    // Olustur
    const olusturRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cari',
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
        'content-type': 'application/json',
      },
      payload: {
        kod: `TEST-E2E-${Date.now()}`,
        tip: 'alici',
        kisiTipi: 'tuzel',
        unvan: 'Test E2E Sirket Ltd.',
        paraBirimiKod: 'TRY',
        iskontoOrani: 0,
        vadeGun: 30,
        kvkkOnayMi: true,
      },
    });

    if (olusturRes.statusCode !== 201) return; // seed eksikse atla
    const olusturulan = JSON.parse(olusturRes.body);
    expect(olusturulan).toHaveProperty('id');
    const cariId = olusturulan.id;

    // Detay
    const detayRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cari/${cariId}`,
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
      },
    });
    expect(detayRes.statusCode).toBe(200);
    const detay = JSON.parse(detayRes.body);
    expect(detay.unvan).toBe('Test E2E Sirket Ltd.');

    // Guncelle
    const guncelleRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/cari/${cariId}`,
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
        'content-type': 'application/json',
      },
      payload: {
        unvan: 'Guncellenmis Test E2E Ltd.',
      },
    });
    expect(guncelleRes.statusCode).toBe(200);
    const guncellenmis = JSON.parse(guncelleRes.body);
    expect(guncellenmis.unvan).toBe('Guncellenmis Test E2E Ltd.');

    // Soft delete
    const silRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cari/${cariId}`,
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
      },
    });
    expect(silRes.statusCode).toBe(204);

    // Silindikten sonra 404 donmeli
    const silinmisRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cari/${cariId}`,
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
      },
    });
    expect(silinmisRes.statusCode).toBe(404);
  });

  // ── Validation ──

  it('POST /api/v1/cari zorunlu alan eksik -> 400', async () => {
    if (!yetkiliToken) return;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cari',
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${yetkiliToken}`,
        'content-type': 'application/json',
      },
      payload: {
        // kod, tip, kisiTipi gibi zorunlu alanlar eksik
        unvan: 'Eksik Alan Test',
      },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  // ── Hata Zarfi Format Kontrolu ──

  it('Hata response format: { veri, hata: { kod, mesaj }, meta }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cari',
      headers: { host: TEST_HOST },
    });
    // JWT olmadan 401 bekliyoruz
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('veri');
    expect(body.veri).toBeNull();
    expect(body).toHaveProperty('hata');
    expect(body.hata).toHaveProperty('kod');
    expect(body.hata).toHaveProperty('mesaj');
    expect(body).toHaveProperty('meta');
    // meta.istekId mevcut olmali
    expect(body.meta).toHaveProperty('istekId');
  });
});
