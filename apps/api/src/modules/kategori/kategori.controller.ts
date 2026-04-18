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
  KategoriOlusturGirdi,
  KategoriOlusturSemasi,
  KategoriGuncelleGirdi,
  KategoriGuncelleSemasi,
  KategoriListeSorgu,
  KategoriListeSorguSemasi,
  KategoriTasiGirdi,
  KategoriTasiSemasi,
  KategoriSiralaGirdi,
  KategoriSiralaSemasi,
} from '@kuvvem/contracts';
import { KategoriService } from './kategori.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/kategori')
export class KategoriController {
  constructor(private readonly kategoriService: KategoriService) {}

  @Get()
  @RequireYetki('kategori.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(KategoriListeSorguSemasi)) sorgu: KategoriListeSorgu,
  ) {
    return this.kategoriService.listele(req.prisma!, sorgu);
  }

  @Get('agac')
  @RequireYetki('kategori.goruntule')
  async agac(
    @Req() req: FastifyRequest,
    @Query('sadeceAktif') sadeceAktif?: string,
  ) {
    return this.kategoriService.agac(req.prisma!, sadeceAktif === 'true');
  }

  @Get(':id')
  @RequireYetki('kategori.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kategoriService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('kategori.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(KategoriOlusturSemasi)) girdi: KategoriOlusturGirdi,
  ) {
    return this.kategoriService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('kategori.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(KategoriGuncelleSemasi)) girdi: KategoriGuncelleGirdi,
  ) {
    return this.kategoriService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('kategori.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kategoriService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  /** Drag-drop: parent değiştir + sıra güncelle */
  @Patch(':id/tasi')
  @RequireYetki('kategori.duzenle')
  async tasi(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(KategoriTasiSemasi)) girdi: KategoriTasiGirdi,
  ) {
    return this.kategoriService.tasi(req.prisma!, id, girdi);
  }

  /** Aynı parent altında toplu sıralama */
  @Post('sirala')
  @RequireYetki('kategori.duzenle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sirala(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(KategoriSiralaSemasi)) girdi: KategoriSiralaGirdi,
  ): Promise<void> {
    await this.kategoriService.sirala(req.prisma!, girdi);
  }

  @Delete(':id')
  @RequireYetki('kategori.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.kategoriService.sil(req.prisma!, id, kullanici.id);
  }
}
