import { Module } from '@nestjs/common';
import { HesapGrupController } from './hesap-grup.controller.js';
import { HesapGrupService } from './hesap-grup.service.js';

@Module({
  controllers: [HesapGrupController],
  providers: [HesapGrupService],
  exports: [HesapGrupService],
})
export class HesapGrupModule {}
