# Desktop IPC Bridge — Native APIs for Vertz Desktop Apps

## Summary

Add a bidirectional IPC bridge between the webview (JavaScript) and the Rust runtime, enabling Vertz desktop apps to access native OS capabilities: filesystem, shell commands, clipboard, and OS dialogs. The bridge uses wry's existing `ipc_handler` + `evaluate_script` for communication, with a TypeScript SDK (`@vertz/desktop`) that developers import to call native APIs.

This is foundational infrastructure for the **IDE Vision** (Rust runtime + webview as IDE) and general-purpose desktop apps built with Vertz.

## Motivation & Priority Justification

### Why this feature

The `vtz` runtime already ships a webview via `--desktop` (wry + tao). The webview can render Vertz apps, but cannot access native OS capabilities. This makes it a browser in a window — not a desktop app platform.

The IPC bridge unlocks two use cases:

1. **IDE Vision** — The long-term plan for a Vertz IDE (Rust runtime + webview + `@vertz/agents`) requires filesystem access, shell execution, and window control. The IPC bridge is the foundational layer that makes this possible.
2. **Desktop apps** — Developers building internal tools, dashboards, or local-first apps can use the same Vertz stack they know for web, plus native OS capabilities.

### Why now (scoped)

This is **not** higher priority than the test runner, package manager, or cloud platform. The design is scoped to Phase 0 (POC) + Phase 1 (transport) + Phase 2 (filesystem only) — minimal Rust work that validates the architecture without diverting from core priorities. Phases 3+ are separate design docs, evaluated only after Phase 2 ships and proves demand.

### Relationship to IDE Vision

The IPC bridge is the foundational layer for the future Vertz IDE. The API surface is designed to support IDE-specific needs:
- **Filesystem** — reading/writing project files, watching for changes
- **Shell** — running build commands, dev servers, git operations
- **Window control** — IDE layout management, panels, multi-window

The general-purpose desktop API and the IDE share the same IPC transport. IDE-specific APIs (project management, LSP integration, agent orchestration) would be built on top in future phases.

## API Surface

### Type definitions

Every type is named, exported, and concrete. No `unknown`, no `any`, no loose generics. The compiler catches invalid usage before runtime.

```ts
// ── @vertz/desktop/types — all exported, all named ──

// ── Filesystem types ──

interface DirEntry {
  name: string;
  isFile: boolean;
  isDir: boolean;
}

interface FileStat {
  size: number;
  isFile: boolean;
  isDir: boolean;
  /** Unix timestamp in milliseconds */
  modified: number;
  /** Unix timestamp in milliseconds */
  created: number;
}

interface CreateDirOptions {
  recursive?: boolean;
}

// ── Shell types ──

interface ShellOutput {
  /** Exit code. 0 = success. Non-zero = command ran but failed. */
  code: number;
  stdout: string;
  stderr: string;
}

// ── Dialog types ──

interface FileFilter {
  name: string;
  extensions: string[];
}

interface OpenDialogOptions {
  filters?: FileFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
  title?: string;
}

interface SaveDialogOptions {
  defaultPath?: string;
  filters?: FileFilter[];
  title?: string;
}

interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

interface MessageDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

// ── Window types ──

interface WindowSize {
  width: number;
  height: number;
}

// ── Error types ──

interface DesktopError {
  code: DesktopErrorCode;
  message: string;
}

type DesktopErrorCode =
  | 'NOT_FOUND'          // File/path not found
  | 'PERMISSION_DENIED'  // OS permission denied
  | 'IO_ERROR'           // General I/O failure
  | 'INVALID_PATH'       // Path traversal, invalid characters
  | 'TIMEOUT'            // IPC request timed out
  | 'METHOD_NOT_FOUND'   // Unknown IPC method
  | 'WINDOW_CLOSED'      // Webview was closed mid-request
  | 'EXECUTION_FAILED'   // Shell command failed to start
  | 'CANCELLED';         // User cancelled (e.g., dialog)

// ── IPC timeout options ──

interface IpcCallOptions {
  timeout?: number;
}
```

### Fully typed method signatures

Every method has exact input types and exact return types. No overloads, no ambiguity.

