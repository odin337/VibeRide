import type { Beat } from '@viberide/shared';

/**
 * Pure beat-scheduling core used by the playback module: given a
 * time-ordered beat list and the elapsed playback time, decides which
 * beats have become due since the last poll. No Web Audio, no clocks.
 */

export interface DueBeats {
  readonly due: readonly Beat[];
  readonly nextIndex: number;
}

/**
 * Returns every beat with time <= elapsedSec starting at startIndex, plus
 * the index to resume from on the next poll. Assumes beats are sorted by
 * time (BeatMap invariant).
 */
export function collectDueBeats(
  beats: readonly Beat[],
  startIndex: number,
  elapsedSec: number,
): DueBeats {
  const due: Beat[] = [];
  let index = Math.max(0, startIndex);
  while (index < beats.length) {
    const beat = beats[index];
    if (!beat || beat.time > elapsedSec) {
      break;
    }
    due.push(beat);
    index += 1;
  }
  return { due, nextIndex: index };
}
