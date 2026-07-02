import { retrieveLaunchParams } from '@telegram-apps/sdk';

/**
 * Detects whether the app is running inside a Telegram client.
 *
 * retrieveLaunchParams() reads launch parameters from every known source
 * (location, sessionStorage, performance entries) and throws when none is
 * present — i.e. in a plain browser. Safe to call anywhere.
 */
export function isTelegramEnv(): boolean {
  try {
    retrieveLaunchParams();
    return true;
  } catch {
    return false;
  }
}
