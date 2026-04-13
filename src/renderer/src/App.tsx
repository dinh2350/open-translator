import { useState, useEffect } from 'react';
import { AudioDebugPanel } from '@renderer/components/AudioDebugPanel';
import { DualPanelView } from '@renderer/components/DualPanelView';
import { ControlBar } from '@renderer/components/ControlBar';
import { SettingsDialog } from '@renderer/components/SettingsDialog';
import { ErrorToast } from '@renderer/components/ErrorToast';
import { MetricsBar } from '@renderer/components/MetricsBar';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useIPCListeners } from '@renderer/hooks/useIPCListeners';

function App(): React.JSX.Element {
  useIPCListeners();

  const isRecording = useTranscriptStore((s) => s.isRecording);
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Apply dark/light theme class to <html>
  useEffect(() => {
    const theme = settings.ui.theme;
    const applyTheme = (isDark: boolean): void => {
      document.documentElement.classList.toggle('dark', isDark);
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches);
      const handler = (e: MediaQueryListEvent): void => applyTheme(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    applyTheme(theme === 'dark');
    return undefined;
  }, [settings.ui.theme]);

  return (
    <div
      className="flex flex-col h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white"
      style={{ fontSize: `${settings.ui.fontSize}px` }}
    >
      {/* Control bar: Start/Stop, mic selector, status indicator */}
      <ControlBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Debug panel (collapsible) */}
      {isRecording && (
        <div className="px-6 py-2 shrink-0 border-b border-gray-200 dark:border-gray-800">
          <AudioDebugPanel />
        </div>
      )}

      {/* Main content: dual transcript panels */}
      <div className="flex-1 min-h-0 p-4">
        <DualPanelView />
      </div>

      {/* Footer / Metrics bar */}
      <MetricsBar />

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Error toasts */}
      <ErrorToast />
    </div>
  );
}

export default App;
