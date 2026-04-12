import { useEffect, useRef, useState, useCallback } from 'react';

interface Segment {
  id: string;
  text: string;
  isFinal: boolean;
  pendingId?: string;
  timestamp: number;
  sttLatencyMs: number;
  audioDurationMs: number;
}

export function TranscriptPanel(): React.JSX.Element {
  const [segments, setSegments] = useState<Segment[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleEvent = useCallback((event: string, data: unknown) => {
    if (event !== 'transcript:segment') return;
    const seg = data as Segment;

    setSegments((prev) => {
      // If this is a final segment with a pendingId, replace matching interims
      if (seg.isFinal && seg.pendingId) {
        const filtered = prev.filter((s) => s.pendingId !== seg.pendingId);
        return [...filtered, seg];
      }
      // If interim with pendingId, replace previous interim with same pendingId
      if (!seg.isFinal && seg.pendingId) {
        const filtered = prev.filter(
          (s) => !(s.pendingId === seg.pendingId && !s.isFinal)
        );
        return [...filtered, seg];
      }
      return [...prev, seg];
    });
  }, []);

  useEffect(() => {
    const cleanup = window.api.onPipelineEvent(handleEvent);
    return cleanup;
  }, [handleEvent]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  return (
    <div className="w-full max-w-2xl mt-4">
      <div className="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto">
        {segments.length === 0 && (
          <p className="text-gray-500 text-sm text-center">
            Speak into the microphone to see transcription...
          </p>
        )}
        {segments.map((seg) => (
          <div key={seg.id} className="mb-2">
            <span
              className={
                seg.isFinal
                  ? 'text-white'
                  : 'text-gray-400 italic'
              }
            >
              {seg.text}
            </span>
            <span className="text-gray-600 text-xs ml-2">
              {seg.sttLatencyMs?.toFixed(0)}ms
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
