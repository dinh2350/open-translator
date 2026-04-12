import { useState, useRef, useCallback } from 'react';
import { AudioSourceSelector } from './AudioSourceSelector';
import { StatusIndicator } from './StatusIndicator';
import { MicrophoneCapture } from '@renderer/audio/microphone';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';

export function ControlBar(): React.JSX.Element {
  const [starting, setStarting] = useState(false);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const selectedDeviceId = useSettingsStore((s) => s.selectedDeviceId);
  const isRecording = useTranscriptStore((s) => s.isRecording);
  const setRecording = useTranscriptStore((s) => s.setRecording);
  const setStatus = useTranscriptStore((s) => s.setStatus);
  const clearSegments = useTranscriptStore((s) => s.clearSegments);
  const status = useTranscriptStore((s) => s.status);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    setStarting(true);

    try {
      // 1. Tell main process to init models (lazy) and start session
      const result = await window.api.sessionStart();
      if (!result.success) {
        setError(result.error ?? 'Failed to start session');
        setStarting(false);
        return;
      }

      // 2. Start mic capture in renderer
      const mic = new MicrophoneCapture();
      mic.onAudioData((pcm) => {
        window.api.sendAudioChunk(pcm.buffer as ArrayBuffer);
      });
      await mic.start(selectedDeviceId ?? undefined);
      micRef.current = mic;

      setRecording(true);
      clearSegments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setStatus('error');
      console.error('Failed to start session:', err);
    } finally {
      setStarting(false);
    }
  }, [selectedDeviceId, setRecording, setStatus, clearSegments]);

  const handleStop = useCallback(async () => {
    // 1. Stop mic capture
    micRef.current?.stop();
    micRef.current = null;

    // 2. Tell main process to stop session
    await window.api.sessionStop();

    setRecording(false);
  }, [setRecording]);

  const isLoading = status === 'loading' || starting;
  const buttonDisabled = isLoading;

  return (
    <div className="flex items-center gap-4 px-6 py-3 shrink-0 border-b border-gray-800">
      <h1 className="text-lg font-bold mr-auto">Open Translator</h1>

      <StatusIndicator />

      <AudioSourceSelector />

      <button
        onClick={isRecording ? handleStop : handleStart}
        disabled={buttonDisabled}
        className={[
          'px-4 py-1.5 rounded text-sm font-medium transition-colors',
          buttonDisabled
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer',
        ].join(' ')}
      >
        {isLoading ? '⏳ Loading…' : isRecording ? '⏹ Stop' : '▶ Start'}
      </button>

      {error && (
        <span className="text-red-400 text-xs max-w-48 truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
