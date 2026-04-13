import { BrowserWindow } from 'electron';
import { logError } from './logger';
import type { WhisperSTT } from '@main/stt';
import type { TranslationService } from '@main/translation/types';

type ErrorCategory = 'audio' | 'model-download' | 'model-load' | 'stt' | 'translation' | 'pipeline';

interface RetryState {
  attempts: number;
  lastAttemptMs: number;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function sendToRenderer(event: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('pipeline:event', event, data);
}

/**
 * Centralized error handler for the pipeline.
 *
 * Classifies errors as recoverable or fatal, applies retry with backoff,
 * reports user-friendly messages to the renderer, and logs to file.
 */
export class PipelineErrorHandler {
  private retryState = new Map<string, RetryState>();
  private stt: WhisperSTT | null = null;
  private translator: TranslationService | null = null;

  setStt(stt: WhisperSTT): void {
    this.stt = stt;
  }

  setTranslator(translator: TranslationService): void {
    this.translator = translator;
  }

  /**
   * Handle an error from the given category.
   * Returns true if the error was handled and the caller should continue,
   * false if the caller should stop/surface the error.
   */
  async handleError(
    category: ErrorCategory,
    error: unknown,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    logError('error', category, error, context);

    switch (category) {
      case 'audio':
        return this.handleAudioError(error);
      case 'model-download':
        return this.handleModelDownloadError(error);
      case 'model-load':
        return this.handleModelLoadError(error);
      case 'stt':
        return this.handleSTTError(error);
      case 'translation':
        return this.handleTranslationError(error);
      case 'pipeline':
        return this.handlePipelineError(error);
      default:
        this.notifyUser('error', 'An unexpected error occurred');
        return false;
    }
  }

  // --- Audio errors ---

  private handleAudioError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('Permission') ||
      message.includes('permission') ||
      message.includes('NotAllowedError')
    ) {
      this.notifyUser(
        'error',
        'Microphone permission denied. Grant access in System Settings → Privacy & Security → Microphone.'
      );
      return false; // Cannot recover without user action
    }

    if (message.includes('NotFoundError') || message.includes('no audio input')) {
      this.notifyUser('error', 'No microphone found. Connect a microphone and try again.');
      return false;
    }

    if (message.includes('disconnect') || message.includes('DeviceLost')) {
      this.notifyUser('warn', 'Microphone disconnected. Reconnect to resume recording.');
      return true; // Can recover via hot-plug
    }

