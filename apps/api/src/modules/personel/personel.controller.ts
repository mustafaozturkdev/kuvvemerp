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
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  PersonelOlusturGirdi,
  PersonelOlusturSemasi,
  PersonelGuncelleGirdi,
  PersonelGuncelleSemasi,
  PersonelOdemeOlusturGirdi,
  PersonelOdemeOlusturSemasi,
} from '@kuvvem/contracts';
import { PersonelService } from './personel.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/personel')
export class PersonelController {
  constructor(private readonly personelService: PersonelService) {}

  @Get()
  @RequireYetki('personel.goruntule')
  async listele(
    @Req() req: FastifyRequest,
    @Query('durum') durum?: string,
  ) {
    return this.personelService.listele(req.prisma!, durum);
  }

  @Get(':id')
  @RequireYetki('personel.goruntule')
  async detay(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.personelService.detay(req.prisma!, id);
  }

  @Post()
  @RequireYetki('personel.yonet')
  async olustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body(new ZodValidationPipe(PersonelOlusturSemasi)) girdi: PersonelOlusturGirdi,
  ) {
    return this.personelService.olustur(req.prisma!, girdi, kullanici.id);
  }

  @Patch(':id')
  @RequireYetki('personel.yonet')
  async guncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(PersonelGuncelleSemasi)) girdi: PersonelGuncelleGirdi,
  ) {
    return this.personelService.guncelle(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/aktiflik')
  @RequireYetki('personel.yonet')
  @HttpCode(HttpStatus.OK)
  async aktiflikToggle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.personelService.aktiflikToggle(req.prisma!, id, kullanici.id);
  }

  @Get(':id/hareketler')
  @RequireYetki('personel.goruntule')
  async hareketler(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.personelService.hareketler(req.prisma!, id);
  }

  @Post(':id/hareketler')
  @RequireYetki('personel.yonet')
  async hareketEkle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(PersonelOdemeOlusturSemasi)) girdi: PersonelOdemeOlusturGirdi,
  ) {
    return this.personelService.hareketEkle(req.prisma!, id, girdi, kullanici.id);
  }
}
