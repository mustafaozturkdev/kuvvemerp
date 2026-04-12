/**
 * Master Prisma Client — kuvvem_master DB.
 * Platform/tenant/billing sorguları için.
 */
export {
  PrismaClient as MasterClient,
  Prisma as MasterPrisma,
} from '../node_modules/.prisma/master/index.js';
export type {
  Plan,
  Tenant,
  TenantDomain,
  PlatformKullanici,
  PlatformKullaniciTenant,
  Abonelik,
  AbonelikFatura,
  KullanimMetrikGunluk,
  PlatformLog,
  TenantBackup,
} from '../node_modules/.prisma/master/index.js';
