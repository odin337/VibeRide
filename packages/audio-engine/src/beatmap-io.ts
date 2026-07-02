import { z } from 'zod';
import type { BeatMap } from '@viberide/shared';

const finiteNonNegative = z.number().finite().nonnegative();
const normalized01 = z.number().min(0).max(1);

export const beatSchema = z.object({
  time: finiteNonNegative,
  indexInBar: z.number().int().min(1).max(4),
});

export const onsetSchema = z.object({
  time: finiteNonNegative,
  strength: normalized01,
  band: z.enum(['bass', 'mid', 'high']),
});

export const energyPointSchema = z.object({
  time: finiteNonNegative,
  energy: normalized01,
});

export const beatMapSchema = z.object({
  version: z.literal(1),
  audioHash: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase sha-256 hex digest'),
  durationSec: z.number().finite().positive(),
  sampleRate: z.number().finite().positive(),
  bpm: z.number().finite().min(40).max(300),
  beats: z.array(beatSchema),
  onsets: z.array(onsetSchema),
  energy: z.array(energyPointSchema),
});

export type SerializedBeatMap = z.infer<typeof beatMapSchema>;

// Compile-time proof that the schema output stays assignable to the shared
// BeatMap contract; both aliases are type-level only and erased at runtime.
type _AssertAssignableToBeatMap<T extends BeatMap> = T;
type _SchemaOutputIsBeatMap = _AssertAssignableToBeatMap<SerializedBeatMap>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Serializes a BeatMap to canonical JSON. The value is validated first so a
 * corrupted BeatMap can never leave the process silently.
 */
export function serializeBeatMap(beatMap: BeatMap): string {
  const result = beatMapSchema.safeParse(beatMap);
  if (!result.success) {
    throw new Error(
      `serializeBeatMap: refusing to serialize an invalid BeatMap (${formatIssues(result.error)})`,
    );
  }
  return JSON.stringify(result.data);
}

/**
 * Parses JSON into a validated BeatMap. Throws a descriptive Error when the
 * input is not JSON or does not satisfy the BeatMap schema.
 */
export function parseBeatMap(json: string): BeatMap {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new Error('parseBeatMap: input is not valid JSON', { cause: error });
  }
  const result = beatMapSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`parseBeatMap: invalid BeatMap (${formatIssues(result.error)})`);
  }
  return result.data;
}
