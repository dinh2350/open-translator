import { useRef, useState, useCallback } from 'react';
import { TranscriptPanel } from './TranscriptPanel';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

export function DualPanelView(): React.JSX.Element {
  const segments = useTranscriptStore((s) => s.segments);
  const syncScroll = useSettingsStore((s) => s.syncScroll);
  const setSyncScroll = useSettingsStore((s) => s.setSyncScroll);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const [leftAtBottom, setLeftAtBottom] = useState(true);
  const [rightAtBottom, setRightAtBottom] = useState(true);

  // Track which panel is the "source" of a sync to prevent loops
  const syncSourceRef = useRef<'left' | 'right' | null>(null);

  const [syncTargetId, setSyncTargetId] = useState<{
    left: string | null;
    right: string | null;
  }>({ left: null, right: null });

  const handleLeftScroll = useCallback(
    (topSegmentId: string) => {
      if (!syncScroll || leftAtBottom) return;
      if (syncSourceRef.current === 'right') {
        // This scroll was triggered by sync from right panel — ignore
        syncSourceRef.current = null;
        return;
      }
      syncSourceRef.current = 'left';
      setSyncTargetId((prev) => ({ ...prev, right: topSegmentId }));
    },
    [syncScroll, leftAtBottom]
  );

  const handleRightScroll = useCallback(
    (topSegmentId: string) => {
      if (!syncScroll || rightAtBottom) return;
      if (syncSourceRef.current === 'left') {
        syncSourceRef.current = null;
        return;
      }
      syncSourceRef.current = 'right';
      setSyncTargetId((prev) => ({ ...prev, left: topSegmentId }));
    },
    [syncScroll, rightAtBottom]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {/* Sync scroll toggle */}
      <div className="flex items-center justify-end px-4 py-1 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={syncScroll}
            onChange={(e) => setSyncScroll(e.target.checked)}
            className="accent-blue-500 cursor-pointer"
          />
          Sync scroll
        </label>
      </div>

      <div className="flex flex-1 min-h-0 w-full gap-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
        <TranscriptPanel
          segments={segments}
          type="original"
          title="English"
          scrollRef={leftRef}
          onAtBottomChange={setLeftAtBottom}
          onUserScroll={handleLeftScroll}
          syncToSegmentId={syncScroll ? syncTargetId.left : null}
        />
        <div className="w-px bg-gray-300 dark:bg-gray-700 shrink-0" />
        <TranscriptPanel
          segments={segments}
          type="translated"
          title="Tiếng Việt"
          scrollRef={rightRef}
          onAtBottomChange={setRightAtBottom}
          onUserScroll={handleRightScroll}
          syncToSegmentId={syncScroll ? syncTargetId.right : null}
        />
      </div>
    </div>
  );
}
