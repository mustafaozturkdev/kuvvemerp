import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  MarkaModelOlusturGirdi,
  MarkaModelOlusturSemasi,
  MarkaModelGuncelleGirdi,
  MarkaModelGuncelleSemasi,
  MarkaModelListeSorgu,
  MarkaModelListeSorguSemasi,
} from '@kuvvem/contracts';
import { MarkaModelService } from './marka-model.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/marka-model')
export class MarkaModelController {
  constructor(private readonly markaModelService: MarkaModelService) {}

  @Get()
  @RequireYetki('marka.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(MarkaModelListeSorguSemasi)) sorgu: MarkaModelListeSorgu,
  ) {
    return this.markaModelService.listele(req.prisma!, sorgu);
  }

  @Get(':id')
  @RequireYetki('marka.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.markaModelService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('marka.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(MarkaModelOlusturSemasi)) girdi: MarkaModelOlusturGirdi,
  ) {
    return this.markaModelService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('marka.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(MarkaModelGuncelleSemasi)) girdi: MarkaModelGuncelleGirdi,
  ) {
    return this.markaModelService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('marka.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.markaModelService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('marka.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.markaModelService.sil(req.prisma!, id, kullanici.id);
  }
}
