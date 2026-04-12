import { useState, useRef, useCallback } from 'react';
import { AudioSourceSelector } from '@renderer/components/AudioSourceSelector';
import { AudioDebugPanel } from '@renderer/components/AudioDebugPanel';
import { MicrophoneCapture } from '@renderer/audio/microphone';
import { useSettingsStore } from '@renderer/stores/settingsStore';

function App(): React.JSX.Element {
  const [recording, setRecording] = useState(false);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const selectedDeviceId = useSettingsStore((s) => s.selectedDeviceId);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      micRef.current?.stop();
      micRef.current = null;
      setRecording(false);
      return;
    }

    try {
      const mic = new MicrophoneCapture();
      mic.onAudioData((pcm) => {
        window.api.sendAudioChunk(pcm.buffer as ArrayBuffer);
      });
      await mic.start(selectedDeviceId ?? undefined);
      micRef.current = mic;
      setRecording(true);
    } catch (err) {
      console.error('Failed to start microphone:', err);
    }
  }, [recording, selectedDeviceId]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Open Translator</h1>
      <p className="text-sm text-gray-400 mb-6">
        Real-time English → Vietnamese meeting transcription &amp; translation
      </p>

      <div className="flex items-center gap-4 mb-6">
        <AudioSourceSelector />
        <button
          onClick={toggleRecording}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            recording
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {recording ? 'Stop' : 'Start'}
        </button>
      </div>

      {recording && <AudioDebugPanel />}

      <p className="mt-auto text-xs text-gray-600">100% local &middot; 100% free</p>
    </div>
  );
}

export default App;