```ts
// ── @vertz/desktop — the only import developers need ──

import { fs, shell, clipboard, dialog, appWindow, app, ipc } from '@vertz/desktop';

// ── fs namespace ──

declare const fs: {
  readTextFile(path: string, options?: IpcCallOptions): Promise<Result<string, DesktopError>>;
  writeTextFile(path: string, content: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  readDir(path: string, options?: IpcCallOptions): Promise<Result<DirEntry[], DesktopError>>;
  exists(path: string, options?: IpcCallOptions): Promise<Result<boolean, DesktopError>>;
  stat(path: string, options?: IpcCallOptions): Promise<Result<FileStat, DesktopError>>;
  remove(path: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  rename(from: string, to: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  createDir(path: string, options?: CreateDirOptions & IpcCallOptions): Promise<Result<void, DesktopError>>;
};

// ── shell namespace ──

declare const shell: {
  execute(command: string, args: string[], options?: IpcCallOptions): Promise<Result<ShellOutput, DesktopError>>;
};

// ── clipboard namespace ──

declare const clipboard: {
  readText(options?: IpcCallOptions): Promise<Result<string, DesktopError>>;
  writeText(text: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
};

// ── dialog namespace (native OS dialogs, NOT in-app UI dialogs) ──
// For in-app styled dialogs, use useDialogStack() from @vertz/ui.
// dialog.* shows native OS chrome (macOS NSAlert, etc).

declare const dialog: {
  open(options?: OpenDialogOptions & IpcCallOptions): Promise<Result<string | null, DesktopError>>;
  save(options?: SaveDialogOptions & IpcCallOptions): Promise<Result<string | null, DesktopError>>;
  confirm(message: string, options?: ConfirmDialogOptions & IpcCallOptions): Promise<Result<boolean, DesktopError>>;
  message(message: string, options?: MessageDialogOptions & IpcCallOptions): Promise<Result<void, DesktopError>>;
};

// ── appWindow namespace ──

declare const appWindow: {
  setTitle(title: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  setSize(size: WindowSize, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  setFullscreen(fullscreen: boolean, options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  innerSize(options?: IpcCallOptions): Promise<Result<WindowSize, DesktopError>>;
  minimize(options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
  close(options?: IpcCallOptions): Promise<Result<void, DesktopError>>;
};

// ── app namespace ──

declare const app: {
  dataDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>>;
  cacheDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>>;
  /** Reads "version" from the app's root package.json */
  version(options?: IpcCallOptions): Promise<Result<string, DesktopError>>;
};

// ── ipc namespace (escape hatch for custom Rust handlers) ──
// "No ceilings" principle. Developer-registered handlers.

declare const ipc: {
  invoke<TResult>(method: string, params: Record<string, unknown>, options?: IpcCallOptions): Promise<Result<TResult, DesktopError>>;
};
```

### Developer usage

```ts
import { fs, shell, appWindow } from '@vertz/desktop';

// Fully typed — result.data is `string`, not `unknown`
const result = await fs.readTextFile('~/Documents/notes.txt');
if (!result.ok) {
  // result.error is DesktopError — result.error.code is DesktopErrorCode
  console.error(result.error.code, result.error.message);
  return;
}
console.log(result.data); // string — TypeScript knows this

// Named return types, not inline objects
const stat = await fs.stat('~/file.txt');
if (stat.ok) {
  stat.data.size;     // number
  stat.data.modified; // number
  stat.data.isFile;   // boolean
}

// Shell — args must be string[]
const build = await shell.execute('make', ['build'], { timeout: 300_000 });
if (build.ok) {
  build.data.code;   // number — 0 = success, non-zero = ran but failed
  build.data.stdout; // string
  build.data.stderr; // string
}

// Window — setSize takes WindowSize, not positional args
await appWindow.setSize({ width: 1280, height: 800 });
const size = await appWindow.innerSize();
if (size.ok) {
  size.data.width;  // number
  size.data.height; // number
}
```

### Type-level tests (`.test-d.ts`)

These run at `vtz run typecheck` time — no runtime, pure compiler verification.

