import { join } from 'path';
import { homedir } from 'os';
import { performance } from 'perf_hooks';
import { pipeline as hfPipeline, env, type TranslationPipeline } from '@huggingface/transformers';
import type { ProgressInfo } from '@huggingface/transformers';
import type { TranslationService, TranslationOptions } from './types';

// Direct model cache into our shared models directory
env.cacheDir = join(homedir(), '.open-translator', 'models', 'hf-cache');
// All models run locally — no remote calls after initial download
env.allowRemoteModels = true; // Needed for first download
env.allowLocalModels = true;

const MODEL_ID = 'Xenova/opus-mt-en-vi';

export class OpusMTTranslator implements TranslationService {
  private translator: TranslationPipeline | null = null;
  private _isReady = false;

  get name(): string {
    return 'opus-mt-en-vi';
  }

  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Initialize translation pipeline.
   * First call downloads ~200MB ONNX model (cached for future).
   * @param onProgress — optional callback for download progress (0–100)
   */
  async init(onProgress?: (percent: number) => void): Promise<void> {
    if (this._isReady) return;

    console.log('[opus-mt] Initializing translation pipeline…');
    const t0 = performance.now();

    this.translator = (await hfPipeline('translation', MODEL_ID, {
      dtype: 'fp32',
      progress_callback: onProgress
        ? (info: ProgressInfo) => {
            if ('progress' in info && typeof info.progress === 'number') {
              onProgress(Math.round(info.progress));
            }
          }
        : undefined,
    })) as TranslationPipeline;

    const loadMs = Math.round(performance.now() - t0);
    console.log(`[opus-mt] Pipeline ready in ${loadMs}ms`);
    this._isReady = true;
  }

  /**
   * Translate English text to Vietnamese.
   * Implements the TranslationService interface used by PipelineOrchestrator.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async translate(text: string, _opts?: TranslationOptions): Promise<string> {
    if (!this.translator) {
      throw new Error('OpusMTTranslator not initialized — call init() first');
    }

    const trimmed = text.trim();
    if (!trimmed) return '';

    const result = await this.translator(trimmed, {
      max_length: 512,
    });

    // Pipeline returns array of { translation_text: string }
    const output = Array.isArray(result) ? result[0] : result;
    return (output as { translation_text: string }).translation_text;
  }

  /**
   * Translate with full timing metadata.
   */
  async translateWithMetrics(
    text: string
  ): Promise<{ translated: string; latencyMs: number; model: string }> {
    const t0 = performance.now();
    const translated = await this.translate(text);
    const latencyMs = performance.now() - t0;
    return { translated, latencyMs, model: MODEL_ID };
  }

  /**
   * Batch translate multiple segments.
   * Hugging Face pipeline supports batched input natively.
   */
  async translateBatch(texts: string[]): Promise<string[]> {
    if (!this.translator) {
      throw new Error('OpusMTTranslator not initialized — call init() first');
    }

    const cleaned = texts.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length === 0) return [];

    const results = await this.translator(cleaned, { max_length: 512 });
    const arr = Array.isArray(results) ? results : [results];
    return arr.map((r) => (r as { translation_text: string }).translation_text);
  }

  free(): void {
    this.translator = null;
    this._isReady = false;
    console.log('[opus-mt] Translator freed');
  }
}
