import { Module } from '@nestjs/common';
import { MarkaController } from './marka.controller.js';
import { MarkaService } from './marka.service.js';

@Module({
  controllers: [MarkaController],
  providers: [MarkaService],
  exports: [MarkaService],
})
export class MarkaModule {}
