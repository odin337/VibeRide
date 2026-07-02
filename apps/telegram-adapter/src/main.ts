import { createConsoleLogger, resolveFeatureFlags } from '@viberide/shared';
import type { PlatformAdapter } from '@viberide/shared';
import { createGame } from '@viberide/web-game/embed';

import { isTelegramEnv } from './telegram/environment';
import { initTelegram } from './telegram/init';
import { createWebLikeFallback, describeCause } from './telegram/local-storage';
import { createTelegramPlatform } from './telegram/platform';

const logger = createConsoleLogger({ bindings: { module: 'telegram-adapter' } });

function renderDevNotice(): void {
  const banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.textContent = 'Running outside Telegram — using local fallback';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '9999',
    padding: '6px 12px',
    textAlign: 'center',
    fontSize: '12px',
    background: '#3b2f00',
    color: '#ffd966',
  });
  document.body.appendChild(banner);
}

function renderErrorScreen(reason: string): void {
  const container = document.getElementById('root') ?? document.body;
  const screen = document.createElement('div');
  Object.assign(screen.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: '100%',
    padding: '24px',
    textAlign: 'center',
  });
  const title = document.createElement('h1');
  title.textContent = 'VibeRide failed to start';
  title.style.fontSize = '18px';
  const detail = document.createElement('p');
  detail.textContent = reason;
  Object.assign(detail.style, { fontSize: '13px', opacity: '0.8' });
  screen.append(title, detail);
  container.replaceChildren(screen);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('root');
  if (root === null) {
    throw new Error('telegram-adapter: #root container is missing from index.html');
  }

  let platform: PlatformAdapter;
  if (isTelegramEnv()) {
    await initTelegram();
    platform = createTelegramPlatform();
  } else {
    logger.info('running outside Telegram, using local fallback platform');
    renderDevNotice();
    platform = createWebLikeFallback();
  }

  createGame(root, {
    platform,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
    // ImportMetaEnv's known keys (DEV, PROD, ...) are booleans, so the
    // interface is not directly comparable to a plain string record.
    flags: resolveFeatureFlags(import.meta.env),
  });
}

void bootstrap().catch((cause: unknown) => {
  const reason = describeCause(cause);
  logger.error('bootstrap failed', { reason });
  renderErrorScreen(reason);
});
