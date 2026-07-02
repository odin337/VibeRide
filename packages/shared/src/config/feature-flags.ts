/**
 * Feature flags allow shipping the pure web game with every crypto
 * feature disabled, then enabling TON/NFT functionality per environment.
 */
export interface FeatureFlags {
  /** Master switch for all TON functionality. */
  readonly tonEnabled: boolean;
  /** NFT skins (requires tonEnabled). */
  readonly nftSkinsEnabled: boolean;
  readonly leaderboardEnabled: boolean;
  /** Telegram Mini App integration. */
  readonly telegramEnabled: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  tonEnabled: false,
  nftSkinsEnabled: false,
  leaderboardEnabled: true,
  telegramEnabled: false,
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function parseBooleanFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
}

/**
 * Resolves flags from an environment map. Accepts both Vite-style
 * (VITE_FEATURE_*) and plain (FEATURE_*) variable names.
 */
export function resolveFeatureFlags(
  env: Readonly<Record<string, string | undefined>>,
): FeatureFlags {
  const read = (name: string, fallback: boolean): boolean =>
    parseBooleanFlag(env[`VITE_FEATURE_${name}`] ?? env[`FEATURE_${name}`], fallback);

  const tonEnabled = read('TON', DEFAULT_FLAGS.tonEnabled);
  return {
    tonEnabled,
    nftSkinsEnabled: tonEnabled && read('NFT_SKINS', DEFAULT_FLAGS.nftSkinsEnabled),
    leaderboardEnabled: read('LEADERBOARD', DEFAULT_FLAGS.leaderboardEnabled),
    telegramEnabled: read('TELEGRAM', DEFAULT_FLAGS.telegramEnabled),
  };
}
