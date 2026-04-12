import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RolOlusturGirdi, RolOlusturSemasi, RolGuncelleGirdi, RolGuncelleSemasi } from '@kuvvem/contracts';
import { RolService } from './rol.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/rol')
export class RolController {
  constructor(private readonly rolService: RolService) {}

  @Get()
  @RequireYetki('rol.yonet')
  async listele(@Req() req: FastifyRequest) {
    return this.rolService.listele(req.prisma!);
  }

  @Get(':id')
  @RequireYetki('rol.yonet')
  async detay(@Req() req: FastifyRequest, @Param('id', ParseIntPipe) id: number) {
    return this.rolService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('rol.yonet')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(RolOlusturSemasi)) girdi: RolOlusturGirdi,
  ) {
    return this.rolService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('rol.yonet')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(RolGuncelleSemasi)) girdi: RolGuncelleGirdi,
  ) {
    return this.rolService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }
}
