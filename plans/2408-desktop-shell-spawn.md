# Desktop `shell.spawn()` with Streaming Output & Event Channel

**Issue:** #2408
**Depends on:** Desktop IPC Bridge (plans/desktop-ipc-bridge.md, Phases 0-2)
**Status:** Draft — Rev 2 (addressing DX, Product, and Technical review findings)

## Summary

Add `shell.spawn()` to `@vertz/desktop` that starts a long-running process and streams stdout/stderr back to JavaScript in real time. This requires a generic **event channel** (Rust → JS push) that extends the existing request-response IPC bridge. The event channel is reusable for future features like file watchers and system events.

Also implements `shell.execute()` (blocking, full output) as a stepping stone — it was designed in the IPC bridge doc (Phase 3) but not yet built.

## Motivation

The current IPC bridge is request-response only. `shell.execute()` blocks until the command finishes and returns the full output. This doesn't work for:

- **Long-running processes** — dev servers, build watchers, test runners. Developers need to see output as it arrives, not after the process exits.
- **IDE Vision** — the future Vertz IDE needs to run `vtz dev`, `git` commands, and agent workflows with live output streaming.
- **Interactive workflows** — processes where the developer reacts to output while the process runs (e.g., a REPL, log tailing).

The event channel built for `shell.spawn()` also enables future push-based features:
- **File watchers** (`fs.watch()`) — push file change events
- **System events** — clipboard changes, window focus, etc.

## API Surface

### New types

```ts
// ── @vertz/desktop/types ──

/** Options for spawning a process. */
interface SpawnOptions {
  /** Working directory. Defaults to app root. */
  cwd?: string;
  /** Additional environment variables merged with the current env. */
  env?: Record<string, string>;
}

/** Handle to a running child process. */
interface ChildProcess {
  /** The OS process ID (PID). Useful for debugging (`ps aux`). */
  readonly pid: number;

  /**
   * Register a callback for stdout data chunks.
   * Multiple callbacks are supported — each call appends a new listener.
   * Returns a disposer function to remove this specific listener.
   */
  onStdout(callback: (data: string) => void): () => void;

  /**
   * Register a callback for stderr data chunks.
   * Multiple callbacks are supported.
   * Returns a disposer function.
   */
  onStderr(callback: (data: string) => void): () => void;

  /**
   * Register a callback for process exit.
   * `code` is the exit code (0 = success, non-zero = failure).
   * `code` is `null` if the process was killed by a signal.
   * Guaranteed to fire AFTER all stdout/stderr chunks have been delivered.
   * Multiple callbacks are supported.
   * Returns a disposer function.
   */
  onExit(callback: (code: number | null) => void): () => void;

  /** Kill the process (SIGTERM on Unix, TerminateProcess on Windows).
   *  Returns ok even if the process already exited (idempotent). */
  kill(): Promise<Result<void, DesktopError>>;
}

/** Event types pushed from Rust to JS for a spawned process. */
type ProcessEventType = 'stdout' | 'stderr' | 'exit';
```

### Extended shell namespace

```ts
// ── @vertz/desktop — shell namespace ──

import type { Result } from '@vertz/errors';
import type {
  ChildProcess,
  DesktopError,
  IpcCallOptions,
  ShellOutput,
  SpawnOptions,
} from '@vertz/desktop';

declare const shell: {
  /**
   * Execute a command and wait for completion. Returns full output.
   * For long-running processes, use `spawn()` instead.
   */
  execute(
    command: string,
    args: string[],
    options?: IpcCallOptions,
  ): Promise<Result<ShellOutput, DesktopError>>;

  /**
   * Spawn a long-running process with streaming stdout/stderr.
   * Returns a ChildProcess handle for subscribing to output and killing.
   *
   * Events are buffered until listeners are registered — no output is lost
   * even for fast-exiting processes. Register callbacks immediately after
   * receiving the handle.
   */
  spawn(
    command: string,
    args: string[],
    options?: SpawnOptions,
  ): Promise<Result<ChildProcess, DesktopError>>;
};
```

### Developer usage

```ts
import { shell } from '@vertz/desktop';

// ── shell.execute() — blocking, full output ──
const build = await shell.execute('make', ['build']);
if (build.ok) {
  console.log(build.data.stdout);
  console.log('exit code:', build.data.code);
}

// ── shell.spawn() — streaming output ──
const result = await shell.spawn('node', ['server.js'], {
  cwd: '~/projects/my-app',
  env: { NODE_ENV: 'development' },
});

if (!result.ok) {
  console.error('Failed to spawn:', result.error.message);
  return;
}

const child = result.data;

// Multiple listeners supported — returns disposer
const offStdout = child.onStdout((data) => {
  console.log('[stdout]', data);
});

child.onStderr((data) => {
  console.error('[stderr]', data);
});

child.onExit((code) => {
  // code is null if killed, number if exited naturally
  console.log('Process exited:', code === null ? 'killed' : `code ${code}`);
});

// Stop listening to stdout without killing the process
offStdout();

// Later: kill the process
await child.kill();

// Compact pattern for short-lived processes:
const echo = await shell.spawn('echo', ['hello']);
if (echo.ok) {
  const chunks: string[] = [];
  echo.data.onStdout((d) => chunks.push(d));
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    echo.data.onExit((code) => { clearTimeout(timer); resolve(code); });
  });
}
```

### Type-level tests (`.test-d.ts`)

