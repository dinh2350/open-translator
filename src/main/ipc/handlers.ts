import { ipcMain, BrowserWindow } from 'electron';
import { ModelManager } from '@main/models';
import { AudioPipeline } from '@main/audio';
import { WhisperSTT } from '@main/stt';
import { PipelineOrchestrator } from '@main/pipeline';
import { OpusMTTranslator } from '@main/translation';

const audioChunkListeners: ((samples: Float32Array) => void)[] = [];
const modelManager = new ModelManager();

// --- Session state (persists across start/stop for quick restart) ---
let pipeline: AudioPipeline | null = null;
let stt: WhisperSTT | null = null;
let orchestrator: PipelineOrchestrator | null = null;
let translator: OpusMTTranslator | null = null;
let modelsLoaded = false;
let sessionActive = false;

function sendToRenderer(event: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('pipeline:event', event, data);
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
      sendToRenderer('pipeline:status', 'recording');
      console.log('[session] Started');
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[session] Failed to start:', err);
      sendToRenderer('pipeline:status', 'error');
      return { success: false, error: message };
    }
  });

  ipcMain.handle('session:stop', async () => {
    if (!sessionActive) return { success: true };

    sessionActive = false;
    pipeline?.flush();
    sendToRenderer('pipeline:status', 'idle');
    console.log('[session] Stopped');
    return { success: true };
  });
}

export function onAudioChunk(callback: (samples: Float32Array) => void): void {
  audioChunkListeners.push(callback);
}

/** Feed audio into the pipeline — only processes when session is active. */
export function feedAudio(samples: Float32Array): void {
  if (!sessionActive || !pipeline) return;
  pipeline.feed(samples).catch((err) => {
    console.error('[pipeline] Error processing audio:', err);
  });
}
