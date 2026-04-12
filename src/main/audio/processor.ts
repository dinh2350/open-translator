const NOISE_GATE_THRESHOLD = 0.01;

export class AudioProcessor {
  private ratio: number;

  constructor(inputSampleRate = 48000, outputSampleRate = 16000) {
    this.ratio = inputSampleRate / outputSampleRate;
  }

  /**
   * Resample audio from inputSampleRate to outputSampleRate using linear interpolation.
   * Sufficient quality for speech recognition (whisper.cpp).
   */
  resample(input: Float32Array): Float32Array {
    const outputLength = Math.floor(input.length / this.ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.ratio;
      const srcFloor = Math.floor(srcIndex);
      const fraction = srcIndex - srcFloor;

      const s0 = input[srcFloor];
      const s1 = srcFloor + 1 < input.length ? input[srcFloor + 1] : s0;

      output[i] = s0 + fraction * (s1 - s0);
    }

    return output;
  }

  /**
   * Normalize audio levels to [-1.0, 1.0] range and apply a simple noise gate.
   * Samples below the threshold are zeroed out.
   */
  normalize(samples: Float32Array): Float32Array {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }

    const output = new Float32Array(samples.length);
    const scale = max > 0 ? 1.0 / max : 1.0;

    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] * scale;
      output[i] = Math.abs(normalized) < NOISE_GATE_THRESHOLD ? 0 : normalized;
    }

    return output;
  }

  /**
   * Convenience: resample then normalize in one call.
   */
  process(input: Float32Array): Float32Array {
    const resampled = this.resample(input);
    return this.normalize(resampled);
  }
}
