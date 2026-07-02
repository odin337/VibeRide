import { createHmac } from 'node:crypto';

/**
 * Test-support builder for REAL, correctly signed Telegram initData
 * strings — the HMAC steps mirror the official algorithm implemented by
 * src/auth/telegram-init-data.ts, computed independently here so the
 * validator is checked against the spec rather than against itself.
 * Excluded from the production build (tsconfig.build.json), fully executed
 * by the test suite.
 */
export interface InitDataOptions {
  /** Omit to produce a signed payload without an auth_date field. */
  readonly authDate?: number;
  /** Omit to produce a signed payload without a user field. */
  readonly user?: unknown;
  /** Extra raw fields, set after user/auth_date (may override them). */
  readonly extra?: Readonly<Record<string, string>>;
}

export function buildInitData(botToken: string, options: InitDataOptions): string {
  const params = new URLSearchParams();
  if (options.authDate !== undefined) {
    params.set('auth_date', String(options.authDate));
  }
  if (options.user !== undefined) {
    params.set('user', JSON.stringify(options.user));
  }
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    params.set(key, value);
  }

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const signature = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', signature);
  return params.toString();
}
