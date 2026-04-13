# Phase 3: Process Streams (29 failures)

## Context

The `vtz` runtime's `process.stdout`/`process.stderr` shim is a bare `{ write: (s) => { console.log(s); } }` object. This lacks `isTTY`, `columns`, `rows`, doesn't return a boolean from `write()`, appends newlines (via `console.log`), and can't be spied on reliably. `process.stdin` doesn't exist at all. This causes 29 TUI test failures.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Add `op_is_tty`, `op_write_stdout`, `op_write_stderr` Rust ops

**Files:**
- `native/vtz/src/runtime/ops/process.rs` (modified)
- `native/vtz/src/runtime/js_runtime.rs` (modified — register new ops)

**What to implement:**

```rust
/// Check if a file descriptor is a TTY.
#[op2(fast)]
pub fn op_is_tty(#[smi] fd: u32) -> bool {
    unsafe { libc::isatty(fd as libc::c_int) != 0 }
}

/// Write raw string to stdout (fd 1). No newline appended.
#[op2(fast)]
pub fn op_write_stdout(#[string] data: &str) -> Result<bool, AnyError> {
    use std::io::Write;
    std::io::stdout().write_all(data.as_bytes())?;
    std::io::stdout().flush()?;
    Ok(true)
}

/// Write raw string to stderr (fd 2). No newline appended.
#[op2(fast)]
pub fn op_write_stderr(#[string] data: &str) -> Result<bool, AnyError> {
    use std::io::Write;
    std::io::stderr().write_all(data.as_bytes())?;
    std::io::stderr().flush()?;
    Ok(true)
}
```

Add all three to `op_decls()`.

Wire in `js_runtime.rs`:
- Ops already registered via `process::op_decls()` (existing pattern)

**Acceptance criteria:**
- [ ] `op_is_tty(1)` returns correct TTY status
- [ ] `op_write_stdout("hello")` writes "hello" to stdout without newline
- [ ] `op_write_stderr("error")` writes "error" to stderr without newline
- [ ] Both write ops return `true`
- [ ] Rust unit tests for all three ops

---

### Task 2: Upgrade process.stdout/stderr/stdin shim

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — CJS bootstrap + tty shim)

**What to implement:**

Replace lines 1340-1341 (current stdout/stderr shim) with WriteStream instances. Also add process.stdin.

The process shim (in the `case 'process':` block around line 1330) should become:

```javascript
case 'process': {
  const p = globalThis.process || {};
  if (!p.env) p.env = {};
  if (!p.cwd) p.cwd = () => '/';
  if (!p.argv) p.argv = [];
  if (!p.platform) p.platform = typeof Deno !== 'undefined' ? Deno.core.ops.op_os_platform() : 'linux';
  if (!p.version) p.version = 'v20.0.0';
  if (!p.versions) p.versions = {};
  if (!p.versions.node) p.versions.node = '20.0.0';
  if (!p.nextTick) p.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
  if (!p.stdout) {
    p.stdout = {
      isTTY: (typeof Deno !== 'undefined') ? Deno.core.ops.op_is_tty(1) : false,
      columns: 80,
      rows: 24,
      write: function(data) { return Deno.core.ops.op_write_stdout(String(data)); },
      on: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      end: function() {},
    };
  }
  if (!p.stderr) {
    p.stderr = {
      isTTY: (typeof Deno !== 'undefined') ? Deno.core.ops.op_is_tty(2) : false,
      columns: 80,
      rows: 24,
      write: function(data) { return Deno.core.ops.op_write_stderr(String(data)); },
      on: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      end: function() {},
    };
  }
  if (!p.stdin) {
    p.stdin = {
      isTTY: (typeof Deno !== 'undefined') ? Deno.core.ops.op_is_tty(0) : false,
      isRaw: false,
      setRawMode: function(_mode) { return this; },
      on: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      removeListener: function(_event, _cb) { return this; },
      resume: function() { return this; },
      pause: function() { return this; },
    };
  }
  globalThis.process = p;
  return p;
}
```

Key properties:
- `write` is an **own property** (not prototype method) — spyable and reassignable
- `write` returns `boolean` (true)
- `write` uses Rust ops for raw output — no newline appended
- `isTTY` set at initialization via `op_is_tty`
- `stdin` supports `isTTY`, `isRaw`, `setRawMode()`, `on()`, `once()`, `removeListener()`, `pause()`, `resume()`

Also update the `node:tty` shim (lines 1643-1653) to use the same ops:
- `WriteStream.write()` → `Deno.core.ops.op_write_stdout(data)`
- `isatty(fd)` → `Deno.core.ops.op_is_tty(fd)`

**Acceptance criteria:**
- [ ] `process.stdout.write("hello")` returns `true` and writes without newline
- [ ] `process.stdout.isTTY` is a boolean
- [ ] `process.stdout.columns` is 80
- [ ] `process.stderr.write("err")` returns `true`
- [ ] `process.stdin.isTTY` is a boolean
- [ ] `process.stdin.setRawMode(true)` returns `process.stdin`
- [ ] `spyOn(process.stdout, 'write')` works (own property, not prototype)
- [ ] `process.stdout.write = customFn` works (direct reassignment)
- [ ] `Object.defineProperty(process.stdin, 'isTTY', { value: true })` works
- [ ] `Object.defineProperty(process.stdout, 'isTTY', { value: true })` works

---

### Task 3: Verify TUI test suite

**Files:**
- No file changes — test verification only

**What to verify:**

```bash
vtz test packages/tui/
```

**Acceptance criteria:**
- [ ] All 29 TUI test failures resolved
- [ ] `prompt.test.ts` passes (spyOn pattern)
- [ ] `wizard.test.ts` passes (spyOn pattern)
- [ ] `task-runner.test.ts` passes (direct write reassignment pattern)
- [ ] `interactive.test.ts` passes (process.stdin.isTTY, process.stdout.isTTY)
- [ ] `device-code-auth.test.ts` passes (direct write reassignment pattern)
