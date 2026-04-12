import { Module } from '@nestjs/common';
import { MagazaController } from './magaza.controller.js';
import { MagazaService } from './magaza.service.js';

@Module({
  controllers: [MagazaController],
  providers: [MagazaService],
  exports: [MagazaService],
})
export class MagazaModule {}
