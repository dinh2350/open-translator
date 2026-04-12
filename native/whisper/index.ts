import { resolve, join } from 'path';

// Load the native addon from the build directory
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(resolve(__dirname, 'build', 'Release', 'whisper_addon.node'));

export interface TranscribeSegment {
  start: number; // ms
  end: number; // ms
  text: string;
}

export interface TranscribeResult {
  text: string;
  segments: TranscribeSegment[];
  language: string;
  processingTimeMs: number;
}

export interface WhisperModelOptions {
  gpu?: boolean;
  nThreads?: number;
}

export interface TranscribeOptions {
  language?: string;
}

export class WhisperModel {
  private native: InstanceType<typeof addon.WhisperModel>;

  constructor(modelPath: string, options?: WhisperModelOptions) {
    const resolvedPath = resolve(modelPath);
    this.native = new addon.WhisperModel(resolvedPath, {
      gpu: options?.gpu ?? true,
      nThreads: options?.nThreads ?? 4,
    });
  }

  async transcribe(audio: Float32Array, options?: TranscribeOptions): Promise<TranscribeResult> {
    if (!this.native.isLoaded()) {
      throw new Error('Model has been freed');
    }
    return this.native.transcribe(audio, {
      language: options?.language ?? 'en',
    });
  }

  isLoaded(): boolean {
    return this.native.isLoaded();
  }

  free(): void {
    this.native.free();
  }
}

/**
 * Get the default models directory path.
 * Models are stored in ~/.open-translator/models/
 */
export function getModelsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return join(home, '.open-translator', 'models');
}
