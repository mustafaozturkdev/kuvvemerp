import { Controller, Post, Req, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UploadService } from './upload.service.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';

@Controller('api/v1/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /api/v1/upload/logo — Firma logosu (max 800px, ORIJINAL format korunur)
   */
  @Post('logo')
  @RequireYetki('sistem.ayar.duzenle')
  async logo(@Req() req: FastifyRequest) {
    const dosya = await this.dosyaAl(req);
    return this.uploadService.resimYukle(dosya.buffer, dosya.filename, dosya.mimetype, {
      maxGenislik: 800,
      maxYukseklik: 800,
      klasor: 'logo',
      webpDonustur: false, // Logo orijinal haliyle
    });
  }

  /**
   * POST /api/v1/upload/imza — Firma imzasi (max 400x200, WebP)
   */
  @Post('imza')
  @RequireYetki('sistem.ayar.duzenle')
  async imza(@Req() req: FastifyRequest) {
    const dosya = await this.dosyaAl(req);
    return this.uploadService.resimYukle(dosya.buffer, dosya.filename, dosya.mimetype, {
      maxGenislik: 400,
      maxYukseklik: 200,
      klasor: 'imza',
      webpDonustur: true,
    });
  }

  /**
   * POST /api/v1/upload/magaza — Magaza resmi (max 1200px, WebP)
   */
  @Post('magaza')
  @RequireYetki('magaza.yonet')
  async magaza(@Req() req: FastifyRequest) {
    const dosya = await this.dosyaAl(req);
    return this.uploadService.resimYukle(dosya.buffer, dosya.filename, dosya.mimetype, {
      maxGenislik: 1200,
      maxYukseklik: 1200,
      klasor: 'magaza',
      webpDonustur: true,
    });
  }

  /**
   * POST /api/v1/upload/genel — Genel resim (WebP)
   */
  @Post('genel')
  @RequireYetki('sistem.ayar.goruntule')
  async genel(@Req() req: FastifyRequest) {
    const dosya = await this.dosyaAl(req);
    return this.uploadService.resimYukle(dosya.buffer, dosya.filename, dosya.mimetype, {
      klasor: 'genel',
      webpDonustur: true,
    });
  }

  private async dosyaAl(req: FastifyRequest) {
    const data = await (req as any).file();
    if (!data) {
      throw new BadRequestException({
        kod: 'DOSYA_BULUNAMADI',
        mesaj: 'Lutfen bir dosya secin',
      });
    }
    const buffer = await data.toBuffer();
    return {
      buffer,
      filename: data.filename,
      mimetype: data.mimetype,
    };
  }
}
