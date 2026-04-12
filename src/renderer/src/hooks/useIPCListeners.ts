import { useEffect } from 'react';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';
import type { TranscriptSegment, PipelineMetrics } from '@shared/types';

/**
 * Subscribe to main-process pipeline events via the preload bridge
 * and feed them into the transcript Zustand store.
 */
export function useIPCListeners(): void {
  const addSegment = useTranscriptStore((s) => s.addSegment);
  const setMetrics = useTranscriptStore((s) => s.setMetrics);
  const setStatus = useTranscriptStore((s) => s.setStatus);

  useEffect(() => {
    const cleanup = window.api.onPipelineEvent((event: string, data: unknown) => {
      switch (event) {
        case 'transcript:segment':
          addSegment(data as TranscriptSegment);
          break;
        case 'pipeline:metrics':
          setMetrics(data as PipelineMetrics);
          break;
        case 'pipeline:status':
          setStatus(data as 'idle' | 'loading' | 'recording' | 'processing' | 'error');
          break;
      }
    });
    return cleanup;
  }, [addSegment, setMetrics, setStatus]);
}
