import { noopLogger } from '@viberide/shared';
import type { BeatMap, GameEventBus, Logger } from '@viberide/shared';

import type { PatternSpec } from '../app/track-library';
import { crashStutterPlan, heardPositionSec, MISS_DUCK, secondsPerBeat } from './grid';
import { transposeHz } from './notes';
import { collectDueBeats } from './scheduler';

/**
 * Web Audio playback glue (coverage-excluded — see vitest.config.ts).
 *
 * One shared AudioContext drives EVERYTHING that sounds — the user-track
 * buffer or the live pattern synth, plus (via getSync) the quantized SFX
 * layer — so every event lands on the same sample clock as the music.
 *
 * Master chain: [source|pattern voices] → duckGain (miss stumble)
 *   → toneFilter (airborne dips it, fever opens it) → musicGain (volume)
 *   → destination.
 *
 * The game simulation is a SLAVE of this clock: getPositionSec() returns
 * the latency-compensated playhead the rider actually hears, and the run
 * controller maps it 1:1 onto simulation ticks.
 */

const SCHEDULER_INTERVAL_MS = 50;

/** Pattern-synth scheduling horizon, seconds. */
const PATTERN_LOOKAHEAD_SEC = 0.25;

/** Tone filter targets, Hz. */
const FILTER_GROUNDED_HZ = 15000;
const FILTER_FEVER_HZ = 20000;
const FILTER_AIRBORNE_HZ = 1300;
const FILTER_RAMP_SEC = 0.06;

/** Fever adds a little heat on top of the opened filter. */
const FEVER_GAIN = 1.15;

export type RunEndKind = 'crashed' | 'finished';

/** Sample-clock access shared with the SFX layer (same AudioContext). */
export interface PlaybackSync {
  ensureContext(): AudioContext | null;
  /** Transport anchor of the current ride, or null when nothing plays. */
  transport(): { startedAtCtxSec: number; bpm: number } | null;
}

export interface PlaybackPort {
  startTrack(pcm: Float32Array, sampleRate: number, beatMap: BeatMap): Promise<void>;
  /** Live-performs a built-in library track through synth voices. */
  startPattern(pattern: PatternSpec, beatMap: BeatMap): Promise<void>;
  /**
   * Latency-compensated song position the listener HEARS right now, or
   * null when the audio clock is unavailable (context blocked/suspended)
   * — the game then falls back to its wall clock.
   */
  getPositionSec(): number | null;
  /** Airborne dims the music (low-pass); landing snaps it back open. */
  setAirborne(airborne: boolean): void;
  /** Fever opens the filter fully and adds gain — boost is heard. */
  setFever(active: boolean): void;
  /** Arrangement layers unlocked by the combo (pattern tracks): 0..2. */
  setIntensity(level: number): void;
  /** A missed note makes the music stumble (short duck). */
  duckMiss(): void;
  /** Musical run ending: crash = stutter + tape stop, finish = sweep + fade. */
  endRun(kind: RunEndKind): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setVolume(volume: number): void;
  dispose(): void;
  readonly sync: PlaybackSync;
}

interface Transport {
  readonly startedAt: number;
  readonly bpm: number;
  readonly durationSec: number;
  readonly beatMap: BeatMap;
  readonly buffer: AudioBuffer | null;
  readonly pattern: PatternSpec | null;
}

/** Safari lacks outputLatency; ancient WebViews may lack baseLatency too. */
function outputLatencySec(ctx: AudioContext): number {
  const partial = ctx as Partial<Pick<AudioContext, 'outputLatency' | 'baseLatency'>>;
  return partial.outputLatency ?? partial.baseLatency ?? 0;
}

