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
} from '@kuvvem/contracts';
import { CariService } from './cari.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

/**
 * CariController — Cari CRUD endpoint'leri.
 * Global APP_GUARD (JwtGuard + YetkiGuard) aktif; method-level @UseGuards gereksiz.
 */
@Controller('api/v1/cari')
export class CariController {
  constructor(private readonly cariService: CariService) {}

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
  @RequireYetki('cari.guncelle')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CariGuncelleSemasi)) girdi: CariGuncelleGirdi,
  ) {
    return this.cariService.guncelle(req.prisma!, id, girdi, kullanici.id);
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
}
