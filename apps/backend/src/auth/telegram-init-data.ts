import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/** Default freshness window for `auth_date`, seconds (24 h). */
export const DEFAULT_INIT_DATA_MAX_AGE_SEC = 86400;

/** Identity claims parsed from the (signature-verified) `user` field. */
export interface TelegramInitDataUser {
  readonly id: number;
  readonly firstName: string | undefined;
  readonly lastName: string | undefined;
  readonly username: string | undefined;
}

export type InitDataValidation =
  | { readonly ok: true; readonly user: TelegramInitDataUser; readonly authDate: number }
  | { readonly ok: false; readonly reason: string };

const SIGNATURE_HEX_PATTERN = /^[0-9a-f]{64}$/;

const initDataUserSchema = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

function invalid(reason: string): InitDataValidation {
  return { ok: false, reason };
}

/**
 * Validates a Telegram Mini App `initData` string per the official
 * algorithm (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *
 * 1. parse the query string and pull out `hash`;
 * 2. build the data-check-string: remaining `key=value` pairs (decoded
 *    values), sorted by key, joined with `\n`;
 * 3. secret = HMAC_SHA256(key = "WebAppData", msg = botToken);
 * 4. expected = hex(HMAC_SHA256(key = secret, msg = data-check-string));
 * 5. compare with the provided hash via a timing-safe comparison;
 * 6. only then trust the claims: `auth_date` freshness, `user` JSON.
 *
 * Pure function: the clock is a parameter, no IO, no exceptions —
 * every failure mode is a discriminated `{ ok: false, reason }`.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  nowSec: number,
  maxAgeSec: number = DEFAULT_INIT_DATA_MAX_AGE_SEC,
): InitDataValidation {
  const params = new URLSearchParams(initData);

  const providedSignatureHex = params.get('hash');
  if (providedSignatureHex === null) {
    return invalid('missing hash field');
  }
  if (!SIGNATURE_HEX_PATTERN.test(providedSignatureHex)) {
    return invalid('hash field is not a 64-char lowercase hex string');
  }
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedSignature = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const providedSignature = Buffer.from(providedSignatureHex, 'hex');
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return invalid('signature mismatch');
  }

  const authDateRaw = params.get('auth_date');
  if (authDateRaw === null) {
    return invalid('missing auth_date field');
  }
  const authDate = Number(authDateRaw);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return invalid('auth_date is not a positive integer');
  }
  if (nowSec - authDate > maxAgeSec) {
    return invalid(`auth_date expired (older than ${maxAgeSec} s)`);
  }

  const userRaw = params.get('user');
  if (userRaw === null) {
    return invalid('missing user field');
  }
  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    return invalid('user field is not valid JSON');
  }
  const userResult = initDataUserSchema.safeParse(userJson);
  if (!userResult.success) {
    return invalid('user field does not match the expected shape');
  }

  return {
    ok: true,
    user: {
      id: userResult.data.id,
      firstName: userResult.data.first_name,
      lastName: userResult.data.last_name,
      username: userResult.data.username,
    },
    authDate,
  };
}
