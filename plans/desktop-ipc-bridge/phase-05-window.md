# Phase 5: Window API

## Context

The desktop IPC bridge needs window control APIs — setting the title, resizing, fullscreen, minimize, close, and reading window size. These operations require main-thread access (macOS AppKit requirement) because `tao::Window` methods must be called from the thread that owns the event loop.

This phase extends the `UserEvent` enum with a `WindowOp` variant so the tokio-spawned handler can dispatch window operations back to the main thread and await the result.

Design doc: `plans/desktop-ipc-bridge.md`
Issue: #2406

## Tasks

### Task 1: Rust — IpcMethod variants + WindowOp enum

**Files:**
- `native/vtz/src/webview/ipc_method.rs` (modified)
- `native/vtz/src/webview/mod.rs` (modified)

**What to implement:**

Add to `IpcMethod` enum:
```rust
AppWindowSetTitle(AppWindowSetTitleParams),
AppWindowSetSize(AppWindowSetSizeParams),
AppWindowSetFullscreen(AppWindowSetFullscreenParams),
AppWindowInnerSize,
AppWindowMinimize,
AppWindowClose,
```

Param structs:
```rust
struct AppWindowSetTitleParams { title: String }
struct AppWindowSetSizeParams { width: u32, height: u32 }
struct AppWindowSetFullscreenParams { fullscreen: bool }
```

Response struct:
```rust
struct WindowSizeResponse { width: u32, height: u32 }
```

Add `IpcMethod::parse` arms for all 6 `appWindow.*` method strings.

Add `WindowOp` enum + `UserEvent::WindowOp` variant to `mod.rs`:
```rust
pub enum WindowOp {
    SetTitle(String),
    SetSize { width: u32, height: u32 },
    SetFullscreen(bool),
    InnerSize,
    Minimize,
    Close,
}

// In UserEvent:
WindowOp {
    op: WindowOp,
    tx: Mutex<Option<oneshot::Sender<Result<serde_json::Value, IpcError>>>>,
}
```

**Acceptance criteria:**
- [ ] All 6 method strings parse correctly
- [ ] `WindowOp` enum covers all operations
- [ ] `UserEvent::WindowOp` variant compiles with oneshot sender
- [ ] Unit tests for each parse arm

---

### Task 2: Rust — Window handler + dispatcher integration

**Files:**
- `native/vtz/src/webview/ipc_handlers/window.rs` (new)
- `native/vtz/src/webview/ipc_handlers/mod.rs` (modified)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified)

**What to implement:**

**Window handler (`window.rs`):**

The handler doesn't execute the window operation directly. Instead, it sends a `WindowOp` event to the main thread via the `EventLoopProxy` and awaits the result through a oneshot channel.

```rust
pub async fn dispatch_window_op(
    proxy: &EventLoopProxy<UserEvent>,
    op: WindowOp,
) -> Result<serde_json::Value, IpcError> {
    let (tx, rx) = oneshot::channel();
    proxy.send_event(UserEvent::WindowOp {
        op,
        tx: Mutex::new(Some(tx)),
    }).map_err(|_| IpcError::io_error("Event loop closed"))?;
    rx.await.map_err(|_| IpcError::io_error("Window operation cancelled"))?
}
```

**Dispatcher changes:**

Modify `execute_method` to accept the proxy, pass it through for window ops:
```rust
async fn execute_method(method: IpcMethod, proxy: EventLoopProxy<UserEvent>) -> Result<Value, IpcError> {
    match method {
        // ... existing handlers unchanged ...
        IpcMethod::AppWindowSetTitle(p) => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::SetTitle(p.title)).await
        }
        // ... etc for other window ops ...
    }
}
```

**Event loop handler in `mod.rs`:**

Add `UserEvent::WindowOp` arm in the event loop:
```rust
UserEvent::WindowOp { op, tx } => {
    let result = match op {
        WindowOp::SetTitle(title) => {
            window.set_title(&title);
            Ok(serde_json::Value::Null)
        }
        WindowOp::SetSize { width, height } => {
            window.set_inner_size(tao::dpi::LogicalSize::new(width, height));
            Ok(serde_json::Value::Null)
        }
        WindowOp::SetFullscreen(fullscreen) => {
            let mode = if fullscreen { Some(tao::window::Fullscreen::Borderless(None)) } else { None };
            window.set_fullscreen(mode);
            Ok(serde_json::Value::Null)
        }
        WindowOp::InnerSize => {
            let size = window.inner_size();
            Ok(serde_json::to_value(WindowSizeResponse { width: size.width, height: size.height }).unwrap())
        }
        WindowOp::Minimize => {
            window.set_minimized(true);
            Ok(serde_json::Value::Null)
        }
        WindowOp::Close => {
            // Will trigger CloseRequested
            // Send result first, then request close
            Ok(serde_json::Value::Null)
        }
    };
    if let Some(sender) = tx.lock().unwrap().take() {
        let _ = sender.send(result);
    }
}
```

**Acceptance criteria:**
- [ ] Window operations dispatch to main thread via UserEvent
- [ ] Results flow back via oneshot channel
- [ ] `execute_method` passes proxy for window ops without changing fs/shell/clipboard behavior
- [ ] Event loop handles all WindowOp variants
- [ ] Exhaustive match compiles

---

### Task 3: TypeScript — Window wrapper + type tests

**Files:**
- `packages/desktop/src/window.ts` (new)
- `packages/desktop/src/index.ts` (modified)
- `packages/desktop/src/__tests__/window.test-d.ts` (new)

**What to implement:**

**`window.ts`:**
```ts
export function setTitle(title: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>
export function setSize(size: WindowSize, options?: IpcCallOptions): Promise<Result<void, DesktopError>>
export function setFullscreen(fullscreen: boolean, options?: IpcCallOptions): Promise<Result<void, DesktopError>>
export function innerSize(options?: IpcCallOptions): Promise<Result<WindowSize, DesktopError>>
export function minimize(options?: IpcCallOptions): Promise<Result<void, DesktopError>>
export function close(options?: IpcCallOptions): Promise<Result<void, DesktopError>>
```

Note: `setSize` takes a `WindowSize` object `{ width, height }` and destructures it for the IPC call.

Update `index.ts`:
```ts
export * as appWindow from './window.js';
```

**Type tests:**
- Positive return types for all 6 methods
- `@ts-expect-error`: `setSize(1280, 800)` (positional args, not object)
- `@ts-expect-error`: `setFullscreen('yes')` (string, not boolean)
- `innerSize()` returns `Promise<Result<WindowSize, DesktopError>>`

**Acceptance criteria:**
- [ ] `appWindow.setSize({ width: 800, height: 600 })` typechecks
- [ ] `appWindow.setSize(800, 600)` is a type error
- [ ] `appWindow.setFullscreen('yes')` is a type error
- [ ] `appWindow.innerSize()` returns `Promise<Result<WindowSize, DesktopError>>`
- [ ] Typecheck passes
