import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantClient } from '@kuvvem/database';
import * as XLSX from 'xlsx';

export interface ExcelSatir {
  [kolon: string]: string | number | null;
}

export interface ImportSonuc {
  basarili: number;
  hatali: number;
  hatalar: Array<{ satirIndex: number; mesaj: string }>;
}

interface CariImportSatir {
  _satirIndex: number;
  _cariGrupId?: number | null;
  _firmaTuru?: string;
  [alan: string]: unknown;
}

// Excel'den import edilebilecek alanlar
export const IMPORT_ALANLARI = [
  { anahtar: 'unvan', etiket: 'Ünvan', zorunluGrup: 'kimlik' },
  { anahtar: 'ad', etiket: 'Adı', zorunluGrup: 'kimlik' },
  { anahtar: 'soyad', etiket: 'Soyadı', zorunluGrup: 'kimlik' },
  { anahtar: 'kisaAd', etiket: 'Kısa Adı', zorunluGrup: null },
  { anahtar: 'cep', etiket: 'Cep Telefon', zorunluGrup: null },
  { anahtar: 'telefon', etiket: 'Telefon', zorunluGrup: null },
  { anahtar: 'email', etiket: 'E-posta', zorunluGrup: null },
  { anahtar: 'vergiNo', etiket: 'Vergi No / TC Kimlik', zorunluGrup: null },
  { anahtar: 'vergiDairesi', etiket: 'Vergi Dairesi', zorunluGrup: null },
  { anahtar: 'il', etiket: 'İl', zorunluGrup: null },
  { anahtar: 'ilce', etiket: 'İlçe', zorunluGrup: null },
  { anahtar: 'adres', etiket: 'Adres', zorunluGrup: null },
  { anahtar: 'iskonto', etiket: 'İskonto %', zorunluGrup: null },
  { anahtar: 'sektor', etiket: 'Sektör', zorunluGrup: null },
] as const;

