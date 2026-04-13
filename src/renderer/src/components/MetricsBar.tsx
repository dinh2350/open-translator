import { useTranscriptStore } from '@renderer/stores/transcriptStore';

function latencyColor(ms: number): string {
  if (ms <= 0) return 'text-gray-500';
  if (ms < 800) return 'text-green-400';
  if (ms < 1000) return 'text-yellow-400';
  return 'text-red-400';
}

function memoryColor(usageMB: number): string {
  if (usageMB > 1400) return 'text-red-400';
  if (usageMB > 1000) return 'text-yellow-400';
  return 'text-green-400';
}

export function MetricsBar(): React.JSX.Element {
  const metrics = useTranscriptStore((s) => s.metrics);
  const status = useTranscriptStore((s) => s.status);

  if (!metrics || status === 'idle') {
    return (
      <div className="flex items-center justify-center px-4 py-1 shrink-0 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-600">
        100% local &middot; 100% free
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-4 py-1 shrink-0 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500">
      <span>
        P95{' '}
        <span className={latencyColor(metrics.totalP95Ms)}>{metrics.totalP95Ms.toFixed(0)}ms</span>
      </span>

      <span className="text-gray-300 dark:text-gray-700">|</span>

      <span>
        STT <span className={latencyColor(metrics.sttP95Ms)}>{metrics.sttP95Ms.toFixed(0)}ms</span>
      </span>

      <span className="text-gray-300 dark:text-gray-700">|</span>

      <span>
        Trans{' '}
        <span className={latencyColor(metrics.translationP95Ms)}>
          {metrics.translationP95Ms.toFixed(0)}ms
        </span>
      </span>

      <span className="text-gray-300 dark:text-gray-700">|</span>

      <span>
        Mem{' '}
        <span className={memoryColor(metrics.memoryUsageMB)}>
          {metrics.memoryUsageMB.toFixed(0)}
        </span>
        <span className="text-gray-400 dark:text-gray-600">
          /{(metrics.systemMemoryMB / 1024).toFixed(0)}GB
        </span>
        {' MB'}
      </span>

      <span className="text-gray-300 dark:text-gray-700">|</span>

      <span>{metrics.activeModel}</span>

      <span className="text-gray-300 dark:text-gray-700">|</span>

      <span>
        {metrics.chunksProcessed} chunks
        {metrics.chunksDropped > 0 && (
          <span className="text-red-400"> ({metrics.chunksDropped} dropped)</span>
        )}
      </span>
    </div>
  );
}
