import { BAND_RANGES, FREQUENCY_BANDS } from '@viberide/shared';
import type { FrequencyBand } from '@viberide/shared';

import { RealFft } from './fft';
import { normalizeInPlace } from './normalize';
import { hannWindow } from './window';

/** STFT frame length in samples. */
export const FRAME_SIZE = 1024;

/** STFT hop in samples (50% overlap). */
export const HOP_SIZE = 512;

export interface NoveltyCurves {
  /** Per-band half-wave-rectified spectral flux, each normalized to [0, 1]. */
  readonly curves: Readonly<Record<FrequencyBand, Float64Array>>;
  /** Seconds between consecutive frames (HOP_SIZE / sampleRate). */
  readonly hopSec: number;
  readonly frameCount: number;
}

interface BinRange {
  /** First FFT bin of the band, inclusive. */
  readonly low: number;
  /** Last FFT bin of the band, inclusive. */
  readonly high: number;
}

/** Maps a band's Hz range onto FFT bin indices (bin 0 / DC is never included). */
function bandBinRange(band: FrequencyBand, sampleRate: number, binCount: number): BinRange {
  const { lowHz, highHz } = BAND_RANGES[band];
  const hzPerBin = sampleRate / FRAME_SIZE;
  const low = Math.max(1, Math.ceil(lowHz / hzPerBin));
  const high = Math.min(binCount - 1, Math.floor(highHz / hzPerBin));
  return { low, high };
}

/**
 * Frames mono PCM (frame 1024, hop 512), applies a Hann window, FFTs each
 * frame, and accumulates half-wave-rectified spectral flux separately for the
 * bass / mid / high bands from BAND_RANGES. Each band curve is normalized to
 * [0, 1]. Fully deterministic: identical PCM always yields identical curves.
 */
export function computeBandNoveltyCurves(pcm: Float32Array, sampleRate: number): NoveltyCurves {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `computeBandNoveltyCurves: sampleRate must be a positive finite number, got ${sampleRate}`,
    );
  }
  const hopSec = HOP_SIZE / sampleRate;
  const frameCount =
    pcm.length >= FRAME_SIZE ? Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1 : 0;
  const curves: Record<FrequencyBand, Float64Array> = {
    bass: new Float64Array(frameCount),
    mid: new Float64Array(frameCount),
    high: new Float64Array(frameCount),
  };
  if (frameCount === 0) {
    return { curves, hopSec, frameCount };
  }

  const fft = new RealFft(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const frame = new Float64Array(FRAME_SIZE);
  let previous = new Float64Array(fft.binCount);
  let current = new Float64Array(fft.binCount);
  const ranges: Record<FrequencyBand, BinRange> = {
    bass: bandBinRange('bass', sampleRate, fft.binCount),
    mid: bandBinRange('mid', sampleRate, fft.binCount),
    high: bandBinRange('high', sampleRate, fft.binCount),
  };

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const offset = frameIndex * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i += 1) {
      // In-bounds by the frameCount formula above.
      frame[i] = (pcm[offset + i] as number) * (window[i] as number);
    }
    fft.magnitudeSpectrum(frame, current);
    if (frameIndex > 0) {
      for (const band of FREQUENCY_BANDS) {
        const { low, high } = ranges[band];
        let flux = 0;
        for (let bin = low; bin <= high; bin += 1) {
          const diff = (current[bin] as number) - (previous[bin] as number);
          if (diff > 0) {
            flux += diff;
          }
        }
        curves[band][frameIndex] = flux;
      }
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  for (const band of FREQUENCY_BANDS) {
    normalizeInPlace(curves[band]);
  }
  return { curves, hopSec, frameCount };
}

/** Sums the three band curves frame-by-frame (input for tempo estimation). */
export function sumCurves(curves: Readonly<Record<FrequencyBand, Float64Array>>): Float64Array {
  const length = curves.bass.length;
  if (curves.mid.length !== length || curves.high.length !== length) {
    throw new RangeError('sumCurves: band curves must have equal length');
  }
  const out = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (curves.bass[i] as number) + (curves.mid[i] as number) + (curves.high[i] as number);
  }
  return out;
}
