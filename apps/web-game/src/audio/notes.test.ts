import { describe, expect, it } from 'vitest';

import { collectNoteHz, PENTATONIC_HZ } from './notes';

describe('collectNoteHz', () => {
  it('cycles the C-D-E-G-A pentatonic in pickup order', () => {
    const twoOctavesOfPickups = Array.from({ length: 10 }, (_, i) => collectNoteHz(i));
    expect(twoOctavesOfPickups).toEqual([...PENTATONIC_HZ, ...PENTATONIC_HZ]);
  });

  it('matches the expected pentatonic frequencies', () => {
    expect(PENTATONIC_HZ).toEqual([523.25, 587.33, 659.25, 783.99, 880]);
  });

  it('is defensive about out-of-range indices', () => {
    expect(collectNoteHz(-1)).toBe(880);
    expect(collectNoteHz(5)).toBe(523.25);
  });
});
