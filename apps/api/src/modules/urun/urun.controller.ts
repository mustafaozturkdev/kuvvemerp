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
  EksenOlusturGirdi,
  EksenOlusturSemasi,
  SecenekOlusturGirdi,
  SecenekOlusturSemasi,
  VaryantOlusturGirdi,
  VaryantOlusturSemasi,
  VaryantGuncelleGirdi,
  VaryantGuncelleSemasi,
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

  // ──────────────────────────────────────────
  // RESİM YÖNETİMİ
  // ──────────────────────────────────────────

  @Get(':id/resim')
  @RequireYetki('urun.goruntule')
  async resimleriListele(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.resimleriListele(req.prisma!, id);
  }

  @Post(':id/resim')
  @RequireYetki('urun.resim-yonet')
  async resimYukle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await (req as any).file();
    if (!data) {
      throw new BadRequestException({
        kod: 'DOSYA_BULUNAMADI',
        mesaj: 'Lütfen bir resim dosyası seçin',
      });
    }
    const buffer = await data.toBuffer();
    const tenantSlug = (req as any).tenant?.slug ?? 'genel';

    const altText = data.fields?.altText?.value as string | undefined;
    const varyantIdStr = data.fields?.varyantId?.value as string | undefined;
    const varyantId = varyantIdStr ? Number(varyantIdStr) : undefined;

    return this.urunService.resimYukle(
      req.prisma!,
      id,
      { buffer, filename: data.filename, mimetype: data.mimetype },
      tenantSlug,
      kullanici.id,
      { altText, varyantId },
    );
  }

  @Patch(':id/resim/:resimId/ana')
  @RequireYetki('urun.resim-yonet')
  async resimAnaYap(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Param('resimId', ParseIntPipe) resimId: number,
  ) {
    return this.urunService.resimAnaYap(req.prisma!, id, resimId, kullanici.id);
  }

  @Patch(':id/resim-siralama')
  @RequireYetki('urun.resim-yonet')
  async resimSiralama(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { resimIds: number[] },
  ) {
    if (!Array.isArray(body?.resimIds)) {
      throw new BadRequestException({ kod: 'GECERSIZ_ISTEK', mesaj: 'resimIds dizisi gerekli' });
    }
    return this.urunService.resimSiralama(req.prisma!, id, body.resimIds);
  }

  @Delete(':id/resim/:resimId')
  @RequireYetki('urun.resim-yonet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resimSil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Param('resimId', ParseIntPipe) resimId: number,
  ): Promise<void> {
    await this.urunService.resimSil(req.prisma!, id, resimId, kullanici.id);
  }

  // ──────────────────────────────────────────
  // VARYANT EKSENLERİ & SEÇENEKLER
  // ──────────────────────────────────────────

  @Get(':id/eksen')
  @RequireYetki('urun.goruntule')
  async eksenleriListele(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.eksenleriListele(req.prisma!, id);
  }

  @Post(':id/eksen')
  @RequireYetki('urun.varyant-yonet')
  async eksenEkle(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EksenOlusturSemasi)) girdi: EksenOlusturGirdi,
  ) {
    return this.urunService.eksenEkle(req.prisma!, id, girdi);
  }

  @Delete(':id/eksen/:eksenId')
  @RequireYetki('urun.varyant-yonet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eksenSil(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('eksenId', ParseIntPipe) eksenId: number,
  ): Promise<void> {
    await this.urunService.eksenSil(req.prisma!, id, eksenId);
  }

  @Post(':id/eksen/:eksenId/secenek')
  @RequireYetki('urun.varyant-yonet')
  async secenekEkle(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('eksenId', ParseIntPipe) eksenId: number,
    @Body(new ZodValidationPipe(SecenekOlusturSemasi)) girdi: SecenekOlusturGirdi,
  ) {
    return this.urunService.secenekEkle(req.prisma!, id, eksenId, girdi);
  }

  @Delete(':id/eksen/:eksenId/secenek/:secenekId')
  @RequireYetki('urun.varyant-yonet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async secenekSil(
    @Req() req: FastifyRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('eksenId', ParseIntPipe) eksenId: number,
    @Param('secenekId', ParseIntPipe) secenekId: number,
  ): Promise<void> {
    await this.urunService.secenekSil(req.prisma!, id, eksenId, secenekId);
  }

  // ──────────────────────────────────────────
  // VARYANT CRUD (ekle / guncelle / sil / matris)
  // ──────────────────────────────────────────

  @Post(':id/varyant')
  @RequireYetki('urun.varyant-yonet')
  async varyantOlustur(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(VaryantOlusturSemasi)) girdi: VaryantOlusturGirdi,
  ) {
    return this.urunService.varyantOlustur(req.prisma!, id, girdi, kullanici.id);
  }

  @Patch(':id/varyant/:varyantId')
  @RequireYetki('urun.varyant-yonet')
  async varyantGuncelle(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Param('varyantId', ParseIntPipe) varyantId: number,
    @Body(new ZodValidationPipe(VaryantGuncelleSemasi)) girdi: VaryantGuncelleGirdi,
  ) {
    return this.urunService.varyantGuncelle(req.prisma!, id, varyantId, girdi, kullanici.id);
  }

  @Delete(':id/varyant/:varyantId')
  @RequireYetki('urun.varyant-yonet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async varyantSil(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Param('varyantId', ParseIntPipe) varyantId: number,
  ): Promise<void> {
    await this.urunService.varyantSil(req.prisma!, id, varyantId, kullanici.id);
  }

  @Post(':id/varyant-matris')
  @RequireYetki('urun.varyant-yonet')
  async varyantMatrisUret(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.varyantMatrisUret(req.prisma!, id, kullanici.id);
  }

  @Post(':id/varyant/:varyantId/barkod-uret')
  @RequireYetki('urun.varyant-yonet')
  async varyantBarkodUret(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
    @Param('varyantId', ParseIntPipe) varyantId: number,
  ) {
    return this.urunService.varyantBarkodUret(req.prisma!, id, varyantId, kullanici.id);
  }

  @Post(':id/toplu-barkod-uret')
  @RequireYetki('urun.varyant-yonet')
  async varyantTopluBarkodUret(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urunService.varyantTopluBarkodUret(req.prisma!, id, kullanici.id);
  }
}
