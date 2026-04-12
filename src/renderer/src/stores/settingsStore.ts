import { create } from 'zustand';
import { MicrophoneCapture } from '@renderer/audio/microphone';

interface SettingsState {
  selectedDeviceId: string | null;
  availableDevices: MediaDeviceInfo[];
  syncScroll: boolean;
  setSelectedDevice: (id: string) => void;
  setSyncScroll: (enabled: boolean) => void;
  refreshDevices: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  selectedDeviceId: null,
  availableDevices: [],
  syncScroll: false,

  setSelectedDevice: (id: string) => {
    set({ selectedDeviceId: id });
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
