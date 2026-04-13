import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsTracker } from '../metrics';

describe('MetricsTracker', () => {
  let tracker: MetricsTracker;

  beforeEach(() => {
    tracker = new MetricsTracker();
  });

  it('returns zero metrics when empty', () => {
    const m = tracker.getMetrics();
    expect(m.sttP95Ms).toBe(0);
    expect(m.translationP95Ms).toBe(0);
    expect(m.totalP95Ms).toBe(0);
    expect(m.chunksProcessed).toBe(0);
    expect(m.chunksDropped).toBe(0);
    expect(m.activeModel).toBe('tiny');
  });

  it('records and computes P95 for STT latencies', () => {
    // Add 20 values: 1..20
    for (let i = 1; i <= 20; i++) {
      tracker.recordSTT(i * 10);
    }
    const p95 = tracker.getP95STT();
    // P95 of [10, 20, ..., 200]: 95th percentile index = ceil(0.95 * 20) - 1 = 18 → 190
    expect(p95).toBe(190);
  });

  it('records and computes P95 for translation latencies', () => {
    for (let i = 1; i <= 10; i++) {
      tracker.recordTranslation(i * 5);
    }
    const p95 = tracker.getP95Translation();
    // P95 of [5, 10, ..., 50]: index = ceil(0.95 * 10) - 1 = 9 → 50
    expect(p95).toBe(50);
  });

  it('records total latency and increments processed count', () => {
    tracker.recordTotal(100);
    tracker.recordTotal(200);
    tracker.recordTotal(150);

    const m = tracker.getMetrics();
    expect(m.chunksProcessed).toBe(3);
    expect(m.totalP95Ms).toBeGreaterThan(0);
  });

  it('records dropped chunks', () => {
    tracker.recordDropped();
    tracker.recordDropped();
    tracker.recordDropped();

    expect(tracker.getMetrics().chunksDropped).toBe(3);
  });

  it('maintains a rolling window of 20 for latencies', () => {
    // Add 25 values — first 5 should be evicted
    for (let i = 1; i <= 25; i++) {
      tracker.recordSTT(i);
    }
    // Window should be [6, 7, ..., 25]
    const p95 = tracker.getP95STT();
    // P95 of [6..25]: index = ceil(0.95 * 20) - 1 = 18 → 24
    expect(p95).toBe(24);
  });

  it('updates active model', () => {
    tracker.setActiveModel('base.en');
    expect(tracker.getMetrics().activeModel).toBe('base');

    tracker.setActiveModel('small.en');
    expect(tracker.getMetrics().activeModel).toBe('small');
  });

  it('reports positive memory usage', () => {
    const m = tracker.getMetrics();
    expect(m.memoryUsageMB).toBeGreaterThan(0);
    expect(m.systemMemoryMB).toBeGreaterThan(0);
  });

  it('handles single value correctly', () => {
    tracker.recordSTT(42);
    expect(tracker.getP95STT()).toBe(42);
  });
});
