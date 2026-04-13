import { useState, useCallback, useEffect } from 'react';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { AudioSourceSelector } from './AudioSourceSelector';
import { useTranscriptStore } from '@renderer/stores/transcriptStore';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'audio' | 'models' | 'display' | 'performance';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'models', label: 'Models' },
  { id: 'display', label: 'Display' },
  { id: 'performance', label: 'Performance' },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps): React.JSX.Element | null {
  const [tab, setTab] = useState<Tab>('audio');

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer',
                tab === t.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {tab === 'audio' && <AudioTab />}
          {tab === 'models' && <ModelsTab />}
          {tab === 'display' && <DisplayTab />}
          {tab === 'performance' && <PerformanceTab />}
        </div>
      </div>
    </div>
  );
}

function AudioTab(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Section title="Microphone">
        <AudioSourceSelector />
      </Section>
    </div>
  );
}

function ModelsTab(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const handleModelChange = useCallback(
    async (model: 'tiny' | 'base' | 'small') => {
      if (model === settings.whisperModel) return;
      setSwitching(true);
      setSwitchError(null);
      try {
        const modelName = `${model}.en`;
        const result = await window.api.switchWhisperModel(modelName);
        if (!result.success) {
          setSwitchError(result.error ?? 'Failed to switch model');
        }
      } catch (err) {
        setSwitchError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setSwitching(false);
      }
    },
    [settings.whisperModel]
  );

  const handleAutoSwitch = useCallback(
    (enabled: boolean) => {
      updateSettings({ autoModelSwitch: enabled });
    },
    [updateSettings]
  );

  return (
    <div className="space-y-4">
      <Section title="Whisper Model">
        <div className="space-y-2">
          {(['tiny', 'base', 'small'] as const).map((model) => (
            <label
              key={model}
              className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <input
                type="radio"
                name="whisper-model"
                checked={settings.whisperModel === model}
                onChange={() => handleModelChange(model)}
                disabled={switching}
                className="accent-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">{model}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  {model === 'tiny' && '~75 MB · Fastest'}
                  {model === 'base' && '~142 MB · Balanced'}
                  {model === 'small' && '~466 MB · Best quality'}
                </span>
              </div>
            </label>
          ))}
          {switching && <p className="text-xs text-yellow-400">⏳ Switching model…</p>}
          {switchError && <p className="text-xs text-red-400">⚠ {switchError}</p>}
        </div>
      </Section>

      <Section title="Auto Model Switch">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoModelSwitch}
            onChange={(e) => handleAutoSwitch(e.target.checked)}
            className="accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Automatically switch to a smaller model when latency is high
          </span>
        </label>
      </Section>
    </div>
  );
}

function DisplayTab(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const syncScroll = useSettingsStore((s) => s.syncScroll);
  const setSyncScroll = useSettingsStore((s) => s.setSyncScroll);

  const handleFontSize = useCallback(
    (size: number) => {
      updateSettings({ ui: { ...settings.ui, fontSize: size } });
    },
    [settings.ui, updateSettings]
  );

  const handleTheme = useCallback(
    (theme: 'light' | 'dark' | 'system') => {
      updateSettings({ ui: { ...settings.ui, theme } });
    },
    [settings.ui, updateSettings]
  );

  return (
    <div className="space-y-4">
      <Section title="Font Size">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={12}
            max={24}
            step={1}
            value={settings.ui.fontSize}
            onChange={(e) => handleFontSize(Number(e.target.value))}
            className="flex-1 accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300 w-10 text-right">
            {settings.ui.fontSize}px
          </span>
        </div>
        <p
          className="text-gray-500 dark:text-gray-400 mt-1"
          style={{ fontSize: `${settings.ui.fontSize}px` }}
        >
          Preview text
        </p>
      </Section>

      <Section title="Theme">
        <div className="flex gap-2">
          {(['system', 'dark', 'light'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => handleTheme(theme)}
              className={[
                'px-3 py-1.5 rounded text-sm capitalize cursor-pointer transition-colors',
                settings.ui.theme === theme
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              {theme}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Scroll">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={syncScroll}
            onChange={(e) => setSyncScroll(e.target.checked)}
            className="accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Sync scroll between English and Vietnamese panels
          </span>
        </label>
      </Section>
    </div>
  );
}

function PerformanceTab(): React.JSX.Element {
  const metrics = useTranscriptStore((s) => s.metrics);

  return (
    <div className="space-y-4">
      <Section title="Pipeline Metrics">
        {metrics ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricItem
              label="STT P95"
              value={`${metrics.sttP95Ms.toFixed(0)}ms`}
              color={latencyColor(metrics.sttP95Ms, 300, 500)}
            />
            <MetricItem
              label="Translation P95"
              value={`${metrics.translationP95Ms.toFixed(0)}ms`}
              color={latencyColor(metrics.translationP95Ms, 100, 150)}
            />
            <MetricItem
              label="Total P95"
              value={`${metrics.totalP95Ms.toFixed(0)}ms`}
              color={latencyColor(metrics.totalP95Ms, 800, 1000)}
            />
            <MetricItem
              label="Memory"
              value={`${metrics.memoryUsageMB.toFixed(0)} MB`}
              color={metrics.memoryUsageMB > 1400 ? 'text-red-400' : 'text-green-400'}
            />
            <MetricItem label="Model" value={metrics.activeModel} />
            <MetricItem label="Chunks" value={`${metrics.chunksProcessed} processed`} />
            {metrics.chunksDropped > 0 && (
              <MetricItem label="Dropped" value={`${metrics.chunksDropped}`} color="text-red-400" />
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No metrics yet. Start a session to see data.
          </p>
        )}
      </Section>
    </div>
  );
}

function MetricItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}): React.JSX.Element {
  return (
    <div>
      <p className="text-gray-400 dark:text-gray-500 text-xs">{label}</p>
      <p className={color ?? 'text-gray-700 dark:text-gray-200'}>{value}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function latencyColor(ms: number, good: number, warn: number): string {
  if (ms <= good) return 'text-green-400';
  if (ms <= warn) return 'text-yellow-400';
  return 'text-red-400';
}
