import { DEFAULT_GAME_SETTINGS, noopLogger, SIM_DT, STORAGE_KEYS } from '@viberide/shared';
import type {
  BeatMap,
  GameEventBus,
  GameSettings,
  LevelDefinition,
  Logger,
  PlatformAdapter,
  RunResult,
  Unsubscribe,
} from '@viberide/shared';
import { z } from 'zod';

import { GameStateMachine } from '../engine/game-state';
import type { GamePhase } from '../engine/game-state';
import { RunController } from '../engine/run-controller';
import type { SimSnapshot } from '../engine/run-controller';
import { InputController } from '../input/input-controller';
import { DEMO_TRACK_TITLE, generateDemoBeatMap } from './demo-beatmap';
import type { GameControllerPorts, RendererHandle } from './ports';

/**
 * Orchestrates one game session: FSM, analysis pipeline, run lifecycle,
 * input, audio and renderer — all through injected ports and the shared
 * bus, so the whole flow is unit-testable with fakes.
 */

export interface LoadedTrack {
  readonly title: string;
  readonly beatMap: BeatMap;
  readonly level: LevelDefinition;
  /** Decoded PCM for playback; null for the synthesized demo. */
  readonly pcm: Float32Array | null;
  readonly sampleRate: number;
}

export interface GameControllerOptions {
  readonly bus: GameEventBus;
  readonly platform: PlatformAdapter;
  readonly ports: GameControllerPorts;
  readonly logger?: Logger;
}

/** Values the HUD renders; updated only when a displayed digit changes. */
export interface HudState {
  readonly score: number;
  readonly distanceM: number;
  readonly boostFraction: number;
  readonly boosting: boolean;
}

const INITIAL_HUD: HudState = { score: 0, distanceM: 0, boostFraction: 1, boosting: false };

/** Persisted-settings shape; anything else falls back to the defaults. */
const settingsSchema = z.object({
  volume: z.number().min(0).max(1),
  reducedMotion: z.boolean(),
});

export class GameController {
  readonly fsm = new GameStateMachine();
  private readonly input: InputController;
  private readonly logger: Logger;
  private run: RunController | null = null;
  private renderer: RendererHandle | null = null;
  private frameHandle: number | null = null;
  private track: LoadedTrack | null = null;
  private lastResult: RunResult | null = null;
  private lastSnapshot: SimSnapshot | null = null;
  private settings: GameSettings = DEFAULT_GAME_SETTINGS;
  private readonly subscriptions: Unsubscribe[] = [];
  private disposed = false;
  private hud: HudState = INITIAL_HUD;
  private readonly hudListeners = new Set<() => void>();

  constructor(private readonly options: GameControllerOptions) {
    this.logger = options.logger ?? noopLogger;
    this.input = new InputController({
      bus: options.bus,
      getTick: () => this.run?.currentTick ?? 0,
      now: () => options.ports.now(),
    });
    this.subscriptions.push(
      options.bus.on('game:finished', ({ result }) => {
        this.onRunEnded(result);
      }),
    );
  }

  get bus(): GameEventBus {
    return this.options.bus;
  }

  get loadedTrack(): LoadedTrack | null {
    return this.track;
  }

  get latestResult(): RunResult | null {
    return this.lastResult;
  }

  get latestSnapshot(): SimSnapshot | null {
    return this.lastSnapshot;
  }

  get currentSettings(): GameSettings {
    return this.settings;
  }

  /** Stable store accessors for React's useSyncExternalStore. */
  readonly subscribePhase = (listener: () => void): Unsubscribe =>
    this.fsm.subscribe(() => {
      listener();
    });

  readonly getPhase = (): GamePhase => this.fsm.phase;

  readonly subscribeHud = (listener: () => void): Unsubscribe => {
    this.hudListeners.add(listener);
    return () => {
      this.hudListeners.delete(listener);
    };
  };

  readonly getHud = (): HudState => this.hud;

