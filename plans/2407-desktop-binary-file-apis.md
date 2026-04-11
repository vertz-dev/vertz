# Desktop Binary File APIs

**Issue:** #2407
**Status:** Draft (Rev 2 — addresses DX, Product, and Technical reviews)
**Author:** Vinicius Dacal
**Date:** 2026-04-10

## Summary

Add `fs.readBinaryFile()` and `fs.writeBinaryFile()` to `@vertz/desktop`, plus streaming variants for files larger than memory. The current IPC wire protocol (JSON-over-`evaluate_script`) can't carry binary data without base64 encoding (33% overhead + JS parse cost). This design introduces an HTTP sidecar transport — axum routes on the existing dev server — that transfers raw bytes via `fetch()`.

## Motivation

The Phase 0–2 IPC bridge (PR #2403) deliberately deferred binary file I/O as a non-goal because the JSON wire protocol is the wrong transport for raw bytes. Desktop apps commonly need binary file operations for:

- Image/media editing (load/save photos, audio, video)
- Document processing (PDFs, spreadsheets)
- File managers and archive tools
- IDE-style editors working with non-text assets
- Game asset loading

Without native binary support, developers would either base64-encode (slow, 33% overhead) or shell out to external tools (brittle, insecure).

## API Surface

### TypeScript — Buffered APIs

```ts
import { fs } from '@vertz/desktop';
import { match } from '@vertz/errors';

// ── Read binary file ──
const result = await fs.readBinaryFile('~/photos/avatar.png');
match(result, {
  ok: (data: Uint8Array) => {
    console.log(`Read ${data.byteLength} bytes`);
  },
  err: (error) => {
    console.error(`${error.code}: ${error.message}`);
  },
});

// ── Write binary file ──
const pixels = new Uint8Array([0x89, 0x50, 0x4e, 0x47, /* ... */]);
const writeResult = await fs.writeBinaryFile('~/output/image.png', pixels);
match(writeResult, {
  ok: () => console.log('Written successfully'),
  err: (error) => console.error(error.message),
});
```

### TypeScript — Streaming APIs

```ts
import { fs } from '@vertz/desktop';

// ── Stream-read a large file ──
const streamResult = await fs.readBinaryStream('~/videos/large.mp4');
if (streamResult.ok) {
  const reader = streamResult.data.getReader();
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    processChunk(value); // Uint8Array chunk
  }
}

// ── Stream-write a large file ──
const inputStream = createLargeFileStream(); // ReadableStream<Uint8Array>
const writeResult = await fs.writeBinaryStream('~/backups/archive.tar', inputStream);
```

### Function Signatures

```ts
// Buffered — reads entire file into memory
function readBinaryFile(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<Uint8Array, DesktopError>>;

// Buffered — writes entire Uint8Array to file
function writeBinaryFile(
  path: string,
  data: Uint8Array,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>>;

// Streaming — returns a ReadableStream of chunks
function readBinaryStream(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<ReadableStream<Uint8Array>, DesktopError>>;

// Streaming — pipes a ReadableStream to a file
function writeBinaryStream(
  path: string,
  data: ReadableStream<Uint8Array>,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>>;
```

### Rust — HTTP Sidecar Routes

Two routes added to the existing axum dev server (prefix `__vertz_` for consistency with `__vertz_hmr`, `__vertz_image`, etc.):

```
GET  /__vertz_fs_binary/read?path=<url-encoded-path>
POST /__vertz_fs_binary/write?path=<url-encoded-path>
```

**Read route:**
- Query param: `path` (URL-encoded absolute path; `~` expanded server-side)
- Required header: `X-VTZ-IPC-Token: {nonce}` (see Security section)
- Success: `200 OK` with `Content-Type: application/octet-stream` + `Content-Length: {file_size}`, raw bytes body
- Error: `4xx/5xx` with `Content-Type: application/json`, `{ "code": "...", "message": "..." }`
- Streaming: response body is streamed from disk via `tokio::fs::File` + `ReaderStream`
- Guard: files larger than 2GB return `413 Payload Too Large` with a message suggesting `readBinaryStream` instead

**Write route:**
- Query param: `path` (URL-encoded absolute path)
- Required header: `X-VTZ-IPC-Token: {nonce}` (see Security section)
- Request body: raw bytes (`Content-Type: application/octet-stream`)
- Success: `204 No Content`
- Error: `4xx/5xx` with JSON error body
- Streaming: request body is streamed to disk via `tokio::io::copy`
- Atomic writes: writes to a temp file (`{path}.vtz-tmp`), then renames to target path on success. Partial writes from crashes or disconnects never leave a corrupted target file.
- Creates parent directories automatically (consistent with `writeTextFile`)

**Error code → HTTP status mapping:**

| DesktopErrorCode | HTTP Status |
|---|---|
| `NOT_FOUND` | 404 |
| `PERMISSION_DENIED` | 403 |
| `IO_ERROR` | 500 |
| `INVALID_PATH` | 400 |

### Permission Model

Binary file operations reuse the existing `fs:read` and `fs:write` capability groups:

- `readBinaryFile` / `readBinaryStream` → requires `fs:read`
- `writeBinaryFile` / `writeBinaryStream` → requires `fs:write`

The HTTP route handlers check `IpcPermissions` from shared state before executing. In dev mode (`AllowAll`), no checking occurs — consistent with the existing IPC dispatcher.

**Permission method strings added to `KNOWN_METHODS` and `IpcMethodString`:**
- `'fs.readBinaryFile'` → capability `fs:read` (covers both buffered and streaming read — same underlying operation)
- `'fs.writeBinaryFile'` → capability `fs:write` (covers both buffered and streaming write)

**Permission wiring:** `IpcPermissions` is currently constructed in `main.rs` and stored on `IpcDispatcher` — it's not accessible from `DevServerState`. To fix this:
1. Add an `ipc_permissions: Arc<IpcPermissions>` field to `DevServerState`
2. `main.rs` creates `IpcPermissions` before building the router and passes it to both `IpcDispatcher` and `DevServerState`
3. Binary route handlers extract permissions via `State<Arc<DevServerState>>` and call `ipc_permissions.is_allowed(method)`

In dev mode this is `AllowAll` (no checking). In production, the same `from_capabilities()` resolution applies.

### Security — Session Nonce

The existing IPC bridge (`window.__vtz_ipc.invoke`) runs in-process via wry's native IPC — it's not reachable via plain HTTP. The binary routes ARE plain HTTP endpoints on localhost, accessible to any process on the same machine.

**Defense-in-depth: session nonce.**

1. On server startup, generate a random 256-bit nonce (`rand::random::<[u8; 32]>()`, hex-encoded)
2. Store the nonce in `DevServerState`
3. Inject the nonce into the webview via the initialization script (alongside `IPC_CLIENT_JS`):
   ```js
   window.__vtz_ipc_token = '<nonce>';
   ```
4. The `binaryFetch` JS helper includes `X-VTZ-IPC-Token: {nonce}` in every request
5. The Rust route handlers validate the token before processing — return `403 Forbidden` on mismatch

This prevents arbitrary local processes from reading/writing files through the binary routes. The nonce is per-session (regenerated on every dev server restart) and never persisted to disk.

### JS Client — Transport Layer

Binary APIs use `fetch()` instead of `window.__vtz_ipc.invoke()`:

```ts
declare global {
  interface Window {
    __vtz_ipc_token?: string;
  }
}

// Internal implementation (not public API)
async function binaryFetch(
  route: 'read' | 'write',
  path: string,
  body?: Uint8Array | ReadableStream<Uint8Array>,
  options?: IpcCallOptions,
): Promise<Result<Response, DesktopError>> {
  // Detect non-webview context (no IPC token = not running in desktop runtime)
  if (typeof window === 'undefined' || !window.__vtz_ipc_token) {
    return err({
      code: 'EXECUTION_FAILED' as DesktopErrorCode,
      message: '@vertz/desktop: Binary IPC not available. Are you running in the native webview?',
    });
  }

  const url = `/__vertz_fs_binary/${route}?path=${encodeURIComponent(path)}`;
  const controller = new AbortController();
  const timeoutId = options?.timeout
    ? setTimeout(() => controller.abort(), options.timeout)
    : undefined;

  try {
    const response = await fetch(url, {
      method: route === 'read' ? 'GET' : 'POST',
      headers: { 'X-VTZ-IPC-Token': window.__vtz_ipc_token },
      body: body ?? undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const error = await response.json();
        return err({ code: error.code as DesktopErrorCode, message: error.message });
      }
      // Non-JSON error (proxy error, server crash, etc.)
      return err({
        code: 'IO_ERROR' as DesktopErrorCode,
        message: `HTTP ${response.status}: ${await response.text()}`,
      });
    }

    return ok(response);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return err({ code: 'TIMEOUT' as DesktopErrorCode, message: 'Request timed out' });
    }
    return err({
      code: 'IO_ERROR' as DesktopErrorCode,
      message: e instanceof Error ? e.message : 'Network error',
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Public API wraps binaryFetch and converts Response → Uint8Array
async function readBinaryFile(path: string, options?: IpcCallOptions) {
  const result = await binaryFetch('read', path, undefined, options);
  if (!result.ok) return result;
  const buffer = await result.data.arrayBuffer();
  return ok(new Uint8Array(buffer));
}
```

The `binaryFetch` function is internal to the `fs` module. Public APIs (`readBinaryFile`, etc.) wrap it and convert to `Result<T, DesktopError>`.

**Timeout semantics for streaming:** The `timeout` option applies to the initial `fetch()` response (connection + first byte). Once a `ReadableStream` is returned, the caller controls pacing — the timeout does not apply to individual chunks or total stream duration.

### Port Discovery

The webview loads from `http://localhost:{port}`, so relative fetch URLs (`/__vertz_fs_binary/...`) automatically target the correct dev server. No port discovery mechanism is needed — this is the same origin.

## Type Flow Map

```
readBinaryFile(path: string) ─── path ──→ binaryFetch('read', path)
                                               │
                                   fetch GET /__vertz_fs_binary/read?path=...
                                               │
                                  ┌─ 200: response.arrayBuffer() → Uint8Array → ok(data)
                                  └─ 4xx: response.json() → DesktopError → err(error)
                                               │
                              Result<Uint8Array, DesktopError>

writeBinaryFile(path, data: Uint8Array) ─── data ──→ binaryFetch('write', path, data)
                                                          │
                                              fetch POST body: raw bytes
                                                          │
                                             ┌─ 204: ok(undefined as void)
                                             └─ 4xx: response.json() → DesktopError → err(error)
                                                          │
                                          Result<void, DesktopError>

readBinaryStream(path) ─── path ──→ binaryFetch('read', path)
                                         │
                            fetch GET → response.body (ReadableStream<Uint8Array>)
                                         │
                    Result<ReadableStream<Uint8Array>, DesktopError>

writeBinaryStream(path, stream) ─── stream ──→ binaryFetch('write', path, stream)
                                                    │
                                       fetch POST body: ReadableStream
                                                    │
                                       Result<void, DesktopError>
```

Generics trace: `Result<T, DesktopError>` where `T` is:
- `Uint8Array` for `readBinaryFile`
- `void` for `writeBinaryFile` / `writeBinaryStream`
- `ReadableStream<Uint8Array>` for `readBinaryStream`

No dead generics — every type parameter reaches the consumer.

## Manifesto Alignment

### If it builds, it works
Type-safe `Result<Uint8Array, DesktopError>` return — the compiler ensures callers handle both success and error. No unchecked casts, no `any`.

### One way to do things
Buffered for small files, streaming for large files — two functions with clear, distinct use cases rather than one overloaded function with options. Consistent `Result` error handling across both.

### Performance is not optional
The entire motivation is eliminating base64 overhead. Raw bytes over HTTP with streaming I/O means:
- Zero encoding/decoding overhead (no base64)
- Constant memory for streaming (no full-file buffering)
- Tokio async I/O on the Rust side (no blocking the event loop)

### No ceilings
Streaming support means there's no file-size ceiling. A 4GB video file works the same as a 4KB icon.

### Tradeoffs

**Chosen: HTTP sidecar over shared memory.** Shared memory (via wry custom protocols or IPC shared buffers) would have lower latency but adds significant complexity:
- Wry's custom protocol handler runs synchronously on the main thread
- Shared memory requires lifecycle management and platform-specific code
- HTTP is well-understood, debuggable (DevTools Network tab), and works identically across platforms

**Chosen: Separate streaming functions over options-based overloads.** Two functions (`readBinaryFile` vs `readBinaryStream`) instead of `readBinaryFile(path, { stream: true })` with conditional return types. Overloads that change the return type based on options violate "one way to do things" — the caller's type depends on a runtime value.

**Rejected: Base64 over existing IPC.** The simplest approach — encode to base64 on Rust side, decode on JS side — adds 33% size overhead and CPU cost for decode. Unacceptable for the use cases motivating this feature (media, large files).

**Rejected: WebSocket binary frames.** WebSocket already exists for HMR (`/__vertz_hmr`). Binary frames could carry file data, but WebSocket requires connection management, framing, and multiplexing for concurrent requests. HTTP is stateless and maps naturally to file operations (one request = one file).

## Non-Goals

- **File watching / change events** — requires push channel (Rust → JS), separate design needed for event subscription model
- **Memory-mapped files** — too platform-specific, no clear use case from webview JS
- **File locking** — complex semantics, defer until concrete use case
- **Compression** — `Content-Encoding: gzip` could reduce transfer size but adds CPU cost; defer as an optimization
- **Chunked upload with resume** — complex protocol for handling interrupted large writes; defer until needed
- **Path sandboxing** — dev mode allows all paths (consistent with existing IPC); production sandboxing is a separate security feature
- **Write mode options (append, create-only)** — `writeBinaryFile` always truncates-and-writes, consistent with `writeTextFile`. Append and create-only modes deferred until concrete use case
- **Range reads** — `readBinaryFile` with `{ offset, length }` for partial reads (e.g., reading file headers). Natural fit for HTTP `Range` headers; defer as an optimization
- **Production transport** — production desktop builds may not include a dev server. If production uses `file://` or bundled assets, binary APIs need a different transport (wry custom protocol or lightweight HTTP server). This is deferred — the current design targets dev mode, consistent with the Phase 0-2 IPC bridge

## Unknowns

### 1. `fetch()` streaming upload support in wry's webview

**Risk:** `fetch()` with a `ReadableStream` body (for `writeBinaryStream`) may not be supported in all webview engines (WebKit on macOS, WebView2 on Windows).

**Resolution:** POC needed during Phase 3. If `ReadableStream` body is not supported in wry's WebKit, `writeBinaryStream` is deferred entirely (not shipped in this feature). The chunked upload fallback would be a non-trivial secondary protocol and deserves its own design doc if ever needed.

**Mitigation:** The buffered APIs (`readBinaryFile`/`writeBinaryFile`) don't depend on streaming upload — they use `ArrayBuffer` request bodies, which are universally supported. `readBinaryStream` uses `response.body` (ReadableStream from fetch response), which is widely supported and not affected by this unknown.

### 2. Maximum `ArrayBuffer` size in webview

**Risk:** `readBinaryFile` on a very large file (>2GB) could exceed the webview's `ArrayBuffer` allocation limit.

**Resolution:** Document a practical limit (e.g., files up to 2GB for buffered API). Files larger than the limit must use the streaming API. The Rust handler can check `Content-Length` and return an error if the file exceeds a configurable threshold.

## POC Results

No POC branch needed. The transport approach is validated by existing patterns in the codebase:

1. **Binary HTTP response:** The image proxy route (`/__vertz_image/*`) already serves binary data from the same axum server with correct `Content-Type` headers.
2. **Fetch from webview:** The webview loads from `http://localhost:{port}`, so same-origin `fetch()` calls work without CORS. The MCP endpoints already accept POST requests with JSON bodies from in-page scripts.
3. **Tokio streaming I/O:** The dev server already uses `tokio::fs` for async file reads in the module server.

These three patterns compose directly into the binary file transport.

## E2E Acceptance Test

```ts
import { fs } from '@vertz/desktop';
import { expectTypeOf } from 'expect-type';

describe('Feature: Binary file read/write', () => {
  describe('Given a binary file exists on disk', () => {
    describe('When calling fs.readBinaryFile(path)', () => {
      it('Then returns ok(Uint8Array) with the file contents', async () => {
        const result = await fs.readBinaryFile('/tmp/test-binary.png');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toBeInstanceOf(Uint8Array);
          expect(result.data.byteLength).toBeGreaterThan(0);
          // PNG magic bytes
          expect(result.data[0]).toBe(0x89);
          expect(result.data[1]).toBe(0x50);
        }
      });
    });
  });

  describe('Given a Uint8Array with binary data', () => {
    describe('When calling fs.writeBinaryFile(path, data)', () => {
      it('Then writes the exact bytes to disk', async () => {
        const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        const writeResult = await fs.writeBinaryFile('/tmp/test-output.bin', data);
        expect(writeResult.ok).toBe(true);

        // Round-trip: read back and verify
        const readResult = await fs.readBinaryFile('/tmp/test-output.bin');
        expect(readResult.ok).toBe(true);
        if (readResult.ok) {
          expect(readResult.data).toEqual(data);
        }
      });
    });
  });

  describe('Given a path that does not exist', () => {
    describe('When calling fs.readBinaryFile(path)', () => {
      it('Then returns err with NOT_FOUND code', async () => {
        const result = await fs.readBinaryFile('/nonexistent/file.bin');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });
  });

  describe('Given no desktop runtime is available', () => {
    describe('When calling fs.readBinaryFile(path)', () => {
      it('Then returns err with EXECUTION_FAILED code', async () => {
        // Outside webview context — window.__vtz_ipc_token is undefined
        // binaryFetch checks for the token before making any fetch call
        const result = await fs.readBinaryFile('/any/path');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('EXECUTION_FAILED');
        }
      });
    });
  });

  describe('Given a binary write completes successfully', () => {
    describe('When checking the transfer overhead', () => {
      it('Then the response body size matches the file size exactly (no base64)', async () => {
        const data = new Uint8Array(1024 * 1024); // 1MB of zeros
        crypto.getRandomValues(data);
        await fs.writeBinaryFile('/tmp/test-overhead.bin', data);
        const result = await fs.readBinaryFile('/tmp/test-overhead.bin');
        expect(result.ok).toBe(true);
        if (result.ok) {
          // Exact byte match proves no base64 inflation (which would be 1.33x)
          expect(result.data.byteLength).toBe(data.byteLength);
          expect(result.data).toEqual(data);
        }
      });
    });
  });

  describe('Given a large file on disk', () => {
    describe('When calling fs.readBinaryStream(path)', () => {
      it('Then returns ok(ReadableStream) that yields Uint8Array chunks', async () => {
        const result = await fs.readBinaryStream('/tmp/large-test-file.bin');
        expect(result.ok).toBe(true);
        if (result.ok) {
          const reader = result.data.getReader();
          const { done, value } = await reader.read();
          expect(done).toBe(false);
          expect(value).toBeInstanceOf(Uint8Array);
          reader.releaseLock();
        }
      });
    });
  });
});

// ── Type-level tests ──

// readBinaryFile returns Result<Uint8Array, DesktopError>
expectTypeOf(fs.readBinaryFile('path')).toEqualTypeOf<
  Promise<Result<Uint8Array, DesktopError>>
>();

// writeBinaryFile returns Result<void, DesktopError>
expectTypeOf(fs.writeBinaryFile('path', new Uint8Array())).toEqualTypeOf<
  Promise<Result<void, DesktopError>>
>();

// readBinaryStream returns Result<ReadableStream<Uint8Array>, DesktopError>
expectTypeOf(fs.readBinaryStream('path')).toEqualTypeOf<
  Promise<Result<ReadableStream<Uint8Array>, DesktopError>>
>();

// writeBinaryStream returns Result<void, DesktopError>
expectTypeOf(fs.writeBinaryStream('path', new ReadableStream())).toEqualTypeOf<
  Promise<Result<void, DesktopError>>
>();

// @ts-expect-error — readBinaryFile requires a path argument
fs.readBinaryFile();

// @ts-expect-error — readBinaryStream requires a path argument
fs.readBinaryStream();

// @ts-expect-error — writeBinaryFile requires Uint8Array, not string
fs.writeBinaryFile('path', 'not binary');

// @ts-expect-error — writeBinaryFile requires Uint8Array, not ArrayBuffer
fs.writeBinaryFile('path', new ArrayBuffer(8));

// @ts-expect-error — writeBinaryStream requires ReadableStream, not Uint8Array
fs.writeBinaryStream('path', new Uint8Array());

// @ts-expect-error — writeBinaryStream requires ReadableStream<Uint8Array>, not ReadableStream<string>
fs.writeBinaryStream('path', new ReadableStream<string>());
```

## Implementation Phases

### Phase 1: HTTP Sidecar Transport + Buffered Read + Session Nonce

**Rust:**
- Generate session nonce on server startup, store in `DevServerState`
- Add `ipc_permissions: Arc<IpcPermissions>` field to `DevServerState`; pass from `main.rs`
- Inject nonce into webview initialization script (`window.__vtz_ipc_token = '<nonce>'`)
- Add `/__vertz_fs_binary/read` route with nonce validation, permission check (`fs.readBinaryFile` → `fs:read`), `expand_tilde`, async file read via `tokio::fs::read`, `Content-Length` header from file metadata
- Add 2GB size guard for buffered reads (returns `413` suggesting streaming API)
- Error responses as JSON with correct HTTP status codes
- Add `fs.readBinaryFile` to `KNOWN_METHODS`, `resolve_capability` (`fs:read` and `fs:all`), and `suggest_capability`

**TypeScript:**
- Add `binaryFetch()` internal helper with nonce header (`X-VTZ-IPC-Token`), non-JSON error fallback, and timeout handling
- Add `readBinaryFile()` to `fs.ts`
- Add `'fs.readBinaryFile'` to `IpcMethodString` union
- Add type-level tests (`.test-d.ts`)

### Phase 2: Buffered Write

**Rust:**
- Add `/__vertz_fs_binary/write` route with nonce validation, permission check (`fs.writeBinaryFile` → `fs:write`)
- Atomic write: write to `{path}.vtz-tmp`, then `tokio::fs::rename` to target path
- Create parent directories automatically
- Add `fs.writeBinaryFile` to `KNOWN_METHODS`, `resolve_capability` (`fs:write` and `fs:all`), and `suggest_capability`

**TypeScript:**
- Add `writeBinaryFile()` to `fs.ts`
- Add `'fs.writeBinaryFile'` to `IpcMethodString` union
- Round-trip integration test (write then read back)
- No-base64-overhead verification test (byte count comparison)

### Phase 3: Streaming Read/Write

**Rust:**
- Add `tokio-util` dependency to `native/vtz/Cargo.toml` (needed for `ReaderStream`)
- Refactor read handler to use `tokio::fs::File` + `tokio_util::io::ReaderStream` for true streaming (no 2GB limit for streaming reads)
- Add streaming write handler using `tokio::io::copy` from request body stream to temp file, then rename
- POC: test `fetch()` with `ReadableStream` body in wry's WebKit. If not supported, `writeBinaryStream` is not shipped in this feature

**TypeScript:**
- Add `readBinaryStream()` to `fs.ts`
- Add `writeBinaryStream()` to `fs.ts` (conditional on POC result)
- Streaming integration tests

### Phase 4: Docs

- Update docs in `packages/docs/` for the new binary fs APIs
- Document buffered vs. streaming usage guidance, 2GB size limit for buffered reads, error codes, and atomic write behavior
