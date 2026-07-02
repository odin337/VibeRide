import { noopLogger } from '@viberide/shared';
import type { BeatMap, GameEventBus, Logger } from '@viberide/shared';

import { collectDueBeats } from './scheduler';

/**
 * Web Audio playback glue (coverage-excluded — see vitest.config.ts): an
 * AudioContext, a master GainNode, an AudioBufferSourceNode for user
 * tracks or a beat-locked oscillator backing for the demo, plus the beat
 * scheduler that turns BeatMap.beats into 'audio:beat' bus events. All
 * decisions about WHICH beats are due live in the pure scheduler module.
 */

const SCHEDULER_INTERVAL_MS = 50;

export interface PlaybackPort {
  startTrack(pcm: Float32Array, sampleRate: number, beatMap: BeatMap): Promise<void>;
  startDemo(beatMap: BeatMap): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export function createTrackPlayback(bus: GameEventBus, logger: Logger = noopLogger): PlaybackPort {
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let source: AudioBufferSourceNode | null = null;
  let schedulerHandle: ReturnType<typeof setInterval> | null = null;
  let volume = 0.8;

  function ensureContext(): AudioContext {
    if (!context) {
      context = new AudioContext();
      masterGain = context.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(context.destination);
    }
    return context;
  }

  async function tryResume(ctx: AudioContext): Promise<void> {
    try {
      await ctx.resume();
    } catch (error) {
      // Autoplay policy may keep the context suspended; the game itself
      // runs on its own clock, so we just stay silent.
      logger.warn('AudioContext resume failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function stopScheduler(): void {
    if (schedulerHandle !== null) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
    }
  }

  function startBeatScheduler(ctx: AudioContext, beatMap: BeatMap, startedAt: number): void {
    stopScheduler();
    let cursor = 0;
    schedulerHandle = setInterval(() => {
      const elapsed = ctx.currentTime - startedAt;
      const { due, nextIndex } = collectDueBeats(beatMap.beats, cursor, elapsed);
      cursor = nextIndex;
      for (const beat of due) {
        bus.emit('audio:beat', { time: beat.time, indexInBar: beat.indexInBar });
      }
      if (cursor >= beatMap.beats.length || elapsed > beatMap.durationSec) {
        stopScheduler();
      }
    }, SCHEDULER_INTERVAL_MS);
  }

  /** Soft kick voice used as the demo's oscillator backing on every beat. */
  function scheduleDemoKick(ctx: AudioContext, at: number, accent: boolean): void {
    if (!masterGain) {
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 150 : 120, at);
    osc.frequency.exponentialRampToValueAtTime(50, at + 0.12);
    gain.gain.setValueAtTime(accent ? 0.5 : 0.35, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  function stopSource(): void {
    if (source) {
      try {
        source.stop();
      } catch {
        // Already stopped — AudioBufferSourceNode.stop throws on repeats.
      }
      source.disconnect();
      source = null;
    }
  }

  return {
    async startTrack(pcm: Float32Array, sampleRate: number, beatMap: BeatMap): Promise<void> {
      const ctx = ensureContext();
      await tryResume(ctx);
      stopSource();
      const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
      // set() accepts ArrayLike<number>, avoiding the Float32Array<ArrayBuffer>
      // generic mismatch copyToChannel() has with lib.dom in TS 5.9.
      buffer.getChannelData(0).set(pcm);
      source = ctx.createBufferSource();
      source.buffer = buffer;
      if (masterGain) {
        source.connect(masterGain);
      }
      const startedAt = ctx.currentTime;
      source.start(startedAt);
      startBeatScheduler(ctx, beatMap, startedAt);
    },

    async startDemo(beatMap: BeatMap): Promise<void> {
      const ctx = ensureContext();
      await tryResume(ctx);
      stopSource();
      const startedAt = ctx.currentTime;
      for (const beat of beatMap.beats) {
        scheduleDemoKick(ctx, startedAt + beat.time, beat.indexInBar === 1);
      }
      startBeatScheduler(ctx, beatMap, startedAt);
    },

    pause(): void {
      if (context && context.state === 'running') {
        void context.suspend();
      }
    },

    resume(): void {
      if (context && context.state === 'suspended') {
        void context.resume();
      }
    },

    stop(): void {
      stopScheduler();
      stopSource();
    },

    setVolume(nextVolume: number): void {
      volume = Math.min(1, Math.max(0, nextVolume));
      if (masterGain) {
        masterGain.gain.value = volume;
      }
    },

    dispose(): void {
      this.stop();
      if (context) {
        void context.close().catch(() => undefined);
        context = null;
        masterGain = null;
      }
    },
  };
}
