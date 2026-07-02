import { createGameEventBus, STORAGE_KEYS } from '@viberide/shared';
import type { GameEventMap, HapticKind, PlatformAdapter, SaveStorage } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { makeFlatLevel } from '../engine/testing/levels';
import { DEMO_TRACK_TITLE } from './demo-beatmap';
import { GameController } from './game-controller';
import { makeFakePorts } from './testing/fake-ports';
import type { FakePortsHarness, FakePortsOverrides } from './testing/fake-ports';

interface MemoryStorage extends SaveStorage {
  readonly data: Map<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
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

interface Harness {
  controller: GameController;
  fakes: FakePortsHarness;
  storage: ReturnType<typeof memoryStorage>;
  haptics: HapticKind[];
  events: { [K in keyof GameEventMap]?: GameEventMap[K][] };
  startDemoRun(): Promise<void>;
}

function makeHarness(
  initialStorage: Record<string, string> = {},
  overrides: FakePortsOverrides = {},
): Harness {
  const bus = createGameEventBus();
  const fakes = makeFakePorts(overrides);
  const storage = memoryStorage(initialStorage);
  const haptics: HapticKind[] = [];
  const platform: PlatformAdapter = {
    kind: 'web',
    storage,
    getAuthPayload: () => Promise.resolve(null),
    haptic: (kind) => {
      haptics.push(kind);
    },
  };
  const controller = new GameController({ bus, platform, ports: fakes.ports });

  const events: Harness['events'] = {};
  const record = <K extends keyof GameEventMap>(name: K): void => {
    bus.on(name, (payload) => {
      // TS collapses the union of per-event array types to `never` when
      // pushing through the generic index — safe here by construction.
      (events[name] ??= []).push(payload as never);
    });
  };
  record('audio:analysisStarted');
  record('audio:analyzed');
  record('track:generated');
  record('game:started');
  record('game:finished');

  return {
    controller,
    fakes,
    storage,
    haptics,
    events,
    async startDemoRun(): Promise<void> {
      controller.loadDemo();
      controller.play();
      await controller.attachStage(document.createElement('div'));
    },
  };
}

describe('GameController analysis flows', () => {
  it('runs menu → analyzing → ready for the demo and stores the track', () => {
    const { controller, events } = makeHarness();
    controller.loadDemo();
    expect(controller.fsm.phase).toBe('ready');
    expect(controller.loadedTrack?.title).toBe(DEMO_TRACK_TITLE);
    expect(controller.loadedTrack?.pcm).toBeNull();
    expect(events['audio:analysisStarted']).toEqual([{ fileName: DEMO_TRACK_TITLE }]);
    expect(events['audio:analyzed']).toHaveLength(1);
    expect(events['track:generated']).toHaveLength(1);
  });

  it('analyzes a file through the ports and strips the extension', async () => {
    const { controller, events } = makeHarness();
    await controller.loadFile('night-drive.mp3', new ArrayBuffer(8));
    expect(controller.fsm.phase).toBe('ready');
    expect(controller.loadedTrack?.title).toBe('night-drive');
    expect(controller.loadedTrack?.pcm).not.toBeNull();
    expect(events['track:generated']).toHaveLength(1);
  });

  it('returns to the menu when analysis fails', async () => {
    const bus = createGameEventBus();
    const fakes = makeFakePorts({
      decodeAudio: () => Promise.reject(new Error('unsupported codec')),
    });
    const controller = new GameController({
      bus,
      platform: {
        kind: 'web',
        storage: memoryStorage(),
        getAuthPayload: () => Promise.resolve(null),
      },
      ports: fakes.ports,
    });
    await expect(controller.loadFile('broken.ogg', new ArrayBuffer(4))).rejects.toThrow(
      'unsupported codec',
    );
    expect(controller.fsm.phase).toBe('menu');
    expect(controller.loadedTrack).toBeNull();
  });
});

describe('GameController run lifecycle', () => {
  it('starts a demo run: game:started, demo playback, frames advance the sim', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();

    expect(harness.controller.fsm.phase).toBe('playing');
    expect(harness.events['game:started']).toHaveLength(1);
    expect(harness.fakes.playback.calls).toContain('startDemo');
    expect(harness.fakes.rendererCreations).toBe(1);

    harness.fakes.fireFrame(0); // anchor
    harness.fakes.fireFrame(1000);
    expect(harness.controller.latestSnapshot?.tick).toBe(60);
    expect(harness.controller.getHud().distanceM).toBe(8);
    expect(harness.fakes.rendererUpdates.length).toBeGreaterThan(0);
  });

  it('ends the run on crash: crashed phase, playback stopped, result kept', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();

    for (let second = 0; second <= 6; second += 1) {
      harness.fakes.fireFrame(second * 1000);
    }
    expect(harness.controller.fsm.phase).toBe('crashed');
    expect(harness.controller.latestResult?.finished).toBe(false);
    expect(harness.fakes.playback.calls).toContain('stop');
    expect(harness.events['game:finished']).toHaveLength(1);
    expect(harness.fakes.sfx.boostActive).toBe(false);
    expect(harness.haptics).toEqual(['error']);
  });

