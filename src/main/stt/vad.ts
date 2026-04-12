import * as ort from 'onnxruntime-node';
import { join } from 'path';
import { app } from 'electron';
import { is } from '@electron-toolkit/utils';

/**
 * Silero VAD v5 wrapper for the Electron main process.
 * Uses onnxruntime-node (native) for fast inference.
 *
 * Architecture decision: Option B — VAD in main process.
 * @ricky0123/vad-node is deprecated (Oct 2024), so we use the
 * Silero ONNX model directly with onnxruntime-node.
 *
 * Model inputs:  input [1, N], state [2, 1, 128], sr [16000n]
 * Model outputs: output (speech probability), stateN (updated state)
 * Frame size: 512 samples (32ms at 16kHz)
 */

/** Tunable VAD parameters */
export interface VADOptions {
  /** Speech probability threshold to start speech (0-1) */
  positiveSpeechThreshold: number;
  /** Speech probability threshold to end speech (0-1) */
  negativeSpeechThreshold: number;
  /** Grace period before declaring end-of-speech (ms) */
  redemptionMs: number;
  /** Audio to prepend before detected speech start (ms) */
  preSpeechPadMs: number;
  /** Minimum speech duration to emit (ms) — avoids false positives */
  minSpeechMs: number;
}

const DEFAULT_OPTIONS: VADOptions = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 240,
  preSpeechPadMs: 160,
  minSpeechMs: 100,
};

/** Frame size for Silero VAD v5 at 16kHz */
const FRAME_SIZE = 512;
/** Milliseconds per frame at 16kHz */
const MS_PER_FRAME = (FRAME_SIZE / 16000) * 1000; // 32ms

type SpeechStartCallback = () => void;
type SpeechEndCallback = (audio: Float32Array) => void;

export class VoiceActivityDetector {
  private session: ort.InferenceSession | null = null;
  private state: ort.Tensor | null = null;
  private sr: ort.Tensor | null = null;
  private options: VADOptions;

  // Frame processor state
  private speaking = false;
  private audioBuffer: { frame: Float32Array; isSpeech: boolean }[] = [];
  private redemptionCounter = 0;
  private speechFrameCount = 0;
  private redemptionFrames: number;
  private preSpeechPadFrames: number;
  private minSpeechFrames: number;

  // Callbacks
  private onSpeechStartCallbacks: SpeechStartCallback[] = [];
  private onSpeechEndCallbacks: SpeechEndCallback[] = [];

  constructor(options?: Partial<VADOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.redemptionFrames = Math.floor(this.options.redemptionMs / MS_PER_FRAME);
    this.preSpeechPadFrames = Math.floor(this.options.preSpeechPadMs / MS_PER_FRAME);
    this.minSpeechFrames = Math.floor(this.options.minSpeechMs / MS_PER_FRAME);
  }

  async init(): Promise<void> {
    const modelPath = is.dev
      ? join(process.cwd(), 'resources/models/silero_vad_v5.onnx')
      : join(app.getAppPath(), '..', 'resources/models/silero_vad_v5.onnx');

    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    });

    this.sr = new ort.Tensor('int64', BigInt64Array.from([16000n]), [1]);
    this.resetState();
  }

  private resetState(): void {
    const zeroes = new Float32Array(2 * 1 * 128);
    this.state = new ort.Tensor('float32', zeroes, [2, 1, 128]);
  }

  /**
   * Process a single 512-sample frame through the Silero VAD model.
   * Returns speech probability (0-1).
   */
  private async runModel(frame: Float32Array): Promise<number> {
    if (!this.session || !this.state || !this.sr) {
      throw new Error('VAD not initialized. Call init() first.');
    }

    const inputTensor = new ort.Tensor('float32', frame, [1, frame.length]);
    const result = await this.session.run({
      input: inputTensor,
      state: this.state,
      sr: this.sr,
    });

    if (!result['stateN']) {
      throw new Error('No state output from VAD model');
    }
    this.state = result['stateN'] as ort.Tensor;

    const output = result['output']?.data;
    if (!output || typeof output[0] !== 'number') {
      throw new Error('Invalid output from VAD model');
    }

    return output[0] as number;
  }

  /**
   * Process resampled 16kHz audio through the VAD.
   * Audio is split into 512-sample frames and processed sequentially.
   * Emits speechStart/speechEnd events via registered callbacks.
   */
  async processAudio(samples: Float32Array): Promise<void> {
    // Split input into FRAME_SIZE chunks
    for (let offset = 0; offset + FRAME_SIZE <= samples.length; offset += FRAME_SIZE) {
      const frame = samples.slice(offset, offset + FRAME_SIZE);
      await this.processFrame(frame);
    }
  }

  private async processFrame(frame: Float32Array): Promise<void> {
    const probability = await this.runModel(frame);
    const isSpeech = probability >= this.options.positiveSpeechThreshold;

    this.audioBuffer.push({ frame, isSpeech });

    if (isSpeech) {
      this.speechFrameCount++;
      this.redemptionCounter = 0;
    }

    // Speech start
    if (isSpeech && !this.speaking) {
      this.speaking = true;
      for (const cb of this.onSpeechStartCallbacks) {
        cb();
      }
    }

    // Speech end detection
    if (
      probability < this.options.negativeSpeechThreshold &&
      this.speaking &&
      ++this.redemptionCounter >= this.redemptionFrames
    ) {
      this.emitSpeechEnd();
    }

    // Trim pre-speech buffer when not speaking
    if (!this.speaking) {
      while (this.audioBuffer.length > this.preSpeechPadFrames) {
        this.audioBuffer.shift();
      }
      this.speechFrameCount = 0;
    }
  }

  private emitSpeechEnd(): void {
    this.redemptionCounter = 0;
    this.speechFrameCount = 0;
    this.speaking = false;

    const audioBuffer = this.audioBuffer;
    this.audioBuffer = [];

    const speechFrameCount = audioBuffer.reduce((acc, item) => (item.isSpeech ? acc + 1 : acc), 0);

    if (speechFrameCount >= this.minSpeechFrames) {
      const audio = concatFloat32Arrays(audioBuffer.map((item) => item.frame));
      for (const cb of this.onSpeechEndCallbacks) {
        cb(audio);
      }
    }
  }

  onSpeechStart(callback: SpeechStartCallback): void {
    this.onSpeechStartCallbacks.push(callback);
  }

  onSpeechEnd(callback: SpeechEndCallback): void {
    this.onSpeechEndCallbacks.push(callback);
  }

  /** Flush any in-progress speech segment (e.g., on mic stop) */
  flush(): void {
    if (this.speaking) {
      this.emitSpeechEnd();
    }
  }

  /** Reset all state for a new session */
  reset(): void {
    this.speaking = false;
    this.audioBuffer = [];
    this.redemptionCounter = 0;
    this.speechFrameCount = 0;
    this.resetState();
  }

  async destroy(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.state = null;
    this.sr = null;
    this.onSpeechStartCallbacks = [];
    this.onSpeechEndCallbacks = [];
  }
}

function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
