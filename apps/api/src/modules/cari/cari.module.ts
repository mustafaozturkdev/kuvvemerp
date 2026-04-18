import { Module } from '@nestjs/common';
import { CariController } from './cari.controller.js';
import { CariService } from './cari.service.js';
import { CariImportController } from './cari-import.controller.js';
import { CariImportService } from './cari-import.service.js';

@Module({
  controllers: [CariController, CariImportController],
  providers: [CariService, CariImportService],
  exports: [CariService],
})
export class CariModule {}
