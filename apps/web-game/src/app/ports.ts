import type { BeatMap, GameEventBus, LevelDefinition } from '@viberide/shared';
import type { DecodedAudio } from '@viberide/audio-engine';

import type { PlaybackPort } from '../audio/playback';
import type { SfxPort } from '../audio/sfx';
import type { GamepadLike } from '../input/input-controller';
import type { SimSnapshot } from '../engine/run-controller';

/**
 * Browser-facing ports injected into the GameController. Production
 * wiring lives in the composition root (embed.tsx); unit tests inject
 * deterministic fakes, which is what keeps the controller's orchestration
 * logic fully coverable in jsdom.
 */

export interface RendererOptions {
  readonly bus: GameEventBus;
  readonly reducedMotion: boolean;
}

export interface RendererHandle {
  /** Per-frame update with the current sim snapshot and time (tick × SIM_DT). */
  update(snapshot: SimSnapshot, timeSec: number): void;
  destroy(): void;
}

export interface GameControllerPorts {
  decodeAudio(bytes: ArrayBuffer): Promise<DecodedAudio>;
  analyze(pcm: Float32Array, sampleRate: number, audioHash: string): BeatMap;
  generateLevel(beatMap: BeatMap): LevelDefinition;
  createRenderer(
    container: HTMLElement,
    level: LevelDefinition,
    options: RendererOptions,
  ): Promise<RendererHandle>;
  readonly playback: PlaybackPort;
  readonly sfx: SfxPort;
  now(): number;
  requestFrame(callback: (nowMs: number) => void): number;
  cancelFrame(handle: number): void;
  getGamepads(): readonly (GamepadLike | null)[];
}
