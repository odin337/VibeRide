import { noopLogger } from '@viberide/shared';
import type { GameEventBus, Logger, Unsubscribe } from '@viberide/shared';

import { nextGridTimeSec } from './grid';
import type { PlaybackSync } from './playback';
import {
  BOOST_DRONE,
  collectNoteHz,
  COLLECT_PLUCK,
  CRASH_BURST,
  JUMP_BLIP,
  LAND_THUMP,
  MISS_SCRATCH,
  SFX_GRID_SUBDIVISIONS,
} from './notes';
import type { BlipSpec } from './notes';

/**
 * Synthesized one-shot SFX glue (coverage-excluded — see vitest.config.ts).
 *
 * Shares the playback AudioContext through PlaybackSync, so every one-shot
 * can be QUANTIZED onto the track's sixteenth grid: jump, landing, note
 * plucks and misses all land on the music, never between it. Note pitch
 * cycles a pentatonic and jumps an octave on long combos — the rider is
 * literally playing the melody (Piano-Tiles).
 *
 * When the shared context is unavailable the sounds simply fire
 * immediately on a local context (silent-ride degradation).
 */

export interface SfxPort {
  /** Starts/stops the boost drone; call once per frame with the sim state. */
  setBoostActive(active: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export function createSfx(
  bus: GameEventBus,
  sync: PlaybackSync | null = null,
  logger: Logger = noopLogger,
): SfxPort {
  let localContext: AudioContext | null = null;
  const gainByContext = new Map<AudioContext, GainNode>();
  let boostNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
  let pickupCount = 0;
  let combo = 0;
  let volume = 0.8;
  const subscriptions: Unsubscribe[] = [];

  function ensureContext(): AudioContext | null {
    const shared = sync?.ensureContext() ?? null;
    if (shared) {
      return shared;
    }
    if (localContext) {
      return localContext;
    }
    try {
      localContext = new AudioContext();
      return localContext;
    } catch (error) {
      logger.warn('sfx AudioContext unavailable', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Per-context SFX bus (bypasses the music filter/duck chain). */
  function busGain(ctx: AudioContext): GainNode {
    const existing = gainByContext.get(ctx);
    if (existing) {
      return existing;
    }
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    gainByContext.set(ctx, gain);
    return gain;
  }

  /**
   * Context time the next one-shot should start at: the next sixteenth of
   * the active transport, or "now" when nothing is playing.
   */
  function quantizedStart(ctx: AudioContext): number {
    const transport = sync?.transport() ?? null;
    const now = ctx.currentTime;
    if (!transport) {
      return now;
    }
    const position = now - transport.startedAtCtxSec;
    const gridPosition = nextGridTimeSec(position, transport.bpm, SFX_GRID_SUBDIVISIONS);
    return transport.startedAtCtxSec + gridPosition;
  }

  function playBlip(spec: BlipSpec, frequencyScale = 1): void {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const at = quantizedStart(ctx);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(spec.startHz * frequencyScale, at);
    osc.frequency.exponentialRampToValueAtTime(spec.endHz * frequencyScale, at + spec.durationSec);
    gain.gain.setValueAtTime(spec.peakGain, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + spec.durationSec);
    osc.connect(gain);
    gain.connect(busGain(ctx));
    osc.start(at);
    osc.stop(at + spec.durationSec + 0.02);
  }

  function playPluck(): void {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const at = quantizedStart(ctx);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = collectNoteHz(pickupCount, combo);
    pickupCount += 1;
    gain.gain.setValueAtTime(COLLECT_PLUCK.peakGain, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + COLLECT_PLUCK.durationSec);
    osc.connect(gain);
    gain.connect(busGain(ctx));
    osc.start(at);
    osc.stop(at + COLLECT_PLUCK.durationSec + 0.02);
  }

  function playCrash(): void {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    // Crashes are NOT quantized: the impact is immediate; the music layer
    // provides the rhythmic stutter (playback.endRun).
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * CRASH_BURST.durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      // Cosmetic noise — Math.random is fine here, nothing gameplay-visible
      // depends on it (the deterministic core never calls into SFX).
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(CRASH_BURST.peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + CRASH_BURST.durationSec);
    noise.connect(gain);
    gain.connect(busGain(ctx));
    noise.start(now);
  }

  function startBoostDrone(): void {
    const ctx = ensureContext();
    if (!ctx || boostNodes) {
      return;
    }
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = BOOST_DRONE.frequencyHz;
    filter.type = 'lowpass';
    filter.frequency.value = BOOST_DRONE.filterHz;
    gain.gain.value = BOOST_DRONE.gain;
    // Pulse the drone on the beat when a transport is running — fever
    // breathes with the track instead of droning flat.
    const transport = sync?.transport() ?? null;
    if (transport) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = transport.bpm / 60;
      depth.gain.value = BOOST_DRONE.gain * 0.5;
      lfo.connect(depth);
      depth.connect(gain.gain);
      lfo.start(quantizedStart(ctx));
      lfo.stop(ctx.currentTime + 30);
    }
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(busGain(ctx));
    osc.start();
    boostNodes = { osc, gain };
  }

  function stopBoostDrone(): void {
    if (!boostNodes) {
      return;
    }
    try {
      boostNodes.osc.stop();
    } catch {
      // Already stopped.
    }
    boostNodes.osc.disconnect();
    boostNodes.gain.disconnect();
    boostNodes = null;
  }

  subscriptions.push(
    bus.on('game:action', ({ action }) => {
      if (action === 'jump') {
        playBlip(JUMP_BLIP);
      }
    }),
    bus.on('game:landed', () => {
      playBlip(LAND_THUMP);
    }),
    bus.on('game:collect', () => {
      combo += 1;
      playPluck();
    }),
    bus.on('game:noteMiss', () => {
      combo = 0;
      playBlip(MISS_SCRATCH);
    }),
    bus.on('game:collision', () => {
      combo = 0;
      playCrash();
    }),
    bus.on('game:started', () => {
      combo = 0;
      pickupCount = 0;
    }),
  );

  return {
    setBoostActive(active: boolean): void {
      if (active) {
        startBoostDrone();
      } else {
        stopBoostDrone();
      }
    },

    setVolume(nextVolume: number): void {
      volume = Math.min(1, Math.max(0, nextVolume));
      for (const gain of gainByContext.values()) {
        gain.gain.value = volume;
      }
    },

    dispose(): void {
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
      }
      stopBoostDrone();
      for (const gain of gainByContext.values()) {
        gain.disconnect();
      }
      gainByContext.clear();
      if (localContext) {
        void localContext.close().catch(() => undefined);
        localContext = null;
      }
    },
  };
}
