import { Controller, Get } from '@nestjs/common';
import { PrismaMasterService } from '../../tenant/prisma-master.service.js';
import { Public } from '../../common/guards/jwt.guard.js';

interface SaglikCevap {
  durum: 'ok' | 'hata';
  versiyon: string;
  zaman: string;
  master_db: 'ok' | 'hata';
  bellek: {
    rss_mb: number;
    heap_kullanilan_mb: number;
    heap_toplam_mb: number;
  };
  calisma_suresi_saniye: number;
}

/**
 * SaglikController — saglik, hazirlik ve canlilik endpoint'leri.
 * Tumu @Public() — JWT gerektirmez.
 *
 * - /saglik       → detayli durum (master DB ping + bellek + uptime)
 * - /saglik/hazir → k8s readiness probe (DB hazir mi)
 * - /saglik/canli → k8s liveness probe (process canli mi)
 */
@Controller('saglik')
export class SaglikController {
  constructor(private readonly master: PrismaMasterService) {}

  @Public()
  @Get()
  async saglik(): Promise<SaglikCevap> {
    let masterDurum: 'ok' | 'hata' = 'ok';
    try {
      await this.master.$queryRaw`SELECT 1`;
    } catch {
      masterDurum = 'hata';
    }

    const mem = process.memoryUsage();

    return {
      durum: masterDurum === 'ok' ? 'ok' : 'hata',
      versiyon: process.env.npm_package_version ?? '0.0.1',
      zaman: new Date().toISOString(),
      master_db: masterDurum,
      bellek: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_kullanilan_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_toplam_mb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      calisma_suresi_saniye: Math.round(process.uptime()),
    };
  }

  @Public()
  @Get('hazir')
  async hazir(): Promise<{ durum: 'ok' | 'hata' }> {
    try {
      await this.master.$queryRaw`SELECT 1`;
      return { durum: 'ok' };
    } catch {
      return { durum: 'hata' };
    }
  }

  @Public()
  @Get('canli')
  canli(): { durum: 'ok' } {
    return { durum: 'ok' };
  }
}
