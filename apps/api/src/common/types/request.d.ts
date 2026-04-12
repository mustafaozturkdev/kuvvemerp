/**
 * Fastify Request augmentation — tenant + kullanici bilgileri her request'te tasinir.
 */
import type { TenantClient } from '@kuvvem/database';

export interface TenantBilgi {
  id: string;        // tenant uuid
  slug: string;
  dbAdi: string;
  durum: string;
  varsayilanDil: string;
  zamanDilimi: string;
}

export interface KullaniciBilgi {
  id: bigint;
  publicId: string;
  email: string;
  roller: string[];
  yetkiler: string[];
  oturumId: bigint;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantBilgi;
    prisma?: TenantClient;
    kullanici?: KullaniciBilgi;
    istekId?: string;
  }
}

export {};
