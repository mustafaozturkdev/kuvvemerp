import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { MagazaOlusturGirdi, MagazaOlusturSemasi, MagazaGuncelleGirdi, MagazaGuncelleSemasi } from '@kuvvem/contracts';
import { MagazaService } from './magaza.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/magaza')
export class MagazaController {
  constructor(private readonly magazaService: MagazaService) {}

  @Get()
  @RequireYetki('magaza.goruntule')
  async listele(@Req() req: FastifyRequest) {
    return this.magazaService.listele(req.prisma!);
  }

  @Get(':id')
  @RequireYetki('magaza.goruntule')
  async detay(@Req() req: FastifyRequest, @Param('id', ParseIntPipe) id: number) {
    return this.magazaService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('magaza.yonet')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(MagazaOlusturSemasi)) girdi: MagazaOlusturGirdi,
  ) {
    return this.magazaService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('magaza.yonet')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(MagazaGuncelleSemasi)) girdi: MagazaGuncelleGirdi,
  ) {
    return this.magazaService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('magaza.yonet')
  @HttpCode(HttpStatus.OK)
  async aktiflikToggle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.magazaService.aktiflikToggle(req.prisma!, id, kullanici.id);
  }
}
