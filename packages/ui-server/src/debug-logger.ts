import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type DebugCategory = 'fields' | 'manifest' | 'plugin' | 'ssr' | 'watcher' | 'ws';

export interface DebugLogger {
  log(category: DebugCategory, message: string, data?: Record<string, unknown>): void;
  isEnabled(category: DebugCategory): boolean;
}

export function createDebugLogger(logDir: string): DebugLogger {
  const envValue = process.env.VERTZ_DEBUG;
  if (!envValue) {
    return {
      log() {},
      isEnabled() {
        return false;
      },
    };
  }

  const enableAll = envValue === '1';
  const enabledCategories = enableAll ? null : new Set(envValue.split(','));
  const logFile = join(logDir, 'debug.log');

  // Truncate log file on creation
  writeFileSync(logFile, '');

  function isEnabled(category: DebugCategory): boolean {
    return enableAll || enabledCategories!.has(category);
  }

  return {
    log(category, message, data) {
      if (!isEnabled(category)) return;
      const entry = { cat: category, msg: message, ...data };
      appendFileSync(logFile, JSON.stringify(entry) + '\n');
    },
    isEnabled,
  };
}
