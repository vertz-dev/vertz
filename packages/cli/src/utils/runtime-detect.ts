export type Runtime = 'bun' | 'node';

export function detectRuntime(): Runtime {
  if (typeof globalThis !== 'undefined' && 'Bun' in globalThis) {
    return 'bun';
  }
  return 'node';
}
