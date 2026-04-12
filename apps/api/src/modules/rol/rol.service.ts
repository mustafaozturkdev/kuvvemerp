import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';
import type { RolOlusturGirdi, RolGuncelleGirdi } from '@kuvvem/contracts';

@Injectable()
export class RolService {
  async listele(prisma: TenantClient) {
    return prisma.rol.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { kullanicilar: true } },
      },
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const rol = await prisma.rol.findUnique({
      where: { id: BigInt(id) },
      include: {
        yetkiler: { include: { yetki: true } },
        kullanicilar: {
          include: { kullanici: { select: { id: true, publicId: true, email: true, ad: true, soyad: true } } },
        },
      },
    });
    if (!rol) throw new NotFoundException({ kod: 'ROL_BULUNAMADI', mesaj: 'Rol bulunamadi' });
    return rol;
  }

  async olustur(prisma: TenantClient, girdi: RolOlusturGirdi, olusturanId: bigint) {
    return prisma.rol.create({
      data: {
        kod: girdi.kod,
        ad: girdi.ad,
        aciklama: girdi.aciklama ?? null,
        olusturanKullaniciId: olusturanId,
      },
    });
  }

  async guncelle(prisma: TenantClient, id: number, girdi: RolGuncelleGirdi, guncelleyenId: bigint) {
    const rol = await prisma.rol.findUnique({ where: { id: BigInt(id) } });
    if (!rol) throw new NotFoundException({ kod: 'ROL_BULUNAMADI', mesaj: 'Rol bulunamadi' });
    if (rol.sistemRoluMu) {
      // Sistem rolleri guncellenemez — sadece aciklama degisebilir
      return prisma.rol.update({
        where: { id: BigInt(id) },
        data: { aciklama: girdi.aciklama ?? rol.aciklama, guncelleyenKullaniciId: guncelleyenId },
      });
    }
    return prisma.rol.update({
      where: { id: BigInt(id) },
      data: {
        ...(girdi.kod && { kod: girdi.kod }),
        ...(girdi.ad && { ad: girdi.ad }),
        ...(girdi.aciklama !== undefined && { aciklama: girdi.aciklama }),
        guncelleyenKullaniciId: guncelleyenId,
      },
    });
  }
}
