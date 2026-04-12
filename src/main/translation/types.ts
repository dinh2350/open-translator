export interface TranslationService {
  init(): Promise<void>;
  translate(text: string, opts?: TranslationOptions): Promise<string>;
  free(): void;
  readonly name: string;
  readonly isReady: boolean;
}

export interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  maxLength?: number;
}

export interface TranslationResult {
  translated: string;
  latencyMs: number;
  model: string;
}
