# Phase 4: Dialog API

## Context

The desktop IPC bridge needs native OS dialog support — file open/save pickers, confirmation dialogs, and message dialogs. These are OS-level dialogs (macOS NSAlert/NSOpenPanel, etc.), NOT in-app UI dialogs (those use `useDialogStack()` from `@vertz/ui`).

Design doc: `plans/desktop-ipc-bridge.md`
Issue: #2406

## Tasks

### Task 1: Rust — IpcMethod variants + param structs for dialog

**Files:**
- `native/vtz/src/webview/ipc_method.rs` (modified)
- `native/vtz/Cargo.toml` (modified — add `rfd` for native dialogs)

**What to implement:**

Add to the `IpcMethod` enum:
```rust
DialogOpen(DialogOpenParams),
DialogSave(DialogSaveParams),
DialogConfirm(DialogConfirmParams),
DialogMessage(DialogMessageParams),
```

Param structs:
```rust
struct FileFilterParam { name: String, extensions: Vec<String> }
struct DialogOpenParams { filters: Option<Vec<FileFilterParam>>, default_path: Option<String>, multiple: Option<bool>, directory: Option<bool>, title: Option<String> }
struct DialogSaveParams { default_path: Option<String>, filters: Option<Vec<FileFilterParam>>, title: Option<String> }
struct DialogConfirmParams { message: String, title: Option<String>, kind: Option<String> }
struct DialogMessageParams { message: String, title: Option<String>, kind: Option<String> }
```

Add `IpcMethod::parse` arms for `dialog.open`, `dialog.save`, `dialog.confirm`, `dialog.message`.

Add `rfd = "0.15"` to `[dependencies]` under the `desktop` feature.

**Acceptance criteria:**
- [ ] All 4 method strings parse correctly
- [ ] Optional fields deserialize correctly when absent
- [ ] Unit tests for each parse arm

---

### Task 2: Rust — Dialog handler implementation

**Files:**
- `native/vtz/src/webview/ipc_handlers/dialog.rs` (new)
- `native/vtz/src/webview/ipc_handlers/mod.rs` (modified)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified)

**What to implement:**

**Dialog handler (`dialog.rs`):**
- `open(params: DialogOpenParams) -> Result<Value, IpcError>` — file/directory picker. Returns selected path as string or null if cancelled.
- `save(params: DialogSaveParams) -> Result<Value, IpcError>` — save dialog. Returns chosen path as string or null.
- `confirm(params: DialogConfirmParams) -> Result<Value, IpcError>` — OS confirmation dialog. Returns boolean.
- `message(params: DialogMessageParams) -> Result<Value, IpcError>` — OS message dialog. Returns null.

Uses `rfd::AsyncFileDialog` for open/save, `rfd::AsyncMessageDialog` for confirm/message.

Map `kind` string to `rfd::MessageLevel` (`"info"` → `Info`, `"warning"` → `Warning`, `"error"` → `Error`).

Wire into dispatcher `execute_method()` match arms.

**Acceptance criteria:**
- [ ] `dialog::open` shows file picker and returns path or null
- [ ] `dialog::open` respects filters, defaultPath, title, directory, multiple options
- [ ] `dialog::save` shows save picker and returns path or null
- [ ] `dialog::confirm` shows confirmation and returns boolean
- [ ] `dialog::message` shows message and returns null
- [ ] Invalid kind values default to Info
- [ ] Exhaustive match compiles

---

### Task 3: TypeScript — Dialog wrapper + type tests

**Files:**
- `packages/desktop/src/dialog.ts` (new)
- `packages/desktop/src/index.ts` (modified)
- `packages/desktop/src/__tests__/dialog.test-d.ts` (new)

**What to implement:**

**`dialog.ts`:**
```ts
export function open(options?: OpenDialogOptions & IpcCallOptions): Promise<Result<string | null, DesktopError>>
export function save(options?: SaveDialogOptions & IpcCallOptions): Promise<Result<string | null, DesktopError>>
export function confirm(message: string, options?: ConfirmDialogOptions & IpcCallOptions): Promise<Result<boolean, DesktopError>>
export function message(message: string, options?: MessageDialogOptions & IpcCallOptions): Promise<Result<void, DesktopError>>
```

Destructure domain options from IpcCallOptions (same pattern as `fs.createDir`).

Update `index.ts`:
```ts
export * as dialog from './dialog.js';
```

**Type tests:**
- Positive return type checks for all 4 methods
- `@ts-expect-error` for: wrong filter shape (missing `name`), wrong `kind` value, wrong argument type for confirm

**Acceptance criteria:**
- [ ] `dialog.open()` returns `Promise<Result<string | null, DesktopError>>`
- [ ] `dialog.confirm('msg')` returns `Promise<Result<boolean, DesktopError>>`
- [ ] `dialog.open({ filters: [{ extensions: ['png'] }] })` is a type error (missing `name`)
- [ ] `dialog.confirm('msg', { kind: 'success' })` is a type error
- [ ] Typecheck passes
