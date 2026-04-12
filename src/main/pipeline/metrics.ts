import type { PipelineMetrics } from '@shared/types';
import type { WhisperModelName } from '@main/stt';

const WINDOW_SIZE = 20;

export class MetricsTracker {
  private sttLatencies: number[] = [];
  private translationLatencies: number[] = [];
  private totalLatencies: number[] = [];
  private processed = 0;
  private dropped = 0;
  private activeModel: WhisperModelName = 'tiny.en';

  recordSTT(ms: number): void {
    this.sttLatencies.push(ms);
    if (this.sttLatencies.length > WINDOW_SIZE) this.sttLatencies.shift();
  }

  recordTranslation(ms: number): void {
    this.translationLatencies.push(ms);
    if (this.translationLatencies.length > WINDOW_SIZE) this.translationLatencies.shift();
  }

  recordTotal(ms: number): void {
    this.totalLatencies.push(ms);
    if (this.totalLatencies.length > WINDOW_SIZE) this.totalLatencies.shift();
    this.processed++;
  }

  recordDropped(): void {
    this.dropped++;
  }

  setActiveModel(model: WhisperModelName): void {
    this.activeModel = model;
  }

  getP95STT(): number {
    return percentile(this.sttLatencies, 0.95);
  }

  getP95Translation(): number {
    return percentile(this.translationLatencies, 0.95);
  }

  getP95Total(): number {
    return percentile(this.totalLatencies, 0.95);
  }

  getMemoryUsageMB(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }

  getMetrics(): PipelineMetrics {
    // Map full model name to base name for the PipelineMetrics type
    const base = this.activeModel.replace('.en', '') as 'tiny' | 'base' | 'small';
    return {
      sttP95Ms: this.getP95STT(),
      translationP95Ms: this.getP95Translation(),
      totalP95Ms: this.getP95Total(),
      memoryUsageMB: this.getMemoryUsageMB(),
      activeModel: base,
      chunksProcessed: this.processed,
      chunksDropped: this.dropped,
    };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
