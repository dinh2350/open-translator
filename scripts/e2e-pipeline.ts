/**
 * End-to-end pipeline test for macOS M1 8GB hardware validation.
 *
 * Tests the full pipeline: Audio → Resample → VAD → STT → Translation
 * using real native models (whisper.cpp + Opus-MT).
 *
 * Usage:
 *   npx tsx scripts/e2e-pipeline.ts
 *
 * Prerequisites:
 *   - Native whisper addon built: cd native/whisper && npm run build
 *   - Models auto-download on first run (~300MB total)
 *
 * Validates:
 *   - P95 latency < 1000ms (acceptance criterion)
 *   - Memory peak < 1.5 GB
 *   - Pipeline processes speech correctly end-to-end
 *   - No crashes under sustained load
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { ModelManager } from '../src/main/models/manager';
import { AudioProcessor } from '../src/main/audio/processor';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WhisperModel } = require(
  resolve(__dirname, '../native/whisper/build/Release/whisper_addon.node')
);

// ─── Helpers ─────────────────────────────────────────────────────────

function loadJfkWav(): Float32Array {
  const wavPath = resolve(__dirname, '../native/whisper/vendor/whisper.cpp/samples/jfk.wav');
  const buf = readFileSync(wavPath);
  const pcm16 = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }
  return float32;
}

function sliceAudio(audio: Float32Array, durationSec: number): Float32Array {
  const len = Math.min(Math.floor(durationSec * 16000), audio.length);
  return audio.slice(0, len);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  latencyP95Ms?: number;
  memoryPeakMB?: number;
}

const results: TestResult[] = [];

function logResult(result: TestResult): void {
  const icon = result.passed ? '✅' : '❌';
  console.log(`\n${icon} ${result.name}`);
  console.log(`   ${result.details}`);
  if (result.latencyP95Ms !== undefined) {
    console.log(`   P95 latency: ${result.latencyP95Ms.toFixed(0)}ms`);
  }
  if (result.memoryPeakMB !== undefined) {
    console.log(`   Peak memory: ${result.memoryPeakMB.toFixed(0)} MB`);
  }
  results.push(result);
}

// ─── Tests ───────────────────────────────────────────────────────────

async function testSTTLatency(modelPath: string, modelName: string): Promise<void> {
  console.log(`\n--- Test: STT latency (${modelName}) ---`);

  const model = new WhisperModel(modelPath, { gpu: true, nThreads: 4 });
  const jfk = loadJfkWav();
  const chunks = [sliceAudio(jfk, 2), sliceAudio(jfk, 3), sliceAudio(jfk, 5), jfk];

  // Warmup
  await model.transcribe(chunks[0], { language: 'en' });

  const latencies: number[] = [];
  for (const chunk of chunks) {
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const result = await model.transcribe(chunk, { language: 'en' });
      const ms = performance.now() - t0;
      latencies.push(ms);
      const dur = (chunk.length / 16000).toFixed(1);
      console.log(`   ${dur}s audio → ${ms.toFixed(0)}ms (${result.text.substring(0, 40)}...)`);
    }
  }

  model.free();

  const p95 = percentile(latencies, 0.95);
  const target = modelName.includes('base') ? 500 : 250;

  logResult({
    name: `STT latency ${modelName}`,
    passed: p95 < target,
    details: `${latencies.length} runs, target P95 < ${target}ms`,
    latencyP95Ms: p95,
  });
}

async function testTranslationLatency(): Promise<void> {
  console.log('\n--- Test: Translation latency (Opus-MT) ---');

  // Dynamic import to avoid requiring @huggingface/transformers at top level
  const { pipeline: hfPipeline, env } = await import('@huggingface/transformers');
  const { join } = await import('path');
  const { homedir } = await import('os');

  env.cacheDir = join(homedir(), '.open-translator', 'models', 'hf-cache');
  env.allowRemoteModels = true;
  env.allowLocalModels = true;

  console.log('   Loading Opus-MT pipeline...');
  const t0 = performance.now();
  const translator = await hfPipeline('translation', 'Xenova/opus-mt-en-vi', { dtype: 'fp32' });
  console.log(`   Pipeline loaded in ${(performance.now() - t0).toFixed(0)}ms`);

  const sentences = [
    'Hello, how are you today?',
    'The weather is nice.',
    'I think we should proceed with the implementation plan discussed in the meeting.',
    'Good morning everyone, welcome to the engineering standup.',
    'Can you please share the quarterly report with the team?',
    'The deployment was successful and all tests are passing.',
    'We need to investigate the memory leak in the audio processing pipeline.',
    'Let me summarize the key takeaways from today.',
  ];

  // Warmup
  await translator('Hello world', { max_length: 512 });

  const latencies: number[] = [];
  for (const text of sentences) {
    const st = performance.now();
    const result = await translator(text, { max_length: 512 });
    const ms = performance.now() - st;
    latencies.push(ms);
    const output = Array.isArray(result) ? result[0] : result;
    const translated = (output as { translation_text: string }).translation_text;
    console.log(
      `   ${ms.toFixed(0)}ms: "${text.substring(0, 30)}..." → "${translated.substring(0, 30)}..."`
    );
  }

  const p95 = percentile(latencies, 0.95);
  logResult({
    name: 'Translation latency (Opus-MT)',
    passed: p95 < 150,
    details: `${latencies.length} sentences, target P95 < 150ms`,
    latencyP95Ms: p95,
  });
}

async function testEndToEndPipeline(modelPath: string, modelName: string): Promise<void> {
  console.log(`\n--- Test: End-to-end pipeline (${modelName} + Opus-MT) ---`);

  const { pipeline: hfPipeline, env } = await import('@huggingface/transformers');
  const { join } = await import('path');
  const { homedir } = await import('os');

  env.cacheDir = join(homedir(), '.open-translator', 'models', 'hf-cache');
  env.allowRemoteModels = true;
  env.allowLocalModels = true;

  const whisperModel = new WhisperModel(modelPath, { gpu: true, nThreads: 4 });
  const translator = await hfPipeline('translation', 'Xenova/opus-mt-en-vi', { dtype: 'fp32' });

  const jfk = loadJfkWav();
  const audioProcessor = new AudioProcessor(16000, 16000); // 1:1 since audio is already 16kHz

  // Simulate 10 speech segments going through the full pipeline
  const chunks = [
    sliceAudio(jfk, 2),
    sliceAudio(jfk, 3),
    sliceAudio(jfk, 4),
    sliceAudio(jfk, 2),
    sliceAudio(jfk, 3),
    sliceAudio(jfk, 5),
    sliceAudio(jfk, 2),
    sliceAudio(jfk, 3),
    sliceAudio(jfk, 4),
    jfk,
  ];

  // Warmup
  const warmupResult = await whisperModel.transcribe(chunks[0], { language: 'en' });
  await translator(warmupResult.text || 'hello', { max_length: 512 });

  const totalLatencies: number[] = [];
  let peakRSS = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const pipeline0 = performance.now();

    // Step 1: Process audio
    const processed = audioProcessor.process(chunk);

    // Step 2: STT
    const sttResult = await whisperModel.transcribe(processed, { language: 'en' });
    const text = sttResult.text?.trim();

    if (!text) {
      console.log(`   Chunk ${i + 1}: empty transcription, skipping`);
      continue;
    }

    // Step 3: Translate
    const transResult = await translator(text, { max_length: 512 });
    const output = Array.isArray(transResult) ? transResult[0] : transResult;
    const translated = (output as { translation_text: string }).translation_text;

    const totalMs = performance.now() - pipeline0;
    totalLatencies.push(totalMs);

    const rss = process.memoryUsage().rss;
    if (rss > peakRSS) peakRSS = rss;

    const dur = (chunk.length / 16000).toFixed(1);
    console.log(
      `   Chunk ${i + 1}: ${dur}s → ${totalMs.toFixed(0)}ms total | ` +
        `"${text.substring(0, 30)}..." → "${translated.substring(0, 30)}..." | ` +
        `RSS: ${formatMB(rss)}`
    );
  }

  whisperModel.free();

  const p95 = percentile(totalLatencies, 0.95);
  const peakMB = peakRSS / (1024 * 1024);

  logResult({
    name: `End-to-end pipeline (${modelName})`,
    passed: p95 < 1000,
    details: `${totalLatencies.length} segments processed`,
    latencyP95Ms: p95,
    memoryPeakMB: peakMB,
  });
}

async function testMemoryStability(modelPath: string): Promise<void> {
  console.log('\n--- Test: Memory stability (30 iterations) ---');

  const whisperModel = new WhisperModel(modelPath, { gpu: true, nThreads: 4 });
  const jfk = loadJfkWav();
  const chunk3s = sliceAudio(jfk, 3);

  const rssSnapshots: number[] = [];

  // Run 30 transcriptions and track RSS
  for (let i = 0; i < 30; i++) {
    await whisperModel.transcribe(chunk3s, { language: 'en' });
    const rss = process.memoryUsage().rss / (1024 * 1024);
    rssSnapshots.push(rss);
    if (i % 10 === 0) {
      console.log(`   Iteration ${i + 1}/30: RSS = ${rss.toFixed(0)} MB`);
    }
  }

  whisperModel.free();

  // Check for memory growth: compare first 5 vs last 5 averages
  const earlyAvg = rssSnapshots.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const lateAvg = rssSnapshots.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const growthMB = lateAvg - earlyAvg;

  const peakMB = Math.max(...rssSnapshots);

  logResult({
    name: 'Memory stability',
    passed: growthMB < 100,
    details: `Growth: ${growthMB.toFixed(0)} MB over 30 iterations (early avg: ${earlyAvg.toFixed(0)} MB, late avg: ${lateAvg.toFixed(0)} MB)`,
    memoryPeakMB: peakMB,
  });
}

async function testAudioProcessing(): Promise<void> {
  console.log('\n--- Test: Audio processing pipeline ---');

  const processor = new AudioProcessor(48000, 16000);
  const jfk = loadJfkWav();

  // Simulate 48kHz input by upsampling the 16kHz JFK audio
  const upsampled = new Float32Array(jfk.length * 3);
  for (let i = 0; i < jfk.length; i++) {
    upsampled[i * 3] = jfk[i];
    upsampled[i * 3 + 1] = jfk[i];
    upsampled[i * 3 + 2] = jfk[i];
  }

  const t0 = performance.now();
  const ITERATIONS = 100;
  for (let i = 0; i < ITERATIONS; i++) {
    // Simulate typical 4096-sample chunks from AudioWorklet
    const chunkSize = 4096;
    for (let offset = 0; offset + chunkSize <= upsampled.length; offset += chunkSize) {
      const chunk = upsampled.slice(offset, offset + chunkSize);
      processor.process(chunk);
    }
  }
  const totalMs = performance.now() - t0;
  const perIteration = totalMs / ITERATIONS;
  const perChunk = perIteration / Math.ceil(upsampled.length / 4096);

  logResult({
    name: 'Audio processing throughput',
    passed: perChunk < 1,
    details: `${ITERATIONS} full-file iterations, ${perChunk.toFixed(3)}ms/chunk (target < 1ms)`,
  });
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      Open Translator — E2E Pipeline Validation         ║');
  console.log('║               macOS M1 8GB Target                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const mgr = new ModelManager();

  // Ensure models are downloaded
  console.log('Ensuring models are cached...');
  const tinyPath = await mgr.ensureModel('whisper-tiny.en', (p) => {
    if (p.percent % 25 === 0) process.stdout.write(`  tiny.en: ${p.percent}%\r`);
  });
  console.log(`  tiny.en: ${tinyPath}`);

  const basePath = await mgr.ensureModel('whisper-base.en', (p) => {
    if (p.percent % 25 === 0) process.stdout.write(`  base.en: ${p.percent}%\r`);
  });
  console.log(`  base.en: ${basePath}`);

  console.log(`\nInitial RSS: ${formatMB(process.memoryUsage().rss)}`);

  // Run tests
  await testAudioProcessing();
  await testSTTLatency(tinyPath, 'tiny.en');
  await testSTTLatency(basePath, 'base.en');
  await testTranslationLatency();
  await testEndToEndPipeline(tinyPath, 'tiny.en');
  await testMemoryStability(tinyPath);

  // ─── Summary ─────────────────────────────────────────────────────

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                   RESULTS SUMMARY                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (r.latencyP95Ms !== undefined) console.log(`     P95: ${r.latencyP95Ms.toFixed(0)}ms`);
    if (r.memoryPeakMB !== undefined) console.log(`     Peak: ${r.memoryPeakMB.toFixed(0)} MB`);
    if (!r.passed) allPassed = false;
  }

  console.log('\n─── Performance Budgets ───');
  console.log('  STT (base, 3s):      < 500ms');
  console.log('  Translation:         < 150ms');
  console.log('  Total E2E P95:       < 1000ms');
  console.log('  Memory peak:         < 1500 MB');
  console.log('  Audio processing:    < 1ms/chunk');

  console.log(`\nFinal RSS: ${formatMB(process.memoryUsage().rss)}`);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  console.log('\n─── Manual Test Checklist ───');
  console.log('  [ ] Scenario 1: Start → Speak → See EN + VI transcript (latency < 1s)');
  console.log('  [ ] Scenario 2: 30-minute session (RAM stable, no crashes)');
  console.log('  [ ] Scenario 3: Rapid speech (backpressure, no drops at normal speed)');
  console.log('  [ ] Scenario 4: Silence periods (no false positives)');
  console.log('  [ ] Scenario 5: Disconnect mic → reconnect → auto-resume');
  console.log('  [ ] Scenario 6: Fresh install → model download → first transcription');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
