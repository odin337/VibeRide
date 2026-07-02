import { sha256HexSchema } from '@viberide/shared';
import type { LevelDefinition } from '@viberide/shared';
import { z } from 'zod';

/**
 * Structural schema for LevelDefinition payloads coming over the wire
 * (backend anti-cheat regeneration, cached levels). Gameplay invariants
 * beyond structure are checked separately by validatePlayability.
 */
export const trackPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const obstacleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['spike', 'gap', 'block', 'movingPlatform']),
  x: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  beatTime: z.number().finite().nonnegative(),
});

export const collectibleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['note', 'gem']),
  x: z.number().finite().nonnegative(),
  y: z.number().finite(),
  beatTime: z.number().finite().nonnegative(),
  score: z.number().int().positive(),
});

export const levelDefinitionSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().nonnegative(),
  audioHash: sha256HexSchema,
  bpm: z.number().finite().positive(),
  durationSec: z.number().finite().positive(),
  lengthM: z.number().finite().positive(),
  heightfield: z.array(trackPointSchema).min(2),
  obstacles: z.array(obstacleSchema),
  collectibles: z.array(collectibleSchema),
  maxScore: z.number().int().nonnegative(),
  finishX: z.number().finite().positive(),
});

/**
 * Serializes a level to JSON. Key order follows the construction order
 * in generateLevel, so the same level always serializes byte-identically
 * — the determinism contract extends through IO.
 */
export function serializeLevel(level: LevelDefinition): string {
  return JSON.stringify(level);
}

/**
 * Parses and validates a serialized level. Throws a descriptive Error
 * on malformed JSON or any schema violation (tampered payloads); zod
 * strips unknown keys, so smuggled extra fields never survive a parse.
 */
export function parseLevel(payload: string): LevelDefinition {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`parseLevel: payload is not valid JSON (${reason})`);
  }
  const result = levelDefinitionSchema.safeParse(json);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`parseLevel: payload is not a valid LevelDefinition (${details})`);
  }
  return result.data;
}
