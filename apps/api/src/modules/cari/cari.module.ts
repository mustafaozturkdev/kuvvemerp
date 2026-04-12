import { Module } from '@nestjs/common';
import { CariController } from './cari.controller.js';
import { CariService } from './cari.service.js';

@Module({
  controllers: [CariController],
  providers: [CariService],
  exports: [CariService],
})
export class CariModule {}