```ts
// @vertz/desktop/types.test-d.ts
import { expectTypeOf } from 'expect-type';
import type { Result } from '@vertz/errors';
import { fs, shell, clipboard, dialog, appWindow, app, ipc } from '@vertz/desktop';
import type { DirEntry, FileStat, ShellOutput, WindowSize, DesktopError } from '@vertz/desktop';

// ── fs: exact return types ──
expectTypeOf(fs.readTextFile('a')).resolves.toEqualTypeOf<Result<string, DesktopError>>();
expectTypeOf(fs.writeTextFile('a', 'b')).resolves.toEqualTypeOf<Result<void, DesktopError>>();
expectTypeOf(fs.readDir('a')).resolves.toEqualTypeOf<Result<DirEntry[], DesktopError>>();
expectTypeOf(fs.exists('a')).resolves.toEqualTypeOf<Result<boolean, DesktopError>>();
expectTypeOf(fs.stat('a')).resolves.toEqualTypeOf<Result<FileStat, DesktopError>>();
expectTypeOf(fs.remove('a')).resolves.toEqualTypeOf<Result<void, DesktopError>>();
expectTypeOf(fs.rename('a', 'b')).resolves.toEqualTypeOf<Result<void, DesktopError>>();
expectTypeOf(fs.createDir('a')).resolves.toEqualTypeOf<Result<void, DesktopError>>();
expectTypeOf(fs.createDir('a', { recursive: true })).resolves.toEqualTypeOf<Result<void, DesktopError>>();

// ── fs: reject wrong types ──
// @ts-expect-error — path must be string
fs.readTextFile(123);
// @ts-expect-error — content must be string
fs.writeTextFile('a', 123);
// @ts-expect-error — recursive must be boolean
fs.createDir('a', { recursive: 'yes' });

// ── shell: exact return types ──
expectTypeOf(shell.execute('git', ['status'])).resolves.toEqualTypeOf<Result<ShellOutput, DesktopError>>();
// @ts-expect-error — args must be string[], not string
shell.execute('git', 'status');
// @ts-expect-error — command must be string
shell.execute(42, []);

// ── clipboard ──
expectTypeOf(clipboard.readText()).resolves.toEqualTypeOf<Result<string, DesktopError>>();
expectTypeOf(clipboard.writeText('hi')).resolves.toEqualTypeOf<Result<void, DesktopError>>();
// @ts-expect-error — must pass string
clipboard.writeText(42);

// ── dialog: options are typed ──
// @ts-expect-error — filters require name + extensions
dialog.open({ filters: [{ extensions: ['png'] }] });
// @ts-expect-error — kind must be 'info' | 'warning' | 'error'
dialog.confirm('ok?', { kind: 'success' });

// ── appWindow: WindowSize, not positional ──
expectTypeOf(appWindow.innerSize()).resolves.toEqualTypeOf<Result<WindowSize, DesktopError>>();
// @ts-expect-error — setSize takes WindowSize object, not two numbers
appWindow.setSize(1280, 800);
// @ts-expect-error — setFullscreen takes boolean, not string
appWindow.setFullscreen('yes');

// ── app ──
expectTypeOf(app.version()).resolves.toEqualTypeOf<Result<string, DesktopError>>();

// ── ipc: generic flows through ──
expectTypeOf(ipc.invoke<{ count: number }>('custom', {})).resolves.toEqualTypeOf<Result<{ count: number }, DesktopError>>();
// @ts-expect-error — params must be Record<string, unknown>, not a primitive
ipc.invoke('method', 'not-an-object');

// ── Result narrowing works ──
async function testNarrowing() {
  const result = await fs.readTextFile('a');
  if (result.ok) {
    expectTypeOf(result.data).toBeString();
    // @ts-expect-error — error doesn't exist on ok branch
    result.error;
  } else {
    expectTypeOf(result.error.code).toEqualTypeOf<DesktopErrorCode>();
    // @ts-expect-error — data doesn't exist on error branch
    result.data;
  }
}
```

### Invalid usage (compile-time errors — summary)

```ts
import { fs, shell, dialog, appWindow } from '@vertz/desktop';

// @ts-expect-error — readTextFile requires string path
await fs.readTextFile(123);

// @ts-expect-error — shell.execute requires args as string[]
await shell.execute('git', 'status');

// @ts-expect-error — dialog.open filters must have name + extensions
await dialog.open({ filters: [{ extensions: ['png'] }] });

// @ts-expect-error — appWindow.setSize requires WindowSize object
await appWindow.setSize(1280, 800);

// @ts-expect-error — setFullscreen requires boolean
await appWindow.setFullscreen('yes');
```

