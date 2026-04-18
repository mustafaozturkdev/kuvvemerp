import { Module } from '@nestjs/common';
import { UrunController } from './urun.controller.js';
import { UrunService } from './urun.service.js';

@Module({
  controllers: [UrunController],
  providers: [UrunService],
  exports: [UrunService],
})
export class UrunModule {}
