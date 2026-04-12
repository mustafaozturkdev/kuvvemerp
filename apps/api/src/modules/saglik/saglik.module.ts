import { Module } from '@nestjs/common';
import { SaglikController } from './saglik.controller.js';

@Module({
  controllers: [SaglikController],
})
export class SaglikModule {}
