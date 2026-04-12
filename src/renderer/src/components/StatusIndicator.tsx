import { useTranscriptStore } from '@renderer/stores/transcriptStore';

const statusConfig = {
  idle: { color: 'bg-gray-500', label: 'Idle', pulse: false },
  loading: { color: 'bg-yellow-400', label: 'Loading models…', pulse: true },
  recording: { color: 'bg-red-500', label: 'Recording', pulse: true },
  processing: { color: 'bg-green-500', label: 'Processing', pulse: false },
  error: { color: 'bg-red-600', label: 'Error', pulse: false },
} as const;

export function StatusIndicator(): React.JSX.Element {
  const status = useTranscriptStore((s) => s.status);
  const metrics = useTranscriptStore((s) => s.metrics);
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span
        className={[
          'inline-block w-2 h-2 rounded-full',
          config.color,
          config.pulse ? 'animate-pulse' : '',
        ].join(' ')}
      />
      <span>{config.label}</span>
      {metrics && status !== 'idle' && (
        <span className="text-gray-600">
          {metrics.activeModel} · P95 {metrics.totalP95Ms.toFixed(0)}ms
        </span>
      )}
    </div>
  );
}
