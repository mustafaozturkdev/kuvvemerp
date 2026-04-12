import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SistemAyarGuncelleGirdi, SistemAyarGuncelleSemasi } from '@kuvvem/contracts';
import { SistemAyarService } from './sistem-ayar.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/ayar')
export class SistemAyarController {
  constructor(private readonly sistemAyarService: SistemAyarService) {}

  @Get()
  @RequireYetki('sistem.ayar.goruntule')
  async getir(@Req() req: FastifyRequest) {
    return this.sistemAyarService.getir(req.prisma!);
  }

  @Put()
  @RequireYetki('sistem.ayar.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(SistemAyarGuncelleSemasi)) girdi: SistemAyarGuncelleGirdi,
  ) {
    return this.sistemAyarService.guncelle(req.prisma!, girdi, kullanici.id);
  }
}
