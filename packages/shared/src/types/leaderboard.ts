export interface LeaderboardEntry {
  readonly rank: number;
  readonly playerId: string;
  readonly displayName: string;
  readonly score: number;
  readonly audioHash: string;
  /** ISO-8601 timestamp. */
  readonly achievedAt: string;
}

export interface LeaderboardPage {
  readonly audioHash: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly total: number;
}