```ts
import { expectTypeOf } from 'expect-type';
import type { Result } from '@vertz/errors';
import { shell } from '@vertz/desktop';
import type { ChildProcess, DesktopError, ShellOutput } from '@vertz/desktop';

// ── shell.execute: exact return type ──
expectTypeOf(shell.execute('git', ['status'])).resolves.toEqualTypeOf<
  Result<ShellOutput, DesktopError>
>();

// ── shell.spawn: exact return type ──
expectTypeOf(shell.spawn('node', ['app.js'])).resolves.toEqualTypeOf<
  Result<ChildProcess, DesktopError>
>();

// ── shell.spawn with options ──
expectTypeOf(
  shell.spawn('node', ['app.js'], { cwd: '/tmp', env: { A: 'B' } }),
).resolves.toEqualTypeOf<Result<ChildProcess, DesktopError>>();

// ── ChildProcess methods ──
declare const child: ChildProcess;
expectTypeOf(child.pid).toBeNumber();
expectTypeOf(child.onStdout).toBeFunction();
expectTypeOf(child.onStderr).toBeFunction();
expectTypeOf(child.onExit).toBeFunction();
expectTypeOf(child.kill()).resolves.toEqualTypeOf<Result<void, DesktopError>>();

// ── onStdout returns a disposer ──
expectTypeOf(child.onStdout(() => {})).toEqualTypeOf<() => void>();

// ── onExit callback receives number | null ──
child.onExit((code) => {
  expectTypeOf(code).toEqualTypeOf<number | null>();
});

// ── Invalid usage ──
// @ts-expect-error — command must be string
shell.execute(42, []);

// @ts-expect-error — args must be string[]
shell.execute('git', 'status');

// @ts-expect-error — spawn args must be string[]
shell.spawn('node', 'app.js');

// @ts-expect-error — cwd must be string
shell.spawn('node', ['app.js'], { cwd: 123 });

// @ts-expect-error — env values must be strings
shell.spawn('node', ['app.js'], { env: { A: 123 } });
```

## Event Channel Architecture

The event channel is a generic push mechanism from Rust to JavaScript, built on top of the existing `evaluate_script` path. It is **internal infrastructure** — developers interact with feature-specific APIs (`shell.spawn()`, future `fs.watch()`), not the event channel directly.

### Wire protocol

Single events:
```
window.__vtz_event(subscriptionId, eventType, data)
```

Batched events (for high-frequency output):
```
window.__vtz_event_batch([
  [subscriptionId, eventType, data],
  [subscriptionId, eventType, data],
])
```

- `subscriptionId` — unique integer (from `AtomicU64`) linking events to a JS listener set
- `eventType` — string discriminant (feature-specific: `"stdout"`, `"stderr"`, `"exit"`)
- `data` — JSON-serializable payload (string for output chunks, `number | null` for exit code)

### JS side: EventRegistry (internal)

```ts
// Injected into webview alongside IPC_CLIENT_JS

type ListenerArray = Array<(data: unknown) => void>;

interface EventSubscription {
  listeners: Map<string, ListenerArray>;
  buffer: Array<[string, unknown]>; // Buffered events before listeners are registered
  ready: boolean; // true once first listener is registered
}

const subscriptions = new Map<number, EventSubscription>();

// Called by Rust via evaluate_script — single event
window.__vtz_event = (subId: number, eventType: string, data: unknown) => {
  const sub = subscriptions.get(subId);
  if (!sub) return; // Already unsubscribed or unknown

  if (!sub.ready) {
    // Buffer events until listeners are registered
    sub.buffer.push([eventType, data]);
    return;
  }

  const callbacks = sub.listeners.get(eventType);
  if (callbacks) {
    for (const cb of callbacks) cb(data);
  }
};

// Called by Rust via evaluate_script — batched events
window.__vtz_event_batch = (events: Array<[number, string, unknown]>) => {
  for (const [subId, eventType, data] of events) {
    window.__vtz_event(subId, eventType, data);
  }
};

// Internal API: pre-allocate a subscription (called BEFORE the IPC spawn request)
function allocateSubscription(id: number): void {
  subscriptions.set(id, {
    listeners: new Map(),
    buffer: [],
    ready: false,
  });
}

// Internal API: register a listener and flush buffer on first registration
function addListener(
  id: number,
  eventType: string,
  callback: (data: unknown) => void,
): () => void {
  const sub = subscriptions.get(id);
  if (!sub) return () => {};

  let arr = sub.listeners.get(eventType);
  if (!arr) {
    arr = [];
    sub.listeners.set(eventType, arr);
  }
  arr.push(callback);

  // On first listener registration, flush buffered events
  if (!sub.ready) {
    sub.ready = true;
    for (const [type, data] of sub.buffer) {
      const cbs = sub.listeners.get(type);
      if (cbs) for (const cb of cbs) cb(data);
    }
    sub.buffer.length = 0;
  }

  // Return disposer
  return () => {
    const idx = arr!.indexOf(callback);
    if (idx >= 0) arr!.splice(idx, 1);
  };
}

function unsubscribe(id: number): void {
  subscriptions.delete(id);
}
```

**Key design decision — event buffering:** The subscription is pre-allocated in the EventRegistry *before* the IPC spawn request is sent. Events arriving before listeners are registered are buffered. The buffer is flushed on the first `addListener()` call. This eliminates the race condition between spawn resolution and listener registration — no output is lost, even for fast-exiting processes like `echo hello`.

### Rust side: EventChannel

```rust
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_SUBSCRIPTION_ID: AtomicU64 = AtomicU64::new(1);

/// Allocate a globally unique subscription ID.
pub fn next_subscription_id() -> u64 {
    NEXT_SUBSCRIPTION_ID.fetch_add(1, Ordering::Relaxed)
}

/// Generic push channel from Rust → JS.
/// Uses a fire-and-forget evaluate_script variant to avoid oneshot overhead.
#[derive(Clone)]
pub struct EventChannel {
    proxy: EventLoopProxy<UserEvent>,
}

impl EventChannel {
    pub fn new(proxy: EventLoopProxy<UserEvent>) -> Self {
        Self { proxy }
    }

    /// Push a single event to the JS subscription identified by `sub_id`.
    pub fn emit(&self, sub_id: u64, event_type: &str, data: &serde_json::Value) {
        let js = format!(
            "window.__vtz_event({},{},{})",
            sub_id,
            serde_json::to_string(event_type).unwrap(),
            data,
        );
        let _ = self.proxy.send_event(UserEvent::EvalScriptFireAndForget { js });
    }

    /// Push a batch of events in a single evaluate_script call.
    /// Used by output reader tasks to reduce event loop pressure.
    pub fn emit_batch(&self, events: &[(u64, &str, &serde_json::Value)]) {
        if events.is_empty() { return; }
        let entries: Vec<String> = events.iter().map(|(id, typ, data)| {
            format!("[{},{},{}]", id, serde_json::to_string(typ).unwrap(), data)
        }).collect();
        let js = format!("window.__vtz_event_batch([{}])", entries.join(","));
        let _ = self.proxy.send_event(UserEvent::EvalScriptFireAndForget { js });
    }
}
```

