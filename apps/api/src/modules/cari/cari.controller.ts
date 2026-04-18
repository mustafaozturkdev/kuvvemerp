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
  UsePipes,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  CariGuncelleGirdi,
  CariGuncelleSemasi,
  CariListeSorgu,
  CariListeSorguSemasi,
  CariOlusturGirdi,
  CariOlusturSemasi,
  CariAdresOlusturSemasi,
  CariAdresGuncelleSemasi,
  CariIletisimOlusturSemasi,
  CariTipleri,
} from '@kuvvem/contracts';
import { z } from 'zod';
import { CariService } from './cari.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/cari')
export class CariController {
  constructor(private readonly cariService: CariService) {}

  // ── Cari CRUD ──────────────────────────────────────────

  @Get()
  @RequireYetki('cari.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(CariListeSorguSemasi)) sorgu: CariListeSorgu,
  ) {
    return this.cariService.listele(req.prisma!, sorgu);
  }

  @Get(':id')
  @RequireYetki('cari.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('cari.olustur')
  @UsePipes(new ZodValidationPipe(CariOlusturSemasi))
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body() girdi: CariOlusturGirdi,
  ) {
    return this.cariService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('cari.duzenle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CariGuncelleSemasi)) girdi: CariGuncelleGirdi,
  ) {
    return this.cariService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/tip')
  @RequireYetki('cari.duzenle')
  async tipDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(z.object({ tip: z.enum(CariTipleri) }))) girdi: { tip: string },
  ) {
    return this.cariService.tipDegistir(req.prisma!, id, girdi.tip, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('cari.duzenle')
  async aktiflikDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariService.aktiflikDegistir(req.prisma!, id, kullanici.id);
  }

  @Delete(':id')
  @RequireYetki('cari.sil')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.cariService.sil(req.prisma!, id, kullanici.id);
  }

  // ── Adres CRUD ──────────────────────────────────────────

  @Get(':id/adres')
  @RequireYetki('cari.goruntule')
  async adresListele(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariService.adresListele(req.prisma!, id);
  }

  @Post(':id/adres')
  @RequireYetki('cari.duzenle')
  async adresOlustur(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CariAdresOlusturSemasi)) girdi: Record<string, unknown>,
  ) {
    return this.cariService.adresOlustur(req.prisma!, id, girdi);
  }

  @Patch(':id/adres/:adresId')
  @RequireYetki('cari.duzenle')
  async adresGuncelle(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('adresId', ParseIntPipe) adresId: number,
    @Body(new ZodValidationPipe(CariAdresGuncelleSemasi)) girdi: Record<string, unknown>,
  ) {
    return this.cariService.adresGuncelle(req.prisma!, id, adresId, girdi);
  }

  @Delete(':id/adres/:adresId')
  @RequireYetki('cari.duzenle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async adresSil(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('adresId', ParseIntPipe) adresId: number,
  ): Promise<void> {
    await this.cariService.adresSil(req.prisma!, id, adresId);
  }

  @Patch(':id/adres/:adresId/varsayilan')
  @RequireYetki('cari.duzenle')
  async adresVarsayilanYap(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('adresId', ParseIntPipe) adresId: number,
    @Body(new ZodValidationPipe(z.object({ tip: z.enum(['fatura', 'sevk']) }))) girdi: { tip: 'fatura' | 'sevk' },
  ) {
    return this.cariService.adresVarsayilanYap(req.prisma!, id, adresId, girdi.tip);
  }

  // ── İletişim CRUD ──────────────────────────────────────────

  @Get(':id/iletisim')
  @RequireYetki('cari.goruntule')
  async iletisimListele(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cariService.iletisimListele(req.prisma!, id);
  }

  @Post(':id/iletisim')
  @RequireYetki('cari.duzenle')
  async iletisimOlustur(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CariIletisimOlusturSemasi)) girdi: { tip: string; deger: string; aciklama?: string | null; varsayilanMi?: boolean },
  ) {
    return this.cariService.iletisimOlustur(req.prisma!, id, girdi);
  }

  @Delete(':id/iletisim/:iletisimId')
  @RequireYetki('cari.duzenle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async iletisimSil(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('iletisimId', ParseIntPipe) iletisimId: number,
  ): Promise<void> {
    await this.cariService.iletisimSil(req.prisma!, id, iletisimId);
  }
}