    this.notifyUser('error', `Audio error: ${message}`);
    return false;
  }

  // --- Model download errors ---

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async handleModelDownloadError(_error: unknown): Promise<boolean> {
    const key = 'model-download';
    const state = this.getRetryState(key);

    if (state.attempts < MAX_RETRIES) {
      state.attempts++;
      state.lastAttemptMs = Date.now();
      this.retryState.set(key, state);

      const backoff = BASE_BACKOFF_MS * Math.pow(2, state.attempts - 1);
      this.notifyUser(
        'warn',
        `Model download failed. Retrying in ${(backoff / 1000).toFixed(0)}s… (${state.attempts}/${MAX_RETRIES})`
      );

      await this.delay(backoff);
      return true; // Caller should retry
    }

    this.notifyUser(
      'error',
      'Model download failed after 3 attempts. Check your internet connection and try again.'
    );
    this.retryState.delete(key);
    return false;
  }

  // --- Model load errors ---

  private async handleModelLoadError(error: unknown): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);

    // Out of memory — try smaller model
    if (message.includes('memory') || message.includes('alloc') || message.includes('ENOMEM')) {
      if (this.stt) {
        const current = this.stt.getModelName();
        if (current && !current.startsWith('tiny')) {
          this.notifyUser('warn', 'Not enough memory for current model. Switching to tiny model…');
          try {
            await this.stt.switchModel('tiny.en');
            return true;
          } catch (switchErr) {
            logError('error', 'model-load', switchErr, { action: 'fallback-to-tiny' });
          }
        }
      }

      this.notifyUser(
        'error',
        'Not enough memory to load any model. Close other apps and try again.'
      );
      return false;
    }

    // Corrupt model file
    if (message.includes('invalid') || message.includes('corrupt') || message.includes('magic')) {
      this.notifyUser('warn', 'Model file appears corrupt. It will be re-downloaded.');
      return true; // Caller should delete and re-download
    }

    this.notifyUser('error', `Failed to load model: ${message}`);
    return false;
  }

  // --- STT errors ---

  private async handleSTTError(error: unknown): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const key = 'stt';
    const state = this.getRetryState(key);

    // Native addon crash — reinitialize
    if (
      message.includes('SIGSEGV') ||
      message.includes('SIGABRT') ||
      message.includes('abort') ||
      message.includes('N-API')
    ) {
      if (this.stt && state.attempts < MAX_RETRIES) {
        state.attempts++;
        this.retryState.set(key, state);

        this.notifyUser('warn', 'STT engine crashed. Reinitializing…');
        try {
          const model = this.stt.getModelName() ?? 'tiny.en';
          this.stt.free();
          await this.stt.init(model);
          this.retryState.delete(key);
          return true;
        } catch (reinitErr) {
          logError('error', 'stt', reinitErr, { action: 'reinit-after-crash' });
        }
      }

      this.notifyUser('error', 'STT engine failed repeatedly. Please restart the app.');
      return false;
    }

    // Timeout handled externally — just log and continue
    if (message.includes('timeout') || message.includes('Timeout')) {
      this.notifyUser('warn', 'Transcription timed out. Skipping chunk.');
      logError('warn', 'stt', error, { action: 'timeout-skip' });
      return true; // Skip this chunk, continue pipeline
    }

    // Any other STT error — skip the chunk
    logError('warn', 'stt', error, { action: 'skip-chunk' });
    return true; // Continue with next chunk
  }

  // --- Translation errors ---

  private async handleTranslationError(error: unknown): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const key = 'translation';
    const state = this.getRetryState(key);

    // ONNX Runtime crash — reinitialize
    if (message.includes('ONNX') || message.includes('runtime') || message.includes('Session')) {
      if (this.translator && state.attempts < MAX_RETRIES) {
        state.attempts++;
        this.retryState.set(key, state);

        this.notifyUser('warn', 'Translation engine crashed. Reinitializing…');
        try {
          this.translator.free();
          await this.translator.init();
          this.retryState.delete(key);
          return true;
        } catch (reinitErr) {
          logError('error', 'translation', reinitErr, { action: 'reinit-after-crash' });
        }
      }

      this.notifyUser('error', 'Translation engine failed. Showing original text only.');
      return false;
    }

    // Any other translation error — show original text
    logError('warn', 'translation', error, { action: 'show-original' });
    return true; // Continue with untranslated text
  }

  // --- Pipeline errors (backpressure, memory) ---

  private handlePipelineError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('backpressure') || message.includes('queue')) {
      this.notifyUser('warn', 'Processing is slow. Some audio may be skipped.');
      return true;
    }

    if (message.includes('memory')) {
      this.notifyUser('warn', 'Memory pressure detected. Switching to lighter model.');
      return true;
    }

    logError('warn', 'pipeline', error);
    return true; // Keep pipeline running
  }

  // --- Utilities ---

  /** Reset retry counters (e.g. after successful operation). */
  resetRetries(category?: string): void {
    if (category) {
      this.retryState.delete(category);
    } else {
      this.retryState.clear();
    }
  }

  private getRetryState(key: string): RetryState {
    return this.retryState.get(key) ?? { attempts: 0, lastAttemptMs: 0 };
  }

  private notifyUser(level: 'warn' | 'error', message: string): void {
    sendToRenderer('pipeline:error', { level, message, timestamp: Date.now() });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
