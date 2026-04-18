import { Injectable } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';

/**
 * LookupService — Basit read-only referans veri listeleri.
 * Form dropdown'lari icin kullanilir: birim, vergi orani vb.
 */
@Injectable()
export class LookupService {
  async birimler(prisma: TenantClient) {
    return prisma.birim.findMany({
      where: { aktifMi: true },
      orderBy: [{ tip: 'asc' }, { ad: 'asc' }],
      select: { id: true, kod: true, ad: true, kisaltma: true, tip: true, ondalikliMi: true },
    });
  }

  async vergiOranlari(prisma: TenantClient) {
    return prisma.vergiOrani.findMany({
      where: { aktifMi: true },
      orderBy: [{ oran: 'asc' }],
      select: { id: true, kod: true, ad: true, oran: true, tip: true, ulkeKodu: true },
    });
  }
}
