import { useRef, useEffect, useState, useCallback, type RefObject } from 'react';
import type { TranscriptSegment } from '@shared/types';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  type: 'original' | 'translated';
  title: string;
  /** Ref callback so parent can access the scroll container */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Called when the panel's at-bottom state changes */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Called when user scrolls (for sync scroll). Passes topmost visible segment id. */
  onUserScroll?: (topSegmentId: string) => void;
  /** If set, scroll this segment id into view (driven by sync scroll). */
  syncToSegmentId?: string | null;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TranscriptPanel({
  segments,
  type,
  title,
  scrollRef: externalScrollRef,
  onAtBottomChange,
  onUserScroll,
  syncToSegmentId,
}: TranscriptPanelProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = externalScrollRef ?? internalScrollRef;
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track whether the sentinel element is visible (i.e. user is at bottom)
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting;
        setIsAtBottom(atBottom);
        onAtBottomChange?.(atBottom);
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollContainerRef, onAtBottomChange]);

  // Auto-scroll to bottom when new segments arrive, only if already at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, isAtBottom]);

  // Sync scroll: scroll a specific segment into view when driven by the other panel
  useEffect(() => {
    if (!syncToSegmentId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(`[data-segment-id="${syncToSegmentId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [syncToSegmentId, scrollContainerRef]);

  // Debounced scroll handler for sync scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onUserScroll) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Find topmost visible segment
        const children = container.querySelectorAll('[data-segment-id]');
        const containerRect = container.getBoundingClientRect();
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          if (rect.top >= containerRect.top - 10) {
            const id = child.getAttribute('data-segment-id');
            if (id) onUserScroll(id);
            break;
          }
        }
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timer) clearTimeout(timer);
    };
  }, [scrollContainerRef, onUserScroll]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const getText = (seg: TranscriptSegment): string | undefined => {
    if (type === 'original') return seg.text;
    return seg.translated;
  };

  const hasNewContent = !isAtBottom && segments.length > 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 relative">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-2 shrink-0">
        {title}
      </h2>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-4">
        {segments.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center mt-8">
            {type === 'original'
              ? 'Speak into the microphone to see transcription...'
              : 'Translations will appear here...'}
          </p>
        )}
        {segments.map((seg) => {
          const text = getText(seg);
          const isInterim = !seg.isFinal;
          const isPending = type === 'translated' && !seg.translated && seg.isFinal;

          return (
            <div
              key={`${seg.id}-${type}`}
              data-segment-id={seg.id}
              className="mb-2 min-h-[2.25rem]"
            >
              <span className="text-gray-400 dark:text-gray-600 text-xs block mb-0.5">
                {formatTime(seg.timestamp)}
              </span>
              <span
                className={[
                  'transition-all duration-300 ease-in-out inline-flex items-center gap-1.5',
                  isInterim
                    ? 'text-gray-400 italic opacity-60'
                    : isPending
                      ? 'text-gray-400 dark:text-gray-500 italic opacity-60'
                      : 'text-gray-900 dark:text-white opacity-100',
                ].join(' ')}
              >
                {isInterim && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-dot shrink-0" />
                )}
                {isPending ? 'Translating…' : text || ''}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* "New content" floating button when auto-scroll is paused */}
      {hasNewContent && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
            bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-lg
            transition-colors cursor-pointer"
        >
          ↓ New content
        </button>
      )}
    </div>
  );
}
