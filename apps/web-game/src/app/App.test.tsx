import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DecodedAudio } from '@viberide/audio-engine';
import { createGameEventBus } from '@viberide/shared';
import type { FeatureFlags, PlatformAdapter, SaveStorage } from '@viberide/shared';
import { MockTonModule } from '@viberide/ton-sdk-wrapper';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import { App } from './App';
import { GameController } from './game-controller';
import { makeFakePorts } from './testing/fake-ports';
import type { FakePortsHarness } from './testing/fake-ports';

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

function makeClient(): ApiClient {
  return {
    authGuest: vi.fn().mockResolvedValue({
      ok: true,
      value: { token: 't', player: { id: 'guest:1', displayName: 'Rider', kind: 'guest' } },
    }),
    authTelegram: vi.fn(),
    registerTrack: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    submitScore: vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'network', message: 'offline' },
    }),
    getLeaderboard: vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'network', message: 'offline' },
    }),
    getToken: () => null,
  };
}

interface RenderOptions {
  readonly flags?: Partial<FeatureFlags>;
  readonly fakes?: FakePortsHarness;
}

interface Rendered {
  controller: GameController;
  fakes: FakePortsHarness;
  root: HTMLElement;
}

function renderApp(options: RenderOptions = {}): Rendered {
  const bus = createGameEventBus();
  const fakes = options.fakes ?? makeFakePorts();
  const platform: PlatformAdapter = {
    kind: 'web',
    storage: memoryStorage(),
    getAuthPayload: () => Promise.resolve(null),
  };
  const controller = new GameController({ bus, platform, ports: fakes.ports });
  const view = render(
    <App
      controller={controller}
      client={makeClient()}
      ton={new MockTonModule()}
      flags={{
        tonEnabled: false,
        nftSkinsEnabled: false,
        leaderboardEnabled: true,
        telegramEnabled: false,
        ...options.flags,
      }}
      platform={platform}
    />,
  );
  return { controller, fakes, root: view.container };
}

function appRoot(root: HTMLElement): HTMLElement {
  const app = root.querySelector('.vr-app');
  if (!(app instanceof HTMLElement)) {
    throw new Error('app root not rendered');
  }
  return app;
}

function pickFile(name: string): void {
  const file = new File([new Uint8Array(16)], name, { type: 'audio/mpeg' });
  fireEvent.change(screen.getByLabelText('Choose an audio track'), {
    target: { files: [file] },
  });
}

describe('App', () => {
  it('renders the menu with a file input and the track library', () => {
    const { root } = renderApp();
    expect(appRoot(root).dataset.gameState).toBe('menu');
    expect(screen.getByLabelText('Choose an audio track')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sunset Cruise' })).toBeDefined();
  });

  it('starts the demo run and exposes data-game-state="playing" with a HUD', async () => {
    const { root, fakes } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sunset Cruise' }));

    expect(appRoot(root).dataset.gameState).toBe('playing');
    await waitFor(() => {
      expect(fakes.rendererCreations).toBe(1);
    });
    expect(screen.getByTestId('hud')).toBeDefined();
    expect(screen.getByTestId('stage')).toBeDefined();

    act(() => {
      fakes.fireFrame(0);
      fakes.fireFrame(1000);
    });
    expect(screen.getByLabelText('distance').textContent).toBe('8 m');
  });

  it('shows the analyzing screen while a file decodes', async () => {
    let resolveDecode: (decoded: DecodedAudio) => void = () => undefined;
    const fakes = makeFakePorts({
      decodeAudio: () =>
        new Promise<DecodedAudio>((resolve) => {
          resolveDecode = resolve;
        }),
    });
    const { root } = renderApp({ fakes });

    pickFile('slow-song.mp3');
    await waitFor(() => {
      expect(appRoot(root).dataset.gameState).toBe('analyzing');
    });
    expect(screen.getByRole('progressbar')).toBeDefined();

    resolveDecode({ pcm: new Float32Array(4), sampleRate: 44100, audioHash: 'ab'.repeat(32) });
    await waitFor(() => {
      expect(appRoot(root).dataset.gameState).toBe('ready');
    });
  });

  it('walks a file through to the ready screen and rides', async () => {
    const { root } = renderApp();
    pickFile('my-song.mp3');

    await waitFor(() => {
      expect(appRoot(root).dataset.gameState).toBe('ready');
    });
    expect(screen.getByText('my-song')).toBeDefined();

    fireEvent.click(screen.getByTestId('start-run'));
    expect(appRoot(root).dataset.gameState).toBe('playing');
  });

  it('returns from ready to the menu', async () => {
    const { root } = renderApp();
    pickFile('my-song.mp3');
    await waitFor(() => {
      expect(appRoot(root).dataset.gameState).toBe('ready');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(appRoot(root).dataset.gameState).toBe('menu');
  });

  it('shows the crash results screen and returns to the menu', async () => {
    const { root, fakes } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sunset Cruise' }));
    await waitFor(() => {
      expect(fakes.rendererCreations).toBe(1);
    });

    act(() => {
      for (let second = 0; second <= 6; second += 1) {
        fakes.fireFrame(second * 1000);
      }
    });
    expect(appRoot(root).dataset.gameState).toBe('crashed');
    expect(screen.getByText('Wiped out')).toBeDefined();
    expect(screen.getByTestId('final-score')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(appRoot(root).dataset.gameState).toBe('menu');
  });

  it('pauses and resumes from the overlay', async () => {
    const { root, fakes } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sunset Cruise' }));
    await waitFor(() => {
      expect(fakes.rendererCreations).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(appRoot(root).dataset.gameState).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(appRoot(root).dataset.gameState).toBe('playing');
  });

  it('toggles the settings panel', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'settings' }));
    expect(screen.getByTestId('settings-panel')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('settings-panel')).toBeNull();
  });

  it('shows the TON panel on the menu only when the flag is on', () => {
    renderApp({ flags: { tonEnabled: true } });
    expect(screen.getByTestId('ton-panel')).toBeDefined();
  });

  it('hides the TON panel when the flag is off', () => {
    renderApp();
    expect(screen.queryByTestId('ton-panel')).toBeNull();
  });

  it('surfaces analysis failures on the menu', async () => {
    const fakes = makeFakePorts({
      decodeAudio: () => Promise.reject(new Error('unsupported codec')),
    });
    const { root } = renderApp({ fakes });

    pickFile('broken.ogg');
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('unsupported codec');
    });
    expect(appRoot(root).dataset.gameState).toBe('menu');
  });
});
