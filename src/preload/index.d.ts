import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      sendAudioChunk: (buffer: ArrayBuffer) => void;
      sessionStart: () => Promise<{ success: boolean; error?: string }>;
      sessionStop: () => Promise<{ success: boolean }>;
      getSettings: () => Promise<import('@shared/types').AppSettings>;
      updateSettings: (
        partial: Partial<import('@shared/types').AppSettings>
      ) => Promise<import('@shared/types').AppSettings>;
      switchWhisperModel: (model: string) => Promise<{ success: boolean; error?: string }>;
      onPipelineEvent: (callback: (event: string, data: unknown) => void) => () => void;
    };
  }
}
