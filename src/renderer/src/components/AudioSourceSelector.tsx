import { useEffect } from 'react';
import { useSettingsStore } from '@renderer/stores/settingsStore';

export function AudioSourceSelector(): React.JSX.Element {
  const { selectedDeviceId, availableDevices, setSelectedDevice, refreshDevices } =
    useSettingsStore();

  useEffect(() => {
    // Load devices on mount
    refreshDevices();

    // Listen for hot-plug events
    const handler = (): void => {
      refreshDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handler);
    };
  }, [refreshDevices]);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="mic-select" className="text-sm text-gray-400 whitespace-nowrap">
        Microphone
      </label>
      <select
        id="mic-select"
        value={selectedDeviceId ?? ''}
        onChange={(e) => setSelectedDevice(e.target.value)}
        className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none min-w-48 truncate"
      >
        {availableDevices.length === 0 && (
          <option value="" disabled>
            No microphones found
          </option>
        )}
        {availableDevices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone (${device.deviceId.slice(0, 8)}…)`}
          </option>
        ))}
      </select>
    </div>
  );
}
