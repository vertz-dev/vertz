import type { ServerAdapter } from '../types/server-adapter';

export interface RuntimeHints {
  hasBun: boolean;
  hasVtz: boolean;
}

function detectRuntime(): RuntimeHints {
  return {
    hasBun: 'Bun' in globalThis,
    hasVtz: '__vtz_runtime' in globalThis,
  };
}

export async function detectAdapter(hints?: RuntimeHints): Promise<ServerAdapter> {
  const runtime = hints ?? detectRuntime();

  if (runtime.hasVtz) {
    const { createVtzAdapter } = await import('./vtz-adapter');
    return createVtzAdapter();
  }

  if (runtime.hasBun) {
    const { createBunAdapter } = await import('./bun-adapter');
    return createBunAdapter();
  }

  throw new Error(
    'No supported server runtime detected. Vertz requires Bun or vtz to use app.listen().',
  );
}