  it('ends a completed run in the finished phase with a success haptic', async () => {
    // A short, empty level: the "demo" finishes in five simulated seconds.
    const harness = makeHarness({}, { generateLevel: () => makeFlatLevel({ lengthM: 40 }) });
    await harness.startDemoRun();
    for (let second = 0; second <= 7; second += 1) {
      harness.fakes.fireFrame(second * 1000);
    }
    expect(harness.controller.fsm.phase).toBe('finished');
    expect(harness.controller.latestResult?.finished).toBe(true);
    expect(harness.controller.latestResult?.distanceM).toBe(40);
    expect(harness.haptics).toEqual(['success']);
  });

  it('retries straight into a fresh run on the same track', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();
    for (let second = 0; second <= 6; second += 1) {
      harness.fakes.fireFrame(second * 1000);
    }
    expect(harness.controller.fsm.phase).toBe('crashed');

    harness.controller.retry();
    expect(harness.controller.fsm.phase).toBe('playing');
    expect(harness.fakes.rendererDestroyed).toBe(true);

    await harness.controller.attachStage(document.createElement('div'));
    expect(harness.fakes.rendererCreations).toBe(2);
    harness.fakes.fireFrame(10000);
    harness.fakes.fireFrame(10500);
    expect(harness.controller.latestSnapshot?.tick).toBe(30);
  });

  it('pauses and resumes playback and the accumulator', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();
    harness.fakes.fireFrame(0);
    harness.fakes.fireFrame(500);
    expect(harness.controller.latestSnapshot?.tick).toBe(30);

    harness.controller.pause();
    expect(harness.controller.fsm.phase).toBe('paused');
    expect(harness.fakes.playback.calls).toContain('pause');
    harness.fakes.fireFrame(4000);
    expect(harness.controller.latestSnapshot?.tick).toBe(30);

    harness.controller.resume();
    expect(harness.controller.fsm.phase).toBe('playing');
    harness.fakes.fireFrame(5000); // re-anchor
    harness.fakes.fireFrame(5500);
    expect(harness.controller.latestSnapshot?.tick).toBe(60);
  });

  it('quits to the menu from pause and clears the loaded track', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();
    harness.controller.pause();
    harness.controller.backToMenu();
    expect(harness.controller.fsm.phase).toBe('menu');
    expect(harness.controller.loadedTrack).toBeNull();
    expect(harness.fakes.rendererDestroyed).toBe(true);
  });

  it('feeds gamepad polls into the run', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();
    harness.fakes.setGamepads([{ buttons: [{ pressed: false }] }]);
    harness.fakes.fireFrame(0);
    harness.fakes.fireFrame(100);
    expect(harness.controller.latestSnapshot?.tick).toBe(6);
  });
});

describe('GameController settings', () => {
  it('loads persisted settings and applies the volume to audio ports', async () => {
    const stored = JSON.stringify({ volume: 0.25, reducedMotion: true });
    const harness = makeHarness({ [STORAGE_KEYS.settings]: stored });
    await harness.controller.loadSettings();
    expect(harness.controller.currentSettings).toEqual({ volume: 0.25, reducedMotion: true });
    expect(harness.fakes.playback.volume).toBe(0.25);
    expect(harness.fakes.sfx.volume).toBe(0.25);
  });

  it('falls back to defaults on corrupt persisted settings', async () => {
    const harness = makeHarness({ [STORAGE_KEYS.settings]: '{"volume":9,"reducedMotion":"yes"}' });
    await harness.controller.loadSettings();
    expect(harness.controller.currentSettings).toEqual({ volume: 0.8, reducedMotion: false });
  });

  it('persists updates', async () => {
    const harness = makeHarness();
    harness.controller.updateSettings({ volume: 0.5, reducedMotion: true });
    expect(harness.fakes.playback.volume).toBe(0.5);
    await Promise.resolve(); // let the fire-and-forget persist settle
    expect(harness.storage.data.get(STORAGE_KEYS.settings)).toBe(
      '{"volume":0.5,"reducedMotion":true}',
    );
  });
});

describe('GameController teardown', () => {
  it('destroy disposes audio ports and detaches everything', async () => {
    const harness = makeHarness();
    await harness.startDemoRun();
    harness.controller.destroy();
    expect(harness.fakes.playback.calls).toContain('dispose');
    expect(harness.fakes.sfx.disposed).toBe(true);
    expect(harness.fakes.rendererDestroyed).toBe(true);
    // Idempotent.
    harness.controller.destroy();
  });

  it('play without a track throws', () => {
    const harness = makeHarness();
    expect(() => {
      harness.controller.play();
    }).toThrow('no track loaded');
  });
});
