import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  sendAudioChunk: (buffer: ArrayBuffer): void => {
    ipcRenderer.send('audio:chunk', buffer);
  },
  onPipelineEvent: (callback: (event: string, data: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, eventName: string, data: unknown): void => {
      callback(eventName, data);
    };
    ipcRenderer.on('pipeline:event', handler);
    return () => {
      ipcRenderer.removeListener('pipeline:event', handler);
    };
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
