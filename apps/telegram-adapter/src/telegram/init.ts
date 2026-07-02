import { init as initSdk, miniApp, swipeBehavior, themeParams, viewport } from '@telegram-apps/sdk';
import { createConsoleLogger } from '@viberide/shared';

import { describeCause } from './local-storage';

const logger = createConsoleLogger({ bindings: { module: 'telegram-init' } });

/** Dark-first fallbacks used when the client does not report theme params. */
export const THEME_DEFAULTS = {
  bg: '#0f0f14',
  text: '#f2f2f2',
  accent: '#6ab3f3',
} as const;

/**
 * Projects Telegram theme params onto CSS custom properties so the game UI
 * can follow the client theme without importing the SDK itself.
 */
export function applyThemeCssVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--tg-bg', themeParams.backgroundColor() ?? THEME_DEFAULTS.bg);
  root.style.setProperty('--tg-text', themeParams.textColor() ?? THEME_DEFAULTS.text);
  root.style.setProperty('--tg-accent', themeParams.buttonColor() ?? THEME_DEFAULTS.accent);
}

/** Runs one init capability; failures are logged, never thrown. */
function step(name: string, run: () => void): void {
  try {
    run();
  } catch (cause) {
    logger.warn('telegram init step failed', { step: name, reason: describeCause(cause) });
  }
}

/**
 * Boots the Telegram Mini App environment. Every capability is guarded by
 * isSupported()/isAvailable() checks and wrapped so that a partial
 * environment (old client, missing feature) never throws.
 */
export async function initTelegram(): Promise<void> {
  step('init-sdk', () => {
    initSdk();
  });

  step('mount-mini-app', () => {
    if (miniApp.mountSync.isAvailable()) {
      miniApp.mountSync();
    }
  });

  step('mount-theme-params', () => {
    if (themeParams.mountSync.isAvailable()) {
      themeParams.mountSync();
    }
  });

  if (viewport.mount.isAvailable()) {
    try {
      await viewport.mount();
      if (viewport.expand.isAvailable()) {
        viewport.expand();
      }
    } catch (cause) {
      logger.warn('telegram init step failed', {
        step: 'mount-viewport',
        reason: describeCause(cause),
      });
    }
  }

  step('apply-theme', () => {
    applyThemeCssVars();
  });

  step('disable-vertical-swipes', () => {
    if (swipeBehavior.isSupported() && swipeBehavior.mount.isAvailable()) {
      swipeBehavior.mount();
      if (swipeBehavior.disableVertical.isAvailable()) {
        swipeBehavior.disableVertical();
      }
    }
  });

  step('ready', () => {
    if (miniApp.ready.isAvailable()) {
      miniApp.ready();
    }
  });
}
