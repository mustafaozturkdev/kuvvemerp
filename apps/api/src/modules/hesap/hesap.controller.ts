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
  HesapOlusturGirdi,
  HesapOlusturSemasi,
  HesapGuncelleGirdi,
  HesapGuncelleSemasi,
  HesapListeSorgu,
  HesapListeSorguSemasi,
} from '@kuvvem/contracts';
import { HesapService } from './hesap.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/hesap')
export class HesapController {
  constructor(private readonly hesapService: HesapService) {}

  @Get()
  @RequireYetki('hesap.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(HesapListeSorguSemasi)) sorgu: HesapListeSorgu,
  ) {
    return this.hesapService.listele(req.prisma!, sorgu);
  }

  @Get(':id')
  @RequireYetki('hesap.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hesapService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('hesap.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(HesapOlusturSemasi)) girdi: HesapOlusturGirdi,
  ) {
    return this.hesapService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('hesap.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(HesapGuncelleSemasi)) girdi: HesapGuncelleGirdi,
  ) {
    return this.hesapService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('hesap.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hesapService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('hesap.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.hesapService.sil(req.prisma!, id, kullanici.id);
  }
}
