import { ipcMain, BrowserWindow } from 'electron';
import { ModelManager } from '@main/models';
import { AudioPipeline } from '@main/audio';
import { WhisperSTT } from '@main/stt';
import { PipelineOrchestrator, PipelineErrorHandler } from '@main/pipeline';
import { OpusMTTranslator } from '@main/translation';
import { loadSettings, updateSettings } from '@main/storage';
import type { AppSettings } from '@shared/types';

const audioChunkListeners: ((samples: Float32Array) => void)[] = [];
const modelManager = new ModelManager();
const errorHandler = new PipelineErrorHandler();

// --- Session state (persists across start/stop for quick restart) ---
let pipeline: AudioPipeline | null = null;
let stt: WhisperSTT | null = null;
let orchestrator: PipelineOrchestrator | null = null;
let translator: OpusMTTranslator | null = null;
let modelsLoaded = false;
let sessionActive = false;
let metricsInterval: ReturnType<typeof setInterval> | null = null;

const METRICS_INTERVAL_MS = 5000;

function sendToRenderer(event: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('pipeline:event', event, data);
}

function startMetricsInterval(): void {
  stopMetricsInterval();
  metricsInterval = setInterval(() => {
    if (orchestrator) {
      sendToRenderer('pipeline:metrics', orchestrator.metrics.getMetrics());
    }
  }, METRICS_INTERVAL_MS);
}

function stopMetricsInterval(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

export function getModelManager(): ModelManager {
  return modelManager;
}

/**
 * Lazily initialize all models and wire the pipeline.
 * Called on the first session:start. Subsequent starts reuse loaded models.
 */
async function ensureModels(): Promise<void> {
  if (modelsLoaded) return;

  sendToRenderer('pipeline:status', 'loading');

  // Init audio pipeline (resample + VAD)
  pipeline = new AudioPipeline();
  await pipeline.init();

  // Init STT and translator in parallel
  stt = new WhisperSTT(modelManager);
  const opusMT = new OpusMTTranslator();

  await Promise.all([
    stt.init('tiny.en'),
    opusMT.init((percent) => {
      sendToRenderer('model:download-progress', {
        model: 'opus-mt-en-vi',
        percent,
        bytesDownloaded: 0,
        bytesTotal: 0,
      });
    }),
  ]);

  translator = opusMT;
  errorHandler.setStt(stt);
  errorHandler.setTranslator(translator);

  // Create orchestrator with both services
  orchestrator = new PipelineOrchestrator(stt, translator);
  orchestrator.metrics.setActiveModel('tiny.en');

  // Forward orchestrator events → renderer
  orchestrator.on('segment', (segment) => sendToRenderer('transcript:segment', segment));
  orchestrator.on('metrics', (metrics) => sendToRenderer('pipeline:metrics', metrics));
  orchestrator.on('status', (status) => sendToRenderer('pipeline:status', status));
  orchestrator.on('model:switched', (event) => sendToRenderer('model:switched', event));

  // Wire VAD events → orchestrator
  pipeline.onSpeechStart(() => {
    orchestrator!.handleSpeechStart();
    sendToRenderer('vad:status', { speaking: true });
  });
  pipeline.onSpeechActive((audio) => {
    orchestrator!.enqueueInterim(audio);
  });
  pipeline.onSpeechEnd((audio) => {
    const durationMs = (audio.length / 16000) * 1000;
    console.log(`[pipeline] Speech ended: ${audio.length} samples (${durationMs.toFixed(0)}ms)`);
    sendToRenderer('vad:status', { speaking: false });
    sendToRenderer('speech:segment', { samples: audio.length, durationMs });
    orchestrator!.enqueue(audio);
  });

  modelsLoaded = true;
  sendToRenderer('model:ready', { model: 'all' });
  console.log('[session] All models loaded');
}

export function registerIPCHandlers(): void {
  ipcMain.handle('ping', () => 'pong');

  ipcMain.on('audio:chunk', (_event, buffer: ArrayBuffer) => {
    const samples = new Float32Array(buffer);
    for (const listener of audioChunkListeners) {
      listener(samples);
    }
  });

  ipcMain.handle('model:ensure', async (_event, name: string) => {
    const window = BrowserWindow.getFocusedWindow();
    const path = await modelManager.ensureModel(name, (progress) => {
      window?.webContents.send('pipeline:event', 'model:download-progress', progress);
    });
    window?.webContents.send('pipeline:event', 'model:ready', { model: name });
    return path;
  });

  ipcMain.handle('model:is-cached', (_event, name: string) => {
    return modelManager.isModelCached(name);
  });

  ipcMain.handle('model:get-path', (_event, name: string) => {
    return modelManager.getModelPath(name);
  });

  ipcMain.handle('model:delete', (_event, name: string) => {
    modelManager.deleteModel(name);
  });

  // --- Session lifecycle ---

  ipcMain.handle('session:start', async () => {
    if (sessionActive) return { success: true };

    try {
      await ensureModels();
      pipeline!.reset();
      sessionActive = true;
      errorHandler.resetRetries();
      startMetricsInterval();
      sendToRenderer('pipeline:status', 'recording');
      console.log('[session] Started');
      return { success: true };
    } catch (err) {
      const handled = await errorHandler.handleError('model-load', err);
      if (handled) {
        // Error handler may have switched to a smaller model — retry once
        try {
          await ensureModels();
          pipeline!.reset();
          sessionActive = true;
          startMetricsInterval();
          sendToRenderer('pipeline:status', 'recording');
          return { success: true };
        } catch (retryErr) {
          await errorHandler.handleError('model-load', retryErr);
        }
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[session] Failed to start:', err);
      sendToRenderer('pipeline:status', 'error');
      return { success: false, error: message };
    }
  });

  ipcMain.handle('session:stop', async () => {
    if (!sessionActive) return { success: true };

    sessionActive = false;
    stopMetricsInterval();
    pipeline?.flush();
    sendToRenderer('pipeline:status', 'idle');
    console.log('[session] Stopped');
    return { success: true };
  });

  // --- Settings ---

  ipcMain.handle('settings:get', () => {
    return loadSettings();
  });

  ipcMain.handle('settings:update', (_event, partial: Partial<AppSettings>) => {
    return updateSettings(partial);
  });

  // --- Model switch (from settings) ---

  ipcMain.handle(
    'model:switch-whisper',
    async (_event, modelName: 'tiny' | 'tiny.en' | 'base' | 'base.en' | 'small' | 'small.en') => {
      if (!stt) return { success: false, error: 'STT not initialized' };

      try {
        sendToRenderer('pipeline:status', 'loading');
        await stt.switchModel(modelName);
        orchestrator?.metrics.setActiveModel(modelName);
        // Persist the base model name (strip .en)
        const baseModel = modelName.replace('.en', '') as 'tiny' | 'base' | 'small';
        updateSettings({ whisperModel: baseModel });
        sendToRenderer('pipeline:status', sessionActive ? 'recording' : 'idle');
        console.log(`[settings] Whisper model switched to ${modelName}`);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[settings] Model switch failed:', err);
        sendToRenderer('pipeline:status', sessionActive ? 'recording' : 'idle');
        return { success: false, error: message };
      }
    }
  );
}

export function onAudioChunk(callback: (samples: Float32Array) => void): void {
  audioChunkListeners.push(callback);
}

/** Feed audio into the pipeline — only processes when session is active. */
export function feedAudio(samples: Float32Array): void {
  if (!sessionActive || !pipeline) return;
  pipeline.feed(samples).catch((err) => {
    errorHandler.handleError('audio', err);
  });
}