@Injectable()
export class CariImportService {
  /**
   * Excel dosyasını parse et, kolonları ve önizleme verisini dön.
   */
  parseExcel(buffer: Buffer): { kolonlar: string[]; satirlar: ExcelSatir[]; toplamSatir: number } {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException({ kod: 'EXCEL_BOS', mesaj: 'Excel dosyası boş' });

    const jsonVeri = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 'A', defval: '' });
    if (jsonVeri.length < 2) {
      throw new BadRequestException({ kod: 'YETERSIZ_SATIR', mesaj: 'Excel dosyasında en az 2 satır olmalı (başlık + veri)' });
    }

    // İlk satır = başlık
    const baslikSatir = jsonVeri[0];
    const kolonlar = Object.values(baslikSatir).map((v) => String(v ?? '').trim());

    // Veri satırları
    const satirlar: ExcelSatir[] = [];
    for (let i = 1; i < jsonVeri.length; i++) {
      const satir = jsonVeri[i];
      const degerler = Object.values(satir);
      // Boş satırları atla
      if (degerler.every((v) => !v || String(v).trim() === '')) continue;

      const satirObj: ExcelSatir = {};
      kolonlar.forEach((kolon, idx) => {
        const harf = String.fromCharCode(65 + idx); // A, B, C...
        const deger = satir[harf];
        satirObj[idx.toString()] = deger != null ? String(deger).trim() : null;
      });
      satirlar.push(satirObj);
    }

    return { kolonlar, satirlar, toplamSatir: satirlar.length };
  }

  /**
   * Eşleştirilmiş verileri toplu olarak cari tablosuna kaydet.
   */
  async importEt(
    prisma: TenantClient,
    satirlar: CariImportSatir[],
    eslestirme: Record<string, string>, // { excelKolonIndex: cariAlanAnahtar }
    varsayilanlar: { tip: string; kisiTipi: string },
    kullaniciId: bigint,
  ): Promise<ImportSonuc> {
    let basarili = 0;
    const hatalar: ImportSonuc['hatalar'] = [];

    for (const satir of satirlar) {
      try {
        // Eşleştirilmiş alanlardan veri çıkar
        const veri: Record<string, string> = {};
        for (const [excelIdx, cariAlan] of Object.entries(eslestirme)) {
          const deger = satir[excelIdx];
          if (deger != null && String(deger).trim()) {
            veri[cariAlan] = String(deger).trim();
          }
        }

        // Zorunlu alan kontrolü: en az unvan veya ad olmalı
        if (!veri.unvan && !veri.ad) {
          hatalar.push({ satirIndex: satir._satirIndex, mesaj: 'Ünvan veya Ad zorunludur' });
          continue;
        }

        // Kişi tipi belirle
        const kisiTipi = veri.unvan ? 'tuzel' : 'gercek';

        // Vergi no benzersizlik kontrolü
        if (veri.vergiNo) {
          const mevcut = await prisma.cari.findFirst({
            where: { vergiNo: veri.vergiNo, silindiMi: false },
            select: { id: true },
          });
          if (mevcut) {
            hatalar.push({ satirIndex: satir._satirIndex, mesaj: `Bu vergi numarası zaten kayıtlı (ID: ${mevcut.id})` });
            continue;
          }
        }

        // Kod oluştur
        const sonCari = await prisma.cari.findFirst({
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        const sonId = sonCari ? Number(sonCari.id) : 0;
        const kod = `IMP-${String(sonId + basarili + 1).padStart(4, '0')}`;

        // Cari oluştur
        const yeniCari = await prisma.cari.create({
          data: {
            kod,
            tip: satir._firmaTuru ?? varsayilanlar.tip ?? 'musteri',
            kisiTipi,
            cariGrupId: satir._cariGrupId ? BigInt(satir._cariGrupId) : null,
            unvan: veri.unvan ?? null,
            ad: veri.ad ?? null,
            soyad: veri.soyad ?? null,
            kisaAd: veri.kisaAd ?? null,
            vergiNo: veri.vergiNo ?? null,
            vergiNoTipi: veri.vergiNo
              ? (veri.vergiNo.length === 11 ? 'TCKN' : 'VKN')
              : null,
            iskontoOrani: veri.iskonto ? veri.iskonto : '0',
            paraBirimiKod: 'TRY',
            sektor: veri.sektor ?? null,
            olusturanKullaniciId: kullaniciId,
          },
        });

        // İletişim bilgileri oluştur
        const iletisimler: Array<{ tip: string; deger: string }> = [];
        if (veri.cep) iletisimler.push({ tip: 'cep', deger: this.telefonFormatla(veri.cep) });
        if (veri.telefon) iletisimler.push({ tip: 'telefon', deger: this.telefonFormatla(veri.telefon) });
        if (veri.email) iletisimler.push({ tip: 'email', deger: veri.email });

        if (iletisimler.length > 0) {
          await prisma.cariIletisim.createMany({
            data: iletisimler.map((il) => ({
              cariId: yeniCari.id,
              tip: il.tip,
              deger: il.deger,
              varsayilanMi: true,
            })),
          });
        }

        // Adres oluştur (il + ilce + adres varsa)
        if (veri.adres || veri.il) {
          await prisma.cariAdres.create({
            data: {
              cariId: yeniCari.id,
              baslik: 'Merkez',
              tip: 'genel',
              adresSatir1: veri.adres ?? `${veri.il ?? ''} ${veri.ilce ?? ''}`.trim(),
              ulkeKodu: 'TR',
              varsayilanFaturaMi: true,
              varsayilanSevkMi: true,
            },
          });
        }

        basarili++;
      } catch (err: any) {
        hatalar.push({
          satirIndex: satir._satirIndex,
          mesaj: err?.message ?? 'Bilinmeyen hata',
        });
      }
    }

    return { basarili, hatali: hatalar.length, hatalar };
  }

  private telefonFormatla(tel: string): string {
    const sadeceSayi = tel.replace(/\D/g, '');
    if (!sadeceSayi) return tel;

    // 5XXXXXXXXX → 905XXXXXXXXX
    if (sadeceSayi.length === 10 && sadeceSayi[0] === '5') {
      return '90' + sadeceSayi;
    }
    // 05XXXXXXXXX → 905XXXXXXXXX
    if (sadeceSayi.length === 11 && sadeceSayi[0] === '0') {
      return '90' + sadeceSayi.slice(1);
    }
    return sadeceSayi;
  }
}
