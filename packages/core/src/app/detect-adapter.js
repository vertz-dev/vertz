import { createBunAdapter } from './bun-adapter';

function detectRuntime() {
  return { hasBun: 'Bun' in globalThis };
}
export function detectAdapter(hints) {
  const runtime = hints ?? detectRuntime();
  if (runtime.hasBun) {
    return createBunAdapter();
  }
  throw new Error('No supported server runtime detected. Vertz requires Bun to use app.listen().');
}
//# sourceMappingURL=detect-adapter.js.map
