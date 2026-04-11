# Phase 3: Shell, Clipboard, and App APIs

## Context

The desktop IPC bridge (phases 0-2) shipped the transport layer and filesystem APIs. This phase adds three more namespace handlers that all run safely on tokio background threads: `shell.execute`, `clipboard.readText/writeText`, and `app.dataDir/cacheDir/version`.

Design doc: `plans/desktop-ipc-bridge.md`
Issue: #2406

## Tasks

### Task 1: Rust — IpcMethod variants + param/response structs for shell, clipboard, app

**Files:**
- `native/vtz/src/webview/ipc_method.rs` (modified)
- `native/vtz/Cargo.toml` (modified — add `arboard` for clipboard)

**What to implement:**

Add to the `IpcMethod` enum:
```rust
ShellExecute(ShellExecuteParams),
ClipboardReadText,
ClipboardWriteText(ClipboardWriteTextParams),
AppDataDir,
AppCacheDir,
AppVersion,
```

Param structs:
```rust
struct ShellExecuteParams { command: String, args: Vec<String> }
struct ClipboardWriteTextParams { text: String }
```

Response structs:
```rust
struct ShellOutputResponse { code: i32, stdout: String, stderr: String }
```

Add `IpcMethod::parse` arms for all 6 new method strings.

Add `arboard = "3"` to `[dependencies]` under the `desktop` feature.

**Acceptance criteria:**
- [ ] All 6 method strings parse correctly into typed variants
- [ ] Unknown methods still return `MethodNotFound`
- [ ] Bad params return `IoError` with descriptive message
- [ ] Unit tests for each new parse arm

---

### Task 2: Rust — Shell, clipboard, and app handler implementations

**Files:**
- `native/vtz/src/webview/ipc_handlers/shell.rs` (new)
- `native/vtz/src/webview/ipc_handlers/clipboard.rs` (new)
- `native/vtz/src/webview/ipc_handlers/app.rs` (new)
- `native/vtz/src/webview/ipc_handlers/mod.rs` (modified)

**What to implement:**

**Shell handler (`shell.rs`):**
- `execute(params: ShellExecuteParams) -> Result<Value, IpcError>`
- Uses `tokio::process::Command` with `output()`.await
- Returns `ShellOutputResponse { code, stdout, stderr }`
- Maps `io::Error` to `ExecutionFailed` (command not found) or `IoError`
- Does NOT use a shell — executes the command directly (no injection risk)

**Clipboard handler (`clipboard.rs`):**
- `read_text() -> Result<Value, IpcError>`
- `write_text(params: ClipboardWriteTextParams) -> Result<Value, IpcError>`
- Uses `arboard::Clipboard` inside `tokio::task::spawn_blocking` (arboard is sync)
- Maps arboard errors to `IoError`

**App handler (`app.rs`):**
- `data_dir() -> Result<Value, IpcError>` — platform data dir (`~/Library/Application Support` on macOS, `~/.local/share` on Linux)
- `cache_dir() -> Result<Value, IpcError>` — platform cache dir (`~/Library/Caches` on macOS, `~/.cache` on Linux)
- `version() -> Result<Value, IpcError>` — reads `version` field from nearest `package.json` in CWD ancestors

**Acceptance criteria:**
- [ ] `shell::execute` runs a command and returns stdout/stderr/exit code
- [ ] `shell::execute` returns `ExecutionFailed` for non-existent commands
- [ ] `clipboard::read_text` returns clipboard contents as string
- [ ] `clipboard::write_text` writes text to clipboard and returns null
- [ ] `app::data_dir` returns platform-appropriate data directory
- [ ] `app::cache_dir` returns platform-appropriate cache directory
- [ ] `app::version` reads version from package.json or returns error
- [ ] All handlers have unit tests with happy/error paths

---

### Task 3: Rust — Wire new handlers into dispatcher

**Files:**
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified)

**What to implement:**

Add match arms in `execute_method()` for all 6 new variants:
```rust
IpcMethod::ShellExecute(p) => shell_handlers::execute(p).await,
IpcMethod::ClipboardReadText => clipboard_handlers::read_text().await,
IpcMethod::ClipboardWriteText(p) => clipboard_handlers::write_text(p).await,
IpcMethod::AppDataDir => app_handlers::data_dir().await,
IpcMethod::AppCacheDir => app_handlers::cache_dir().await,
IpcMethod::AppVersion => app_handlers::version().await,
```

Add `use` statements for the new handler modules.

**Acceptance criteria:**
- [ ] Exhaustive match compiles (no missing arms)
- [ ] Dispatcher imports updated

---

### Task 4: TypeScript — Shell, clipboard, and app wrappers

**Files:**
- `packages/desktop/src/shell.ts` (new)
- `packages/desktop/src/clipboard.ts` (new)
- `packages/desktop/src/app.ts` (new)
- `packages/desktop/src/index.ts` (modified)

**What to implement:**

**`shell.ts`:**
```ts
export function execute(command: string, args: string[], options?: IpcCallOptions): Promise<Result<ShellOutput, DesktopError>>
```

**`clipboard.ts`:**
```ts
export function readText(options?: IpcCallOptions): Promise<Result<string, DesktopError>>
export function writeText(text: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>
```

**`app.ts`:**
```ts
export function dataDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>>
export function cacheDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>>
export function version(options?: IpcCallOptions): Promise<Result<string, DesktopError>>
```

Update `index.ts` to add namespace exports:
```ts
export * as shell from './shell.js';
export * as clipboard from './clipboard.js';
export * as app from './app.js';
```

**Acceptance criteria:**
- [ ] Each wrapper calls `invoke()` with correct method string and params
- [ ] Types match design doc signatures exactly
- [ ] Typecheck passes

---

### Task 5: TypeScript — Type-level tests

**Files:**
- `packages/desktop/src/__tests__/shell.test-d.ts` (new)
- `packages/desktop/src/__tests__/clipboard.test-d.ts` (new)
- `packages/desktop/src/__tests__/app.test-d.ts` (new)

**What to implement:**

Type tests following the pattern in `fs.test-d.ts`:
- Positive: `expectTypeOf(method()).toEqualTypeOf<Promise<Result<T, DesktopError>>>()`
- Negative: `@ts-expect-error` for wrong argument types
- Cover all methods in each namespace

**Acceptance criteria:**
- [ ] `shell.execute` returns `Promise<Result<ShellOutput, DesktopError>>`
- [ ] `shell.execute('cmd', 'not-array')` is a type error
- [ ] `clipboard.readText()` returns `Promise<Result<string, DesktopError>>`
- [ ] `clipboard.writeText(42)` is a type error
- [ ] `app.version()` returns `Promise<Result<string, DesktopError>>`
- [ ] All `@ts-expect-error` directives are needed (not unused)
