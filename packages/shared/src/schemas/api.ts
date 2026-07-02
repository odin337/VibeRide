import { z } from 'zod';

/** zod schemas shared by the backend (validation) and clients (typing). */

export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase sha-256 hex digest');

export const replayCheckpointSchema = z.object({
  tick: z.number().int().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
  score: z.number().int().nonnegative(),
});

export const scoreSubmissionSchema = z.object({
  audioHash: sha256HexSchema,
  seed: z.number().int(),
  score: z.number().int().nonnegative(),
  distanceM: z.number().finite().nonnegative(),
  finished: z.boolean(),
  durationMs: z.number().int().positive(),
  collectiblesTaken: z.number().int().nonnegative(),
  checkpoints: z.array(replayCheckpointSchema).min(1).max(600),
});

export type ScoreSubmission = z.infer<typeof scoreSubmissionSchema>;

export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1).max(8192),
});

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;

export const guestAuthRequestSchema = z.object({
  deviceId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(64),
});

export type GuestAuthRequest = z.infer<typeof guestAuthRequestSchema>;

export const trackMetadataSchema = z.object({
  audioHash: sha256HexSchema,
  title: z.string().trim().min(1).max(200),
  durationSec: z.number().finite().positive(),
  bpm: z.number().finite().min(40).max(300),
});

export type TrackMetadata = z.infer<typeof trackMetadataSchema>;

export const leaderboardQuerySchema = z.object({
  audioHash: sha256HexSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
