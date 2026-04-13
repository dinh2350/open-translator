import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineOrchestrator } from '../orchestrator';
import type { TranscriptSegment } from '@shared/types';
import type { TranslationService } from '@main/translation/types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockSTT(latencyMs = 10) {
  let callCount = 0;
  return {
    init: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockImplementation(async (chunk, opts) => {
      await delay(latencyMs);
      callCount++;
      if (chunk.samples.length < 8000) return null;
      return {
        id: `seg-${callCount}`,
        text: `Segment ${callCount}`,
        timestamp: chunk.timestamp,
        isFinal: opts?.isFinal ?? true,
        pendingId: opts?.pendingId,
        audioDurationMs: (chunk.samples.length / chunk.sampleRate) * 1000,
        sttLatencyMs: latencyMs,
        totalLatencyMs: latencyMs,
      } satisfies TranscriptSegment;
    }),
    switchModel: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
    getModelName: vi.fn().mockReturnValue('tiny.en'),
    free: vi.fn(),
  };
}

function createMockTranslator(latencyMs = 5): TranslationService {
  return {
    name: 'mock',
    isReady: true,
    init: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn().mockImplementation(async (text: string) => {
      await delay(latencyMs);
      return `[VI] ${text}`;
    }),
    free: vi.fn(),
  };
}

function createAudioChunk(durationSec = 2): Float32Array {
  return new Float32Array(Math.floor(durationSec * 16000));
}

describe('Pipeline stress tests', () => {
  let stt: ReturnType<typeof createMockSTT>;
  let translator: TranslationService;
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    stt = createMockSTT(5);
    translator = createMockTranslator(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orchestrator = new PipelineOrchestrator(stt as any, translator);
  });

  it('processes 50 consecutive chunks without memory growth', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    const initialRSS = process.memoryUsage().rss;

    for (let i = 0; i < 50; i++) {
      orchestrator.handleSpeechStart();
      orchestrator.enqueue(createAudioChunk(1.5));
      // Allow processing between chunks
      if (i % 5 === 0) await delay(50);
    }

    // Wait for all processing to complete
    await delay(500);

    const finalRSS = process.memoryUsage().rss;
    const growthMB = (finalRSS - initialRSS) / (1024 * 1024);

    // Memory should not grow by more than 50MB for mock pipeline
    expect(growthMB).toBeLessThan(50);
    expect(segments.length).toBeGreaterThan(0);

    const metrics = orchestrator.metrics.getMetrics();
    expect(metrics.chunksProcessed).toBeGreaterThan(0);
  });

  it('maintains stable P95 latency under continuous load', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    for (let i = 0; i < 30; i++) {
      orchestrator.handleSpeechStart();
      orchestrator.enqueue(createAudioChunk(2));
      await delay(20);
    }

    await delay(500);

    const metrics = orchestrator.metrics.getMetrics();
    // With mock latencies (5ms STT + 3ms translate), P95 should be well under 1000ms
    expect(metrics.totalP95Ms).toBeLessThan(1000);
    expect(metrics.sttP95Ms).toBeLessThan(500);
    expect(metrics.translationP95Ms).toBeLessThan(150);
  });

  it('handles rapid-fire enqueuing with backpressure', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    // Rapid-fire 20 chunks with no delay between
    for (let i = 0; i < 20; i++) {
      orchestrator.handleSpeechStart();
      orchestrator.enqueue(createAudioChunk(1));
    }

    await delay(1000);

    const metrics = orchestrator.metrics.getMetrics();
    // Should have processed some and dropped some (queue max = 5)
    expect(metrics.chunksProcessed + metrics.chunksDropped).toBeGreaterThanOrEqual(20);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('recovers after translation failures', async () => {
    let failCount = 0;
    const flakyTranslator: TranslationService = {
      name: 'flaky',
      isReady: true,
      init: vi.fn().mockResolvedValue(undefined),
      translate: vi.fn().mockImplementation(async (text: string) => {
        failCount++;
        if (failCount <= 3) throw new Error('Temporary failure');
        await delay(3);
        return `[VI] ${text}`;
      }),
      free: vi.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orch = new PipelineOrchestrator(stt as any, flakyTranslator);
    const segments: TranscriptSegment[] = [];
    orch.on('segment', (seg) => segments.push(seg));

    for (let i = 0; i < 10; i++) {
      orch.handleSpeechStart();
      orch.enqueue(createAudioChunk(2));
      await delay(30);
    }
    await delay(500);

    // All should produce segments (some without translation)
    expect(segments.length).toBeGreaterThan(0);
    const withTranslation = segments.filter((s) => s.translated);
    const withoutTranslation = segments.filter((s) => !s.translated);
    expect(withTranslation.length).toBeGreaterThan(0);
    expect(withoutTranslation.length).toBeGreaterThan(0);
  });

  it('handles silence periods gracefully (no wasted processing)', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    // Speech → silence → speech
    orchestrator.handleSpeechStart();
    orchestrator.enqueue(createAudioChunk(2));
    await delay(50);

    // Simulate 2s of silence (no enqueues)
    await delay(200);
    const midMetrics = orchestrator.metrics.getMetrics();
    const midProcessed = midMetrics.chunksProcessed;

    // Another speech segment
    orchestrator.handleSpeechStart();
    orchestrator.enqueue(createAudioChunk(2));
    await delay(100);

    const finalMetrics = orchestrator.metrics.getMetrics();
    // Should have processed exactly 2 chunks (no phantom processing during silence)
    expect(finalMetrics.chunksProcessed).toBe(midProcessed + 1);
  });
});
