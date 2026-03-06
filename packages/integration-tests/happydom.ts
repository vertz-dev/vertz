import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Preserve Bun's native network/IO APIs before happy-dom overwrites them
const natives = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
  FormData: globalThis.FormData,
  Blob: globalThis.Blob,
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  WebSocket: globalThis.WebSocket,
};

GlobalRegistrator.register({ url: 'http://localhost/' });

// Restore Bun's native APIs (happy-dom versions can't do real I/O)
for (const [key, value] of Object.entries(natives)) {
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
