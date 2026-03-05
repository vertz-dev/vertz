/**
 * Preload script that registers happy-dom globals (document, window, etc.)
 * for bun:test. Used via `bun test --preload ./src/__tests__/happy-dom-preload.ts`.
 */
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost' });

// Properties that would cause recursion or conflict with bun globals
const skip = new Set([
  'undefined', 'NaN', 'Infinity', 'globalThis', 'global',
  'window', 'self', 'top', 'parent', 'frames',
  'Bun', 'process', 'console', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'queueMicrotask',
  'URL', 'URLSearchParams', 'Request', 'Response', 'Headers',
  'fetch', 'crypto', 'performance', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'Blob', 'FormData',
  'ReadableStream', 'WritableStream', 'TransformStream',
  'Event', 'EventTarget', 'MessageEvent', 'ErrorEvent',
  'WebSocket', 'Worker', 'SharedWorker',
  'atob', 'btoa', 'structuredClone',
]);

for (const key of Object.getOwnPropertyNames(win)) {
  if (skip.has(key)) continue;
  if (key in globalThis) continue;
  try {
    const value = (win as Record<string, unknown>)[key];
    (globalThis as Record<string, unknown>)[key] = value;
  } catch {
    // Some properties can't be set — skip them
  }
}
