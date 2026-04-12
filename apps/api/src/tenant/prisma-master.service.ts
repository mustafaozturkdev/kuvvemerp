import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MasterClient } from '@kuvvem/database';

/**
 * PrismaMasterService — kuvvem_master DB ile tek Prisma client.
 * Tum tenant cozumleri, abonelik, plan sorgulari buradan gecer.
 */
@Injectable()
export class PrismaMasterService extends MasterClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaMasterService.name);

  constructor() {
    super({
      datasourceUrl: process.env.DATABASE_URL_MASTER,
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Master DB baglanti kuruldu');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Master DB baglanti kapatildi');
  }
}
