import { Module } from '@nestjs/common';
import { CariGrupController } from './cari-grup.controller.js';
import { CariGrupService } from './cari-grup.service.js';

@Module({
  controllers: [CariGrupController],
  providers: [CariGrupService],
  exports: [CariGrupService],
})
export class CariGrupModule {}