### New `UserEvent` variant

```rust
// Added to the existing UserEvent enum in webview/mod.rs
enum UserEvent {
    ServerReady { port: u16 },
    Navigate(String),
    EvalScript { js: String, tx: Mutex<Option<oneshot::Sender<String>>> },
    EvalScriptFireAndForget { js: String },  // NEW — no callback, no oneshot overhead
    Quit,
}
```

The `EvalScriptFireAndForget` variant is handled in the event loop with a plain `webview.evaluate_script(&js)` call — no callback, no `Mutex<Option<oneshot::Sender>>` allocation. This is critical for high-frequency push events where the JS evaluation result is never needed.

### Handler context

The current `execute_method(method: IpcMethod)` signature only receives the method params. `shell.spawn` and `process.kill` need access to shared state. A `HandlerContext` carries this:

```rust
/// Shared state passed to IPC handlers that need it.
pub struct HandlerContext {
    pub event_channel: EventChannel,
    pub process_map: Arc<ProcessMap>,
}

/// Updated dispatch function signature.
async fn execute_method(method: IpcMethod, ctx: &HandlerContext) -> Result<serde_json::Value, IpcError> {
    match method {
        // Existing FS handlers — don't need ctx, pass through unchanged
        IpcMethod::FsReadTextFile(p) => fs_handlers::read_text_file(p).await,
        // ...
        // New shell handlers — receive ctx
        IpcMethod::ShellExecute(p) => shell_handlers::execute(p).await,
        IpcMethod::ShellSpawn(p) => shell_handlers::spawn(p, ctx).await,
        IpcMethod::ProcessKill(p) => shell_handlers::kill(p, ctx).await,
    }
}
```

The `IpcDispatcher` creates the `HandlerContext` during construction and passes it to `execute_method`. The `ProcessMap` is `Arc`-wrapped so it can be shared between the dispatcher and the webview close handler.

### Output batching strategy

High-frequency output processes (e.g., `find /`, `yes`) can produce thousands of lines per second. To prevent event loop starvation, reader tasks batch output:

1. Reader task reads from the pipe into an internal buffer
2. After each read, check a flush timer (5ms interval)
3. When the timer fires OR the buffer exceeds 64KB, emit a batch via `EventChannel::emit_batch()`
4. Buffer has a hard cap of 1MB — if reached, the batch is flushed immediately regardless of timer

This means:
- Low-frequency output (typical dev server): delivered within 5ms of arrival
- High-frequency output: batched into ~5ms windows, reducing event loop pressure by orders of magnitude
- Pathological output: capped at 1MB per batch to prevent OOM

### How `shell.spawn()` uses the event channel

```
JS: shell.spawn('node', ['app.js'])
  ↓
1. JS allocates subscription ID (via IPC call or pre-allocated by Rust)
2. JS pre-registers subscription in EventRegistry (buffer mode)
  ↓
IPC request: { method: "shell.spawn", params: { command, args, subscriptionId, ... } }
  ↓
Rust: IpcMethod::ShellSpawn(params)
  → tokio::process::Command::new(cmd).stdout(Piped).stderr(Piped).spawn()
  → Take stdout pipe → spawn stdout_reader task
  → Take stderr pipe → spawn stderr_reader task
  → Move child (with pipes taken) → spawn exit_watcher task
  → Store PID + abort handles in ProcessMap
  → Return { pid, subscriptionId } to JS
  ↓
JS receives ok result → constructs ChildProcess handle
  → Developer calls child.onStdout(cb) → addListener() flushes buffer
  ↓
Background Rust tasks:
  → stdout_reader: loop { read chunk → batch → channel.emit_batch() }
  → stderr_reader: loop { read chunk → batch → channel.emit_batch() }
  → exit_watcher:
      1. await stdout_reader completion  ← ORDERING GUARANTEE
      2. await stderr_reader completion  ← all output delivered before exit
      3. child.wait() → get exit code
      4. channel.emit(sub_id, "exit", code_or_null)
      5. process_map.remove(sub_id)
  ↓
JS EventRegistry dispatches to onStdout/onStderr/onExit callbacks
```

**Ordering guarantee:** The exit_watcher task awaits both reader tasks *before* emitting the `exit` event. This ensures all stdout/stderr chunks have been delivered to JS before `onExit` fires. Developers can safely collect output in `onStdout` and process it in `onExit`.

### Process lifecycle & cleanup

| Event | Rust action | JS action |
|-------|-------------|-----------|
| Process exits naturally | Readers complete → exit_watcher emits `exit` → remove from ProcessMap | Buffer flushed → `onExit` fires → unsubscribe from EventRegistry |
| `kill()` called | Send SIGTERM via PID, abort reader tasks → process exits → exit_watcher emits `exit(null)` | `kill()` resolves (ok), then `onExit(null)` fires |
| `kill()` on already-exited process | ProcessMap.kill() returns Ok (idempotent — entry already removed) | `kill()` resolves ok |
| Webview closes | `ProcessMap::kill_all()` kills all active processes | `beforeunload` clears all subscriptions |
| Spawn fails (cmd not found) | Return error result immediately, no subscription created | No ChildProcess constructed |

### Process ownership model (Rust)

The `tokio::process::Child` is split at spawn time to avoid ownership conflicts:

