import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      sendAudioChunk: (buffer: ArrayBuffer) => void;
      onPipelineEvent: (callback: (event: string, data: unknown) => void) => () => void;
    };
  }
}