### How it works at runtime

```
                 ┌─────────────────────────────────────────┐
                 │              WebKit (wry)                │
                 │                                         │
                 │  JS calls window.ipc.postMessage(json)  │
                 │         ↑ result via eval callback       │
                 └─────────┬──────────────────────┬────────┘
                           │                      │
                    ipc_handler              evaluate_script
                   (JS → Rust)              (Rust → JS)
                           │                      │
                 ┌─────────▼──────────────────────▼────────┐
                 │     Rust: ipc_handler closure            │
                 │     (has: tokio Handle + EventLoopProxy) │
                 │                                         │
                 │  1. Deserialize IpcRequest               │
                 │  2. tokio::spawn on background thread    │
                 │  3. Match IpcMethod enum (exhaustive)    │
                 │  4. Execute async handler                │
                 │  5. Send EvalScript via EventLoopProxy   │
                 │  6. Main thread evals response JS        │
                 └─────────────────────────────────────────┘
```

**Threading model:**

1. `ipc_handler` runs on the **main thread** (macOS AppKit requirement). It must not block.
2. Before `WebviewApp::run()`, construct an `IpcDispatcher` that captures:
   - `tokio::runtime::Handle` — for spawning async tasks from the main thread
   - `EventLoopProxy<UserEvent>` — for sending `EvalScript` responses back
3. Inside `ipc_handler`: deserialize → `handle.spawn()` the async work → return immediately.
4. When the async task completes: serialize result → `proxy.send_event(EvalScript { ... })`.
5. The event loop receives `EvalScript` and calls `webview.evaluate_script()` on the main thread.

This is the same pattern already proven by the E2E ops via `WebviewBridge::eval()`. The IPC router reuses `WebviewBridge` for response delivery — no new eval mechanism needed.

### Wire protocol

The wire protocol uses JSON. While the JSON layer itself is untyped, **both sides enforce types at their boundary**:

- **JS side:** Each method wrapper in `@vertz/desktop` serializes typed params and deserializes the response into the exact return type. Developers never interact with raw JSON.
- **Rust side:** The `IpcMethod` enum deserializes the method string, and each variant has a typed params struct. Exhaustive match ensures every method is handled.

```ts
// Request (JS → Rust) — internal, never exposed to developers
interface IpcRequest {
  id: number;                     // monotonically increasing integer (safe up to 2^53)
  method: IpcMethodString;        // discriminant — see IpcMethodString below
  params: Record<string, unknown>; // each method defines its own shape via serde
}

// All valid method strings (maps 1:1 to Rust IpcMethod enum variants)
type IpcMethodString =
  | 'fs.readTextFile'  | 'fs.writeTextFile' | 'fs.readDir'
  | 'fs.exists'        | 'fs.stat'          | 'fs.remove'
  | 'fs.rename'        | 'fs.createDir'
  | 'shell.execute'
  | 'clipboard.readText' | 'clipboard.writeText'
  | 'dialog.open'     | 'dialog.save'      | 'dialog.confirm' | 'dialog.message'
  | 'appWindow.setTitle' | 'appWindow.setSize' | 'appWindow.setFullscreen'
  | 'appWindow.innerSize' | 'appWindow.minimize' | 'appWindow.close'
  | 'app.dataDir'     | 'app.cacheDir'     | 'app.version';

// Response (Rust → JS, injected via evaluate_script) — internal
type IpcResponse =
  | { id: number; ok: true; result: unknown }  // deserialized to T by the method wrapper
  | { id: number; ok: false; error: { code: DesktopErrorCode; message: string } };
```

