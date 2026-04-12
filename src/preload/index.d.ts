import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      sendAudioChunk: (buffer: ArrayBuffer) => void;
      sessionStart: () => Promise<{ success: boolean; error?: string }>;
      sessionStop: () => Promise<{ success: boolean }>;
      onPipelineEvent: (callback: (event: string, data: unknown) => void) => () => void;
    };
  }
}
