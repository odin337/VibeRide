import { describe, expect, it } from 'vitest';

import { buildInitData } from '../testing/telegram';
import { DEFAULT_INIT_DATA_MAX_AGE_SEC, validateInitData } from './telegram-init-data';

const BOT_TOKEN = '7000000001:AAFakeTestTokenForHmacDerivation123456';
const NOW_SEC = 1_751_443_200; // 2025-07-02T08:00:00Z
const USER = { id: 12345, first_name: 'Danila', username: 'danila_rides' };

describe('validateInitData', () => {
  it('accepts a correctly signed, fresh initData and parses the user', () => {
    const initData = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC - 60,
      user: USER,
      extra: { query_id: 'AAHdF6IQAAAAAN0XohDhrOrc' },
    });
    const result = validateInitData(initData, BOT_TOKEN, NOW_SEC);
    expect(result).toEqual({
      ok: true,
      user: { id: 12345, firstName: 'Danila', lastName: undefined, username: 'danila_rides' },
      authDate: NOW_SEC - 60,
    });
  });

  it('is insensitive to the original field order (sorted data-check-string)', () => {
    // buildInitData sets extra fields after user/auth_date; URLSearchParams
    // preserves insertion order, so this exercises re-sorting inside the
    // validator against an out-of-alphabetical-order payload.
    const initData = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC,
      user: USER,
      extra: { a_first_key: 'value' },
    });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC).ok).toBe(true);
  });

  it('rejects a tampered hash', () => {
    const initData = buildInitData(BOT_TOKEN, { authDate: NOW_SEC, user: USER });
    const params = new URLSearchParams(initData);
    const signature = params.get('hash') ?? '';
    const flipped = (signature.startsWith('0') ? '1' : '0') + signature.slice(1);
    params.set('hash', flipped);
    const result = validateInitData(params.toString(), BOT_TOKEN, NOW_SEC);
    expect(result).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects payloads whose fields were modified after signing', () => {
    const initData = buildInitData(BOT_TOKEN, { authDate: NOW_SEC, user: USER });
    const params = new URLSearchParams(initData);
    params.set('user', JSON.stringify({ ...USER, id: 99999 }));
    const result = validateInitData(params.toString(), BOT_TOKEN, NOW_SEC);
    expect(result).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects initData signed with a different bot token', () => {
    const initData = buildInitData('8000000002:OtherBotToken', {
      authDate: NOW_SEC,
      user: USER,
    });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'signature mismatch',
    });
  });

  it('rejects an expired auth_date and accepts one exactly at the limit', () => {
    const expired = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC - DEFAULT_INIT_DATA_MAX_AGE_SEC - 1,
      user: USER,
    });
    const result = validateInitData(expired, BOT_TOKEN, NOW_SEC);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/auth_date expired/);
    }

    const atLimit = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC - DEFAULT_INIT_DATA_MAX_AGE_SEC,
      user: USER,
    });
    expect(validateInitData(atLimit, BOT_TOKEN, NOW_SEC).ok).toBe(true);
  });

  it('honours a custom maxAgeSec', () => {
    const initData = buildInitData(BOT_TOKEN, { authDate: NOW_SEC - 120, user: USER });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC, 60).ok).toBe(false);
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC, 300).ok).toBe(true);
  });

  it('rejects payloads without a hash field', () => {
    expect(validateInitData('auth_date=123&user=%7B%7D', BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'missing hash field',
    });
  });

  it('rejects a malformed hash value', () => {
    const result = validateInitData(`auth_date=${NOW_SEC}&hash=nothex`, BOT_TOKEN, NOW_SEC);
    expect(result).toEqual({
      ok: false,
      reason: 'hash field is not a 64-char lowercase hex string',
    });
  });

  it('rejects garbage input', () => {
    const result = validateInitData('complete garbage, not a querystring', BOT_TOKEN, NOW_SEC);
    expect(result.ok).toBe(false);
  });

  it('rejects a signed payload missing auth_date', () => {
    const initData = buildInitData(BOT_TOKEN, { user: USER });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'missing auth_date field',
    });
  });

  it('rejects a signed payload with a non-integer auth_date', () => {
    const initData = buildInitData(BOT_TOKEN, { user: USER, extra: { auth_date: 'soon' } });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'auth_date is not a positive integer',
    });
  });

  it('rejects a signed payload missing the user field', () => {
    const initData = buildInitData(BOT_TOKEN, { authDate: NOW_SEC });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'missing user field',
    });
  });

  it('rejects a signed payload with non-JSON user', () => {
    const initData = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC,
      extra: { user: 'not json {' },
    });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'user field is not valid JSON',
    });
  });

  it('rejects a signed payload whose user lacks an integer id', () => {
    const initData = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC,
      user: { id: 'twelve', first_name: 'X' },
    });
    expect(validateInitData(initData, BOT_TOKEN, NOW_SEC)).toEqual({
      ok: false,
      reason: 'user field does not match the expected shape',
    });
  });
});
