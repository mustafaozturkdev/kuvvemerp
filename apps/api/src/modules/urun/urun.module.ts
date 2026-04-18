import { Module } from '@nestjs/common';
import { UrunController } from './urun.controller.js';
import { UrunService } from './urun.service.js';
import { UploadModule } from '../upload/upload.module.js';

@Module({
  imports: [UploadModule],
  controllers: [UrunController],
  providers: [UrunService],
  exports: [UrunService],
})
export class UrunModule {}
