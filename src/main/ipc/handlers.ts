import { ipcMain } from 'electron';

const audioChunkListeners: ((samples: Float32Array) => void)[] = [];

export function registerIPCHandlers(): void {
  ipcMain.handle('ping', () => 'pong');

  ipcMain.on('audio:chunk', (_event, buffer: ArrayBuffer) => {
    const samples = new Float32Array(buffer);
    for (const listener of audioChunkListeners) {
      listener(samples);
    }
  });
}

export function onAudioChunk(callback: (samples: Float32Array) => void): void {
  audioChunkListeners.push(callback);
}
