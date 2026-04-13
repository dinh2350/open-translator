import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineOrchestrator } from '../orchestrator';
import type { TranscriptSegment, AudioChunk } from '@shared/types';
import type { TranslationService } from '@main/translation/types';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockSTT(latencyMs = 50, text = 'Hello world') {
  const stt = {
    transcribing: false,
    ready: true,
    currentModel: 'tiny.en',
    init: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockImplementation(async (chunk: AudioChunk, opts) => {
      await delay(latencyMs);
      if (chunk.samples.length < 8000) return null; // Short segment skip
      return {
        id: crypto.randomUUID(),
        text,
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
  return stt;
}

// ─── Mock Translator ───────────────────────────────────────────────

function createMockTranslator(latencyMs = 30): TranslationService {
  return {
    name: 'mock-translator',
    isReady: true,
    init: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn().mockImplementation(async (text: string) => {
      await delay(latencyMs);
      return `[VI] ${text}`;
    }),
    free: vi.fn(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAudioChunk(durationSec = 2, sampleRate = 16000): Float32Array {
  return new Float32Array(Math.floor(durationSec * sampleRate));
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('PipelineOrchestrator', () => {
  let stt: ReturnType<typeof createMockSTT>;
  let translator: TranslationService;
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    stt = createMockSTT(10, 'Hello world');
    translator = createMockTranslator(5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orchestrator = new PipelineOrchestrator(stt as any, translator);
  });

  it('processes a single chunk through STT and translation', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    orchestrator.handleSpeechStart();
    orchestrator.enqueue(createAudioChunk(2));
    await delay(100);

    expect(segments.length).toBe(1);
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].translated).toBe('[VI] Hello world');
    expect(segments[0].isFinal).toBe(true);
  });

  it('processes multiple chunks in sequence', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    for (let i = 0; i < 5; i++) {
      orchestrator.handleSpeechStart();
      orchestrator.enqueue(createAudioChunk(1.5));
      await delay(50);
    }
    await delay(200);

    expect(segments.length).toBe(5);
    for (const seg of segments) {
      expect(seg.translated).toBe('[VI] Hello world');
    }
  });

  it('emits metrics after each completed cycle', async () => {
    const metricsEvents: unknown[] = [];
    orchestrator.on('metrics', (m) => metricsEvents.push(m));

    orchestrator.handleSpeechStart();
    orchestrator.enqueue(createAudioChunk(2));
    await delay(100);

    expect(metricsEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks status transitions correctly', async () => {
    const statuses: string[] = [];
    orchestrator.on('status', (s) => statuses.push(s));

    orchestrator.handleSpeechStart();
    orchestrator.enqueue(createAudioChunk(2));
    await delay(100);

    expect(statuses).toContain('recording');
    expect(statuses).toContain('processing');
    expect(statuses[statuses.length - 1]).toBe('idle');
  });

  it('drops oldest chunk when queue is full (backpressure)', async () => {
    const slowSTT = createMockSTT(200, 'Slow');
    const slowTranslator = createMockTranslator(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slowOrch = new PipelineOrchestrator(slowSTT as any, slowTranslator);

    // Enqueue 7 chunks rapidly (max queue = 5)
    for (let i = 0; i < 7; i++) {
      slowOrch.handleSpeechStart();
      slowOrch.enqueue(createAudioChunk(1));
    }

    const metrics = slowOrch.metrics.getMetrics();
    expect(metrics.chunksDropped).toBeGreaterThan(0);
  });

  it('skips short audio segments', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    orchestrator.handleSpeechStart();
    // 0.3s audio = 4800 samples < 8000 minimum
    orchestrator.enqueue(createAudioChunk(0.3));
    await delay(50);

    expect(segments.length).toBe(0);
  });

  it('handles interim transcriptions without blocking finals', async () => {
    const segments: TranscriptSegment[] = [];
    orchestrator.on('segment', (seg) => segments.push(seg));

    const pendingId = orchestrator.handleSpeechStart();
    expect(typeof pendingId).toBe('string');

    // Send interim
    orchestrator.enqueueInterim(createAudioChunk(1));
    await delay(30);

    // Send final
    orchestrator.enqueue(createAudioChunk(2));
    await delay(100);

    const finals = segments.filter((s) => s.isFinal);
    expect(finals.length).toBe(1);
    expect(finals[0].translated).toBe('[VI] Hello world');
  });

  it('emits segment even when translation fails', async () => {
    const failTranslator: TranslationService = {
      name: 'fail',
      isReady: true,
      init: vi.fn().mockResolvedValue(undefined),
      translate: vi.fn().mockRejectedValue(new Error('Translation failed')),
      free: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orch = new PipelineOrchestrator(stt as any, failTranslator);
    const segments: TranscriptSegment[] = [];
    orch.on('segment', (seg) => segments.push(seg));

    orch.handleSpeechStart();
    orch.enqueue(createAudioChunk(2));
    await delay(100);

    expect(segments.length).toBe(1);
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].translated).toBeUndefined();
  });
});
