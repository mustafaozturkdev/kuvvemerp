import { Module } from '@nestjs/common';
import { KullaniciController } from './kullanici.controller.js';
import { KullaniciService } from './kullanici.service.js';

@Module({
  controllers: [KullaniciController],
  providers: [KullaniciService],
  exports: [KullaniciService],
})
export class KullaniciModule {}
