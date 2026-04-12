import { Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const IZIN_VERILEN_TIPLER = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BOYUT = 5 * 1024 * 1024; // 5MB

interface UploadSonuc {
  dosyaAdi: string;
  url: string;
  genislik: number;
  yukseklik: number;
  boyutByte: number;
  mimeTipi: string;
}

@Injectable()
export class UploadService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
  }

  async resimYukle(
    buffer: Buffer,
    orijinalAd: string,
    mimeTipi: string,
    options?: {
      maxGenislik?: number;
      maxYukseklik?: number;
      kalite?: number;
      klasor?: string;
      webpDonustur?: boolean; // true = WebP, false = orijinal format korunur
    },
  ): Promise<UploadSonuc> {
    if (!IZIN_VERILEN_TIPLER.includes(mimeTipi)) {
      throw new BadRequestException({
        kod: 'GECERSIZ_DOSYA_TIPI',
        mesaj: 'Desteklenen tipler: JPG, PNG, GIF, WebP',
      });
    }

    if (buffer.length > MAX_BOYUT) {
      throw new BadRequestException({
        kod: 'DOSYA_COK_BUYUK',
        mesaj: `Maksimum dosya boyutu: ${MAX_BOYUT / 1024 / 1024}MB`,
      });
    }

    const maxG = options?.maxGenislik ?? 1200;
    const maxY = options?.maxYukseklik ?? 1200;
    const kalite = options?.kalite ?? 85;
    const klasor = options?.klasor ?? 'genel';
    const webpDonustur = options?.webpDonustur ?? true;

    const hedefKlasor = path.join(this.uploadDir, klasor);
    await fs.mkdir(hedefKlasor, { recursive: true });

    const hash = crypto.randomBytes(8).toString('hex');

    let pipeline = sharp(buffer).resize(maxG, maxY, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    let uzanti: string;
    let ciktiMime: string;

    if (webpDonustur) {
      // WebP donusumu
      pipeline = pipeline.webp({ quality: kalite });
      uzanti = 'webp';
      ciktiMime = 'image/webp';
    } else {
      // Orijinal format korunur, sadece resize + optimize
      const ext = this.uzantiAl(mimeTipi);
      uzanti = ext;
      ciktiMime = mimeTipi;

      switch (mimeTipi) {
        case 'image/jpeg':
          pipeline = pipeline.jpeg({ quality: kalite });
          break;
        case 'image/png':
          pipeline = pipeline.png({ compressionLevel: 8 });
          break;
        case 'image/webp':
          pipeline = pipeline.webp({ quality: kalite });
          break;
        // GIF: sharp resize eder, format korur
      }
    }

    const dosyaAdi = `${hash}.${uzanti}`;
    const dosyaYolu = path.join(hedefKlasor, dosyaAdi);
    const sonuc = await pipeline.toFile(dosyaYolu);

    return {
      dosyaAdi,
      url: `/uploads/${klasor}/${dosyaAdi}`,
      genislik: sonuc.width,
      yukseklik: sonuc.height,
      boyutByte: sonuc.size,
      mimeTipi: ciktiMime,
    };
  }

  async dosyaSil(url: string): Promise<void> {
    if (!url || !url.startsWith('/uploads/')) return;
    const dosyaYolu = path.join(process.cwd(), url);
    try {
      await fs.unlink(dosyaYolu);
    } catch {
      // Dosya yoksa sessizce gec
    }
  }

  private uzantiAl(mimeTipi: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return map[mimeTipi] ?? 'jpg';
  }
}