```rust
let mut child = Command::new(&params.command)
    .args(&params.args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| IpcError::execution_failed(...))?;

let pid = child.id().expect("process has PID");

// Take pipes — moves ownership to reader tasks
let stdout = child.stdout.take().unwrap();
let stderr = child.stderr.take().unwrap();

// Spawn reader tasks (own the pipes)
let stdout_handle = tokio::spawn(read_stream(stdout, sub_id, "stdout", channel.clone()));
let stderr_handle = tokio::spawn(read_stream(stderr, sub_id, "stderr", channel.clone()));

// Spawn exit watcher (owns the Child for .wait())
let exit_handle = tokio::spawn(watch_exit(
    child, sub_id, channel.clone(), process_map.clone(),
    stdout_handle, stderr_handle,
));

// Store PID + abort handles in ProcessMap (for kill())
process_map.insert(sub_id, ProcessEntry {
    pid,
    abort_handles: vec![
        stdout_handle.abort_handle(),
        stderr_handle.abort_handle(),
        exit_handle.abort_handle(),
    ],
});
```

**ProcessMap stores PID, not Child.** `kill()` uses `nix::sys::signal::kill(Pid::from_raw(pid), Signal::SIGTERM)` (Unix) or the equivalent on Windows. This avoids holding the `Child` behind a `Mutex` and the anti-pattern of holding a lock across `.await`.

```rust
/// Tracks spawned processes for kill() and cleanup.
pub struct ProcessMap {
    inner: Mutex<HashMap<u64, ProcessEntry>>,
}

struct ProcessEntry {
    pid: u32,
    abort_handles: Vec<tokio::task::AbortHandle>,
}

impl ProcessMap {
    pub fn insert(&self, id: u64, entry: ProcessEntry) { ... }

    /// Kill a process by subscription ID. Idempotent — returns Ok if already removed.
    pub fn kill(&self, id: u64) -> Result<(), IpcError> {
        let mut map = self.inner.lock().unwrap();
        if let Some(entry) = map.remove(&id) {
            // Send SIGTERM via PID
            #[cfg(unix)]
            nix::sys::signal::kill(
                nix::unistd::Pid::from_raw(entry.pid as i32),
                nix::sys::signal::Signal::SIGTERM,
            ).ok(); // Ignore error if process already exited
            // Abort reader tasks
            for handle in &entry.abort_handles {
                handle.abort();
            }
        }
        // Idempotent: no error if ID not found
        Ok(())
    }

    pub fn remove(&self, id: u64) {
        self.inner.lock().unwrap().remove(&id);
    }

    /// Kill all active processes. Called on webview close.
    pub fn kill_all(&self) {
        let mut map = self.inner.lock().unwrap();
        for (_, entry) in map.drain() {
            #[cfg(unix)]
            nix::sys::signal::kill(
                nix::unistd::Pid::from_raw(entry.pid as i32),
                nix::sys::signal::Signal::SIGTERM,
            ).ok();
            for handle in &entry.abort_handles {
                handle.abort();
            }
        }
    }
}
```

### Diagram

```
                ┌───────────────────────────────────────────────────┐
                │                    WebKit (wry)                    │
                │                                                   │
                │  1. Allocate sub in EventRegistry (buffer mode)   │
                │  2. shell.spawn('node', ['app.js'])               │
                │    ↓                                              │
                │  window.__vtz_ipc.invoke('shell.spawn', params)   │
                │    ↓ (IPC request)                                │
                └────┬──────────────────────────────────────────────┘
                     │                          ▲
                     │                          │ EvalScriptFireAndForget
               ipc_handler                      │
               (JS → Rust)                      │
                     │                          │
                ┌────▼──────────────────────────┴───────────────────┐
                │  Rust: IpcDispatcher + HandlerContext              │
                │                                                   │
                │  1. Parse ShellSpawn(params)                      │
                │  2. Command::new(cmd).stdout(Piped).spawn()       │
                │  3. Split child: pipes → readers, child → watcher │
                │  4. Store PID + abort handles in ProcessMap       │
                │  5. Return { pid, subscriptionId } to JS          │
                │                                                   │
                │  Background tasks (tokio::spawn):                 │
                │  ┌─────────────────────────────────────────────┐  │
                │  │ stdout_reader:                              │  │
                │  │   loop { read → batch buffer (5ms/64KB) →   │  │
                │  │     channel.emit_batch() }                  │  │
                │  ├─────────────────���───────────────────────────┤  │
                │  │ stderr_reader:                              │  │
                │  │   loop { read → batch buffer (5ms/64KB) →   │  │
                │  │     channel.emit_batch() }                  │  │
                │  ├─────────────────────────────────────────────┤  │
                │  │ exit_watcher:                               │  │
                │  │   1. await stdout_reader join               │  │
                │  │   2. await stderr_reader join               │  │
                │  │   3. child.wait() → exit code               │  │
                │  │   4. channel.emit(sub_id, "exit", code)     │  │
                │  │   5. process_map.remove(sub_id)             │  │
                │  └─────────────────────────────────────────────┘  │
                └───────────────────────────────────────────────────┘
```

## Manifesto Alignment

### Principles upheld

- **If it builds, it works** — `ChildProcess` interface is fully typed. `onStdout` accepts `(data: string) => void`, not `unknown`. `onExit` callback receives `number | null`. `kill()` returns `Result<void, DesktopError>`. Invalid usage caught at compile time.
- **One way to do things** — One pattern for streaming (`shell.spawn` + callbacks), one pattern for blocking (`shell.execute`). No `Observable`, no `AsyncIterator`, no dual API. The event channel is one mechanism for all push features.
- **AI agents are first-class users** — `spawn/execute/kill/onStdout/onStderr/onExit` — an LLM predicts every method name on the first try. The API mirrors Node.js `child_process.spawn()` semantics that LLMs know well.
- **No ceilings** — The generic EventChannel can carry any push event. Future features (file watchers, system events) plug in without a transport redesign.
- **Performance is not optional** — Output batching (5ms windows, 64KB threshold) prevents event loop starvation. `EvalScriptFireAndForget` avoids oneshot overhead per event. 1MB batch cap prevents OOM.
- **If you can't demo it, it's not done** — Demo: a terminal component that shows live output from `vtz dev` running inside a desktop app.

### What we rejected

