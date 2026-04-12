import { AudioDebugPanel } from '@renderer/components/AudioDebugPanel';
import { DualPanelView } from '@renderer/components/DualPanelView';
import { ControlBar } from '@renderer/components/ControlBar';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';
import { useIPCListeners } from '@renderer/hooks/useIPCListeners';

function App(): React.JSX.Element {
  useIPCListeners();

  const isRecording = useTranscriptStore((s) => s.isRecording);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Control bar: Start/Stop, mic selector, status indicator */}
      <ControlBar />

      {/* Debug panel (collapsible) */}
      {isRecording && (
        <div className="px-6 py-2 shrink-0 border-b border-gray-800">
          <AudioDebugPanel />
        </div>
      )}

      {/* Main content: dual transcript panels */}
      <div className="flex-1 min-h-0 p-4">
        <DualPanelView />
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 py-1 shrink-0">
        100% local &middot; 100% free
      </div>
    </div>
  );
}

export default App;