  /** Loads persisted settings; safe to call once at startup. */
  async loadSettings(): Promise<void> {
    try {
      const raw = await this.options.platform.storage.get(STORAGE_KEYS.settings);
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        const parsed = settingsSchema.safeParse(stored);
        this.settings = parsed.success ? parsed.data : DEFAULT_GAME_SETTINGS;
      }
    } catch (error) {
      this.logger.warn('failed to load settings', { reason: describeError(error) });
    }
    this.applyVolume();
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.applyVolume();
    void this.options.platform.storage
      .set(STORAGE_KEYS.settings, JSON.stringify(settings))
      .catch((error: unknown) => {
        this.logger.warn('failed to persist settings', { reason: describeError(error) });
      });
  }

  /** menu → analyzing → ready pipeline for a user-supplied audio file. */
  async loadFile(fileName: string, bytes: ArrayBuffer): Promise<void> {
    this.fsm.transition('analyzing');
    this.options.bus.emit('audio:analysisStarted', { fileName });
    this.options.bus.emit('audio:analysisProgress', { progress: 0.1 });
    try {
      const decoded = await this.options.ports.decodeAudio(bytes);
      this.options.bus.emit('audio:analysisProgress', { progress: 0.45 });
      const beatMap = this.options.ports.analyze(
        decoded.pcm,
        decoded.sampleRate,
        decoded.audioHash,
      );
      this.options.bus.emit('audio:analyzed', { beatMap });
      this.options.bus.emit('audio:analysisProgress', { progress: 0.8 });
      const level = this.options.ports.generateLevel(beatMap);
      this.options.bus.emit('track:generated', { level });
      this.options.bus.emit('audio:analysisProgress', { progress: 1 });
      this.track = {
        title: stripExtension(fileName),
        beatMap,
        level,
        pcm: decoded.pcm,
        sampleRate: decoded.sampleRate,
      };
      this.fsm.transition('ready');
    } catch (error) {
      this.logger.error('track analysis failed', { fileName, reason: describeError(error) });
      this.fsm.transition('menu');
      throw error instanceof Error ? error : new Error(describeError(error));
    }
  }

  /** menu → analyzing → ready with the synthesized demo BeatMap. */
  loadDemo(): void {
    this.fsm.transition('analyzing');
    this.options.bus.emit('audio:analysisStarted', { fileName: DEMO_TRACK_TITLE });
    const beatMap = generateDemoBeatMap();
    this.options.bus.emit('audio:analyzed', { beatMap });
    const level = this.options.ports.generateLevel(beatMap);
    this.options.bus.emit('track:generated', { level });
    this.options.bus.emit('audio:analysisProgress', { progress: 1 });
    this.track = {
      title: DEMO_TRACK_TITLE,
      beatMap,
      level,
      pcm: null,
      sampleRate: beatMap.sampleRate,
    };
    this.fsm.transition('ready');
  }

  /** ready → playing. The run itself starts when the stage mounts (attachStage). */
  play(): void {
    if (!this.track) {
      throw new Error('play: no track loaded');
    }
    this.fsm.transition('playing');
  }

  /**
   * Called by the stage element's ref once React has mounted it. Starts
   * the run, input, audio and the frame loop; the renderer and playback
   * are best-effort — their failure degrades visuals/sound, never the run.
   */
  async attachStage(container: HTMLElement): Promise<void> {
    const track = this.track;
    if (!track || this.fsm.phase !== 'playing' || this.run !== null) {
      return;
    }

    const run = new RunController({
      level: track.level,
      bus: this.options.bus,
      clock: () => this.options.ports.now(),
      getActions: () => this.input.consume(this.options.ports.now()),
    });
    this.run = run;
    this.input.attach(window);
    run.start();
    this.scheduleFrame();

    try {
      const renderer = await this.options.ports.createRenderer(container, track.level, {
        bus: this.options.bus,
        reducedMotion: this.settings.reducedMotion,
      });
      if (this.run === run) {
        this.renderer = renderer;
      } else {
        // The run was torn down (quit/retry) while the renderer was booting.
        renderer.destroy();
        return;
      }
    } catch (error) {
      this.logger.warn('renderer unavailable, riding blind', { reason: describeError(error) });
    }

    try {
      if (this.run !== run) {
        return;
      }
      if (track.pcm) {
        await this.options.ports.playback.startTrack(track.pcm, track.sampleRate, track.beatMap);
      } else {
        await this.options.ports.playback.startDemo(track.beatMap);
      }
    } catch (error) {
      this.logger.warn('playback unavailable, riding silent', { reason: describeError(error) });
    }
  }

  pause(): void {
    if (this.fsm.phase !== 'playing') {
      return;
    }
    this.fsm.transition('paused');
    this.run?.pause();
    this.options.ports.playback.pause();
    this.options.ports.sfx.setBoostActive(false);
  }

  resume(): void {
    if (this.fsm.phase !== 'paused') {
      return;
    }
    this.fsm.transition('playing');
    this.run?.resume();
    this.options.ports.playback.resume();
  }

  /** crashed/finished → straight back into a fresh run on the same track. */
  retry(): void {
    this.teardownRun();
    this.fsm.transition('ready');
    this.fsm.transition('playing');
  }

  backToMenu(): void {
    this.teardownRun();
    this.track = null;
    this.lastResult = null;
    this.fsm.transition('menu');
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.teardownRun();
    for (const unsubscribe of this.subscriptions.splice(0)) {
      unsubscribe();
    }
    this.options.ports.playback.dispose();
    this.options.ports.sfx.dispose();
  }

  private applyVolume(): void {
    this.options.ports.playback.setVolume(this.settings.volume);
    this.options.ports.sfx.setVolume(this.settings.volume);
  }

  private scheduleFrame(): void {
    this.frameHandle = this.options.ports.requestFrame((nowMs) => {
      this.onFrame(nowMs);
    });
  }

  private onFrame(nowMs: number): void {
    const run = this.run;
    if (!run || this.disposed) {
      return;
    }
    this.input.updateGamepads(this.options.ports.getGamepads());
    run.advance(nowMs);
    const snapshot = run.snapshot();
    this.lastSnapshot = snapshot;
    this.updateHud(snapshot);
    this.options.ports.sfx.setBoostActive(snapshot.boosting);
    this.renderer?.update(snapshot, snapshot.tick * SIM_DT);
    if (run.status === 'running' || run.status === 'paused') {
      this.scheduleFrame();
    }
  }

  private updateHud(snapshot: SimSnapshot): void {
    const next: HudState = {
      score: snapshot.score,
      // Round, not floor: accumulated float error may leave x at 7.999…95.
      distanceM: Math.round(snapshot.distanceM),
      boostFraction: Math.round(snapshot.boostFraction * 100) / 100,
      boosting: snapshot.boosting,
    };
    if (
      next.score === this.hud.score &&
      next.distanceM === this.hud.distanceM &&
      next.boostFraction === this.hud.boostFraction &&
      next.boosting === this.hud.boosting
    ) {
      return;
    }
    this.hud = next;
    for (const listener of [...this.hudListeners]) {
      listener();
    }
  }

  private onRunEnded(result: RunResult): void {
    this.lastResult = result;
    this.options.ports.sfx.setBoostActive(false);
    this.options.ports.playback.stop();
    this.input.detach();
    if (this.frameHandle !== null) {
      this.options.ports.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    if (this.fsm.phase === 'playing') {
      this.fsm.transition(result.finished ? 'finished' : 'crashed');
    }
    if (result.finished) {
      this.options.platform.haptic?.('success');
    } else {
      this.options.platform.haptic?.('error');
    }
  }

  private teardownRun(): void {
    if (this.frameHandle !== null) {
      this.options.ports.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.input.detach();
    this.options.ports.playback.stop();
    this.options.ports.sfx.setBoostActive(false);
    this.renderer?.destroy();
    this.renderer = null;
    this.run = null;
    this.lastSnapshot = null;
    this.hud = INITIAL_HUD;
    for (const listener of [...this.hudListeners]) {
      listener();
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
