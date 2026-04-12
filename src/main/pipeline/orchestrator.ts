import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import type { AudioChunk, TranscriptSegment } from '@shared/types';
import { WhisperSTT } from '@main/stt';
import type { TranscribeOptions } from '@main/stt';
import { MetricsTracker } from './metrics';
import { AdaptiveModelQuality } from './adaptive';
import type { AdaptiveEvent } from './adaptive';

export interface TranslationService {
  translate(text: string): Promise<string>;
}

type OrchestratorEvent = 'segment' | 'metrics' | 'status' | 'model:switched';
type StatusValue = 'idle' | 'recording' | 'processing';
type EventCallback<T = unknown> = (data: T) => void;

const MAX_QUEUE_SIZE = 5;

/**
 * Stub translator until Sprint 3 (Task 3.1/3.2).
 * Returns the original text unmodified — no "[VI]" prefix to avoid
 * polluting real transcript output.
 */
class StubTranslator implements TranslationService {
  async translate(text: string): Promise<string> {
    return text;
  }
}

export class PipelineOrchestrator {
  private queue: { chunk: AudioChunk; pendingId?: string }[] = [];
  private processingSTT = false;
  private stt: WhisperSTT;
  private translator: TranslationService;
  private _metrics: MetricsTracker;
  private _adaptive: AdaptiveModelQuality;
  private status: StatusValue = 'idle';
  private currentPendingId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<OrchestratorEvent, EventCallback<any>[]>();

  constructor(stt: WhisperSTT, translator?: TranslationService) {
    this.stt = stt;
    this.translator = translator ?? new StubTranslator();
    this._metrics = new MetricsTracker();
    this._adaptive = new AdaptiveModelQuality(stt, this._metrics, 'tiny');

    // Forward adaptive events
    this._adaptive.onEvent((event) => {
      console.log(
        `[orchestrator] Adaptive: ${event.type} ${event.from} → ${event.to}: ${event.reason}`
      );
      this.emit('model:switched', event);
    });
  }

  get metrics(): MetricsTracker {
    return this._metrics;
  }

  get adaptive(): AdaptiveModelQuality {
    return this._adaptive;
  }

  /** Called when VAD detects speech start — generates a new pendingId. */
  handleSpeechStart(): string {
    this.currentPendingId = randomUUID();
    this.setStatus('recording');
    return this.currentPendingId;
  }

  /** Enqueue an interim audio snapshot for partial transcription. */
  enqueueInterim(audio: Float32Array): void {
    if (!this.stt.isReady() || !this.currentPendingId) return;

    const chunk: AudioChunk = {
      samples: audio,
      sampleRate: 16000,
      timestamp: Date.now(),
    };

    // Interims are fire-and-forget — don't queue, just attempt
    this.stt
      .transcribe(chunk, { isFinal: false, pendingId: this.currentPendingId })
      .then((segment) => {
        if (segment) {
          this.emit('segment', segment);
        }
      })
      .catch((err) => {
        console.error('[orchestrator] Interim STT error:', err);
      });
  }

  /**
   * Enqueue a final speech segment for STT → Translation pipeline.
   * Applies backpressure: if queue is full, drops oldest chunk.
   */
  enqueue(audio: Float32Array): void {
    const pendingId = this.currentPendingId ?? undefined;
    this.currentPendingId = null;

    const chunk: AudioChunk = {
      samples: audio,
      sampleRate: 16000,
      timestamp: Date.now(),
    };

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      this._metrics.recordDropped();
      console.warn('[orchestrator] Queue full — dropped oldest chunk');
    }

    this.queue.push({ chunk, pendingId });
    this.processNext();
  }

  /** Set a real translator (replaces stub). */
  setTranslator(translator: TranslationService): void {
    this.translator = translator;
  }

  on(event: 'segment', callback: EventCallback<TranscriptSegment>): void;
  on(event: 'metrics', callback: EventCallback<ReturnType<MetricsTracker['getMetrics']>>): void;
  on(event: 'status', callback: EventCallback<StatusValue>): void;
  on(event: 'model:switched', callback: EventCallback<AdaptiveEvent>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: OrchestratorEvent, callback: EventCallback<any>): void {
    const cbs = this.listeners.get(event) ?? [];
    cbs.push(callback);
    this.listeners.set(event, cbs);
  }

  private emit(event: OrchestratorEvent, data: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) cb(data);
    }
  }

  private setStatus(s: StatusValue): void {
    if (s !== this.status) {
      this.status = s;
      this.emit('status', s);
    }
  }

  /**
   * Process the next queued chunk through the STT → Translation pipeline.
   * Concurrent: starts STT for next chunk while translating current.
   */
  private processNext(): void {
    if (this.processingSTT || this.queue.length === 0) return;

    // Pause processing during model switch
    if (this._adaptive.isSwitching()) {
      console.log('[orchestrator] Model switching — pausing queue');
      return;
    }

    this.processingSTT = true;
    this.setStatus('processing');

    const { chunk, pendingId } = this.queue.shift()!;
    const enqueueTime = performance.now();

    const transcribeOpts: TranscribeOptions = { isFinal: true, pendingId };

    this.stt
      .transcribe(chunk, transcribeOpts)
      .then((segment) => {
        this.processingSTT = false;

        if (!segment) {
          // Empty/short — move to next
          this.checkIdle();
          this.processNext();
          return;
        }

        this._metrics.recordSTT(segment.sttLatencyMs);

        // Start next STT immediately (concurrent with translation)
        this.processNext();

        // Run translation
        return this.runTranslation(segment, enqueueTime);
      })
      .catch((err) => {
        console.error('[orchestrator] STT error:', err);
        this.processingSTT = false;
        this.checkIdle();
        this.processNext();
      });
  }

  private async runTranslation(segment: TranscriptSegment, enqueueTime: number): Promise<void> {
    try {
      const t0 = performance.now();
      const translated = await this.translator.translate(segment.text);
      const translationLatency = performance.now() - t0;

      segment.translated = translated;
      segment.translationLatencyMs = translationLatency;
      segment.totalLatencyMs = performance.now() - enqueueTime;

      this._metrics.recordTranslation(translationLatency);
      this._metrics.recordTotal(segment.totalLatencyMs);

      this.emit('segment', segment);
      this.emit('metrics', this._metrics.getMetrics());

      // Evaluate adaptive model quality after each completed cycle
      this._adaptive.evaluate().then(() => {
        // Resume queue in case it was paused during a model switch
        this.processNext();
      });
    } catch (err) {
      console.error('[orchestrator] Translation error:', err);
      // Still emit segment without translation
      segment.totalLatencyMs = performance.now() - enqueueTime;
      this._metrics.recordTotal(segment.totalLatencyMs);
      this.emit('segment', segment);
    }

    this.checkIdle();
  }

  private checkIdle(): void {
    if (!this.processingSTT && this.queue.length === 0 && !this.currentPendingId) {
      this.setStatus('idle');
    }
  }
}
