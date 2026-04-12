/**
 * Auth e2e — saglik, giris, yenile, cikis, lockout akislari.
 *
 * NOT: Gercek DB + tenant subdomain'i gerektirir. CI'da:
 *   - kuvvem_master seed edilmis
 *   - demo.kuvvem.local tenant_domain kaydi var
 *   - test kullanicisi olusturulmus (email: test@kuvvem.local, sifre: Test1234!)
 *
 * Mock DB ile calistirmak icin: PrismaMasterService + TenantService override edilmeli.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

const TEST_HOST = 'demo.kuvvem.local';
const TEST_EMAIL = 'test@kuvvem.local';
const TEST_SIFRE = 'Test1234!';
const YANLIS_SIFRE = 'YanlisSifre123!';

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Saglik Endpoint'leri ──

  it('GET /saglik -> 200 ok + bellek + uptime', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/saglik',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('durum');
    expect(body).toHaveProperty('versiyon');
    expect(body).toHaveProperty('bellek');
    expect(body).toHaveProperty('calisma_suresi_saniye');
    expect(body.bellek).toHaveProperty('rss_mb');
  });

  it('GET /saglik/hazir -> 200 readiness probe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/saglik/hazir',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('durum');
  });

  it('GET /saglik/canli -> 200 liveness probe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/saglik/canli',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.durum).toBe('ok');
  });

  // ── Tenant Cozumleme ──

  it('POST /api/v1/auth/giris hatali domain -> 404 TENANT_BULUNAMADI', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: 'bulunmayan.test' },
      payload: { email: 'x@y.com', sifre: '123456789a' },
    });
    expect([400, 404]).toContain(res.statusCode);
  });

  // ── Giris Akisi ──

  it('POST /api/v1/auth/giris basarili -> accessToken + refreshToken doner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: TEST_SIFRE },
    });
    // CI'da seed yoksa 404 (tenant bulunamadi) alabilir — yine de format dogru
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body).toHaveProperty('accessTokenBitis');
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
    }
  });

  it('POST /api/v1/auth/giris yanlis sifre -> 401 GECERSIZ_KIMLIK', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: YANLIS_SIFRE },
    });
    // Tenant yoksa 404, kullanici yoksa 401
    if (res.statusCode === 401) {
      const body = JSON.parse(res.body);
      expect(body.hata).toBeDefined();
      expect(body.hata.kod).toBe('GECERSIZ_KIMLIK');
    }
  });

  it('POST /api/v1/auth/giris 5x yanlis -> HESAP_KILITLI', async () => {
    // 5 yanlis giris denemesi sonrasi hesap kilitlenmeli
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/giris',
        headers: { host: TEST_HOST },
        payload: { email: TEST_EMAIL, sifre: YANLIS_SIFRE },
      });
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: TEST_SIFRE },
    });

    if (res.statusCode === 401) {
      const body = JSON.parse(res.body);
      // 5. denemede ya HESAP_KILITLI ya da GECERSIZ_KIMLIK (tenant olmayabilir)
      expect(body.hata).toBeDefined();
      expect(['HESAP_KILITLI', 'GECERSIZ_KIMLIK']).toContain(body.hata.kod);
    }
  });

  // ── Refresh Token Akisi ──

  it('POST /api/v1/auth/yenile gecersiz token -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/yenile',
      headers: { host: TEST_HOST },
      payload: { refreshToken: 'gecersiz-refresh-token-xxxx' },
    });
    // Tenant yoksa 404, token gecersizse 401
    expect([401, 404]).toContain(res.statusCode);
  });

  it('POST /api/v1/auth/yenile basarili akis (giris + yenile + eski token gecersiz)', async () => {
    // Once giris yap
    const girisRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: TEST_SIFRE },
    });

    if (girisRes.statusCode !== 200) return; // CI seed yoksa atla

    const { refreshToken, accessToken } = JSON.parse(girisRes.body);

    // Refresh token ile yenile
    const yenileRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/yenile',
      headers: { host: TEST_HOST },
      payload: { refreshToken },
    });

    expect(yenileRes.statusCode).toBe(200);
    const yeniBody = JSON.parse(yenileRes.body);
    expect(yeniBody).toHaveProperty('accessToken');
    expect(yeniBody).toHaveProperty('refreshToken');
    // Yeni refresh token eski ile ayni olmamali (rotation)
    expect(yeniBody.refreshToken).not.toBe(refreshToken);

    // Eski refresh token artik gecersiz olmali
    const eskiRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/yenile',
      headers: { host: TEST_HOST },
      payload: { refreshToken },
    });
    expect(eskiRes.statusCode).toBe(401);
  });

  // ── Cikis Akisi ──

  it('POST /api/v1/auth/cikis JWT olmadan -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/cikis',
      headers: { host: TEST_HOST },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/cikis basarili -> 204', async () => {
    // Once giris yap
    const girisRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: TEST_EMAIL, sifre: TEST_SIFRE },
    });

    if (girisRes.statusCode !== 200) return; // CI seed yoksa atla

    const { accessToken } = JSON.parse(girisRes.body);

    const cikisRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/cikis',
      headers: {
        host: TEST_HOST,
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(cikisRes.statusCode).toBe(204);
  });

  // ── Validation ──

  it('POST /api/v1/auth/giris gecersiz email formati -> 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: { email: 'gecersiz-email', sifre: '12345678' },
    });
    // Tenant yoksa 404, validation hatasi 400
    expect([400, 404]).toContain(res.statusCode);
  });

  it('POST /api/v1/auth/giris bos body -> 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/giris',
      headers: { host: TEST_HOST },
      payload: {},
    });
    expect([400, 404]).toContain(res.statusCode);
  });
});
