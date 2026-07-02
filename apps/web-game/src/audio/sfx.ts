import { noopLogger } from '@viberide/shared';
import type { GameEventBus, Logger, Unsubscribe } from '@viberide/shared';

import { BOOST_DRONE, collectNoteHz, COLLECT_PLUCK, CRASH_BURST, JUMP_BLIP } from './notes';

/**
 * Synthesized one-shot SFX glue (coverage-excluded — see vitest.config.ts).
 * Subscribes to the bus: jump → rising blip, collect → pentatonic pluck
 * cycling C-D-E-G-A, crash → noise burst; boost is a filtered saw drone
 * driven per-frame by setBoostActive. Note selection and envelope data
 * are pure and live in notes.ts.
 */

export interface SfxPort {
  /** Starts/stops the boost drone; call once per frame with the sim state. */
  setBoostActive(active: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export function createSfx(bus: GameEventBus, logger: Logger = noopLogger): SfxPort {
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let boostNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
  let pickupCount = 0;
  let volume = 0.8;
  const subscriptions: Unsubscribe[] = [];

  function ensureContext(): AudioContext | null {
    if (context) {
      return context;
    }
    try {
      context = new AudioContext();
      masterGain = context.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(context.destination);
      return context;
    } catch (error) {
      logger.warn('sfx AudioContext unavailable', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  function playBlip(): void {
    const ctx = ensureContext();
    if (!ctx || !masterGain) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(JUMP_BLIP.startHz, now);
    osc.frequency.exponentialRampToValueAtTime(JUMP_BLIP.endHz, now + JUMP_BLIP.durationSec);
    gain.gain.setValueAtTime(JUMP_BLIP.peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + JUMP_BLIP.durationSec);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + JUMP_BLIP.durationSec + 0.02);
  }

  function playPluck(): void {
    const ctx = ensureContext();
    if (!ctx || !masterGain) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = collectNoteHz(pickupCount);
    pickupCount += 1;
    gain.gain.setValueAtTime(COLLECT_PLUCK.peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + COLLECT_PLUCK.durationSec);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + COLLECT_PLUCK.durationSec + 0.02);
  }

  function playCrash(): void {
    const ctx = ensureContext();
    if (!ctx || !masterGain) {
      return;
    }
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
    gain.connect(masterGain);
    noise.start(now);
  }

  function startBoostDrone(): void {
    const ctx = ensureContext();
    if (!ctx || !masterGain || boostNodes) {
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
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
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
        playBlip();
      }
    }),
    bus.on('game:collect', () => {
      playPluck();
    }),
    bus.on('game:collision', () => {
      playCrash();
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
      if (masterGain) {
        masterGain.gain.value = volume;
      }
    },

    dispose(): void {
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
      }
      stopBoostDrone();
      if (context) {
        void context.close().catch(() => undefined);
        context = null;
        masterGain = null;
      }
    },
  };
}
