import { SetMetadata } from '@nestjs/common';

export const YETKI_META_KEY = 'gerekli_yetkiler';

/**
 * @RequireYetki('cari.goruntule', 'cari.olustur') — tum listede icermeli (AND).
 */
export const RequireYetki = (...yetkiler: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(YETKI_META_KEY, yetkiler);
