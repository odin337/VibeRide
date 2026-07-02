import { createGame } from './embed';
import { createWebPlatform } from './platform/web-platform';

/**
 * Standalone web entry: the same createGame the Telegram adapter embeds,
 * bound to the plain-web PlatformAdapter (localStorage saves, guest auth).
 */

const container = document.getElementById('root');
if (container === null) {
  throw new Error('web-game: #root container is missing from index.html');
}

createGame(container, {
  platform: createWebPlatform(),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
});
