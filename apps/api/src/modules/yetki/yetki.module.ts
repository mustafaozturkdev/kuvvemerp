import { Module } from '@nestjs/common';
import { YetkiController } from './yetki.controller.js';
import { YetkiService } from './yetki.service.js';

@Module({
  controllers: [YetkiController],
  providers: [YetkiService],
  exports: [YetkiService],
})
export class YetkiModule {}
