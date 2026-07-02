import { describe, expect, it } from 'vitest';

import {
  crashStutterPlan,
  heardPositionSec,
  intensityFromCombo,
  MISS_DUCK,
  nextGridTimeSec,
  secondsPerBeat,
} from './grid';

describe('secondsPerBeat', () => {
  it('converts bpm to seconds', () => {
    expect(secondsPerBeat(120)).toBeCloseTo(0.5, 12);
    expect(secondsPerBeat(60)).toBe(1);
  });

  it('rejects non-positive and non-finite bpm', () => {
    expect(() => secondsPerBeat(0)).toThrow(RangeError);
    expect(() => secondsPerBeat(-10)).toThrow(RangeError);
    expect(() => secondsPerBeat(Number.NaN)).toThrow(RangeError);
  });
});

describe('nextGridTimeSec', () => {
  it('snaps forward to the next sixteenth', () => {
    // 120 BPM → sixteenth = 0.125 s.
    expect(nextGridTimeSec(0.3, 120, 4)).toBeCloseTo(0.375, 12);
    expect(nextGridTimeSec(0.001, 120, 4)).toBeCloseTo(0.125, 12);
  });

  it('returns the position itself when already on the grid', () => {
    expect(nextGridTimeSec(0.375, 120, 4)).toBeCloseTo(0.375, 12);
    expect(nextGridTimeSec(0, 120, 4)).toBe(0);
  });

  it('clamps negative positions to the grid origin', () => {
    expect(nextGridTimeSec(-1, 120, 4)).toBe(0);
  });

  it('rejects a non-positive subdivision', () => {
    expect(() => nextGridTimeSec(0, 120, 0)).toThrow(RangeError);
  });
});

describe('heardPositionSec', () => {
  it('subtracts the output latency from the context playhead', () => {
    expect(heardPositionSec(10.5, 10, 0.1)).toBeCloseTo(0.4, 12);
  });

  it('never goes negative and ignores negative latencies', () => {
    expect(heardPositionSec(10.01, 10, 0.1)).toBe(0);
    expect(heardPositionSec(10.5, 10, -1)).toBeCloseTo(0.5, 12);
  });
});

describe('crashStutterPlan', () => {
  it('produces time-ordered shrinking slices ending in a tape stop', () => {
    const plan = crashStutterPlan(10, 120);
    expect(plan.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i]?.atSec ?? 0).toBeGreaterThan(plan[i - 1]?.atSec ?? Number.POSITIVE_INFINITY);
      expect(plan[i]?.gain ?? 1).toBeLessThan(plan[i - 1]?.gain ?? 0);
      expect(plan[i]?.playbackRate ?? 1).toBeLessThan(plan[i - 1]?.playbackRate ?? 0);
    }
    expect(plan.at(-1)?.tapeStop).toBe(true);
    expect(plan.every((slice) => slice.durationSec > 0 && slice.offsetSec >= 0)).toBe(true);
  });

  it('slices the last eighth note before the crash position', () => {
    const plan = crashStutterPlan(10, 120);
    // 120 BPM → eighth = 0.25 s → slice starts at 9.75 s.
    expect(plan[0]?.offsetSec).toBeCloseTo(9.75, 12);
    expect(plan[0]?.durationSec).toBeCloseTo(0.25, 12);
  });

  it('clamps the slice offset at the start of the track', () => {
    const plan = crashStutterPlan(0.05, 120);
    expect(plan[0]?.offsetSec).toBe(0);
  });
});

describe('intensityFromCombo', () => {
  it('unlocks arrangement layers at combo 8 and 16', () => {
    expect(intensityFromCombo(0)).toBe(0);
    expect(intensityFromCombo(7)).toBe(0);
    expect(intensityFromCombo(8)).toBe(1);
    expect(intensityFromCombo(15)).toBe(1);
    expect(intensityFromCombo(16)).toBe(2);
    expect(intensityFromCombo(100)).toBe(2);
  });
});

describe('MISS_DUCK', () => {
  it('dips below full volume and recovers quickly', () => {
    expect(MISS_DUCK.dipGain).toBeGreaterThan(0);
    expect(MISS_DUCK.dipGain).toBeLessThan(1);
    expect(MISS_DUCK.releaseSec).toBeGreaterThan(MISS_DUCK.attackSec);
  });
});
