import { createRoot } from 'react-dom/client';
import { analyzePcm, decodeAudioFile } from '@viberide/audio-engine';
import { createConsoleLogger, createGameEventBus, resolveFeatureFlags } from '@viberide/shared';
import type { FeatureFlags, PlatformAdapter } from '@viberide/shared';
import { createTonModule } from '@viberide/ton-sdk-wrapper';
import type { TonModuleConfig } from '@viberide/ton-sdk-wrapper';
import { generateLevel } from '@viberide/track-generator';

import { createApiClient } from './api/client';
import { createTrackPlayback } from './audio/playback';
import { createSfx } from './audio/sfx';
import { App } from './app/App';
import { GameController } from './app/game-controller';
import type { GameControllerPorts } from './app/ports';
import { createPixiRenderer } from './render/renderer';
import './styles.css';

/**
 * The embeddable entry (composition root, coverage-excluded — see
 * vitest.config.ts): wires the browser implementations of every port and
 * mounts the React app. apps/telegram-adapter consumes exactly this
 * function via the "./embed" package export.
 */

export interface CreateGameOptions {
  readonly platform: PlatformAdapter;
  /** Backend origin; defaults to VITE_API_BASE_URL, then same-origin. */
  readonly apiBaseUrl?: string;
  /** Overrides applied on top of the env-resolved feature flags. */
  readonly flags?: Partial<FeatureFlags>;
}

export interface GameHandle {
  destroy(): void;
}

function readEnv(): Record<string, string | undefined> {
  // ImportMetaEnv's known keys (DEV, PROD, ...) are booleans, so the
  // interface is not directly comparable to a plain string record.
  return import.meta.env;
}

export function createGame(container: HTMLElement, options: CreateGameOptions): GameHandle {
  const env = readEnv();
  const flags: FeatureFlags = { ...resolveFeatureFlags(env), ...options.flags };
  const logger = createConsoleLogger({ bindings: { module: 'web-game' } });
  const bus = createGameEventBus((event, error) => {
    logger.error('event handler failed', {
      event,
      reason: error instanceof Error ? error.message : String(error),
    });
  });

  const tonConfig: TonModuleConfig = {
    network: env.VITE_TON_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
    manifestUrl: env.VITE_TONCONNECT_MANIFEST_URL ?? '',
  };
  const ton = createTonModule(flags.tonEnabled, tonConfig, 'tonconnect', logger);

  const ports: GameControllerPorts = {
    decodeAudio: (bytes) => decodeAudioFile(bytes),
    analyze: (pcm, sampleRate, audioHash) => analyzePcm(pcm, sampleRate, audioHash),
    generateLevel: (beatMap) => generateLevel(beatMap),
    createRenderer: (element, level, rendererOptions) =>
      createPixiRenderer(element, level, rendererOptions),
    playback: createTrackPlayback(bus, logger),
    sfx: createSfx(bus, logger),
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => {
      window.cancelAnimationFrame(handle);
    },
    getGamepads: () => {
      try {
        return navigator.getGamepads();
      } catch {
        // Insecure contexts / permissions policies may forbid gamepad access.
        return [];
      }
    },
  };

  const controller = new GameController({ bus, platform: options.platform, ports, logger });
  const client = createApiClient({
    baseUrl: options.apiBaseUrl ?? env.VITE_API_BASE_URL ?? '',
    logger,
  });

  const root = createRoot(container);
  root.render(
    <App
      controller={controller}
      client={client}
      ton={ton}
      flags={flags}
      platform={options.platform}
      logger={logger}
    />,
  );

  return {
    destroy(): void {
      root.unmount();
      controller.destroy();
    },
  };
}