```rust
// Rust side — typed method enum (serde tag = method string)
#[derive(Debug, serde::Deserialize)]
#[serde(tag = "method")]
enum IpcMethod {
    #[serde(rename = "fs.readTextFile")]
    FsReadTextFile { params: FsReadTextFileParams },
    #[serde(rename = "fs.writeTextFile")]
    FsWriteTextFile { params: FsWriteTextFileParams },
    #[serde(rename = "fs.readDir")]
    FsReadDir { params: FsPathParams },
    #[serde(rename = "fs.exists")]
    FsExists { params: FsPathParams },
    #[serde(rename = "fs.stat")]
    FsStat { params: FsPathParams },
    #[serde(rename = "fs.remove")]
    FsRemove { params: FsPathParams },
    #[serde(rename = "fs.rename")]
    FsRename { params: FsRenameParams },
    #[serde(rename = "fs.createDir")]
    FsCreateDir { params: FsCreateDirParams },
    #[serde(rename = "shell.execute")]
    ShellExecute { params: ShellExecuteParams },
    // ... etc
}

// Each variant has its own typed params struct
#[derive(Debug, serde::Deserialize)]
struct FsReadTextFileParams { path: String }

#[derive(Debug, serde::Deserialize)]
struct FsWriteTextFileParams { path: String, content: String }

#[derive(Debug, serde::Deserialize)]
struct FsPathParams { path: String }

#[derive(Debug, serde::Deserialize)]
struct FsRenameParams { from: String, to: String }

#[derive(Debug, serde::Deserialize)]
struct FsCreateDirParams { path: String, recursive: Option<bool> }

#[derive(Debug, serde::Deserialize)]
struct ShellExecuteParams { command: String, args: Vec<String> }

// Response types are also typed per handler
#[derive(Debug, serde::Serialize)]
struct FileStat { size: u64, is_file: bool, is_dir: bool, modified: u64, created: u64 }

#[derive(Debug, serde::Serialize)]
struct ShellOutput { code: i32, stdout: String, stderr: String }

#[derive(Debug, serde::Serialize)]
struct DirEntry { name: String, is_file: bool, is_dir: bool }
```

**Type safety at every boundary:**

| Layer | Typed? | How |
|-------|--------|-----|
| Developer TS → method wrapper | Yes | Exact param types per method signature |
| Method wrapper → wire JSON | Yes | Wrapper serializes known typed params |
| Wire JSON → Rust deserialize | Yes | `IpcMethod` enum + per-variant params struct |
| Rust handler → response | Yes | Each handler returns a typed `Result<T, IpcError>` |
| Response → wire JSON | Yes | `serde::Serialize` on concrete response types |
| Wire JSON → developer Result | Yes | Method wrapper deserializes to exact `Result<T, DesktopError>` |

### Timeout handling

Each method category has a default timeout:

| Category | Default timeout | Rationale |
|----------|----------------|-----------|
| `fs.*` | 10s | Filesystem ops should be fast, 10s catches hangs |
| `shell.execute` | 120s | Build commands can be slow |
| `clipboard.*` | 5s | Should be instant |
| `dialog.*` | None (∞) | User interaction, no timeout |
| `appWindow.*` | 5s | Window ops are synchronous |
| `app.*` | 5s | Metadata reads are fast |

Developers can override per-call:

```ts
const result = await shell.execute('make', ['build'], { timeout: 300_000 }); // 5 minutes
```

**Dangling responses:** When a request times out, the JS side removes the promise from the pending map and resolves with `{ ok: false, error: { code: 'TIMEOUT', ... } }`. If the Rust side later completes, `__vtz_ipc_resolve` silently drops the response (ID not found in pending map).

**Window close:** When the webview closes, all pending promises are rejected with `{ ok: false, error: { code: 'WINDOW_CLOSED', ... } }`. The JS IPC client listens for `beforeunload` to trigger this cleanup.

## Manifesto Alignment

### Principles upheld

- **If it builds, it works** — Full TypeScript types for every IPC method. Invalid calls caught at compile time.
- **One way to do things** — One API surface (`@vertz/desktop`), one wire protocol, one IPC mechanism.
- **AI agents are first-class users** — API mirrors Node.js `fs` + Tauri patterns. An LLM predicts `fs.readTextFile()` on the first try.
- **No ceilings** — `ipc.invoke()` escape hatch for custom Rust handlers.
- **If you can't demo it, it's not done** — Demo: a desktop dashboard that uses `@vertz/server` + local file import/export.

### What we rejected

- **Tauri-style `#[command]` macros** — Proc macros, custom attributes, codegen. Too much magic. We use a Rust `IpcMethod` enum with `serde::Deserialize` and exhaustive `match` — compile-time safety without proc macros.
- **Electron-style `ipcRenderer`/`ipcMain` split** — Two concepts for one thing. We unify into a single `invoke` pattern.
- **Auto-generating TS types from Rust** — Complex, fragile. We hand-write the TS types to ensure the API is designed for developers, not for the Rust compiler.
- **Method-string dispatch without type safety** — Every IPC method is a variant of `enum IpcMethod`. The Rust router matches exhaustively — adding a method to TS without adding to Rust is a compile error.

