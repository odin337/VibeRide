import type { EnergyPoint } from '@viberide/shared';

/** Envelope resolution: one EnergyPoint per ~250 ms of audio. */
export const ENERGY_BLOCK_SEC = 0.25;

/**
 * RMS energy envelope of mono PCM: one point per ENERGY_BLOCK_SEC block
 * (timestamped at the block center), normalized so the loudest block is 1.
 * A fully silent signal keeps all points at 0.
 */
export function computeEnergyEnvelope(pcm: Float32Array, sampleRate: number): EnergyPoint[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `computeEnergyEnvelope: sampleRate must be a positive finite number, got ${sampleRate}`,
    );
  }
  if (pcm.length === 0) {
    return [];
  }
  const blockSize = Math.max(1, Math.round(ENERGY_BLOCK_SEC * sampleRate));
  const blockCount = Math.ceil(pcm.length / blockSize);
  const rms = new Float64Array(blockCount);
  const times = new Float64Array(blockCount);
  let maxRms = 0;

  for (let block = 0; block < blockCount; block += 1) {
    const start = block * blockSize;
    const end = Math.min(start + blockSize, pcm.length);
    let sumSquares = 0;
    for (let i = start; i < end; i += 1) {
      const sample = pcm[i] as number;
      sumSquares += sample * sample;
    }
    const length = end - start;
    const value = Math.sqrt(sumSquares / length);
    rms[block] = value;
    times[block] = (start + length / 2) / sampleRate;
    if (value > maxRms) {
      maxRms = value;
    }
  }

  const points: EnergyPoint[] = [];
  for (let block = 0; block < blockCount; block += 1) {
    points.push({
      time: times[block] as number,
      energy: maxRms === 0 ? 0 : (rms[block] as number) / maxRms,
    });
  }
  return points;
}
