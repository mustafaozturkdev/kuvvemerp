import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  KullaniciGuncelleGirdi,
  KullaniciGuncelleSemasi,
  KullaniciOlusturGirdi,
  KullaniciOlusturSemasi,
  SifreDegistirGirdi,
  SifreDegistirSemasi,
} from '@kuvvem/contracts';
import { KullaniciService } from './kullanici.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/kullanici')
export class KullaniciController {
  constructor(private readonly kullaniciService: KullaniciService) {}

  @Get()
  @RequireYetki('kullanici.yonet')
  async listele(@Req() req: FastifyRequest) {
    return this.kullaniciService.listele(req.prisma!);
  }

  @Get(':id')
  @RequireYetki('kullanici.yonet')
  async detay(@Req() req: FastifyRequest, @Param('id', ParseIntPipe) id: number) {
    return this.kullaniciService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('kullanici.yonet')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(KullaniciOlusturSemasi)) girdi: KullaniciOlusturGirdi,
  ) {
    return this.kullaniciService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('kullanici.yonet')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(KullaniciGuncelleSemasi)) girdi: KullaniciGuncelleGirdi,
  ) {
    return this.kullaniciService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('kullanici.yonet')
  @HttpCode(HttpStatus.OK)
  async aktiflikToggle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kullaniciService.aktiflikToggle(req.prisma!, id, kullanici.id);
  }

  @Post('sifre-degistir')
  @HttpCode(HttpStatus.OK)
  async sifreDegistir(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(SifreDegistirSemasi)) girdi: SifreDegistirGirdi,
  ) {
    return this.kullaniciService.sifreDegistir(req.prisma!, kullanici.id, girdi);
  }
}