- **WebSocket sidecar** — A separate WebSocket server for push events would be a second transport. Violates "One way to do things." The `evaluate_script` path is sufficient and already proven.
- **AsyncIterator / ReadableStream** — While ergonomic for some use cases, these patterns are less predictable for LLMs and harder to type correctly. Simple callbacks (`onStdout`, `onStderr`, `onExit`) are the most LLM-friendly pattern.
- **`EventEmitter` pattern** — String-typed event names (`child.on('stdout', ...)`) lose type safety. Dedicated methods (`child.onStdout(cb)`) give each event its own typed callback signature.
- **stdin support in v1** — Writing to a process's stdin (e.g., interactive REPLs) adds complexity (backpressure, encoding, flow control). Deferred to a follow-up. `spawn()` captures stdout/stderr but does not pipe stdin.
- **`EvalScript` with oneshot for push events** — Creating a `Mutex<Option<oneshot::Sender>>` per event is wasteful for fire-and-forget push. The new `EvalScriptFireAndForget` variant avoids this overhead entirely.
- **Holding `Child` in ProcessMap** — Leads to `Mutex` held across `.await` (Tokio anti-pattern). Instead, split the `Child` at spawn: pipes to readers, `Child` to exit_watcher, PID to ProcessMap. `kill()` uses OS-level signal by PID.

## Non-Goals

- **stdin support** — Writing to a spawned process's stdin is not included. This requires flow control and backpressure handling. Follow-up design. (The `ChildProcess` interface intentionally omits `writeStdin` — this is a deliberate deferral, not an oversight.)
- **PTY / pseudo-terminal** — No terminal emulation (ANSI escape sequences, terminal size, etc.). Output is raw text. A terminal component would need a PTY layer on top.
- **Signal selection** — `kill()` sends SIGTERM (Unix) / TerminateProcess (Windows). No API for sending specific signals (SIGINT, SIGKILL, etc.). Follow-up if needed.
- **Process groups** — No API for managing related processes (e.g., killing a process tree). `kill()` targets the single spawned process.
- **Binary output** — Output is decoded as UTF-8 strings. Binary process output (e.g., image generators) is not supported — same limitation as the IPC bridge's text-only constraint.
- **Cross-platform shell expansion** — Commands are executed directly, not through a shell. No `$PATH` expansion, no globbing, no piping. Developers must pass the full command path or rely on OS PATH resolution.

## Unknowns

1. **Output chunk granularity.** `tokio::process::ChildStdout` reads in internal buffer-sized chunks. The size depends on the OS pipe buffer (typically 4-64KB). We may want line-buffered delivery for developer ergonomics. **Resolution:** Start with raw chunks batched on 5ms/64KB windows. Add a `lineBuffered: true` option later if developers request it.

2. ~~**evaluate_script throughput under high-frequency output.**~~ **Resolved in design:** Output batching (5ms flush interval, 64KB threshold, 1MB cap) reduces event loop calls by orders of magnitude. The `EvalScriptFireAndForget` variant avoids per-event oneshot allocation. Phase 1 implementation should include a throughput benchmark to validate the batching parameters.

3. **Cleanup on webview close.** When the webview is closed while processes are running, we need to kill all spawned processes. **Resolution:** `ProcessMap::kill_all()` called from the event loop's close handler. The `ProcessMap` is `Arc`-shared between the `HandlerContext` and the event loop's close handling code.

## POC Results

*To be filled after POC.*

## Type Flow Map

### Trace 1: `shell.execute` (string + string[] → ShellOutput)

```
Layer                                    Type at this point
──────────────────────────────────────────────────────────────────
Developer: shell.execute(cmd, args)      cmd: string, args: string[]
                                         Return: Promise<Result<ShellOutput, DesktopError>>
  ↓
TS invoke<ShellOutput>('shell.execute',  ShellOutput used as type parameter T
  { command, args })
  ↓
JSON: { method: 'shell.execute',         Wire: untyped JSON
  params: { command, args } }
  ↓
Rust: IpcMethod::ShellExecute            ShellExecuteParams { command: String, args: Vec<String> }
  ↓
Rust handler returns:                    Result<ShellOutputResponse, IpcError>
                                         ShellOutputResponse { code: i32, stdout: String, stderr: String }
  ↓
JSON → evaluate_script
  ↓
TS: Result<ShellOutput, DesktopError>    ShellOutput { code: number; stdout: string; stderr: string }
  ↓
Developer: result.data.code              number
           result.data.stdout            string
           result.data.stderr            string
```

### Trace 2: `shell.spawn` (string + string[] → ChildProcess)

```
Developer: shell.spawn(cmd, args, opts)  cmd: string, args: string[], opts?: SpawnOptions
                                         Return: Promise<Result<ChildProcess, DesktopError>>
  ↓
TS: allocateSubscription(subId)          Pre-register in EventRegistry (buffer mode)
TS: invoke<{ pid: number }>              Internal response type
  ('shell.spawn', { command, args,
   subscriptionId, cwd?, env? })
  ↓
Rust: IpcMethod::ShellSpawn              ShellSpawnParams { command, args, subscriptionId, cwd?, env? }
  ↓
Rust spawns process, stores PID,         { pid: u32 }
  returns response
  ↓
TS constructs ChildProcess from          ChildProcess { pid, onStdout, onStderr, onExit, kill }
  pid + subscriptionId + EventRegistry
  ↓
Developer: child.onStdout(cb)            cb: (data: string) => void — registered, buffer flushed
           child.onStderr(cb)            cb: (data: string) => void
           child.onExit(cb)              cb: (code: number | null) => void
           child.kill()                  Promise<Result<void, DesktopError>>
           child.pid                     number (OS PID)
```

### Trace 3: Event push (Rust → JS callback)

```
Rust reader task reads stdout chunk      Vec<u8> → String (UTF-8)
  ↓
Batch buffer accumulates chunks          5ms timer / 64KB threshold
  ↓
EventChannel.emit_batch([(sub_id,        Batched events
  "stdout", chunk1), ...])
  ↓
EvalScriptFireAndForget:                 "window.__vtz_event_batch([...])"
  ↓
JS: EventRegistry dispatches             For each event: listeners.get("stdout") → call all callbacks
  ↓
Developer's callbacks:                   (data: string) => void — each registered callback called
```