export function createTrackPlayback(bus: GameEventBus, logger: Logger = noopLogger): PlaybackPort {
  let context: AudioContext | null = null;
  let duckGain: GainNode | null = null;
  let toneFilter: BiquadFilterNode | null = null;
  let musicGain: GainNode | null = null;
  let source: AudioBufferSourceNode | null = null;
  let transport: Transport | null = null;
  let schedulerHandle: ReturnType<typeof setInterval> | null = null;
  let volume = 0.8;
  let airborne = false;
  let fever = false;
  let intensity = 0;
  let ended = false;
  /** Every scheduled one-off node of the current ride, for hard stop(). */
  const liveNodes = new Set<AudioScheduledSourceNode>();
  /** Pattern-synth cursor: next beat index to schedule. */
  let patternCursor = 0;
  /** Beat-event cursor for 'audio:beat' emission. */
  let beatCursor = 0;

  function ensureContext(): AudioContext | null {
    if (context) {
      return context;
    }
    try {
      context = new AudioContext();
    } catch (error) {
      logger.warn('AudioContext unavailable — riding silent', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    duckGain = context.createGain();
    toneFilter = context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = FILTER_GROUNDED_HZ;
    musicGain = context.createGain();
    musicGain.gain.value = volume;
    duckGain.connect(toneFilter);
    toneFilter.connect(musicGain);
    musicGain.connect(context.destination);
    return context;
  }

  async function tryResume(ctx: AudioContext): Promise<void> {
    try {
      await ctx.resume();
    } catch (error) {
      // Autoplay policy may keep the context suspended; getPositionSec()
      // then returns null and the game falls back to its wall clock.
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

  function stopLiveNodes(): void {
    for (const node of liveNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
      node.disconnect();
    }
    liveNodes.clear();
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

  function registerVoice(node: AudioScheduledSourceNode): void {
    liveNodes.add(node);
    node.onended = (): void => {
      liveNodes.delete(node);
      node.disconnect();
    };
  }

  // --- pattern synth voices -------------------------------------------------

  function voiceKick(ctx: AudioContext, out: AudioNode, spec: PatternSpec, at: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.kick.startHz, at);
    osc.frequency.exponentialRampToValueAtTime(spec.kick.endHz, at + spec.kick.decaySec);
    gain.gain.setValueAtTime(spec.kick.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + spec.kick.decaySec + 0.05);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + spec.kick.decaySec + 0.08);
    registerVoice(osc);
  }

  function voiceBass(
    ctx: AudioContext,
    out: AudioNode,
    spec: PatternSpec,
    at: number,
    semitones: number,
    durationSec: number,
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = transposeHz(spec.rootHz / 2, semitones);
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    gain.gain.setValueAtTime(0.22, at);
    gain.gain.setTargetAtTime(0.0001, at + durationSec * 0.7, 0.05);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + durationSec);
    registerVoice(osc);
  }

  function voiceHat(ctx: AudioContext, out: AudioNode, at: number, accent: boolean): void {
    const length = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      // Cosmetic noise — nothing gameplay-visible depends on it.
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6500;
    const gain = ctx.createGain();
    gain.gain.value = accent ? 0.16 : 0.09;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.start(at);
    registerVoice(noise);
  }

  function voiceStab(
    ctx: AudioContext,
    out: AudioNode,
    spec: PatternSpec,
    at: number,
    semitones: number,
  ): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    gain.connect(out);
    // A tight two-note stab (root + fifth-ish) for harmonic body.
    for (const extra of [0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = spec.stabType;
      osc.frequency.value = transposeHz(spec.rootHz, semitones + extra);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 0.25);
      registerVoice(osc);
    }
  }

  /** Schedules pattern voices for beats entering the lookahead horizon. */
  function schedulePattern(ctx: AudioContext, out: AudioNode, t: Transport): void {
    const pattern = t.pattern;
    if (!pattern) {
      return;
    }
    const beatSec = secondsPerBeat(t.bpm);
    const horizon = ctx.currentTime + PATTERN_LOOKAHEAD_SEC;
    while (patternCursor < t.beatMap.beats.length) {
      const beat = t.beatMap.beats[patternCursor];
      if (!beat) {
        break;
      }
      const at = t.startedAt + beat.time;
      if (at > horizon) {
        break;
      }
      patternCursor += 1;
      if (at < ctx.currentTime - 0.01) {
        continue; // Missed the window (tab throttling) — skip, stay in sync.
      }
      const bar = Math.floor((patternCursor - 1) / 4);
      voiceKick(ctx, out, pattern, at);
      if (beat.indexInBar === 1) {
        const semis = pattern.bassSemitones[bar % pattern.bassSemitones.length] ?? 0;
        voiceBass(ctx, out, pattern, at, semis, beatSec * 4);
      }
      if (intensity >= 1) {
        for (let s = 1; s < pattern.hatSubdivision; s += 1) {
          voiceHat(ctx, out, at + (beatSec * s) / pattern.hatSubdivision, false);
        }
        voiceHat(ctx, out, at + beatSec / 2, beat.indexInBar % 2 === 0);
      }
      if (intensity >= 2 && (beat.indexInBar === 2 || beat.indexInBar === 4)) {
        const degree = pattern.scaleSemitones[patternCursor % pattern.scaleSemitones.length] ?? 0;
        voiceStab(ctx, out, pattern, at, degree);
      }
    }
  }

  /** Emits 'audio:beat' for beats whose HEARD time has arrived. */
  function pumpBeatEvents(ctx: AudioContext, t: Transport): void {
    const elapsed = heardPositionSec(ctx.currentTime, t.startedAt, outputLatencySec(ctx));
    const { due, nextIndex } = collectDueBeats(t.beatMap.beats, beatCursor, elapsed);
    beatCursor = nextIndex;
    for (const beat of due) {
      bus.emit('audio:beat', { time: beat.time, indexInBar: beat.indexInBar });
    }
  }

  function startScheduler(ctx: AudioContext): void {
    stopScheduler();
    schedulerHandle = setInterval(() => {
      const t = transport;
      if (!t || !duckGain) {
        return;
      }
      if (!ended && t.pattern) {
        schedulePattern(ctx, duckGain, t);
      }
      pumpBeatEvents(ctx, t);
      const elapsed = ctx.currentTime - t.startedAt;
      if (beatCursor >= t.beatMap.beats.length && elapsed > t.durationSec + 2) {
        stopScheduler();
      }
    }, SCHEDULER_INTERVAL_MS);
  }

  function applyTone(): void {
    if (!context || !toneFilter || !musicGain) {
      return;
    }
    const now = context.currentTime;
    const target = airborne ? FILTER_AIRBORNE_HZ : fever ? FILTER_FEVER_HZ : FILTER_GROUNDED_HZ;
    toneFilter.frequency.setTargetAtTime(target, now, FILTER_RAMP_SEC);
    musicGain.gain.setTargetAtTime(volume * (fever ? FEVER_GAIN : 1), now, FILTER_RAMP_SEC);
  }

  async function begin(
    beatMap: BeatMap,
    buffer: AudioBuffer | null,
    pattern: PatternSpec | null,
  ): Promise<void> {
    const ctx = ensureContext();
    if (!ctx || !duckGain) {
      return;
    }
    await tryResume(ctx);
    stopSource();
    stopLiveNodes();
    ended = false;
    patternCursor = 0;
    beatCursor = 0;
    airborne = false;
    fever = false;
    intensity = 0;
    duckGain.gain.cancelScheduledValues(ctx.currentTime);
    duckGain.gain.value = 1;
    applyTone();

    const startedAt = ctx.currentTime + 0.05;
    if (buffer) {
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(duckGain);
      source.start(startedAt);
    }
    transport = {
      startedAt,
      bpm: beatMap.bpm,
      durationSec: beatMap.durationSec,
      beatMap,
      buffer,
      pattern,
    };
    startScheduler(ctx);
  }

  const sync: PlaybackSync = {
    ensureContext,
    transport(): { startedAtCtxSec: number; bpm: number } | null {
      if (!transport || !context || context.state !== 'running') {
        return null;
      }
      return { startedAtCtxSec: transport.startedAt, bpm: transport.bpm };
    },
  };

  return {
    sync,

    async startTrack(pcm: Float32Array, sampleRate: number, beatMap: BeatMap): Promise<void> {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
      // set() accepts ArrayLike<number>, avoiding the Float32Array<ArrayBuffer>
      // generic mismatch copyToChannel() has with lib.dom in TS 5.9.
      buffer.getChannelData(0).set(pcm);
      await begin(beatMap, buffer, null);
    },

    async startPattern(pattern: PatternSpec, beatMap: BeatMap): Promise<void> {
      await begin(beatMap, null, pattern);
    },

    getPositionSec(): number | null {
      if (!context || !transport || ended || context.state !== 'running') {
        return null;
      }
      return heardPositionSec(context.currentTime, transport.startedAt, outputLatencySec(context));
    },

    setAirborne(next: boolean): void {
      if (airborne !== next) {
        airborne = next;
        applyTone();
      }
    },

    setFever(next: boolean): void {
      if (fever !== next) {
        fever = next;
        applyTone();
      }
    },

    setIntensity(level: number): void {
      intensity = Math.max(0, Math.min(2, Math.floor(level)));
    },

    duckMiss(): void {
      if (!context || !duckGain || ended) {
        return;
      }
      const now = context.currentTime;
      duckGain.gain.cancelScheduledValues(now);
      duckGain.gain.setValueAtTime(duckGain.gain.value, now);
      duckGain.gain.linearRampToValueAtTime(MISS_DUCK.dipGain, now + MISS_DUCK.attackSec);
      duckGain.gain.linearRampToValueAtTime(1, now + MISS_DUCK.releaseSec);
    },

    endRun(kind: RunEndKind): void {
      const ctx = context;
      const t = transport;
      if (!ctx || !t || !duckGain || !musicGain || ended) {
        return;
      }
      ended = true;
      const now = ctx.currentTime;
      if (kind === 'finished') {
        // Triumphant resolve: filter wide open, small swell, long fade.
        toneFilter?.frequency.setTargetAtTime(FILTER_FEVER_HZ, now, 0.1);
        musicGain.gain.setTargetAtTime(volume * 1.1, now, 0.08);
        musicGain.gain.setTargetAtTime(0.0001, now + 0.9, 0.35);
        const stopAt = now + 2.4;
        source?.stop(stopAt);
        return;
      }
      // Crash: the music itself breaks — beat-repeat the last eighth of the
      // ACTUAL buffer, shrinking and slowing, then a tape-stop tail.
      stopScheduler();
      if (t.buffer && source) {
        const positionSec = Math.max(0, now - t.startedAt);
        stopSource();
        for (const slice of crashStutterPlan(positionSec, t.bpm)) {
          const node = ctx.createBufferSource();
          node.buffer = t.buffer;
          const gain = ctx.createGain();
          gain.gain.value = slice.gain;
          node.playbackRate.value = slice.playbackRate;
          if (slice.tapeStop) {
            node.playbackRate.setValueAtTime(slice.playbackRate, now + slice.atSec);
            node.playbackRate.linearRampToValueAtTime(0.05, now + slice.atSec + slice.durationSec);
            gain.gain.setValueAtTime(slice.gain, now + slice.atSec);
            gain.gain.linearRampToValueAtTime(0.0001, now + slice.atSec + slice.durationSec);
          }
          node.connect(gain);
          gain.connect(duckGain);
          node.start(now + slice.atSec, slice.offsetSec, slice.durationSec * 2);
          node.stop(now + slice.atSec + slice.durationSec + 0.05);
          registerVoice(node);
        }
      } else if (t.pattern) {
        // No buffer to slice: a decelerating kick roll reads as tape stop.
        const beatSec = secondsPerBeat(t.bpm);
        const spec = t.pattern;
        const times = [0, beatSec / 2, beatSec / 2 + beatSec / 1.5];
        times.forEach((offset, index) => {
          const slowed: PatternSpec = {
            ...spec,
            kick: {
              ...spec.kick,
              startHz: spec.kick.startHz * (1 - 0.22 * index),
              endHz: Math.max(30, spec.kick.endHz * (1 - 0.25 * index)),
              decaySec: spec.kick.decaySec * (1 + 0.6 * index),
            },
          };
          if (duckGain) {
            voiceKick(ctx, duckGain, slowed, now + offset);
          }
        });
      }
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
      stopLiveNodes();
      transport = null;
      ended = false;
      if (context && duckGain && musicGain) {
        const now = context.currentTime;
        duckGain.gain.cancelScheduledValues(now);
        duckGain.gain.value = 1;
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.value = volume;
      }
    },

    setVolume(nextVolume: number): void {
      volume = Math.min(1, Math.max(0, nextVolume));
      if (musicGain) {
        musicGain.gain.value = volume * (fever ? FEVER_GAIN : 1);
      }
    },

    dispose(): void {
      this.stop();
      if (context) {
        void context.close().catch(() => undefined);
        context = null;
        duckGain = null;
        toneFilter = null;
        musicGain = null;
      }
    },
  };
}
