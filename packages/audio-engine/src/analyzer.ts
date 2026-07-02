import { FREQUENCY_BANDS, isSha256Hex } from '@viberide/shared';
import type { BeatMap, Onset } from '@viberide/shared';

import { buildBeatGrid, deriveBeatPhase, estimateTempo } from './dsp/bpm';
import { computeEnergyEnvelope } from './dsp/energy';
import { detectOnsets } from './dsp/onset-detection';
import { computeBandNoveltyCurves, sumCurves } from './dsp/spectral-flux';

/**
 * Full deterministic analysis pipeline over decoded mono PCM:
 * band novelty curves → per-band onsets → tempo (autocorrelation) →
 * beat grid phased against bass onsets → RMS energy envelope.
 *
 * The same PCM + sampleRate + audioHash always produce a deep-equal BeatMap.
 */
export function analyzePcm(pcm: Float32Array, sampleRate: number, audioHash: string): BeatMap {
  if (pcm.length === 0) {
    throw new RangeError('analyzePcm: pcm must not be empty');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `analyzePcm: sampleRate must be a positive finite number, got ${sampleRate}`,
    );
  }
  if (!isSha256Hex(audioHash)) {
    throw new RangeError('analyzePcm: audioHash must be a lowercase sha-256 hex digest');
  }

  const durationSec = pcm.length / sampleRate;
  const { curves, hopSec } = computeBandNoveltyCurves(pcm, sampleRate);

  const onsets: Onset[] = [];
  for (const band of FREQUENCY_BANDS) {
    onsets.push(...detectOnsets(curves[band], hopSec, band));
  }
  // Onsets were collected in FREQUENCY_BANDS order, and Array.prototype.sort is
  // stable (ES2019+), so equal-time onsets keep the bass < mid < high order —
  // the global ordering is fully deterministic.
  onsets.sort((a, b) => a.time - b.time);

  const { bpm, periodSec } = estimateTempo(sumCurves(curves), hopSec);
  const bassOnsets = onsets.filter((onset) => onset.band === 'bass');
  // Bass carries the beat in most material; fall back to all onsets otherwise.
  const phaseSec = deriveBeatPhase(bassOnsets.length > 0 ? bassOnsets : onsets, periodSec);
  const beats = buildBeatGrid(phaseSec, periodSec, durationSec);
  const energy = computeEnergyEnvelope(pcm, sampleRate);

  return {
    version: 1,
    audioHash,
    durationSec,
    sampleRate,
    bpm,
    beats,
    onsets,
    energy,
  };
}
