import { Injectable, NotFoundException } from '@nestjs/common';
import type { MagazaOlusturGirdi, MagazaGuncelleGirdi } from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class MagazaService {
  async listele(prisma: TenantClient) {
    return prisma.magaza.findMany({
      where: { silindiMi: false },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        publicId: true,
        kod: true,
        ad: true,
        tip: true,
        ilAdi: true,
        ilceAdi: true,
        adres: true,
        telefon: true,
        cep: true,
        email: true,
        ip: true,
        instagram: true,
        eFaturaOnEk: true,
        eArsivOnEk: true,
        paraBirimiKod: true,
        aktifMi: true,
        perakendeSatis: true,
        eticaretSatis: true,
        pazaryeriSatis: true,
        b2bSatis: true,
        _count: { select: { kullanicilar: true } },
      },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const m = await prisma.magaza.findFirst({
      where: { id: BigInt(id), silindiMi: false },
    });
    if (!m) {
      throw new NotFoundException({
        kod: 'MAGAZA_BULUNAMADI',
        mesaj: `Magaza bulunamadi: ${id}`,
      });
    }
    return m;
  }

  async olustur(prisma: TenantClient, girdi: MagazaOlusturGirdi, olusturanId: bigint) {
    const firma = await prisma.firma.findFirst();
    return prisma.magaza.create({
      data: {
        firmaId: firma!.id,
        kod: girdi.kod,
        ad: girdi.ad,
        tip: girdi.tip ?? 'sube',
        ilAdi: girdi.ilAdi ?? null,
        ilceAdi: girdi.ilceAdi ?? null,
        adres: girdi.adres ?? null,
        telefon: girdi.telefon ?? null,
        cep: girdi.cep ?? null,
        email: girdi.email ?? null,
        ip: girdi.ip ?? null,
        instagram: girdi.instagram ?? null,
        eFaturaOnEk: girdi.eFaturaOnEk ?? null,
        eArsivOnEk: girdi.eArsivOnEk ?? null,
        harita: girdi.harita ?? null,
        paraBirimiKod: girdi.paraBirimiKod ?? 'TRY',
        ulkeKodu: girdi.ulkeKodu ?? 'TR',
        olusturanKullaniciId: olusturanId,
      },
    });
  }

  async guncelle(prisma: TenantClient, id: number, girdi: MagazaGuncelleGirdi, guncelleyenId: bigint) {
    await this.detay(prisma, id);
    return prisma.magaza.update({
      where: { id: BigInt(id) },
      data: {
        ...girdi,
        guncelleyenKullaniciId: guncelleyenId,
      },
    });
  }

  async aktiflikToggle(prisma: TenantClient, id: number, guncelleyenId: bigint) {
    const m = await this.detay(prisma, id);
    return prisma.magaza.update({
      where: { id: BigInt(id) },
      data: {
        aktifMi: !m.aktifMi,
        guncelleyenKullaniciId: guncelleyenId,
      },
    });
  }
}
