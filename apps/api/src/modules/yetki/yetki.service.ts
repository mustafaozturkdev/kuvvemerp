import { Injectable } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class YetkiService {
  async listele(prisma: TenantClient) {
    return prisma.yetki.findMany({
      orderBy: [{ modul: 'asc' }, { eylem: 'asc' }],
    });
  }

  async modulGruplu(prisma: TenantClient) {
    const yetkiler = await this.listele(prisma);
    const gruplu: Record<string, typeof yetkiler> = {};
    for (const y of yetkiler) {
      gruplu[y.modul] ??= [];
      gruplu[y.modul].push(y);
    }
    return gruplu;
  }

  async rolYetkileriGetir(prisma: TenantClient, rolId: number) {
    return prisma.rolYetki.findMany({
      where: { rolId: BigInt(rolId) },
      select: { yetkiId: true },
    });
  }

  async rolYetkileriGuncelle(
    prisma: TenantClient,
    rolId: number,
    yetkiIdler: number[],
    guncelleyenId: bigint,
  ) {
    const bigRolId = BigInt(rolId);

    // Mevcut yetkileri sil
    await prisma.rolYetki.deleteMany({ where: { rolId: bigRolId } });

    // Yenilerini ekle
    if (yetkiIdler.length > 0) {
      await prisma.rolYetki.createMany({
        data: yetkiIdler.map((yId) => ({
          rolId: bigRolId,
          yetkiId: BigInt(yId),
          olusturanKullaniciId: guncelleyenId,
        })),
        skipDuplicates: true,
      });
    }

    return prisma.rolYetki.findMany({
      where: { rolId: bigRolId },
      include: { yetki: true },
    });
  }
}
