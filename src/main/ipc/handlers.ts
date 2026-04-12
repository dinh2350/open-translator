import { ipcMain, BrowserWindow } from 'electron';
import { ModelManager } from '@main/models';

const audioChunkListeners: ((samples: Float32Array) => void)[] = [];
const modelManager = new ModelManager();

export function getModelManager(): ModelManager {
  return modelManager;
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
}

export function onAudioChunk(callback: (samples: Float32Array) => void): void {
  audioChunkListeners.push(callback);
}