## Non-Goals

- **Production app bundling** (`.app`, code signing, auto-update) — separate initiative.
- **Native UI widgets** (menus, system tray, dock icon) — future work after the IPC bridge proves itself.
- **Cross-process communication** — this is same-process webview↔rust, not multi-process IPC.
- **Mobile (iOS/Android)** — desktop-only for now.
- **Production deployment without a permission system** — This feature ships as dev-mode-only. A Tauri-style allowlist/permission system is required before any production desktop deployment is supported. That system is a separate design doc.
- **Binary file APIs** — `readBinaryFile` / `writeBinaryFile` are deferred. The wire protocol is JSON-over-`evaluate_script`, which makes binary data inefficient (base64 encoding, 33% overhead, JS parse cost). Binary file APIs require a separate transport design — likely an HTTP sidecar route (`/__vtz_ipc_binary/:id`) served by the existing axum dev server. This is a separate design doc after Phase 2 proves the text-based IPC works.
- **`shell.spawn()` with streaming output** — The IPC wire protocol is request-response. Streaming stdout/stderr from a spawned process requires a push channel (Rust → JS), which is a different pattern. `shell.execute()` (blocking, returns full output) is in scope. `shell.spawn()` with streaming output requires a separate event subscription design that also enables file watchers and system events.

## Security Considerations

**This is a dev-mode feature.** All IPC calls are unrestricted. This is the same security posture as `vtz dev` itself — a dev server that can read/write any file, execute any command, and serve on any interface.

Known risks in dev mode:
- `shell.execute()` can run arbitrary commands. Any JS executing in the webview has full shell access.
- `fs.*` can read/write any file the user can access. Paths are canonicalized (`~` expanded, symlinks resolved) but not sandboxed.
- If the dev server binds to `0.0.0.0` (via `--host`), the webview's IPC is still local-only — IPC uses `window.ipc.postMessage`, which is only available from within the wry webview context, not from arbitrary HTTP requests.

The IPC router architecture is designed to support per-method allowlists in the future. The `IpcMethod` enum with exhaustive match makes it straightforward to add a permission check before dispatch.

## Unknowns

1. **IPC round-trip latency.** The `ipc_handler` → `tokio::spawn` → `EvalScript` via `EventLoopProxy` path adds main-thread event loop hops. The POC must measure round-trip latency for a simple operation (e.g., `fs.exists`). **Resolution:** POC.

2. **E2E testing of desktop IPC.** The acceptance tests require running in a webview context with IPC. The current test runner (`vtz test`) runs in V8 without a webview. Desktop IPC tests need either (a) the E2E runner (`vtz test --e2e`) which already has webview support, or (b) Rust-level integration tests. **Resolution:** Phase 0 POC uses Rust integration tests. Phase 1+ uses `vtz test --e2e`.

## POC Results

*To be filled after POC.*

## Type Flow Map

### Trace 1: `fs.readTextFile` (string → string)

```
Layer                                    Type at this point
──────────────────────────────────────────────────────────────────
Developer: fs.readTextFile(path)         path: string ✓ (enforced by method signature)
                                         Return: Promise<Result<string, DesktopError>>
  ↓
TS wrapper serializes:                   { method: 'fs.readTextFile', params: { path: string } }
  ↓                                      IpcMethodString literal — not an arbitrary string
JSON over window.ipc.postMessage
  ↓
Rust deserializes:                       IpcMethod::FsReadTextFile { params: FsReadTextFileParams }
                                         FsReadTextFileParams { path: String } ✓ typed struct
  ↓
Rust handler returns:                    Result<String, IpcError> ✓ concrete Rust types
  ↓
Rust serializes response:               { id: u64, ok: true, result: "file contents" }
  ↓
evaluate_script → JS
  ↓
TS wrapper deserializes:                 Result<string, DesktopError> ✓
  ↓
Developer: result.data                   string ✓ — TypeScript knows the exact type
           result.error.code             DesktopErrorCode ✓ — discriminated union
```

