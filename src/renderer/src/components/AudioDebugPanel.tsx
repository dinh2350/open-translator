import { useEffect, useRef, useState, useCallback } from 'react';

interface PipelineDebugState {
  speaking: boolean;
  audioLevel: number;
  segmentCount: number;
  lastSegmentDurationMs: number;
  waveform: number[];
}

const WAVEFORM_LENGTH = 200;

export function AudioDebugPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PipelineDebugState>({
    speaking: false,
    audioLevel: 0,
    segmentCount: 0,
    lastSegmentDurationMs: 0,
    waveform: new Array(WAVEFORM_LENGTH).fill(0),
  });

  const handlePipelineEvent = useCallback((event: string, data: unknown) => {
    const d = data as Record<string, number | boolean>;
    switch (event) {
      case 'vad:status':
        setState((prev) => ({ ...prev, speaking: d.speaking as boolean }));
        break;
      case 'audio:level': {
        const rms = d.rms as number;
        setState((prev) => {
          const waveform = [...prev.waveform.slice(1), rms];
          return { ...prev, audioLevel: rms, waveform };
        });
        break;
      }
      case 'speech:segment':
        setState((prev) => ({
          ...prev,
          segmentCount: prev.segmentCount + 1,
          lastSegmentDurationMs: d.durationMs as number,
        }));
        break;
    }
  }, []);

  useEffect(() => {
    const cleanup = window.api.onPipelineEvent(handlePipelineEvent);
    return cleanup;
  }, [handlePipelineEvent]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Waveform
    const { waveform, speaking } = state;
    ctx.strokeStyle = speaking ? '#22c55e' : '#6b7280';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const level = Math.min(waveform[i] * 10, 1); // Scale RMS for visibility
      const y = height / 2 - level * (height / 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Mirror
    ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const level = Math.min(waveform[i] * 10, 1);
      const y = height / 2 + level * (height / 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Center line
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }, [state]);

  const levelDb = state.audioLevel > 0 ? 20 * Math.log10(state.audioLevel) : -60;
  const levelPercent = Math.max(0, Math.min(100, ((levelDb + 60) / 60) * 100));

  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="font-mono">Audio Pipeline Debug</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            state.speaking
              ? 'bg-green-500/20 text-green-400'
              : 'bg-gray-200/50 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500'
          }`}
        >
          {state.speaking ? '● Speaking' : '○ Silent'}
        </span>
      </div>

      {/* Waveform */}
      <canvas
        ref={canvasRef}
        width={600}
        height={100}
        className="w-full h-24 rounded border border-gray-300 dark:border-gray-700"
      />

      {/* Level meter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500 w-8">Level</span>
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              levelPercent > 80
                ? 'bg-red-500'
                : levelPercent > 50
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${levelPercent}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-14 text-right">
          {levelDb.toFixed(1)} dB
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div>
          Speech segments:{' '}
          <span className="text-gray-900 dark:text-white font-mono">{state.segmentCount}</span>
        </div>
        {state.lastSegmentDurationMs > 0 && (
          <div>
            Last:{' '}
            <span className="text-gray-900 dark:text-white font-mono">
              {state.lastSegmentDurationMs.toFixed(0)}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
