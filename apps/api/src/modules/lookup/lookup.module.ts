import { Module } from '@nestjs/common';
import { LookupController } from './lookup.controller.js';
import { LookupService } from './lookup.service.js';

@Module({
  controllers: [LookupController],
  providers: [LookupService],
  exports: [LookupService],
})
export class LookupModule {}
