/**
 * Benchmark script for whisper.cpp STT latency.
 *
 * Usage:
 *   npx tsx scripts/benchmark-stt.ts
 *
 * Downloads models via ModelManager if not cached.
 * Tests with both synthetic audio (silence/noise) and real JFK sample.
 * Compares Metal GPU vs CPU-only, tiny.en vs base.en.
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { ModelManager } from '../src/main/models/manager';

// Load native addon directly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WhisperModel } = require(
  resolve(__dirname, '../native/whisper/build/Release/whisper_addon.node')
);

// ─── Helpers ─────────────────────────────────────────────────────────

function generateSilence(durationSec: number, sampleRate = 16000): Float32Array {
  return new Float32Array(Math.floor(durationSec * sampleRate));
}

function generateNoise(durationSec: number, sampleRate = 16000): Float32Array {
  const samples = new Float32Array(Math.floor(durationSec * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = (Math.random() * 2 - 1) * 0.1; // Low-level noise
  }
  return samples;
}

function loadJfkWav(): Float32Array {
  const wavPath = resolve(__dirname, '../native/whisper/vendor/whisper.cpp/samples/jfk.wav');
  const buf = readFileSync(wavPath);

  // WAV header is 44 bytes, PCM 16-bit mono 16kHz
  const pcm16 = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }
  return float32;
}

function sliceAudio(audio: Float32Array, durationSec: number, sampleRate = 16000): Float32Array {
  const len = Math.min(Math.floor(durationSec * sampleRate), audio.length);
  return audio.slice(0, len);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
  return ms.toFixed(1) + 'ms';
}

// ─── Benchmark Runner ────────────────────────────────────────────────

interface BenchResult {
  model: string;
  gpu: boolean;
  audioLabel: string;
  audioDurationSec: number;
  runs: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

async function benchmarkModel(
  modelPath: string,
  modelName: string,
  gpu: boolean,
  audio: Float32Array,
  audioLabel: string,
  audioDurationSec: number,
  runs: number
): Promise<BenchResult> {
  const model = new WhisperModel(modelPath, { gpu, nThreads: 4 });

  // Warmup run (excluded from stats)
  await model.transcribe(audio, { language: 'en' });

  const latencies: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await model.transcribe(audio, { language: 'en' });
    latencies.push(performance.now() - t0);
  }

  model.free();

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  return {
    model: modelName,
    gpu,
    audioLabel,
    audioDurationSec,
    runs,
    latencies,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    mean,
  };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== whisper.cpp STT Benchmark ===\n');

  const mgr = new ModelManager();

  // Ensure models are downloaded
  console.log('Ensuring models are downloaded...');
  const tinyPath = await mgr.ensureModel('whisper-tiny.en', (p) => {
    if (p.percent % 25 === 0) process.stdout.write(`  tiny.en: ${p.percent}%\r`);
  });
  console.log(`  tiny.en: ${tinyPath}`);

  const basePath = await mgr.ensureModel('whisper-base.en', (p) => {
    if (p.percent % 25 === 0) process.stdout.write(`  base.en: ${p.percent}%\r`);
  });
  console.log(`  base.en: ${basePath}`);

  // Prepare audio samples
  const jfk = loadJfkWav();
  const jfkDuration = jfk.length / 16000;

  const audioSamples: { label: string; audio: Float32Array; durationSec: number }[] = [
    { label: 'silence-1s', audio: generateSilence(1), durationSec: 1 },
    { label: 'silence-3s', audio: generateSilence(3), durationSec: 3 },
    { label: 'noise-3s', audio: generateNoise(3), durationSec: 3 },
    { label: 'jfk-3s', audio: sliceAudio(jfk, 3), durationSec: 3 },
    { label: 'jfk-5s', audio: sliceAudio(jfk, 5), durationSec: 5 },
    { label: `jfk-full-${jfkDuration.toFixed(0)}s`, audio: jfk, durationSec: jfkDuration },
  ];

  const RUNS = 5;
  const models: { name: string; path: string }[] = [
    { name: 'tiny.en', path: tinyPath },
    { name: 'base.en', path: basePath },
  ];

  const results: BenchResult[] = [];

  // GPU benchmarks
  for (const m of models) {
    console.log(`\n--- ${m.name} (Metal GPU) ---`);
    // Load once for timing
    const loadT0 = performance.now();
    const loadModel = new WhisperModel(m.path, { gpu: true, nThreads: 4 });
    console.log(`  Model load: ${formatMs(performance.now() - loadT0)}`);
    loadModel.free();

    for (const s of audioSamples) {
      const r = await benchmarkModel(m.path, m.name, true, s.audio, s.label, s.durationSec, RUNS);
      results.push(r);
      console.log(
        `  ${s.label.padEnd(20)} P50=${formatMs(r.p50).padStart(8)} ` +
          `P95=${formatMs(r.p95).padStart(8)} P99=${formatMs(r.p99).padStart(8)}`
      );
    }
  }

  // CPU-only benchmarks (just 3s audio to compare)
  console.log('\n--- CPU-only comparison (3s audio) ---');
  for (const m of models) {
    const audio3s = sliceAudio(jfk, 3);
    const r = await benchmarkModel(m.path, m.name, false, audio3s, 'jfk-3s-cpu', 3, RUNS);
    results.push(r);
    console.log(
      `  ${m.name.padEnd(10)} CPU  P50=${formatMs(r.p50).padStart(8)} ` +
        `P95=${formatMs(r.p95).padStart(8)} P99=${formatMs(r.p99).padStart(8)}`
    );
  }

  // Summary table
  console.log('\n\n=== Results Summary ===\n');
  console.log(
    '| Model    | GPU   | Audio                | Duration | Runs | P50     | P95     | P99     | Mean    |'
  );
  console.log(
    '|----------|-------|----------------------|----------|------|---------|---------|---------|---------|'
  );
  for (const r of results) {
    console.log(
      `| ${r.model.padEnd(8)} | ${(r.gpu ? 'Metal' : 'CPU').padEnd(5)} ` +
        `| ${r.audioLabel.padEnd(20)} | ${r.audioDurationSec.toFixed(0).padStart(5)}s   ` +
        `| ${String(r.runs).padStart(4)} | ${formatMs(r.p50).padStart(7)} ` +
        `| ${formatMs(r.p95).padStart(7)} | ${formatMs(r.p99).padStart(7)} ` +
        `| ${formatMs(r.mean).padStart(7)} |`
    );
  }

  // Check acceptance criteria
  console.log('\n=== Acceptance Criteria ===\n');

  const baseGpu3s = results.find(
    (r) => r.model === 'base.en' && r.gpu && r.audioLabel === 'jfk-3s'
  );
  const tinyGpu3s = results.find(
    (r) => r.model === 'tiny.en' && r.gpu && r.audioLabel === 'jfk-3s'
  );
  const baseCpu3s = results.find(
    (r) => r.model === 'base.en' && !r.gpu && r.audioLabel === 'jfk-3s-cpu'
  );
  const baseGpu3sResult = results.find(
    (r) => r.model === 'base.en' && r.gpu && r.audioLabel === 'jfk-3s'
  );

  if (baseGpu3s) {
    const pass = baseGpu3s.p95 < 500;
    console.log(
      `  base.en P95 < 500ms for 3s audio: ${pass ? 'PASS' : 'FAIL'} (${formatMs(baseGpu3s.p95)})`
    );
  }
  if (tinyGpu3s) {
    const pass = tinyGpu3s.p95 < 250;
    console.log(
      `  tiny.en P95 < 250ms for 3s audio: ${pass ? 'PASS' : 'FAIL'} (${formatMs(tinyGpu3s.p95)})`
    );
  }
  if (baseCpu3s && baseGpu3sResult) {
    const improvement = baseCpu3s.p50 - baseGpu3sResult.p50;
    const pass = improvement > 0;
    console.log(
      `  Metal GPU faster than CPU: ${pass ? 'PASS' : 'FAIL'} ` +
        `(GPU=${formatMs(baseGpu3sResult.p50)} vs CPU=${formatMs(baseCpu3s.p50)}, ` +
        `delta=${formatMs(improvement)})`
    );
  }

  // Memory usage
  const mem = process.memoryUsage();
  console.log(
    `\n  Memory: heap=${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB, ` +
      `rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB`
  );

  // Output markdown table for BENCHMARKS.md
  console.log('\n\n=== Markdown for docs/BENCHMARKS.md ===\n');
  console.log('| Model | GPU | Audio | Duration | P50 | P95 | P99 | Mean |');
  console.log('|-------|-----|-------|----------|-----|-----|-----|------|');
  for (const r of results) {
    console.log(
      `| ${r.model} | ${r.gpu ? 'Metal' : 'CPU'} | ${r.audioLabel} | ${r.audioDurationSec.toFixed(0)}s | ${formatMs(r.p50)} | ${formatMs(r.p95)} | ${formatMs(r.p99)} | ${formatMs(r.mean)} |`
    );
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
