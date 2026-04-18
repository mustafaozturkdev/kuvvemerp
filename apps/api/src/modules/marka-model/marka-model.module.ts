import { Module } from '@nestjs/common';
import { MarkaModelController } from './marka-model.controller.js';
import { MarkaModelService } from './marka-model.service.js';

@Module({
  controllers: [MarkaModelController],
  providers: [MarkaModelService],
  exports: [MarkaModelService],
})
export class MarkaModelModule {}
