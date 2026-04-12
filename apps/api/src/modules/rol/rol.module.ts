import { Module } from '@nestjs/common';
import { RolController } from './rol.controller.js';
import { RolService } from './rol.service.js';

@Module({
  controllers: [RolController],
  providers: [RolService],
  exports: [RolService],
})
export class RolModule {}
