import { z } from 'zod';

/**
 * Environment variable dogrulama — hatali env'de uygulama bootstrap'ta patlar.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL_MASTER: z.string().url(),
  DATABASE_URL_TEMPLATE: z.string().refine((v) => v.includes('{db}'), {
    message: 'DATABASE_URL_TEMPLATE {db} placeholder icermeli',
  }),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmali'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  ARGON2_MEMORY_COST: z.coerce.number().default(65536),
  ARGON2_TIME_COST: z.coerce.number().default(3),
  ARGON2_PARALLELISM: z.coerce.number().default(1),

  TENANT_CACHE_MAX: z.coerce.number().default(80),
  TENANT_CACHE_TTL_MS: z.coerce.number().default(1000 * 60 * 10),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGINS: z.string().optional(),

  THROTTLE_TTL_MS: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(100),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const sonuc = envSchema.safeParse(config);
  if (!sonuc.success) {
    const hatalar = sonuc.error.flatten().fieldErrors;
    throw new Error(
      `Env dogrulama hatasi:\n${JSON.stringify(hatalar, null, 2)}`,
    );
  }
  return sonuc.data;
}
