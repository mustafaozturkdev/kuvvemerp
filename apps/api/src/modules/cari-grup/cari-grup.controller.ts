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
  CariGrupOlusturGirdi,
  CariGrupOlusturSemasi,
  CariGrupGuncelleGirdi,
  CariGrupGuncelleSemasi,
} from '@kuvvem/contracts';
import { CariGrupService } from './cari-grup.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/cari-grup')
export class CariGrupController {
  constructor(private readonly cariGrupService: CariGrupService) {}

  @Get()
  @RequireYetki('cari.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query('aktifMi') aktifMi?: string,
  ) {
    const filtre = aktifMi === 'true' ? true : aktifMi === 'false' ? false : undefined;
    return this.cariGrupService.listele(req.prisma!, filtre);
  }

  @Get(':id')
  @RequireYetki('cari.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariGrupService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('cari.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(CariGrupOlusturSemasi)) girdi: CariGrupOlusturGirdi,
  ) {
    return this.cariGrupService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('cari.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CariGrupGuncelleSemasi)) girdi: CariGrupGuncelleGirdi,
  ) {
    return this.cariGrupService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('cari.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariGrupService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('cari.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.cariGrupService.sil(req.prisma!, id, kullanici.id);
  }
}
