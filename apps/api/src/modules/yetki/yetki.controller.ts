import { Body, Controller, Get, Param, ParseIntPipe, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { YetkiService } from './yetki.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/yetki')
export class YetkiController {
  constructor(private readonly yetkiService: YetkiService) {}

  @Get()
  @RequireYetki('rol.yonet')
  async listele(@Req() req: FastifyRequest) {
    return this.yetkiService.listele(req.prisma!);
  }

  @Get('gruplu')
  @RequireYetki('rol.yonet')
  async modulGruplu(@Req() req: FastifyRequest) {
    return this.yetkiService.modulGruplu(req.prisma!);
  }

  @Get('rol/:rolId')
  @RequireYetki('rol.yonet')
  async rolYetkileri(@Req() req: FastifyRequest, @Param('rolId', ParseIntPipe) rolId: number) {
    return this.yetkiService.rolYetkileriGetir(req.prisma!, rolId);
  }

  @Put('rol/:rolId')
  @RequireYetki('rol.yonet')
  async rolYetkileriGuncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('rolId', ParseIntPipe) rolId: number,
    @Body() girdi: { yetkiIdler: number[] },
  ) {
    return this.yetkiService.rolYetkileriGuncelle(
      req.prisma!,
      rolId,
      girdi.yetkiIdler,
      kullanici.id,
    );
  }
}
