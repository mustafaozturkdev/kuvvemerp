import {
  BadRequestException,
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
  UrunOlusturGirdi,
  UrunOlusturSemasi,
  UrunGuncelleGirdi,
  UrunGuncelleSemasi,
  UrunListeSorgu,
  UrunListeSorguSemasi,
  UrunTopluAktiflikGirdi,
  UrunTopluAktiflikSemasi,
  UrunTopluAlanGuncelleGirdi,
  UrunTopluAlanGuncelleSemasi,
  VaryantFiyatGuncelleGirdi,
  VaryantFiyatGuncelleSemasi,
  VaryantBarkodEkleGirdi,
  VaryantBarkodEkleSemasi,
} from '@kuvvem/contracts';
import { UrunService } from './urun.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/urun')
export class UrunController {
  constructor(private readonly urunService: UrunService) {}

  // ──────────────────────────────────────────
  // LISTE / DETAY
  // ──────────────────────────────────────────

  @Get()
  @RequireYetki('urun.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(UrunListeSorguSemasi)) sorgu: UrunListeSorgu,
  ) {
    return this.urunService.listele(req.prisma!, sorgu);
  }

  @Get('barkod/:barkod')
  @RequireYetki('urun.goruntule')
  async barkodIleAra(
    @Req() req: FastifyRequest,
    @Param('barkod') barkod: string,
  ) {
    return this.urunService.barkodIleAra(req.prisma!, barkod);
  }

  @Get(':id')
  @RequireYetki('urun.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.detay(req.prisma!, id);
  }

  // ──────────────────────────────────────────
  // OLUŞTUR / GÜNCELLE / SİL
  // ──────────────────────────────────────────

  @Post()
  @RequireYetki('urun.olustur')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(UrunOlusturSemasi)) girdi: UrunOlusturGirdi,
  ) {
    return this.urunService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('urun.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UrunGuncelleSemasi)) girdi: UrunGuncelleGirdi,
  ) {
    return this.urunService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('urun.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('urun.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.urunService.sil(req.prisma!, id, kullanici.id);
  }

  // ──────────────────────────────────────────
  // TOPLU İŞLEMLER
  // ──────────────────────────────────────────

  @Patch('toplu/aktiflik')
  @RequireYetki('urun.toplu-islem')
  async topluAktiflik(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(UrunTopluAktiflikSemasi)) girdi: UrunTopluAktiflikGirdi,
  ) {
    return this.urunService.topluAktiflik(req.prisma!, girdi, kullanici.id);
  }

  @Patch('toplu/alan-guncelle')
  @RequireYetki('urun.toplu-islem')
  async topluAlanGuncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(UrunTopluAlanGuncelleSemasi)) girdi: UrunTopluAlanGuncelleGirdi,
  ) {
    return this.urunService.topluAlanGuncelle(req.prisma!, girdi, kullanici.id);
  }

  // ──────────────────────────────────────────
  // VARYANT
  // ──────────────────────────────────────────

  @Get('varyant/:varyantId')
  @RequireYetki('urun.goruntule')
  async varyantDetay(
    @Req() req: FastifyRequest,
    @Param('varyantId', ParseIntPipe) varyantId: number,
  ) {
    return this.urunService.varyantDetay(req.prisma!, varyantId);
  }

  @Patch('varyant/:varyantId/fiyat')
  @RequireYetki('urun.fiyat-guncelle')
  async varyantFiyatGuncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('varyantId', ParseIntPipe) varyantId: number,
    @Body(new ZodValidationPipe(VaryantFiyatGuncelleSemasi)) girdi: VaryantFiyatGuncelleGirdi,
  ) {
    return this.urunService.varyantFiyatGuncelle(req.prisma!, varyantId, girdi, kullanici.id);
  }

  @Post('varyant/:varyantId/barkod')
  @RequireYetki('urun.varyant-yonet')
  async varyantBarkodEkle(
    @Req() req: FastifyRequest,
    @Param('varyantId', ParseIntPipe) varyantId: number,
    @Body(new ZodValidationPipe(VaryantBarkodEkleSemasi)) girdi: VaryantBarkodEkleGirdi,
  ) {
    return this.urunService.varyantBarkodEkle(req.prisma!, varyantId, girdi);
  }

  @Delete('varyant/:varyantId/barkod/:barkodId')
  @RequireYetki('urun.varyant-yonet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async varyantBarkodSil(
    @Req() req: FastifyRequest,
    @Param('varyantId', ParseIntPipe) varyantId: number,
    @Param('barkodId', ParseIntPipe) barkodId: number,
  ): Promise<void> {
    await this.urunService.varyantBarkodSil(req.prisma!, varyantId, barkodId);
  }
}
