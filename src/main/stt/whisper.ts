import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import type { AudioChunk, TranscriptSegment } from '@shared/types';
import { ModelManager } from '@main/models';

// The native addon path resolves from the project root at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WhisperModel } = require(
  resolve(__dirname, '../../native/whisper/build/Release/whisper_addon.node')
);

type WhisperModelType = InstanceType<typeof WhisperModel>;

const MIN_SPEECH_SAMPLES = 8000; // 0.5s at 16kHz — skip very short segments
const MAX_SPEECH_SAMPLES = 480000; // 30s at 16kHz — warn on very long segments

export type WhisperModelName = 'tiny' | 'tiny.en' | 'base' | 'base.en' | 'small' | 'small.en';

export interface TranscribeOptions {
  /** Whether this is the final transcription for the utterance (default: true) */
  isFinal?: boolean;
  /** Shared ID grouping interim + final segments for the same utterance */
  pendingId?: string;
}

export class WhisperSTT {
  private model: WhisperModelType | null = null;
  private modelManager: ModelManager;
  private currentModelName: WhisperModelName | null = null;
  private transcribing = false;
  private transcribeQueue: (() => void)[] = [];

  constructor(modelManager: ModelManager) {
    this.modelManager = modelManager;
  }

  async init(modelName: WhisperModelName = 'base.en'): Promise<void> {
    const registryKey = `whisper-${modelName}`;
    const modelPath = await this.modelManager.ensureModel(registryKey);

    console.log(`[whisper] Loading model ${modelName} from ${modelPath}`);
    const t0 = performance.now();

    this.model = new WhisperModel(modelPath, { gpu: false, nThreads: 4 });
    this.currentModelName = modelName;

    console.log(`[whisper] Model loaded in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  async transcribe(
    audio: AudioChunk,
    options: TranscribeOptions = {}
  ): Promise<TranscriptSegment | null> {
    if (!this.model) {
      throw new Error('WhisperSTT not initialized. Call init() first.');
    }

    const { isFinal = true, pendingId } = options;

    // Skip if already transcribing an interim — avoid queuing up work
    if (!isFinal && this.transcribing) {
      return null;
    }

    // Serialize access to the native model — concurrent calls crash GGML
    if (this.transcribing) {
      await new Promise<void>((resolve) => {
        this.transcribeQueue.push(resolve);
      });
    }

    const sampleCount = audio.samples.length;

    // Skip very short segments (< 0.5s) — likely VAD false positives
    if (sampleCount < MIN_SPEECH_SAMPLES) {
      console.log(
        `[whisper] Skipping short segment: ${sampleCount} samples ` +
          `(${((sampleCount / audio.sampleRate) * 1000).toFixed(0)}ms)`
      );
      return null;
    }

    if (sampleCount > MAX_SPEECH_SAMPLES) {
      console.warn(
        `[whisper] Long segment: ${sampleCount} samples ` +
          `(${((sampleCount / audio.sampleRate) * 1000).toFixed(0)}ms)`
      );
    }

    this.transcribing = true;
    try {
      const start = performance.now();
      const result = await this.model.transcribe(audio.samples, { language: 'en' });
      const sttLatency = performance.now() - start;

      const text = result.text.trim();

      // Skip empty transcriptions (silence misdetected as speech)
      if (!text) {
        console.log(`[whisper] Empty transcription, skipping (${sttLatency.toFixed(0)}ms)`);
        return null;
      }

      const audioDurationMs = (sampleCount / audio.sampleRate) * 1000;
      const tag = isFinal ? 'final' : 'interim';

      console.log(
        `[whisper] [${tag}] "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}" ` +
          `(${audioDurationMs.toFixed(0)}ms audio → ${sttLatency.toFixed(0)}ms STT)`
      );

      return {
        id: randomUUID(),
        text,
        timestamp: audio.timestamp,
        isFinal,
        pendingId,
        audioDurationMs,
        sttLatencyMs: sttLatency,
        totalLatencyMs: sttLatency, // Translation latency added later by pipeline
      };
    } finally {
      this.transcribing = false;
      // Wake up next waiting caller
      const next = this.transcribeQueue.shift();
      if (next) next();
    }
  }

  async switchModel(modelName: WhisperModelName): Promise<void> {
    if (modelName === this.currentModelName) return;

    console.log(`[whisper] Switching model: ${this.currentModelName} → ${modelName}`);
    this.free();
    await this.init(modelName);
  }

  isReady(): boolean {
    return this.model !== null;
  }

  getModelName(): WhisperModelName | null {
    return this.currentModelName;
  }

  free(): void {
    if (this.model) {
      this.model.free();
      this.model = null;
      this.currentModelName = null;
      console.log('[whisper] Model freed');
    }
  }
}
