import { HEIGHTFIELD_STEP_M, seedFromHash, WORLD_SPEED_BASE } from '@viberide/shared';
import type { TrackPoint } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ENERGY,
  energyAt,
  generateTerrain,
  MAX_TERRAIN_SLOPE,
  SPAWN_FLAT_M,
  TERRAIN_MAX_Y,
  TERRAIN_MIN_Y,
  terrainHeightAt,
} from './terrain';
import { FIXTURE_AUDIO_HASH, makeBeatMap } from './testing/fixtures';

const seed = seedFromHash(FIXTURE_AUDIO_HASH);

describe('generateTerrain', () => {
  const beatMap = makeBeatMap();
  const lengthM = beatMap.durationSec * WORLD_SPEED_BASE;
  const terrain = generateTerrain(beatMap, seed);

  it('samples every HEIGHTFIELD_STEP_M from x=0 to lengthM', () => {
    expect(terrain).toHaveLength(Math.floor(lengthM / HEIGHTFIELD_STEP_M) + 1);
    expect(terrain[0]).toEqual({ x: 0, y: 0 });
    for (let i = 1; i < terrain.length; i += 1) {
      expect(terrain[i]!.x - terrain[i - 1]!.x).toBeCloseTo(HEIGHTFIELD_STEP_M, 9);
    }
    expect(terrain[terrain.length - 1]!.x).toBeCloseTo(lengthM, 9);
  });

  it('keeps the first 10 metres perfectly flat at y=0', () => {
    const spawnPoints = terrain.filter((point) => point.x <= SPAWN_FLAT_M);
    expect(spawnPoints.length).toBeGreaterThan(0);
    for (const point of spawnPoints) {
      expect(point.y).toBe(0);
    }
  });

  it('produces actual hills beyond the fade-in zone', () => {
    expect(terrain.some((point) => point.x > 25 && Math.abs(point.y) > 0.05)).toBe(true);
  });

  it('clamps every height to the playable range', () => {
    for (const point of terrain) {
      expect(point.y).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
      expect(point.y).toBeLessThanOrEqual(TERRAIN_MAX_Y);
    }
  });

  it('never exceeds the documented slope bound', () => {
    const maxStep = MAX_TERRAIN_SLOPE * HEIGHTFIELD_STEP_M;
    for (let i = 1; i < terrain.length; i += 1) {
      expect(Math.abs(terrain[i]!.y - terrain[i - 1]!.y)).toBeLessThanOrEqual(maxStep + 1e-9);
    }
  });

  it('is deterministic for the same BeatMap and seed', () => {
    const again = generateTerrain(makeBeatMap(), seed);
    expect(again).toEqual(terrain);
    expect(JSON.stringify(again)).toBe(JSON.stringify(terrain));
  });

  it('differs for a different seed', () => {
    const other = generateTerrain(beatMap, (seed + 1) >>> 0);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(terrain));
  });

  it('makes louder music hillier than quiet music', () => {
    const quietEnvelope = [
      { time: 0, energy: 0.05 },
      { time: 60, energy: 0.05 },
    ];
    const loudEnvelope = [
      { time: 0, energy: 0.95 },
      { time: 60, energy: 0.95 },
    ];
    const quiet = generateTerrain(makeBeatMap({ energy: quietEnvelope }), seed);
    const loud = generateTerrain(makeBeatMap({ energy: loudEnvelope }), seed);
    const maxAbs = (points: readonly TrackPoint[]): number =>
      Math.max(...points.map((point) => Math.abs(point.y)));
    expect(maxAbs(loud)).toBeGreaterThan(maxAbs(quiet));
  });

  it('emits a minimum of two samples even for the shortest tracks', () => {
    const tiny = generateTerrain(makeBeatMap({ durationSec: 0.01 }), seed);
    expect(tiny.length).toBeGreaterThanOrEqual(2);
  });
});

describe('energyAt', () => {
  const envelope = [
    { time: 0, energy: 0 },
    { time: 10, energy: 1 },
    { time: 20, energy: 0.5 },
  ];

  it('falls back to DEFAULT_ENERGY for an empty envelope', () => {
    expect(energyAt([], 5)).toBe(DEFAULT_ENERGY);
  });

  it('clamps to the first sample before the envelope starts', () => {
    expect(energyAt(envelope, -3)).toBe(0);
    expect(energyAt(envelope, 0)).toBe(0);
  });

  it('clamps to the last sample after the envelope ends', () => {
    expect(energyAt(envelope, 25)).toBe(0.5);
  });

  it('linearly interpolates between samples', () => {
    expect(energyAt(envelope, 2.5)).toBeCloseTo(0.25, 12);
    expect(energyAt(envelope, 15)).toBeCloseTo(0.75, 12);
    expect(energyAt(envelope, 10)).toBeCloseTo(1, 12);
  });
});

describe('terrainHeightAt', () => {
  const field: TrackPoint[] = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 0 },
  ];

  it('returns 0 for an empty heightfield', () => {
    expect(terrainHeightAt([], 3)).toBe(0);
  });

  it('clamps outside the sampled range', () => {
    expect(terrainHeightAt(field, -1)).toBe(0);
    expect(terrainHeightAt(field, 5)).toBe(0);
  });

  it('linearly interpolates between samples', () => {
    expect(terrainHeightAt(field, 0.25)).toBeCloseTo(0.5, 12);
    expect(terrainHeightAt(field, 1)).toBeCloseTo(2, 12);
    expect(terrainHeightAt(field, 1.5)).toBeCloseTo(1, 12);
  });
});
