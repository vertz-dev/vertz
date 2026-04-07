# Phase 2: Filesystem APIs

## Context

Phase 1 built the production-quality IPC transport with typed dispatch and robust JS client. This phase implements all `fs.*` methods — the most commonly needed desktop APIs. Text-only (binary deferred).

Design doc: `plans/desktop-ipc-bridge.md`

## Tasks

### Task 1: Path resolution + fs.exists + fs.stat

**Files:**
- `native/vtz/src/webview/ipc_handlers/mod.rs` (new)
- `native/vtz/src/webview/ipc_handlers/fs.rs` (new)
- `native/vtz/src/webview/ipc_method.rs` (modified — add FsExists, FsStat variants)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — dispatch new variants)

**What to implement:**

Path resolution utility:
- `~` expansion to real home directory
- Relative paths resolved against app root (directory containing `package.json`)
- Canonicalization via `std::fs::canonicalize` (resolves symlinks)
- Return `InvalidPath` error for paths that resolve outside expected boundaries

`fs.exists(path)` → `Result<bool, IpcError>`
`fs.stat(path)` → `Result<FileStat, IpcError>`

**Acceptance criteria:**
- [ ] `~` expands to the user's home directory
- [ ] Relative paths resolve against app root
- [ ] `fs.exists` returns true/false without errors for valid paths
- [ ] `fs.stat` returns `FileStat { size, is_file, is_dir, modified, created }`
- [ ] Non-existent path → `NotFound` error
- [ ] Unit tests for path resolution edge cases
- [ ] `cargo test` + `cargo clippy` + `cargo fmt --check` clean

---

### Task 2: fs.readTextFile + fs.writeTextFile

**Files:**
- `native/vtz/src/webview/ipc_handlers/fs.rs` (modified)
- `native/vtz/src/webview/ipc_method.rs` (modified — ensure FsReadTextFile, FsWriteTextFile)
- `packages/desktop/src/fs.ts` (new — method wrappers)
- `packages/desktop/src/index.ts` (modified — export fs)

**What to implement:**

Rust handlers:
- `fs.readTextFile(path)` → `Result<String, IpcError>` — reads UTF-8 file content
- `fs.writeTextFile(path, content)` → `Result<(), IpcError>` — writes string to file, creates parent dirs if needed

TS wrappers in `@vertz/desktop`:
- `fs.readTextFile(path: string, options?: IpcCallOptions): Promise<Result<string, DesktopError>>`
- `fs.writeTextFile(path: string, content: string, options?: IpcCallOptions): Promise<Result<void, DesktopError>>`

**Acceptance criteria:**
- [ ] Read existing file → ok result with string content
- [ ] Read non-existent file → `NOT_FOUND` error
- [ ] Read binary file → `IO_ERROR` (invalid UTF-8)
- [ ] Write creates file if not exists
- [ ] Write creates parent directories
- [ ] Write then read round-trips content
- [ ] TS type-level tests for both methods
- [ ] `cargo test` + `vtz run typecheck` + `vtz run lint` clean

---

### Task 3: fs.readDir + fs.createDir + fs.remove + fs.rename

**Files:**
- `native/vtz/src/webview/ipc_handlers/fs.rs` (modified)
- `native/vtz/src/webview/ipc_method.rs` (modified — add remaining fs variants)
- `packages/desktop/src/fs.ts` (modified — add remaining method wrappers)
- `packages/desktop/src/types.ts` (modified — ensure all types exported)

**What to implement:**

Rust handlers:
- `fs.readDir(path)` → `Result<Vec<DirEntry>, IpcError>` — list directory contents (non-recursive)
- `fs.createDir(path, recursive?)` → `Result<(), IpcError>` — create directory
- `fs.remove(path)` → `Result<(), IpcError>` — remove file or empty directory
- `fs.rename(from, to)` → `Result<(), IpcError>` — rename/move file

TS wrappers with full type signatures.

**Acceptance criteria:**
- [ ] `readDir` returns `DirEntry[]` with name, isFile, isDir
- [ ] `readDir` on non-existent dir → `NOT_FOUND`
- [ ] `createDir` with recursive flag creates nested dirs
- [ ] `createDir` without recursive on nested path → error
- [ ] `remove` deletes files
- [ ] `remove` on non-existent → `NOT_FOUND`
- [ ] `rename` moves files
- [ ] All TS type-level tests pass
- [ ] All types exported from `@vertz/desktop`
- [ ] Full quality gates: `cargo test --all && cargo clippy && cargo fmt --check && vtz test && vtz run typecheck && vtz run lint`