### Trace 2: `fs.stat` (string → FileStat)

```
Developer: fs.stat(path)                 path: string ✓
                                         Return: Promise<Result<FileStat, DesktopError>>
  ↓
Rust: IpcMethod::FsStat                  FsPathParams { path: String } ✓
  ↓
Rust handler returns:                    Result<FileStat, IpcError>
                                         FileStat { size: u64, is_file: bool, ... } ✓
  ↓
Developer: result.data.size              number ✓ (not unknown)
           result.data.isFile            boolean ✓ (not unknown)
           result.data.modified          number ✓ (not unknown)
```

### Trace 3: `shell.execute` (string + string[] → ShellOutput)

```
Developer: shell.execute(cmd, args)      cmd: string ✓, args: string[] ✓
                                         Return: Promise<Result<ShellOutput, DesktopError>>
  ↓
Rust: IpcMethod::ShellExecute            ShellExecuteParams { command: String, args: Vec<String> } ✓
  ↓
Rust handler returns:                    Result<ShellOutput, IpcError>
                                         ShellOutput { code: i32, stdout: String, stderr: String } ✓
  ↓
Developer: result.data.code              number ✓
           result.data.stdout            string ✓
           result.data.stderr            string ✓
```

### Trace 4: Result narrowing (discriminated union)

```
const result = await fs.readTextFile('a');
                                         Result<string, DesktopError>

if (result.ok) {                         narrowed to { ok: true; data: string }
  result.data                            string ✓
  result.error                           TS error ✗ — doesn't exist on ok branch
} else {                                 narrowed to { ok: false; error: DesktopError }
  result.error.code                      DesktopErrorCode ✓
  result.error.message                   string ✓
  result.data                            TS error ✗ — doesn't exist on error branch
}
```

**No `unknown` anywhere in the developer-facing API.** Every input parameter, every return type, every error field is a concrete named type. The `ipc.invoke<T>()` escape hatch is the only place with a generic — and even there, `params` is `Record<string, unknown>` (not bare `unknown`), and the developer explicitly provides `T`.

## E2E Acceptance Test

```ts
import { describe, it, expect } from '@vertz/test';
import { fs, clipboard, appWindow, app } from '@vertz/desktop';

describe('Feature: Desktop IPC bridge', () => {
  describe('Given a desktop app running with --desktop', () => {
    describe('When calling fs.readTextFile() with a valid path', () => {
      it('Then returns ok result with file contents', async () => {
        const result = await fs.readTextFile('./test-fixtures/hello.txt');
        expect(result.ok).toBe(true);
        expect(result.data).toBe('Hello from Vertz Desktop!');
      });
    });

    describe('When calling fs.writeTextFile() then readTextFile()', () => {
      it('Then the written content round-trips', async () => {
        const tmpPath = './test-fixtures/tmp-write-test.txt';
        const writeResult = await fs.writeTextFile(tmpPath, 'round-trip test');
        expect(writeResult.ok).toBe(true);

        const readResult = await fs.readTextFile(tmpPath);
        expect(readResult.ok).toBe(true);
        expect(readResult.data).toBe('round-trip test');

        await fs.remove(tmpPath);
      });
    });

    describe('When calling fs.readTextFile() with a non-existent path', () => {
      it('Then returns error result with NOT_FOUND code', async () => {
        const result = await fs.readTextFile('./does-not-exist.txt');
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('NOT_FOUND');
      });
    });

    describe('When calling fs.readDir()', () => {
      it('Then returns array of DirEntry objects', async () => {
        const result = await fs.readDir('./test-fixtures');
        expect(result.ok).toBe(true);
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]).toHaveProperty('name');
        expect(result.data[0]).toHaveProperty('isFile');
        expect(result.data[0]).toHaveProperty('isDir');
      });
    });

    describe('When calling clipboard.writeText() then readText()', () => {
      it('Then the clipboard round-trips the text', async () => {
        const write = await clipboard.writeText('vertz-clipboard-test');
        expect(write.ok).toBe(true);

        const read = await clipboard.readText();
        expect(read.ok).toBe(true);
        expect(read.data).toBe('vertz-clipboard-test');
      });
    });

    describe('When calling appWindow.setTitle()', () => {
      it('Then the window title updates', async () => {
        const result = await appWindow.setTitle('Test Title');
        expect(result.ok).toBe(true);
      });
    });

    describe('When calling appWindow.setSize() with an object', () => {
      it('Then the window resizes', async () => {
        const result = await appWindow.setSize({ width: 800, height: 600 });
        expect(result.ok).toBe(true);

        const size = await appWindow.innerSize();
        expect(size.ok).toBe(true);
        expect(size.data.width).toBe(800);
        expect(size.data.height).toBe(600);
      });
    });

    // @ts-expect-error — readTextFile requires string, not number
    describe('When calling fs.readTextFile(123)', () => {
      it('Then TypeScript catches the error at compile time', () => {});
    });

    // @ts-expect-error — setSize requires object, not positional args
    describe('When calling appWindow.setSize(1280, 800)', () => {
      it('Then TypeScript catches the error at compile time', () => {});
    });
  });
});
```

