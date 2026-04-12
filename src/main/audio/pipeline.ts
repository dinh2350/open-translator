import { AudioProcessor } from '@main/audio/processor';
import { VoiceActivityDetector, VADOptions } from '@main/stt/vad';

/**
 * Initial audio pipeline: AudioCapture IPC → Resample → VAD → Speech chunks
 * Full Pipeline Orchestrator with STT + Translation comes in Sprint 2 (Task 2.5).
 */
export class AudioPipeline {
  private processor: AudioProcessor;
  private vad: VoiceActivityDetector;
  private initialized = false;

  constructor(vadOptions?: Partial<VADOptions>) {
    this.processor = new AudioProcessor(48000, 16000);
    this.vad = new VoiceActivityDetector(vadOptions);
  }

  async init(): Promise<void> {
    await this.vad.init();
    this.initialized = true;
    console.log('[pipeline] Audio pipeline initialized');
  }

  /**
   * Feed raw 48kHz audio from the microphone IPC channel.
   * Resamples to 16kHz and runs through VAD.
   */
  async feed(samples48kHz: Float32Array): Promise<void> {
    if (!this.initialized) {
      throw new Error('Pipeline not initialized. Call init() first.');
    }

    const resampled = this.processor.resample(samples48kHz);
    await this.vad.processAudio(resampled);
  }

  /** Register callback for when speech starts */
  onSpeechStart(callback: () => void): void {
    this.vad.onSpeechStart(callback);
  }

  /** Register callback for when speech ends — receives 16kHz mono audio of the speech segment */
  onSpeechEnd(callback: (audio: Float32Array) => void): void {
    this.vad.onSpeechEnd(callback);
  }

  /** Register callback for interim audio every ~1s during active speech */
  onSpeechActive(callback: (audio: Float32Array) => void): void {
    this.vad.onSpeechActive(callback);
  }

  /** Flush any in-progress speech segment */
  flush(): void {
    this.vad.flush();
  }

  /** Reset pipeline state for a new session */
  reset(): void {
    this.vad.reset();
  }

  async destroy(): Promise<void> {
    await this.vad.destroy();
    this.initialized = false;
  }
}
