import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { MagazaService } from './magaza.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
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
    @Body() girdi: Record<string, unknown>,
  ) {
    return this.magazaService.olustur(req.prisma!, girdi as any, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('magaza.yonet')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body() girdi: Record<string, unknown>,
  ) {
    return this.magazaService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }
}
