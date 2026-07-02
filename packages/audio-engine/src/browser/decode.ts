import { sha256Hex } from '@viberide/shared';

/**
 * Every decode is pinned to this rate. An OfflineAudioContext resamples the
 * decoded audio to its own sample rate, so pinning it makes the PCM handed to
 * the analyzer independent of the device's hardware output rate (a plain
 * AudioContext would follow the hardware).
 */
export const DECODE_SAMPLE_RATE = 44100;

export interface DecodedAudio {
  /** Mono PCM at DECODE_SAMPLE_RATE (channels averaged with equal weight). */
  readonly pcm: Float32Array;
  readonly sampleRate: number;
  /** sha-256 hex digest of the ORIGINAL encoded bytes, not the decoded PCM. */
  readonly audioHash: string;
}

/**
 * Browser-only: decodes an encoded audio file (mp3/ogg/wav/...) to mono PCM
 * and hashes the original bytes. Thin glue over the Web Audio API — all
 * analysis logic lives in the pure-DSP modules, which never touch the DOM.
 */
export async function decodeAudioFile(input: ArrayBuffer): Promise<DecodedAudio> {
  if (input.byteLength === 0) {
    throw new RangeError('decodeAudioFile: input buffer is empty');
  }
  // Hash first: decodeAudioData detaches the ArrayBuffer it receives.
  const audioHash = await sha256Hex(input);
  const context = new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE);
  const audioBuffer = await context.decodeAudioData(input.slice(0));
  return {
    pcm: downmixToMono(audioBuffer),
    sampleRate: audioBuffer.sampleRate,
    audioHash,
  };
}

/** Averages all channels into a single mono Float32Array. */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channelCount = buffer.numberOfChannels;
  if (channelCount === 1) {
    return buffer.getChannelData(0);
  }
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] = (mono[i] as number) + (data[i] as number);
    }
  }
  for (let i = 0; i < length; i += 1) {
    mono[i] = (mono[i] as number) / channelCount;
  }
  return mono;
}
