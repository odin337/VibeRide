import { resolveFeatureFlags } from '@viberide/shared';
import type { FeatureFlags } from '@viberide/shared';
import { z } from 'zod';

/**
 * Backend runtime configuration, zod-validated once at bootstrap.
 * Variable names and defaults follow docs/SETUP.md (`apps/backend` table).
 */
export interface Env {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly host: string;
  readonly jwtSecret: string;
  /** True when the built-in dev/test secret is in use — logged as a warning. */
  readonly jwtSecretIsFallback: boolean;
  /** Session token lifetime in seconds. */
  readonly jwtExpiresIn: number;
  /** Absent ⇒ POST /api/auth/telegram responds 503. */
  readonly telegramBotToken: string | undefined;
  readonly corsOrigins: readonly string[];
  readonly throttleTtlSec: number;
  readonly throttleLimit: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly flags: FeatureFlags;
}

/**
 * Fixed development/test fallback so `pnpm dev` works with zero setup.
 * loadEnv refuses to boot production without a real JWT_SECRET.
 */
export const DEV_JWT_SECRET = 'viberide-development-only-jwt-secret-0000';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  // Seconds — a plain number keeps the value assignable to @nestjs/jwt's
  // `expiresIn: number | StringValue` without depending on ms's types.
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173,http://localhost:5174'),
  THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/** Empty strings (e.g. `JWT_SECRET=` in an .env file) count as unset. */
function withoutBlankValues(
  raw: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Parses and validates the process environment. Throws a descriptive Error
 * on any invalid value and when production is missing its JWT secret —
 * failing the boot is safer than running misconfigured.
 */
export function loadEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(withoutBlankValues(raw));
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid backend environment: ${details}`);
  }
  const parsed = result.data;

  const providedSecret = parsed.JWT_SECRET;
  if (parsed.NODE_ENV === 'production' && providedSecret === undefined) {
    throw new Error(
      'JWT_SECRET is required in production — refusing to boot. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }

  const corsOrigins = parsed.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    jwtSecret: providedSecret ?? DEV_JWT_SECRET,
    jwtSecretIsFallback: providedSecret === undefined,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    corsOrigins,
    throttleTtlSec: parsed.THROTTLE_TTL_SEC,
    throttleLimit: parsed.THROTTLE_LIMIT,
    logLevel: parsed.LOG_LEVEL,
    flags: resolveFeatureFlags(raw),
  };
}
