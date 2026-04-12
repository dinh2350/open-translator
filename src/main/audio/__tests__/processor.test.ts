import { describe, it, expect } from 'vitest';
import { AudioProcessor } from '../processor';

describe('AudioProcessor', () => {
  const processor = new AudioProcessor(48000, 16000);

  describe('resample', () => {
    it('produces correct output length (input * 1/3)', () => {
      const input = new Float32Array(4096);
      const output = processor.resample(input);
      expect(output.length).toBe(Math.floor(4096 / 3));
    });

    it('produces correct output length for various sizes', () => {
      for (const size of [480, 960, 4096, 9600]) {
        const input = new Float32Array(size);
        const output = processor.resample(input);
        expect(output.length).toBe(Math.floor(size / 3));
      }
    });

    it('preserves a known sine wave frequency', () => {
      const freqHz = 440;
      const sampleRate = 48000;
      const duration = 0.1; // 100ms
      const numSamples = Math.floor(sampleRate * duration);
      const input = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        input[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
      }

      const output = processor.resample(input);

      // Verify the output still contains the 440Hz frequency
      // by checking zero-crossings: ~2 per cycle, so ~88 crossings in 100ms
      let crossings = 0;
      for (let i = 1; i < output.length; i++) {
        if ((output[i - 1] >= 0 && output[i] < 0) || (output[i - 1] < 0 && output[i] >= 0)) {
          crossings++;
        }
      }

      const expectedCrossings = Math.floor(2 * freqHz * duration);
      // Allow ±2 crossings tolerance
      expect(crossings).toBeGreaterThanOrEqual(expectedCrossings - 2);
      expect(crossings).toBeLessThanOrEqual(expectedCrossings + 2);
    });

    it('output values stay within [-1, 1] for normalized input', () => {
      const input = new Float32Array(4096);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
      }

      const output = processor.resample(input);
      for (let i = 0; i < output.length; i++) {
        expect(output[i]).toBeGreaterThanOrEqual(-1);
        expect(output[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('normalize', () => {
    it('scales peak to 1.0', () => {
      const input = new Float32Array([0.1, -0.5, 0.25, -0.3]);
      const output = processor.normalize(input);
      // Max abs is 0.5, so output should be scaled by 1/0.5 = 2
      expect(output[1]).toBeCloseTo(-1.0, 5);
    });

    it('applies noise gate to quiet samples', () => {
      const input = new Float32Array([0.5, 0.001, -0.5, 0.002]);
      const output = processor.normalize(input);
      // After normalization: 1.0, 0.002, -1.0, 0.004
      // 0.002 and 0.004 are below threshold (0.01), should be zeroed
      expect(output[1]).toBe(0);
      expect(output[3]).toBe(0);
    });

    it('handles all-zero input without NaN', () => {
      const input = new Float32Array(100);
      const output = processor.normalize(input);
      for (let i = 0; i < output.length; i++) {
        expect(output[i]).toBe(0);
        expect(Number.isNaN(output[i])).toBe(false);
      }
    });
  });

  describe('process', () => {
    it('resamples and normalizes in one call', () => {
      const input = new Float32Array(4800);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5;
      }

      const output = processor.process(input);
      expect(output.length).toBe(Math.floor(4800 / 3));

      // Peak should be close to 1.0 after normalization
      let peak = 0;
      for (let i = 0; i < output.length; i++) {
        const abs = Math.abs(output[i]);
        if (abs > peak) peak = abs;
      }
      expect(peak).toBeCloseTo(1.0, 1);
    });
  });

  describe('performance', () => {
    it('resamples 4096 samples in < 1ms', () => {
      const input = new Float32Array(4096);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random() * 2 - 1;
      }

      const start = performance.now();
      for (let run = 0; run < 100; run++) {
        processor.resample(input);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 100;

      expect(avgMs).toBeLessThan(1);
    });
  });
});