### Trace 4: kill() (JS → Rust → process exit → JS)

```
Developer: child.kill()                  Promise<Result<void, DesktopError>>
  ↓
IPC request: { method: 'process.kill',   subscriptionId: number
  params: { subscriptionId } }
  ↓
Rust: ProcessMap.kill(id)                Send SIGTERM via PID, abort reader tasks
                                         Idempotent — Ok even if already exited
  ↓
Rust: returns ok                         Result<(), IpcError>
  ↓
Process exits (killed by signal)         → exit_watcher detects exit
  ↓
exit_watcher: await readers (already     Readers either completed or were aborted
  aborted), then child.wait()
  ↓
EventChannel.emit(sub_id, "exit", null)  null = killed by signal (not a natural exit code)
  ↓
JS: onExit callbacks fire                (code: number | null) => void — code is null
```

### Trace 5: Exit code semantics

```
Natural exit (code 0):     onExit(0)       — success
Natural exit (code 42):    onExit(42)      — non-zero exit
Killed by kill():          onExit(null)    — signal death, no exit code
Killed by SIGKILL:         onExit(null)    — signal death, no exit code
```

This follows Node.js convention where `child.exitCode` is `null` when the process was killed by a signal, and `child.signalCode` provides the signal name. We simplify to `number | null` — `null` always means "killed by signal."

**No `unknown` in the developer-facing API.** Every callback parameter and return type is concrete. The event channel internals use `unknown` for the generic dispatch, but feature APIs (shell.spawn) wrap it with typed callbacks.

## E2E Acceptance Test

```ts
import { describe, it, expect } from '@vertz/test';
import { shell } from '@vertz/desktop';
import type { ChildProcess, ShellOutput } from '@vertz/desktop';

/** Helper: wait for process exit with timeout. */
function waitForExit(child: ChildProcess, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Exit timeout')), timeoutMs);
    child.onExit((code) => { clearTimeout(timer); resolve(code); });
  });
}

/** Helper: collect all stdout until exit with timeout. */
function collectStdout(child: ChildProcess, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const timer = setTimeout(() => reject(new Error('Stdout collection timeout')), timeoutMs);
    child.onStdout((data) => chunks.push(data));
    child.onExit(() => { clearTimeout(timer); resolve(chunks.join('')); });
  });
}

/** Helper: collect all stderr until exit with timeout. */
function collectStderr(child: ChildProcess, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const timer = setTimeout(() => reject(new Error('Stderr collection timeout')), timeoutMs);
    child.onStderr((data) => chunks.push(data));
    child.onExit(() => { clearTimeout(timer); resolve(chunks.join('')); });
  });
}

describe('Feature: shell.execute()', () => {
  describe('Given a desktop app running with --desktop', () => {
    describe('When calling shell.execute() with a valid command', () => {
      it('Then returns ok result with stdout, stderr, and exit code', async () => {
        const result = await shell.execute('echo', ['hello']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.stdout.trim()).toBe('hello');
        expect(result.data.code).toBe(0);
      });
    });

    describe('When calling shell.execute() with a non-existent command', () => {
      it('Then returns error result with EXECUTION_FAILED code', async () => {
        const result = await shell.execute('nonexistent-command-xyz', []);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('EXECUTION_FAILED');
      });
    });

    describe('When calling shell.execute() with a command that exits non-zero', () => {
      it('Then returns ok result with non-zero code', async () => {
        const result = await shell.execute('sh', ['-c', 'exit 42']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.code).toBe(42);
      });
    });
  });
});

describe('Feature: shell.spawn()', () => {
  describe('Given a desktop app running with --desktop', () => {
    describe('When spawning a process that writes to stdout', () => {
      it('Then onStdout receives the output chunks', async () => {
        const result = await shell.spawn('sh', ['-c', 'echo line1; echo line2']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const output = await collectStdout(result.data);
        expect(output).toContain('line1');
        expect(output).toContain('line2');
      });
    });

    describe('When spawning a process that writes to stderr', () => {
      it('Then onStderr receives the error output', async () => {
        const result = await shell.spawn('sh', ['-c', 'echo err >&2']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const errors = await collectStderr(result.data);
        expect(errors).toContain('err');
      });
    });

    describe('When spawning a process and calling kill()', () => {
      it('Then the process exits and onExit fires with null', async () => {
        const result = await shell.spawn('sleep', ['60']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const child = result.data;
        const exitPromise = waitForExit(child, 5000);

        const killResult = await child.kill();
        expect(killResult.ok).toBe(true);

        const exitCode = await exitPromise;
        expect(exitCode).toBeNull();
      });
    });

    describe('When calling kill() on an already-exited process', () => {
      it('Then kill() returns ok (idempotent)', async () => {
        const result = await shell.spawn('echo', ['done']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Wait for natural exit
        await waitForExit(result.data, 5000);

        // kill() after exit should still succeed
        const killResult = await result.data.kill();
        expect(killResult.ok).toBe(true);
      });
    });

    describe('When spawning a process with cwd option', () => {
      it('Then the process runs in the specified directory', async () => {
        const result = await shell.spawn('pwd', [], { cwd: '/tmp' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const output = await collectStdout(result.data);
        expect(output.trim()).toBe('/tmp');
      });
    });

    describe('When spawning a process with env option', () => {
      it('Then the process inherits the custom env vars', async () => {
        const result = await shell.spawn('sh', ['-c', 'echo $MY_VAR'], {
          env: { MY_VAR: 'hello-vertz' },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const output = await collectStdout(result.data);
        expect(output.trim()).toBe('hello-vertz');
      });
    });

    describe('When spawning a non-existent command', () => {
      it('Then returns error result with EXECUTION_FAILED', async () => {
        const result = await shell.spawn('nonexistent-command-xyz', []);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('EXECUTION_FAILED');
      });
    });

    describe('When the process exits naturally', () => {
      it('Then onExit receives the exit code', async () => {
        const result = await shell.spawn('sh', ['-c', 'exit 7']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const code = await waitForExit(result.data, 5000);
        expect(code).toBe(7);
      });
    });

    describe('When onStdout is called multiple times', () => {
      it('Then all callbacks receive the output', async () => {
        const result = await shell.spawn('echo', ['multi']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const chunks1: string[] = [];
        const chunks2: string[] = [];
        result.data.onStdout((d) => chunks1.push(d));
        result.data.onStdout((d) => chunks2.push(d));

        await waitForExit(result.data, 5000);

        expect(chunks1.join('')).toContain('multi');
        expect(chunks2.join('')).toContain('multi');
      });
    });

    describe('When an onStdout disposer is called', () => {
      it('Then that specific listener stops receiving', async () => {
        const result = await shell.spawn('sh', ['-c', 'echo a; sleep 0.1; echo b']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const all: string[] = [];
        const partial: string[] = [];
        result.data.onStdout((d) => all.push(d));
        const off = result.data.onStdout((d) => { partial.push(d); off(); });

        await waitForExit(result.data, 5000);

        // 'all' should have both lines, 'partial' should have at most one
        expect(all.join('')).toContain('b');
        expect(partial.length).toBeLessThanOrEqual(1);
      });
    });

    describe('When onExit fires', () => {
      it('Then all stdout chunks have already been delivered (ordering guarantee)', async () => {
        const result = await shell.spawn('sh', ['-c', 'for i in $(seq 1 100); do echo line$i; done']);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const chunks: string[] = [];
        let outputAtExit = '';
        result.data.onStdout((d) => chunks.push(d));
        result.data.onExit(() => { outputAtExit = chunks.join(''); });

        await waitForExit(result.data, 5000);

        // At the time onExit fired, all 100 lines should have been received
        for (let i = 1; i <= 100; i++) {
          expect(outputAtExit).toContain(`line${i}`);
        }
      });
    });
  });
});

describe('Feature: Event channel reusability', () => {
  describe('Given the event channel infrastructure', () => {
    describe('When two processes are spawned concurrently', () => {
      it('Then each process receives only its own events', async () => {
        const r1 = await shell.spawn('echo', ['proc1']);
        const r2 = await shell.spawn('echo', ['proc2']);
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        if (!r1.ok || !r2.ok) return;

        const [out1, out2] = await Promise.all([
          collectStdout(r1.data, 5000),
          collectStdout(r2.data, 5000),
        ]);

        expect(out1).toContain('proc1');
        expect(out1).not.toContain('proc2');
        expect(out2).toContain('proc2');
        expect(out2).not.toContain('proc1');
      });
    });
  });
});
```

