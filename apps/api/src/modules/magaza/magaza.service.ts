import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';

// PHP parity alanlar
const MAGAZA_ALANLARI = [
  'kod', 'ad', 'tip', 'adres', 'telefon', 'cep', 'email', 'ip',
  'instagram', 'eFaturaOnEk', 'eArsivOnEk', 'paraBirimiKod',
  'ilAdi', 'ilceAdi', 'ulkeKodu', 'harita',
] as const;

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

  async olustur(prisma: TenantClient, girdi: Record<string, unknown>, olusturanId: bigint) {
    const firma = await prisma.firma.findFirst();
    const g = girdi as any;
    return prisma.magaza.create({
      data: {
        firmaId: firma!.id,
        kod: g.kod,
        ad: g.ad,
        tip: g.tip ?? 'sube',
        ilAdi: g.ilAdi ?? null,
        ilceAdi: g.ilceAdi ?? null,
        adres: g.adres ?? null,
        telefon: g.telefon ?? null,
        cep: g.cep ?? null,
        email: g.email ?? null,
        ip: g.ip ?? null,
        instagram: g.instagram ?? null,
        eFaturaOnEk: g.eFaturaOnEk ?? null,
        eArsivOnEk: g.eArsivOnEk ?? null,
        harita: g.harita ?? null,
        paraBirimiKod: g.paraBirimiKod ?? 'TRY',
        ulkeKodu: g.ulkeKodu ?? 'TR',
        olusturanKullaniciId: olusturanId,
      },
    });
  }

  async guncelle(prisma: TenantClient, id: number, girdi: Record<string, unknown>, guncelleyenId: bigint) {
    await this.detay(prisma, id);
    const data: Record<string, unknown> = { guncelleyenKullaniciId: guncelleyenId };
    for (const alan of MAGAZA_ALANLARI) {
      if (girdi[alan] !== undefined) {
        data[alan] = girdi[alan];
      }
    }
    return prisma.magaza.update({
      where: { id: BigInt(id) },
      data,
    });
  }
}
