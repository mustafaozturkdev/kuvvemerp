import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * ZodValidationPipe — body/query/param'i Zod schema'sina gore dogrular.
 * Hata durumunda standart hata formatinda 400 firlatir.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const sonuc = this.schema.safeParse(value);
    if (!sonuc.success) {
      const alanlar = sonuc.error.flatten().fieldErrors;
      throw new BadRequestException({
        kod: 'VALIDATION_HATASI',
        mesaj: 'Girdi dogrulama hatasi',
        alan: null,
        detay: alanlar,
      });
    }
    return sonuc.data;
  }
}
