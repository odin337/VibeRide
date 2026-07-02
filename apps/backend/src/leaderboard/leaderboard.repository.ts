import { Injectable } from '@nestjs/common';
import type { LeaderboardEntry, LeaderboardPage } from '@viberide/shared';

/** One accepted submission — the caller supplies the timestamp. */
export interface ScoreRecord {
  readonly playerId: string;
  readonly displayName: string;
  readonly score: number;
  readonly audioHash: string;
  /** ISO-8601. */
  readonly achievedAt: string;
}

/** Persistence boundary — injected via the LEADERBOARD_REPOSITORY token. */
export interface LeaderboardRepository {
  /**
   * Upserts the player's best score for the track (a lower or equal score
   * never replaces a better one) and returns the player's effective entry
   * with its current rank.
   */
  upsertBest(record: ScoreRecord): Promise<LeaderboardEntry>;
  getPage(audioHash: string, limit: number): Promise<LeaderboardPage>;
}

/**
 * Ordering contract: score descending, then earlier achievedAt (first to
 * reach a score outranks later equals), then playerId for determinism.
 */
function compareRecords(a: ScoreRecord, b: ScoreRecord): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.achievedAt !== b.achievedAt) {
    return a.achievedAt < b.achievedAt ? -1 : 1;
  }
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * Process-local leaderboard keyed by track, one best record per player.
 * TODO(manual): replace with a Postgres-backed implementation before
 * scaling beyond one replica — data is lost on restart.
 */
@Injectable()
export class InMemoryLeaderboardRepository implements LeaderboardRepository {
  private readonly boards = new Map<string, Map<string, ScoreRecord>>();

  upsertBest(record: ScoreRecord): Promise<LeaderboardEntry> {
    let board = this.boards.get(record.audioHash);
    if (!board) {
      board = new Map<string, ScoreRecord>();
      this.boards.set(record.audioHash, board);
    }
    const existing = board.get(record.playerId);
    const best = existing && existing.score >= record.score ? existing : record;
    board.set(record.playerId, best);

    const ranked = this.sortedRecords(record.audioHash);
    const rank = ranked.findIndex((entry) => entry.playerId === record.playerId) + 1;
    return Promise.resolve(toEntry(best, rank));
  }

  getPage(audioHash: string, limit: number): Promise<LeaderboardPage> {
    const ranked = this.sortedRecords(audioHash);
    return Promise.resolve({
      audioHash,
      entries: ranked.slice(0, limit).map((record, index) => toEntry(record, index + 1)),
      total: ranked.length,
    });
  }

  private sortedRecords(audioHash: string): ScoreRecord[] {
    const board = this.boards.get(audioHash);
    return board ? [...board.values()].sort(compareRecords) : [];
  }
}

function toEntry(record: ScoreRecord, rank: number): LeaderboardEntry {
  return {
    rank,
    playerId: record.playerId,
    displayName: record.displayName,
    score: record.score,
    audioHash: record.audioHash,
    achievedAt: record.achievedAt,
  };
}
