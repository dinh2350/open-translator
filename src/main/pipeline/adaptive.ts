import { freemem } from 'os';
import { WhisperSTT } from '@main/stt';
import type { WhisperModelName } from '@main/stt';
import { MetricsTracker } from './metrics';

type ModelTier = 'tiny' | 'base';

export interface AdaptiveEvent {
  type: 'downgrade' | 'upgrade-suggestion';
  from: ModelTier;
  to: ModelTier;
  reason: string;
}

type AdaptiveCallback = (event: AdaptiveEvent) => void;

/** Thresholds for adaptive model switching */
const DOWNGRADE_P95_TOTAL_MS = 900;
const DOWNGRADE_RAM_GB = 1.5;
const UPGRADE_P95_TOTAL_MS = 300;
const UPGRADE_RAM_GB = 3;
const UPGRADE_CHECK_INTERVAL_MS = 60_000;
const MIN_SAMPLES_FOR_DECISION = 5;

export class AdaptiveModelQuality {
  private currentModel: ModelTier = 'base';
  private stt: WhisperSTT;
  private metrics: MetricsTracker;
  private switching = false;
  private lastUpgradeCheck = 0;
  private listeners: AdaptiveCallback[] = [];

  constructor(stt: WhisperSTT, metrics: MetricsTracker, initialModel?: ModelTier) {
    this.stt = stt;
    this.metrics = metrics;
    if (initialModel) this.currentModel = initialModel;
  }

  getCurrentModel(): ModelTier {
    return this.currentModel;
  }

  isSwitching(): boolean {
    return this.switching;
  }

  onEvent(callback: AdaptiveCallback): void {
    this.listeners.push(callback);
  }

  /**
   * Called after each transcription cycle.
   * Checks downgrade rules immediately, upgrade rules periodically.
   */
  async evaluate(): Promise<void> {
    if (this.switching) return;

    const metrics = this.metrics.getMetrics();

    // Need enough samples before making decisions
    if (metrics.chunksProcessed < MIN_SAMPLES_FOR_DECISION) return;

    // --- Immediate downgrade rules ---
    if (this.currentModel === 'base') {
      const availableRAM = this.getAvailableRAMGB();
      if (metrics.totalP95Ms > DOWNGRADE_P95_TOTAL_MS) {
        await this.downgrade(
          `P95 total latency ${metrics.totalP95Ms.toFixed(0)}ms > ${DOWNGRADE_P95_TOTAL_MS}ms`
        );
        return;
      }
      if (availableRAM < DOWNGRADE_RAM_GB) {
        await this.downgrade(`Available RAM ${availableRAM.toFixed(1)}GB < ${DOWNGRADE_RAM_GB}GB`);
        return;
      }
    }

    // --- Periodic upgrade suggestion ---
    const now = Date.now();
    if (this.currentModel === 'tiny' && now - this.lastUpgradeCheck >= UPGRADE_CHECK_INTERVAL_MS) {
      this.lastUpgradeCheck = now;
      const availableRAM = this.getAvailableRAMGB();
      if (metrics.totalP95Ms < UPGRADE_P95_TOTAL_MS && availableRAM > UPGRADE_RAM_GB) {
        this.emitEvent({
          type: 'upgrade-suggestion',
          from: 'tiny',
          to: 'base',
          reason:
            `P95 ${metrics.totalP95Ms.toFixed(0)}ms < ${UPGRADE_P95_TOTAL_MS}ms ` +
            `and RAM ${availableRAM.toFixed(1)}GB > ${UPGRADE_RAM_GB}GB`,
        });
      }
    }
  }

  private async downgrade(reason: string): Promise<void> {
    if (this.currentModel === 'tiny') return;

    this.switching = true;
    const from = this.currentModel;
    console.log(`[adaptive] Downgrading ${from} → tiny: ${reason}`);

    try {
      const modelName: WhisperModelName = 'tiny.en';
      await this.stt.switchModel(modelName);
      this.currentModel = 'tiny';
      this.metrics.setActiveModel(modelName);

      this.emitEvent({ type: 'downgrade', from, to: 'tiny', reason });
    } catch (err) {
      console.error('[adaptive] Downgrade failed:', err);
    } finally {
      this.switching = false;
    }
  }

  /** Manually trigger an upgrade (called by user action, not automatic). */
  async upgradeToBase(): Promise<void> {
    if (this.currentModel === 'base' || this.switching) return;

    this.switching = true;
    console.log('[adaptive] Upgrading tiny → base (user-initiated)');

    try {
      const modelName: WhisperModelName = 'base.en';
      await this.stt.switchModel(modelName);
      this.currentModel = 'base';
      this.metrics.setActiveModel(modelName);
    } catch (err) {
      console.error('[adaptive] Upgrade failed:', err);
    } finally {
      this.switching = false;
    }
  }

  private getAvailableRAMGB(): number {
    return freemem() / (1024 * 1024 * 1024);
  }

  private emitEvent(event: AdaptiveEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