## Security Considerations

**This is a dev-mode feature.** Same posture as `shell.execute()` and `fs.*`:

- `shell.spawn()` can run arbitrary commands. Any JS executing in the webview has full shell access.
- `cwd` is not sandboxed — processes can run in any directory the user can access.
- `env` is additive — it merges with the current environment, not replaces it. No env variable filtering.
- Processes spawned via `shell.spawn()` inherit the Rust runtime's user permissions.

The permission system (`IpcPermissions`) requires `shell:spawn` capability (or `shell:all`) when in restricted mode. The `process.kill` method requires the same capability as the `shell.spawn` that created it.

### Permission system changes

- Add `"shell.spawn"` and `"process.kill"` to `KNOWN_METHODS`
- Update `shell:all` to expand to `["shell.execute", "shell.spawn", "process.kill"]`
- Add new capability group `shell:spawn` → `["shell.spawn", "process.kill"]`
- Update `suggest_capability()` for the new methods
- **Note:** Existing `shell:all` users gain `shell.spawn` and `process.kill` capabilities. This is intentional — `shell:all` means "all shell capabilities."

## Implementation Phases

### Phase 1: Event channel infrastructure + `UserEvent::EvalScriptFireAndForget`

Build the generic Rust → JS push channel, the JS-side EventRegistry with buffering, and the new fire-and-forget eval variant.

**Rust:**
- `UserEvent::EvalScriptFireAndForget { js: String }` variant in `webview/mod.rs`
- Handle the new variant in the event loop (plain `evaluate_script`, no callback)
- `EventChannel` struct with `emit()` and `emit_batch()` methods in `webview/event_channel.rs`
- `next_subscription_id()` using `AtomicU64`
- `HandlerContext` struct in `webview/ipc_dispatcher.rs`

**JS (injected):**
- EventRegistry with `allocateSubscription()`, `addListener()`, `unsubscribe()` in the IPC client JS
- `window.__vtz_event()` and `window.__vtz_event_batch()` handlers

**TypeScript:**
- `event.ts` internal module in `@vertz/desktop` (not exported to developers)

**Tests:** Rust unit tests for `EventChannel` and `next_subscription_id()`. JS unit tests for EventRegistry dispatch, buffering, multi-listener, and disposer semantics.

### Phase 2: `shell.execute()` (request-response)

Implement the simpler blocking shell execution first. Validates shell basics (command spawning, output capture, error handling) without the event channel.

**Rust:**
- `ShellExecuteParams` and `ShellOutputResponse` structs in `ipc_method.rs`
- `IpcMethod::ShellExecute` variant + `parse` case + `execute_method` arm
- `shell_handlers::execute()` async handler using `tokio::process::Command`
- `ipc_handlers/shell.rs` new file
- Add `"shell.execute"` to permissions (already in KNOWN_METHODS)

**TypeScript:**
- `shell.ts` module with `execute()` function
- Export `shell` namespace from `index.ts`

**Tests:** Rust integration tests + TS type-level tests.

### Phase 3: `shell.spawn()` (streaming) + `process.kill` + cleanup + permissions

Implement the main feature using the event channel from Phase 1. Includes ProcessMap, kill, cleanup on webview close, and all permission updates.

