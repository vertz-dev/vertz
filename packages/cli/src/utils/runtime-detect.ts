export type Runtime = 'vtz' | 'bun' | 'node';

export function detectRuntime(): Runtime {
  if (
    typeof globalThis !== 'undefined' &&
    '__vtz_runtime' in globalThis &&
    (globalThis as Record<string, unknown>).__vtz_runtime === true
  ) {
    return 'vtz';
  }
  if (typeof globalThis !== 'undefined' && 'Bun' in globalThis) {
    return 'bun';
  }
  return 'node';
}
