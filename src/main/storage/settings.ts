import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { AppSettings } from '@shared/types';

const SETTINGS_DIR = join(app.getPath('home'), '.open-translator');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SETTINGS: AppSettings = {
  audioDeviceId: null,
  whisperModel: 'tiny',
  autoModelSwitch: true,
  language: { source: 'en', target: 'vi' },
  ui: { theme: 'system', fontSize: 16 },
};

let cachedSettings: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (cachedSettings) return cachedSettings;

  if (!existsSync(SETTINGS_FILE)) {
    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
  }

  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Merge with defaults so new fields get filled in
    cachedSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      language: { ...DEFAULT_SETTINGS.language, ...parsed.language },
      ui: { ...DEFAULT_SETTINGS.ui, ...parsed.ui },
    };
    return cachedSettings;
  } catch {
    console.warn('[settings] Failed to read settings, using defaults');
    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  cachedSettings = settings;

  try {
    if (!existsSync(SETTINGS_DIR)) {
      mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[settings] Failed to save settings:', err);
  }
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated: AppSettings = {
    ...current,
    ...partial,
    language: { ...current.language, ...(partial.language ?? {}) },
    ui: { ...current.ui, ...(partial.ui ?? {}) },
  };
  saveSettings(updated);
  return updated;
}
