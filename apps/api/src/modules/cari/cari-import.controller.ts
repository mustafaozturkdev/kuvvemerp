import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CariImportService, IMPORT_ALANLARI } from './cari-import.service.js';
import { CurrentKullanici } from '../../common/decorators/kullanici.decorator.js';
import { RequireYetki } from '../../common/decorators/yetki.decorator.js';
import type { KullaniciBilgi } from '../../common/types/request.js';

@Controller('api/v1/cari/import')
export class CariImportController {
  constructor(private readonly importService: CariImportService) {}

  /**
   * Excel dosyasını yükle ve parse et.
   * Multipart form-data ile dosya gelir.
   */
  @Post('upload')
  @RequireYetki('cari.olustur')
  async upload(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      return { hata: { kod: 'DOSYA_YOK', mesaj: 'Dosya yüklenmedi' } };
    }

    const dosyaAdi = data.filename.toLowerCase();
    if (!dosyaAdi.endsWith('.xlsx') && !dosyaAdi.endsWith('.xls')) {
      return { hata: { kod: 'GECERSIZ_FORMAT', mesaj: 'Sadece .xlsx ve .xls dosyaları kabul edilir' } };
    }

    const buffer = await data.toBuffer();
    const sonuc = this.importService.parseExcel(buffer);

    return {
      tamam: true,
      kolonlar: sonuc.kolonlar,
      satirlar: sonuc.satirlar,
      toplamSatir: sonuc.toplamSatir,
      importAlanlari: IMPORT_ALANLARI,
    };
  }

  /**
   * Eşleştirilmiş verileri toplu olarak kaydet.
   */
  @Post('execute')
  @RequireYetki('cari.olustur')
  async execute(
    @Req() req: FastifyRequest,
    @CurrentKullanici() kullanici: KullaniciBilgi,
    @Body() body: {
      satirlar: Array<Record<string, unknown>>;
      eslestirme: Record<string, string>;
      varsayilanlar: { tip: string; kisiTipi: string };
    },
  ) {
    if (!body.satirlar?.length) {
      return { hata: { kod: 'VERI_YOK', mesaj: 'Aktarılacak veri bulunamadı' } };
    }

    if (!body.eslestirme || Object.keys(body.eslestirme).length === 0) {
      return { hata: { kod: 'ESLESTIRME_YOK', mesaj: 'Kolon eşleştirmesi yapılmadı' } };
    }

    const sonuc = await this.importService.importEt(
      req.prisma!,
      body.satirlar as any,
      body.eslestirme,
      body.varsayilanlar ?? { tip: 'musteri', kisiTipi: 'tuzel' },
      kullanici.id,
    );

    return {
      tamam: true,
      ...sonuc,
    };
  }
}
