import type { BeatMap } from '../types/audio';
import type { PlayerAction, RunResult } from '../types/game';
import type { LevelDefinition } from '../types/track';
import type { WalletInfo } from '../types/ton';

/**
 * The single event vocabulary connecting AudioAnalysis, TrackGenerator,
 * GameEngine, Input and TON modules. Modules communicate only through
 * these events, which keeps every module independently replaceable.
 *
 * A type alias (not an interface) so it gets an implicit index signature
 * and satisfies the EventBus `Record<string, unknown>` constraint.
 */
export type GameEventMap = {
  'audio:analysisStarted': { fileName: string };
  'audio:analysisProgress': { progress: number };
  'audio:analyzed': { beatMap: BeatMap };
  'audio:beat': { time: number; indexInBar: number };
  'track:generated': { level: LevelDefinition };
  'game:started': { audioHash: string; seed: number };
  'game:action': { action: PlayerAction; tick: number };
  'game:collision': { obstacleId: string; tick: number };
  'game:collect': { collectibleId: string; score: number; tick: number };
  'game:finished': { result: RunResult };
  'ton:walletConnected': { wallet: WalletInfo };
  'ton:walletDisconnected': Record<string, never>;
  'ton:transactionSent': { boc: string };
};

export type GameEventName = keyof GameEventMap;
