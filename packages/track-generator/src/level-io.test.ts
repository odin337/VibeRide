import type { LevelDefinition } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { generateLevel } from './generator';
import { levelDefinitionSchema, parseLevel, serializeLevel } from './level-io';
import { makeBeatMap } from './testing/fixtures';

const level = generateLevel(makeBeatMap());

/** Re-parses the serialized level into a mutable JSON object for tampering. */
function levelJson(source: LevelDefinition = level): Record<string, unknown> {
  return JSON.parse(serializeLevel(source)) as Record<string, unknown>;
}

describe('serializeLevel / parseLevel', () => {
  it('round-trips a generated level structurally intact', () => {
    const parsed = parseLevel(serializeLevel(level));
    expect(parsed).toEqual(level);
  });

  it('round-trips byte-identically', () => {
    const payload = serializeLevel(level);
    expect(serializeLevel(parseLevel(payload))).toBe(payload);
  });

  it('accepts generator output through the schema directly', () => {
    const result = levelDefinitionSchema.safeParse(levelJson());
    expect(result.success).toBe(true);
  });

  it('rejects malformed JSON with a descriptive error', () => {
    expect(() => parseLevel('{not json')).toThrow(/not valid JSON/);
    expect(() => parseLevel('')).toThrow(/not valid JSON/);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseLevel('42')).toThrow(/not a valid LevelDefinition/);
    expect(() => parseLevel('null')).toThrow(/not a valid LevelDefinition/);
  });

  it('rejects a tampered obstacle width', () => {
    const json = levelJson();
    const obstacles = json.obstacles as { width: number }[];
    expect(obstacles.length).toBeGreaterThan(0);
    obstacles[0]!.width = -1;
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/obstacles\.0\.width/);
  });

  it('rejects an unknown obstacle kind', () => {
    const json = levelJson();
    const obstacles = json.obstacles as { kind: string }[];
    obstacles[0]!.kind = 'lava';
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/obstacles\.0\.kind/);
  });

  it('rejects an invalid audio hash', () => {
    const json = levelJson();
    json.audioHash = 'DEADBEEF';
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/audioHash/);
  });

  it('rejects an unsupported version', () => {
    const json = levelJson();
    json.version = 2;
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/version/);
  });

  it('rejects a non-integer maxScore', () => {
    const json = levelJson();
    json.maxScore = 10.5;
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/maxScore/);
  });

  it('rejects a negative seed', () => {
    const json = levelJson();
    json.seed = -1;
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/seed/);
  });

  it('rejects a payload with a missing field', () => {
    const json = levelJson();
    delete json.finishX;
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/finishX/);
  });

  it('rejects a heightfield with fewer than two points', () => {
    const json = levelJson();
    json.heightfield = [{ x: 0, y: 0 }];
    expect(() => parseLevel(JSON.stringify(json))).toThrow(/heightfield/);
  });

  it('strips smuggled unknown keys on parse', () => {
    const json = levelJson();
    json.injected = 'payload';
    const parsed = parseLevel(JSON.stringify(json));
    expect('injected' in parsed).toBe(false);
    expect(parsed).toEqual(level);
  });
});
