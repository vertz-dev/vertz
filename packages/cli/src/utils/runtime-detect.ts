declare const Bun: unknown;

export type Runtime = 'bun' | 'node';

export function detectRuntime(): Runtime {
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }
  return 'node';
}
