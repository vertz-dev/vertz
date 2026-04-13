# Phase 6: node:fs Gaps (3 failures)

## Context

Three tests fail due to missing `node:fs` APIs: `accessSync`, `fs.watch()`, and async `mkdtemp`. `mkdtempSync` already exists as a Rust op. `accessSync` needs a new Rust op. `fs.watch()` will use a JS polling shim.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Add `op_fs_access_sync` Rust op and `fs.constants`

**Files:**
- `native/vtz/src/runtime/ops/fs.rs` (modified)

**What to implement:**

```rust
/// Check file accessibility (node:fs accessSync).
/// mode: F_OK=0, R_OK=4, W_OK=2, X_OK=1
#[op2(fast)]
pub fn op_fs_access_sync(
    #[string] path: String,
    #[smi] mode: u32,
) -> Result<(), deno_core::error::AnyError> {
    let metadata = std::fs::metadata(&path).map_err(|e| {
        map_io_error(e, &path)
    })?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let file_mode = metadata.mode();
        let uid = unsafe { libc::getuid() };
        let gid = unsafe { libc::getgid() };
        let is_owner = metadata.uid() == uid;
        let is_group = metadata.gid() == gid;
        
        if mode & 4 != 0 { // R_OK
            let readable = (is_owner && file_mode & 0o400 != 0)
                || (is_group && file_mode & 0o040 != 0)
                || (file_mode & 0o004 != 0);
            if !readable {
                return Err(deno_core::anyhow::anyhow!("EACCES: permission denied, access '{}'", path));
            }
        }
        if mode & 2 != 0 { // W_OK
            let writable = (is_owner && file_mode & 0o200 != 0)
                || (is_group && file_mode & 0o020 != 0)
                || (file_mode & 0o002 != 0);
            if !writable {
                return Err(deno_core::anyhow::anyhow!("EACCES: permission denied, access '{}'", path));
            }
        }
        if mode & 1 != 0 { // X_OK
            let executable = (is_owner && file_mode & 0o100 != 0)
                || (is_group && file_mode & 0o010 != 0)
                || (file_mode & 0o001 != 0);
            if !executable {
                return Err(deno_core::anyhow::anyhow!("EACCES: permission denied, access '{}'", path));
            }
        }
    }
    
    Ok(())
}
```

Register in `op_decls()`.

For `fs.constants`, add to the `node:fs` synthetic module or the fs bootstrap JS:
```javascript
const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
```

**Acceptance criteria:**
- [ ] `accessSync('/tmp')` succeeds (F_OK check)
- [ ] `accessSync('/nonexistent', 0)` throws ENOENT
- [ ] `accessSync('/etc/shadow', 2)` throws EACCES (W_OK fails for non-root)
- [ ] `fs.constants.R_OK === 4`
- [ ] Rust unit tests

---

### Task 2: Add `mkdtemp` async and `fs.watch()` polling shim

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — node:fs shim)

**What to implement:**

Add to the `node:fs` JavaScript shim/bootstrap:

**mkdtemp (async, callback-style):**
```javascript
function mkdtemp(prefix, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const dir = Deno.core.ops.op_fs_mkdtemp_sync(prefix);
    if (callback) queueMicrotask(() => callback(null, dir));
  } catch (err) {
    if (callback) queueMicrotask(() => callback(err));
    else throw err;
  }
}
```

Also add to `fs/promises`:
```javascript
async function mkdtemp(prefix) {
  return Deno.core.ops.op_fs_mkdtemp_sync(prefix);
}
```

**fs.watch() polling shim:**
```javascript
function watch(filename, options, listener) {
  if (typeof options === 'function') { listener = options; options = {}; }
  const interval = 500; // ms
  let lastMtime = null;
  try { lastMtime = Deno.core.ops.op_fs_stat_sync(filename).mtimeMs; } catch {}
  
  const timerId = setInterval(() => {
    try {
      const stat = Deno.core.ops.op_fs_stat_sync(filename);
      if (stat.mtimeMs !== lastMtime) {
        lastMtime = stat.mtimeMs;
        if (listener) listener('change', filename);
      }
    } catch {}
  }, interval);
  
  return {
    close() { clearInterval(timerId); },
    on(_event, _cb) { return this; },
    once(_event, _cb) { return this; },
    removeListener(_event, _cb) { return this; },
  };
}
```

**Acceptance criteria:**
- [ ] `mkdtemp('/tmp/prefix-', (err, dir) => ...)` calls callback with temp dir path
- [ ] `await fsPromises.mkdtemp('/tmp/prefix-')` returns temp dir path
- [ ] `fs.watch(path, callback)` fires `callback('change', path)` on file modification
- [ ] `watcher.close()` stops the polling
- [ ] JS integration tests

---

### Task 3: Verify affected test suites

**Files:**
- No file changes — test verification only

**What to verify:**

```bash
vtz test packages/codegen/
vtz test packages/ui-canvas/
```

**Acceptance criteria:**
- [ ] `@vertz/codegen` tests pass (accessSync usage)
- [ ] `@vertz/ui-canvas` tests pass (watch usage)
- [ ] 3 failures resolved
