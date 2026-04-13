import { useEffect } from 'react';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';

const AUTO_DISMISS_MS = 8000;

export function ErrorToast(): React.JSX.Element {
  const errors = useTranscriptStore((s) => s.errors);
  const dismissError = useTranscriptStore((s) => s.dismissError);

  // Auto-dismiss warnings after 8s
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const err of errors) {
      if (err.level === 'warn') {
        const timer = setTimeout(() => dismissError(err.timestamp), AUTO_DISMISS_MS);
        timers.push(timer);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [errors, dismissError]);

  if (errors.length === 0) return <></>;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 max-w-sm">
      {errors.map((err) => (
        <div
          key={err.timestamp}
          className={[
            'flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg text-sm border',
            err.level === 'error'
              ? 'bg-red-950 border-red-800 text-red-200'
              : 'bg-yellow-950 border-yellow-800 text-yellow-200',
          ].join(' ')}
        >
          <span className="shrink-0 mt-0.5">{err.level === 'error' ? '⛔' : '⚠️'}</span>
          <span className="flex-1">{err.message}</span>
          <button
            onClick={() => dismissError(err.timestamp)}
            className="shrink-0 text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
