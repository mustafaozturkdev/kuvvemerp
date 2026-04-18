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
  MarkaOlusturGirdi,
  MarkaOlusturSemasi,
  MarkaGuncelleGirdi,
  MarkaGuncelleSemasi,
  MarkaListeSorgu,
  MarkaListeSorguSemasi,
} from '@kuvvem/contracts';
import { MarkaService } from './marka.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/marka')
export class MarkaController {
  constructor(private readonly markaService: MarkaService) {}

  @Get()
  @RequireYetki('marka.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(MarkaListeSorguSemasi)) sorgu: MarkaListeSorgu,
  ) {
    return this.markaService.listele(req.prisma!, sorgu);
  }

  @Get(':id')
  @RequireYetki('marka.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.markaService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('marka.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(MarkaOlusturSemasi)) girdi: MarkaOlusturGirdi,
  ) {
    return this.markaService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('marka.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(MarkaGuncelleSemasi)) girdi: MarkaGuncelleGirdi,
  ) {
    return this.markaService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('marka.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.markaService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('marka.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.markaService.sil(req.prisma!, id, kullanici.id);
  }
}
