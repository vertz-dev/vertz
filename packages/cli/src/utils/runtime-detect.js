export function detectRuntime() {
  if (typeof globalThis !== 'undefined' && 'Bun' in globalThis) {
    return 'bun';
  }
  return 'node';
}
//# sourceMappingURL=runtime-detect.js.map
