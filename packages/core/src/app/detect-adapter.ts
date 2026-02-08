import type { ServerAdapter } from '../types/server-adapter';
import { createBunAdapter } from './bun-adapter';

export interface RuntimeHints {
  hasBun: boolean;
}

function detectRuntime(): RuntimeHints {
  return { hasBun: 'Bun' in globalThis };
}

export function detectAdapter(hints?: RuntimeHints): ServerAdapter {
  const runtime = hints ?? detectRuntime();

  if (runtime.hasBun) {
    return createBunAdapter();
  }

  throw new Error('No supported server runtime detected. Vertz requires Bun to use app.listen().');
}
