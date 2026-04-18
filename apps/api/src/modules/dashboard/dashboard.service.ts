import { Injectable } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class DashboardService {
  async istatistik(prisma: TenantClient) {
    const simdi = new Date();
    const yediGunOnce = new Date(simdi.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      cariSayisi,
      aktifCariSayisi,
      kullaniciSayisi,
      aktifKullaniciSayisi,
      sonYediGunOturum,
    ] = await Promise.all([
      prisma.cari.count({ where: { silindiMi: false } }),
      prisma.cari.count({ where: { silindiMi: false, aktifMi: true } }),
      prisma.kullanici.count({ where: { silindiMi: false } }),
      prisma.kullanici.count({ where: { silindiMi: false, aktifMi: true } }),
      prisma.oturum.count({
        where: { olusturmaTarihi: { gte: yediGunOnce } },
      }),
    ]);

    return {
      cariSayisi,
      aktifCariSayisi,
      kullaniciSayisi,
      aktifKullaniciSayisi,
      sonYediGunOturum,
    };
  }
}
