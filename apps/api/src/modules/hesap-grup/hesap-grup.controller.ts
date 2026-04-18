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
  HesapGrupOlusturGirdi,
  HesapGrupOlusturSemasi,
  HesapGrupGuncelleGirdi,
  HesapGrupGuncelleSemasi,
} from '@kuvvem/contracts';
import { HesapGrupService } from './hesap-grup.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/hesap-grup')
export class HesapGrupController {
  constructor(private readonly hesapGrupService: HesapGrupService) {}

  @Get()
  @RequireYetki('hesap.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query('aktifMi') aktifMi?: string,
  ) {
    const filtre = aktifMi === 'true' ? true : aktifMi === 'false' ? false : undefined;
    return this.hesapGrupService.listele(req.prisma!, filtre);
  }

  @Get(':id')
  @RequireYetki('hesap.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hesapGrupService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('hesap.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(HesapGrupOlusturSemasi)) girdi: HesapGrupOlusturGirdi,
  ) {
    return this.hesapGrupService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('hesap.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(HesapGrupGuncelleSemasi)) girdi: HesapGrupGuncelleGirdi,
  ) {
    return this.hesapGrupService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('hesap.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hesapGrupService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('hesap.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.hesapGrupService.sil(req.prisma!, id, kullanici.id);
  }
}
