import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { freemem, totalmem } from 'os';

const LOGS_DIR = join(homedir(), '.open-translator', 'logs');
const LOG_FILE = join(LOGS_DIR, 'error.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotate after this

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function rotateIfNeeded(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    const size = statSync(LOG_FILE).size;
    if (size > MAX_LOG_SIZE) {
      const rotated = LOG_FILE + '.1';
      renameSync(LOG_FILE, rotated);
    }
  } catch {
    // Non-critical — continue without rotation
  }
}

export type ErrorSeverity = 'warn' | 'error' | 'fatal';

export interface ErrorLogEntry {
  timestamp: string;
  severity: ErrorSeverity;
  category: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export function logError(
  severity: ErrorSeverity,
  category: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    severity,
    category,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: {
      ...context,
      memoryFreeMB: Math.round(freemem() / 1024 / 1024),
      memoryTotalMB: Math.round(totalmem() / 1024 / 1024),
      processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  };

  // Always log to console
  const consoleFn = severity === 'warn' ? console.warn : console.error;
  consoleFn(`[${category}] ${entry.message}`);

  // Write to file
  try {
    ensureLogsDir();
    rotateIfNeeded();
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (writeErr) {
    console.error('[logger] Failed to write to log file:', writeErr);
  }
}
