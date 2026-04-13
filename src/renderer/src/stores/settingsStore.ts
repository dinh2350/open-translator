import { create } from 'zustand';
import { MicrophoneCapture } from '@renderer/audio/microphone';
import type { AppSettings } from '@shared/types';

interface SettingsState {
  // Persisted settings
  settings: AppSettings;
  loaded: boolean;

  // Runtime-only state
  selectedDeviceId: string | null;
  availableDevices: MediaDeviceInfo[];
  syncScroll: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setSelectedDevice: (id: string) => void;
  setSyncScroll: (enabled: boolean) => void;
  refreshDevices: () => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  audioDeviceId: null,
  whisperModel: 'tiny',
  autoModelSwitch: true,
  language: { source: 'en', target: 'vi' },
  ui: { theme: 'system', fontSize: 16 },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  selectedDeviceId: null,
  availableDevices: [],
  syncScroll: false,

  loadSettings: async () => {
    try {
      const settings = await window.api.getSettings();
      set({
        settings,
        selectedDeviceId: settings.audioDeviceId,
        loaded: true,
      });
    } catch (err) {
      console.error('[settingsStore] Failed to load settings:', err);
      set({ loaded: true });
    }
  },

  updateSettings: async (partial) => {
    try {
      const updated = await window.api.updateSettings(partial);
      set({ settings: updated });
    } catch (err) {
      console.error('[settingsStore] Failed to save settings:', err);
    }
  },

  setSelectedDevice: (id: string) => {
    set({ selectedDeviceId: id });
    // Persist to disk
    get().updateSettings({ audioDeviceId: id });
  },

  setSyncScroll: (enabled: boolean) => {
    set({ syncScroll: enabled });
  },

  refreshDevices: async () => {
    const devices = await MicrophoneCapture.listDevices();
    set((state) => {
      const stillExists = devices.some((d) => d.deviceId === state.selectedDeviceId);
      return {
        availableDevices: devices,
        selectedDeviceId: stillExists ? state.selectedDeviceId : (devices[0]?.deviceId ?? null),
      };
    });
  },
}));
