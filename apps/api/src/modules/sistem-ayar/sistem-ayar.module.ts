import { Module } from '@nestjs/common';
import { SistemAyarController } from './sistem-ayar.controller.js';
import { SistemAyarService } from './sistem-ayar.service.js';

@Module({
  controllers: [SistemAyarController],
  providers: [SistemAyarService],
  exports: [SistemAyarService],
})
export class SistemAyarModule {}
