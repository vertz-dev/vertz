# Phase 1: Fix bin stubs wrapping shell scripts in `exec node` (#2532)

## Context

`vtz install` generates bin stubs in `node_modules/.bin/` that unconditionally wrap targets in `exec node`. For packages whose `bin` entries point to `.sh` files (like `@vertz/runtime`'s `cli.sh` and `cli-exec.sh`), this causes `ERR_UNKNOWN_FILE_EXTENSION` errors, breaking every package build because `vtzx vertz-build` resolves through the broken stub.

Tracking issue: #2559 | Bug: #2532

## Tasks

### Task 1: Add failing test for .sh bin stub detection

**Files:**
- `native/vtz/src/pm/bin.rs` (modified — add test)

**What to implement:**
Add a test that verifies bin stubs for `.sh` targets do NOT contain `exec node` but instead execute the shell script directly.

**Acceptance criteria:**
- [ ] Test creates a package with bin entry pointing to `./bin/cli.sh`
- [ ] Test asserts the generated stub contains `exec "$(dirname ...)` without `node`
- [ ] Test fails (RED) because current code always uses `exec node`

---

### Task 2: Fix `write_bin_stub` to detect shell script targets

**Files:**
- `native/vtz/src/pm/bin.rs` (modified — fix `write_bin_stub`)

**What to implement:**
Modify `write_bin_stub` to check if the target path ends with `.sh`. If so, generate a stub that executes the script directly (`exec "$(dirname "$0")/..."`) instead of wrapping it in `exec node`.

**Acceptance criteria:**
- [ ] `.sh` targets get `exec "$(dirname "$0")/{target}" "$@"` (no `node`)
- [ ] `.js`, `.cjs`, `.mjs` and extensionless targets still get `exec node "$(dirname "$0")/{target}" "$@"`
- [ ] All existing bin stub tests still pass
- [ ] New `.sh` test passes (GREEN)
