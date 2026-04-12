import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from 'lru-cache';
import { TenantClient } from '@kuvvem/database/tenant-client';
import { PrismaMasterService } from './prisma-master.service.js';
import type { TenantBilgi } from '../common/types/request.js';
import type { Env } from '../config/env.validation.js';

/**
 * TenantService — multi-tenant DB client fabrikasi.
 *
 * - LRU cache ile aktif tenant client'larini tutar (max 80, TTL 10dk).
 * - Dispose'ta $disconnect cagrilarak connection leak engellenir.
 * - resolveTenant(host) master DB'den tenant_domain kaydini okur.
 * - buildDbUrl DATABASE_URL_TEMPLATE'i {db} placeholder ile genisletir.
 */
@Injectable()
export class TenantService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantService.name);

  private readonly clients: LRUCache<string, TenantClient>;

  constructor(
    private readonly master: PrismaMasterService,
    private readonly config: ConfigService<Env, true>,
  ) {
    const max = this.config.get('TENANT_CACHE_MAX', { infer: true });
    const ttl = this.config.get('TENANT_CACHE_TTL_MS', { infer: true });

    this.clients = new LRUCache<string, TenantClient>({
      max,
      ttl,
      dispose: (client, dbAdi): void => {
        // LRU dispose sync cagrilir; promise'i yakalayip log'layalim
        void client
          .$disconnect()
          .then(() => this.logger.debug(`Tenant client disposed: ${dbAdi}`))
          .catch((err: unknown) =>
            this.logger.error(`Disconnect hata: ${dbAdi}`, err),
          );
      },
    });
  }

  /**
   * Host header'dan tenant cozumle. Saglik endpoint'leri bypass etmeli.
   */
  async resolveTenant(host: string): Promise<TenantBilgi> {
    const cleanHost = host.split(':')[0].toLowerCase();

    const domain = await this.master.tenantDomain.findFirst({
      where: {
        domain: cleanHost,
        dogrulamaDurum: 'dogrulandi',
        aktifMi: true,
      },
      include: { tenant: true },
    });

    if (!domain || !domain.tenant) {
      throw new NotFoundException({
        kod: 'TENANT_BULUNAMADI',
        mesaj: `Bu domain icin tenant bulunamadi: ${cleanHost}`,
      });
    }

    const tenant = domain.tenant;
    if (tenant.durum !== 'aktif' && tenant.durum !== 'deneme') {
      throw new NotFoundException({
        kod: 'TENANT_AKTIF_DEGIL',
        mesaj: `Tenant aktif degil: ${tenant.slug}`,
      });
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      dbAdi: tenant.dbAdi,
      durum: tenant.durum,
      varsayilanDil: tenant.varsayilanDil,
      zamanDilimi: tenant.zamanDilimi,
    };
  }

  /**
   * Tenant DB icin Prisma client al. Cache'den veya yeni olusturarak.
   */
  async getClient(dbAdi: string): Promise<TenantClient> {
    let client = this.clients.get(dbAdi);
    if (!client) {
      const url = this.buildDbUrl(dbAdi);
      client = new TenantClient({
        datasources: { db: { url } },
        log: [{ level: 'error', emit: 'stdout' }],
      });
      await client.$connect();
      this.clients.set(dbAdi, client);
      this.logger.debug(`Tenant client created: ${dbAdi}`);
    }
    return client;
  }

  private buildDbUrl(dbAdi: string): string {
    const template = this.config.get('DATABASE_URL_TEMPLATE', { infer: true });
    if (!template) {
      throw new Error('DATABASE_URL_TEMPLATE env yok');
    }
    return template.replace('{db}', dbAdi);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Tum tenant client baglantilari kapatiliyor...');
    const tasks: Array<Promise<void>> = [];
    for (const [dbAdi, client] of this.clients.entries()) {
      tasks.push(
        client
          .$disconnect()
          .catch((err: unknown) => this.logger.error(`Cleanup hata: ${dbAdi}`, err)),
      );
    }
    await Promise.allSettled(tasks);
    this.clients.clear();
  }
}
