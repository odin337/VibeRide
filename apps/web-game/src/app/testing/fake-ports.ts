import type { DecodedAudio } from '@viberide/audio-engine';
import type { BeatMap } from '@viberide/shared';
import { generateLevel, makeBeatMap } from '@viberide/track-generator';

import type { PlaybackPort } from '../../audio/playback';
import type { SfxPort } from '../../audio/sfx';
import type { SimSnapshot } from '../../engine/run-controller';
import type { GamepadLike } from '../../input/input-controller';
import type { GameControllerPorts, RendererHandle } from '../ports';

/**
 * Deterministic in-memory GameControllerPorts for jsdom tests: manual
 * frame pump instead of rAF, a fake clock, recording playback/sfx and a
 * renderer that only counts updates. The analysis/generation ports stay
 * real (they are pure) unless overridden.
 */

export interface RecordingPlayback extends PlaybackPort {
  readonly calls: string[];
  volume: number;
}

export function makeRecordingPlayback(): RecordingPlayback {
  const playback: RecordingPlayback = {
    calls: [],
    volume: -1,
    startTrack: (): Promise<void> => {
      playback.calls.push('startTrack');
      return Promise.resolve();
    },
    startDemo: (): Promise<void> => {
      playback.calls.push('startDemo');
      return Promise.resolve();
    },
    pause: (): void => {
      playback.calls.push('pause');
    },
    resume: (): void => {
      playback.calls.push('resume');
    },
    stop: (): void => {
      playback.calls.push('stop');
    },
    setVolume: (volume: number): void => {
      playback.volume = volume;
    },
    dispose: (): void => {
      playback.calls.push('dispose');
    },
  };
  return playback;
}

export interface RecordingSfx extends SfxPort {
  boostActive: boolean;
  volume: number;
  disposed: boolean;
}

export function makeRecordingSfx(): RecordingSfx {
  const sfx: RecordingSfx = {
    boostActive: false,
    volume: -1,
    disposed: false,
    setBoostActive: (active: boolean): void => {
      sfx.boostActive = active;
    },
    setVolume: (volume: number): void => {
      sfx.volume = volume;
    },
    dispose: (): void => {
      sfx.disposed = true;
    },
  };
  return sfx;
}

export interface FakePortsHarness {
  readonly ports: GameControllerPorts;
  readonly playback: RecordingPlayback;
  readonly sfx: RecordingSfx;
  readonly rendererUpdates: SimSnapshot[];
  rendererDestroyed: boolean;
  rendererCreations: number;
  /** Delivers the next pending animation frame at `nowMs`. */
  fireFrame(nowMs: number): void;
  setNow(nowMs: number): void;
  setGamepads(pads: readonly (GamepadLike | null)[]): void;
}

export interface FakePortsOverrides {
  readonly decodeAudio?: GameControllerPorts['decodeAudio'];
  readonly analyze?: GameControllerPorts['analyze'];
  readonly generateLevel?: GameControllerPorts['generateLevel'];
  readonly createRenderer?: GameControllerPorts['createRenderer'];
}

export function makeFakePorts(overrides: FakePortsOverrides = {}): FakePortsHarness {
  const playback = makeRecordingPlayback();
  const sfx = makeRecordingSfx();
  const rendererUpdates: SimSnapshot[] = [];
  const pendingFrames: ((nowMs: number) => void)[] = [];
  let now = 0;
  let pads: readonly (GamepadLike | null)[] = [];

  const harness: FakePortsHarness = {
    playback,
    sfx,
    rendererUpdates,
    rendererDestroyed: false,
    rendererCreations: 0,
    fireFrame(nowMs: number): void {
      now = nowMs;
      const callback = pendingFrames.shift();
      callback?.(nowMs);
    },
    setNow(nowMs: number): void {
      now = nowMs;
    },
    setGamepads(next: readonly (GamepadLike | null)[]): void {
      pads = next;
    },
    ports: {
      decodeAudio:
        overrides.decodeAudio ??
        ((bytes: ArrayBuffer): Promise<DecodedAudio> =>
          Promise.resolve({
            pcm: new Float32Array(bytes.byteLength || 1),
            sampleRate: 44100,
            audioHash: 'ab'.repeat(32),
          })),
      analyze:
        overrides.analyze ??
        ((_pcm: Float32Array, sampleRate: number, audioHash: string): BeatMap =>
          // Real analyzePcm needs seconds of PCM; tests exercise the pure
          // fixture pipeline instead (still a schema-valid BeatMap).
          makeBeatMap({ audioHash, sampleRate, durationSec: 20 })),
      generateLevel: overrides.generateLevel ?? generateLevel,
      createRenderer:
        overrides.createRenderer ??
        ((): Promise<RendererHandle> => {
          harness.rendererCreations += 1;
          return Promise.resolve({
            update: (snapshot: SimSnapshot): void => {
              rendererUpdates.push(snapshot);
            },
            destroy: (): void => {
              harness.rendererDestroyed = true;
            },
          });
        }),
      playback,
      sfx,
      now: () => now,
      requestFrame: (callback): number => {
        pendingFrames.push(callback);
        return pendingFrames.length;
      },
      cancelFrame: (): void => {
        pendingFrames.length = 0;
      },
      getGamepads: () => pads,
    },
  };
  return harness;
}
