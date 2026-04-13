import { create } from 'zustand';
import type { TranscriptSegment, PipelineMetrics } from '@shared/types';

type PipelineStatus = 'idle' | 'loading' | 'recording' | 'processing' | 'error';

export interface PipelineError {
  level: 'warn' | 'error';
  message: string;
  timestamp: number;
}

interface TranscriptState {
  segments: TranscriptSegment[];
  isRecording: boolean;
  metrics: PipelineMetrics | null;
  status: PipelineStatus;
  errors: PipelineError[];

  addSegment: (segment: TranscriptSegment) => void;
  updateSegment: (id: string, update: Partial<TranscriptSegment>) => void;
  clearSegments: () => void;
  setRecording: (recording: boolean) => void;
  setStatus: (status: PipelineStatus) => void;
  setMetrics: (metrics: PipelineMetrics) => void;
  addError: (error: PipelineError) => void;
  dismissError: (timestamp: number) => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  isRecording: false,
  metrics: null,
  status: 'idle',
  errors: [],

  addSegment: (segment) =>
    set((state) => {
      // If final with pendingId, replace matching interims
      if (segment.isFinal && segment.pendingId) {
        const filtered = state.segments.filter((s) => s.pendingId !== segment.pendingId);
        return { segments: [...filtered, segment] };
      }
      // If interim with pendingId, replace previous interim with same pendingId
      if (!segment.isFinal && segment.pendingId) {
        const filtered = state.segments.filter(
          (s) => !(s.pendingId === segment.pendingId && !s.isFinal)
        );
        return { segments: [...filtered, segment] };
      }
      return { segments: [...state.segments, segment] };
    }),

  updateSegment: (id, update) =>
    set((state) => ({
      segments: state.segments.map((s) => (s.id === id ? { ...s, ...update } : s)),
    })),

  clearSegments: () => set({ segments: [] }),
  setRecording: (recording) => set({ isRecording: recording }),
  setStatus: (status) => set({ status }),
  setMetrics: (metrics) => set({ metrics }),
  addError: (error) =>
    set((state) => ({
      // Keep max 5 errors visible
      errors: [...state.errors, error].slice(-5),
    })),
  dismissError: (timestamp) =>
    set((state) => ({
      errors: state.errors.filter((e) => e.timestamp !== timestamp),
    })),
}));
