import { Module } from '@nestjs/common';
import { HesapController } from './hesap.controller.js';
import { HesapService } from './hesap.service.js';

@Module({
  controllers: [HesapController],
  providers: [HesapService],
  exports: [HesapService],
})
export class HesapModule {}