**Rust:**
- `ShellSpawnParams`, `ProcessKillParams` structs in `ipc_method.rs`
- `IpcMethod::ShellSpawn` and `IpcMethod::ProcessKill` variants
- `shell_handlers::spawn()` — split child, spawn readers with batching, spawn exit_watcher with ordering guarantee
- `shell_handlers::kill()` — delegate to ProcessMap
- `ProcessMap` struct in `webview/process_map.rs` — PID-based kill, idempotent operations
- `ProcessMap::kill_all()` integration with webview close handler in `mod.rs`
- Add `"shell.spawn"`, `"process.kill"` to `KNOWN_METHODS`
- Update `shell:all` capability, add `shell:spawn` capability group
- Update `suggest_capability()` for new methods
- `nix` crate dependency for Unix signal sending

**TypeScript:**
- `ChildProcess` implementation wrapping pid + subscriptionId + EventRegistry
- `spawn()` function in `shell.ts` — pre-allocates subscription, constructs handle
- New types in `types.ts`: `SpawnOptions`, `ChildProcess`, `ProcessEventType`
- Update `permissions.ts`: new `IpcMethodString` values, capability groups

**Tests:** Rust integration tests for spawn/kill lifecycle (including idempotent kill, ordering guarantee), TS type-level tests, E2E acceptance tests from this doc.

## Key Files

| Component | Path | Phase |
|-----------|------|-------|
| UserEvent variant | `native/vtz/src/webview/mod.rs` | 1 |
| Event channel (Rust) | `native/vtz/src/webview/event_channel.rs` | 1 |
| Handler context | `native/vtz/src/webview/ipc_dispatcher.rs` | 1 |
| Event client JS | `native/vtz/src/webview/ipc_dispatcher.rs` (IPC_CLIENT_JS) | 1 |
| Event registry (TS) | `packages/desktop/src/event.ts` | 1 |
| IPC method enum | `native/vtz/src/webview/ipc_method.rs` | 2, 3 |
| Shell handlers (Rust) | `native/vtz/src/webview/ipc_handlers/shell.rs` | 2, 3 |
| Shell module (TS) | `packages/desktop/src/shell.ts` | 2, 3 |
| Types (TS) | `packages/desktop/src/types.ts` | 2, 3 |
| Process map (Rust) | `native/vtz/src/webview/process_map.rs` | 3 |
| Permissions (Rust) | `native/vtz/src/webview/ipc_permissions.rs` | 3 |
| Permissions (TS) | `packages/desktop/src/permissions.ts` | 3 |
| Webview close handler | `native/vtz/src/webview/mod.rs` | 3 |

## Review Resolution Log

### Rev 2 — Addressing DX, Product, and Technical reviews (2026-04-10)

**Blockers resolved:**

1. **Event registration race (DX #1, Tech #3):** Subscription is now pre-allocated in EventRegistry *before* the IPC spawn request. Events arriving before listeners are registered are buffered. Buffer is flushed on first `addListener()` call. Fast-exiting processes like `echo hello` work correctly.

2. **Exit ordering guarantee (DX #2):** The exit_watcher task now explicitly awaits both stdout_reader and stderr_reader task completion *before* emitting the `exit` event. All output is guaranteed to be delivered before `onExit` fires.

3. **EvalScriptFireAndForget (Tech #1):** Added new `UserEvent::EvalScriptFireAndForget { js: String }` variant. No oneshot channel, no Mutex, no callback overhead. Used by EventChannel for all push events.

4. **kill()/exit race (Tech #2):** ProcessMap operations are idempotent. `kill()` on a non-existent ID returns `Ok(())`. `remove()` is a no-op on missing entries. Documented in ProcessMap implementation and lifecycle table.

**Should-fix items resolved:**

5. **Multiple listeners (DX #3):** EventRegistry uses `ListenerArray` (array of callbacks) per event type. Calling `onStdout` multiple times appends. Added E2E test for multi-listener behavior.

6. **Unsubscribe/disposer (DX #4):** All `on*` methods return `() => void` disposer function. Calling it removes that specific listener. Added E2E test for disposer behavior.

7. **Exit code ambiguity (DX #6, Tech nit):** Changed from `-1` to `number | null`. `null` = killed by signal (follows Node.js convention). Natural exit codes are always numbers. Updated all type signatures, traces, and tests.

8. **E2E test timeouts (DX #9, Product #1):** Added `waitForExit()`, `collectStdout()`, `collectStderr()` helpers with configurable timeouts. All Promise-based waits in E2E tests now have 5000ms timeouts per integration-test-safety rules.

9. **Output batching (Tech #4):** Designed upfront: 5ms flush interval, 64KB threshold, 1MB hard cap. `emit_batch()` method on EventChannel. Reader tasks batch into windows. Documented in architecture section.

10. **Child ownership (Tech #5):** Child is split at spawn time: pipes → reader tasks, Child → exit_watcher, PID → ProcessMap. `kill()` uses `nix::sys::signal::kill()` by PID. No `Mutex` held across `.await`.

11. **Permission changes (Tech #6):** Explicitly documented: new `KNOWN_METHODS` entries, `shell:all` expansion, new `shell:spawn` capability group, `suggest_capability()` updates.

12. **HandlerContext (Tech #7):** New `HandlerContext` struct carrying `EventChannel` + `Arc<ProcessMap>`. Passed to `execute_method()`. FS handlers don't need it; shell handlers receive it.

**Nits resolved:**

13. **SpawnOptions timeout (DX #7, Product #3):** `SpawnOptions` no longer extends `IpcCallOptions`. Timeout doesn't apply to spawn (the process runs indefinitely). `execute()` keeps `IpcCallOptions` for command timeout.

14. **child.id → child.pid (DX #8, DX suggestion):** Replaced `id: number` (internal handle) with `pid: number` (OS PID). Useful for debugging (`ps aux | grep <pid>`). The internal subscription ID is not exposed.

15. **AtomicU64 (Tech nit):** Explicitly specified `AtomicU64` with `Ordering::Relaxed` in the EventChannel implementation.

16. **Phase 4 folded into Phase 3 (Product nit):** Permissions and cleanup are now part of Phase 3, reducing artificial phase boundaries.
