export interface TranscriptSegment {
  id: string;
  text: string; // Original English text
  translated?: string; // Vietnamese translation
  timestamp: number; // Unix ms
  isFinal: boolean; // false = interim/partial
  speakerId?: string; // Phase 2
  audioDurationMs: number; // Duration of source audio chunk
  sttLatencyMs: number; // whisper processing time
  translationLatencyMs?: number; // Opus-MT processing time
  totalLatencyMs: number; // End-of-speech → text on screen
}

export interface AudioChunk {
  samples: Float32Array; // 16kHz mono float32
  sampleRate: number; // 16000
  timestamp: number; // When VAD detected end-of-speech
}

export interface PipelineMetrics {
  sttP95Ms: number;
  translationP95Ms: number;
  totalP95Ms: number;
  memoryUsageMB: number;
  activeModel: 'tiny' | 'base' | 'small';
  chunksProcessed: number;
  chunksDropped: number;
}

export interface AppSettings {
  audioDeviceId: string | null;
  whisperModel: 'tiny' | 'base' | 'small';
  autoModelSwitch: boolean;
  language: { source: string; target: string };
  ui: { theme: 'light' | 'dark'; fontSize: number };
}

export type IPCEvents = {
  'transcript:segment': TranscriptSegment;
  'pipeline:metrics': PipelineMetrics;
  'pipeline:status': 'idle' | 'recording' | 'processing' | 'error';
  'model:download-progress': {
    model: string;
    percent: number;
    bytesDownloaded: number;
    bytesTotal: number;
  };
  'model:ready': { model: string };
  'audio:devices': MediaDeviceInfo[];
};