## Implementation Phases

### Phase 0: POC — IPC round-trip (unblocks unknowns)

Validate the threading model: `ipc_handler` closure capturing `tokio::runtime::Handle` + `EventLoopProxy`, dispatching to a background task, returning via `EvalScript`. Measure round-trip latency.

**Deliverable:** Working `fs.readTextFile()` call from JS → Rust → JS with timing measurements. Rust integration test proving the round-trip.

**Architecture to validate:**
```rust
// Before WebviewApp::run():
let tokio_handle = tokio::runtime::Handle::current();
let proxy = app.proxy();

// In ipc_handler:
.with_ipc_handler(move |req| {
    let body = req.body().to_string();
    let proxy = proxy.clone();
    let handle = tokio_handle.clone();
    handle.spawn(async move {
        let request: IpcRequest = serde_json::from_str(&body)?;
        let result = dispatch(request.method, request.params).await;
        let response_js = format!(
            "window.__vtz_ipc_resolve({}, {})",
            request.id, serde_json::to_string(&result)?
        );
        let (tx, _rx) = oneshot::channel();
        proxy.send_event(eval_script_event(response_js, tx));
    });
})
```

### Phase 1: IPC transport layer

Build the production-quality IPC router and JS client.

- Rust: `IpcMethod` enum with `serde::Deserialize` + exhaustive match. `IpcDispatcher` struct. Error types.
- JS: `window.__vtz_ipc` with `invoke()`, promise registry, timeout handling, window-close cleanup.
- Wire into `webview/mod.rs`. Reuse `WebviewBridge` for response delivery.
- `@vertz/desktop` package skeleton with `ipc.invoke()` and `Result`/`DesktopError` types.

### Phase 2: Filesystem APIs

Implement `fs.*` methods — text-only (binary deferred).

- `readTextFile`, `writeTextFile`, `readDir`, `exists`, `stat`, `remove`, `rename`, `createDir`
- Path resolution: `~` expansion, canonicalization, relative-to-app-root (directory containing `package.json`)
- Full `@vertz/desktop` package published with fs types and docs.

### Future phases (separate design docs)

- **Shell, clipboard, dialog, window, app** — evaluated after Phase 2 proves the architecture.
- **Binary file APIs** — separate transport design (HTTP sidecar or shared memory).
- **`shell.spawn()` with streaming** — event subscription system (Rust → JS push).
- **Permission system** — per-method allowlist for production builds.
- **Demo app** — desktop dashboard using `@vertz/server` + local file import/export, showcasing the full Vertz stack (not a toy file explorer).

## Key Files

| Component | Path |
|-----------|------|
| Webview module | `native/vtz/src/webview/mod.rs` |
| Webview bridge (reused) | `native/vtz/src/webview/bridge.rs` |
| CLI desktop flags | `native/vtz/src/cli.rs` |
| E2E ops (reference pattern) | `native/vtz/src/runtime/ops/e2e.rs` |
| IPC method enum (new) | `native/vtz/src/webview/ipc_method.rs` |
| IPC dispatcher (new) | `native/vtz/src/webview/ipc_dispatcher.rs` |
| IPC handlers (new) | `native/vtz/src/webview/ipc_handlers/` |
| JS IPC client (new) | `native/vtz/src/webview/ipc_client.js` |
| `@vertz/desktop` (new) | `packages/desktop/` |
