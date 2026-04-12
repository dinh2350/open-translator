import type { TranslationService, TranslationOptions } from './types';

/**
 * Phase 2 placeholder: Ollama + Qwen2.5-3B for context-aware translation.
 * Will connect to a local Ollama instance for higher-quality, context-aware
 * translations that handle technical terms and meeting jargon better than Opus-MT.
 */
export class OllamaTranslator implements TranslationService {
  private _isReady = false;

  get name(): string {
    return 'ollama-qwen2.5-3b';
  }

  get isReady(): boolean {
    return this._isReady;
  }

  async init(): Promise<void> {
    throw new Error('OllamaTranslator not yet implemented — Phase 2');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async translate(_text: string, _opts?: TranslationOptions): Promise<string> {
    throw new Error('OllamaTranslator not yet implemented — Phase 2');
  }

  free(): void {
    this._isReady = false;
  }
}
