import type { Beat } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { collectDueBeats } from './scheduler';

const beats: Beat[] = Array.from({ length: 8 }, (_, i) => ({
  time: i * 0.5,
  indexInBar: (i % 4) + 1,
}));

describe('collectDueBeats', () => {
  it('returns every beat up to the elapsed time', () => {
    const { due, nextIndex } = collectDueBeats(beats, 0, 1.2);
    expect(due.map((beat) => beat.time)).toEqual([0, 0.5, 1]);
    expect(nextIndex).toBe(3);
  });

  it('resumes from the cursor without re-emitting', () => {
    const first = collectDueBeats(beats, 0, 1.2);
    const second = collectDueBeats(beats, first.nextIndex, 1.6);
    expect(second.due.map((beat) => beat.time)).toEqual([1.5]);
    expect(second.nextIndex).toBe(4);
  });

  it('returns nothing before the first beat becomes due', () => {
    expect(collectDueBeats(beats, 1, 0.2)).toEqual({ due: [], nextIndex: 1 });
  });

  it('drains the list and stays empty afterwards', () => {
    const all = collectDueBeats(beats, 0, 100);
    expect(all.due).toHaveLength(8);
    expect(all.nextIndex).toBe(8);
    expect(collectDueBeats(beats, all.nextIndex, 200)).toEqual({ due: [], nextIndex: 8 });
  });

  it('clamps a negative start index', () => {
    expect(collectDueBeats(beats, -5, 0).due.map((beat) => beat.time)).toEqual([0]);
  });

  it('handles an empty beat list', () => {
    expect(collectDueBeats([], 0, 10)).toEqual({ due: [], nextIndex: 0 });
  });
});
