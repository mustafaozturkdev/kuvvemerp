/**
 * Tenant Prisma Client — her tenant icin dinamik DATABASE_URL.
 * Calisma zamaninda TenantService.getClient() uzerinden olusturulur.
 */
export {
  PrismaClient as TenantClient,
  Prisma as TenantPrisma,
} from '../node_modules/.prisma/client-tenant/index.js';
export type {
  SistemAyar,
  Kullanici,
  Rol,
  Yetki,
  RolYetki,
  KullaniciRol,
  Oturum,
  ApiAnahtar,
  AuditLog,
  Cari,
  CariGrup,
  CariAdres,
  Urun,
  UrunVaryant,
  Kategori,
  Marka,
} from '../node_modules/.prisma/client-tenant/index.js';
