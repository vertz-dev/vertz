# Phase 2: Fix @types/* packages double-nested after install (#2533)

## Context

All `@types/*` packages are extracted one directory level too deep after `vtz install`. For example, `node_modules/@types/node/index.d.ts` ends up at `node_modules/@types/node/node/index.d.ts`. This breaks all TypeScript compilation.

The root cause is in `strip_package_prefix()` in `tarball.rs`. npm tarballs typically use `package/` as the root directory, but some packages (notably @types) may use the package name (e.g., `node/` for `@types/node`) as the root. The current code only strips when the first component is literally `"package"`, leaving other root directory names intact.

Tracking issue: #2559 | Bug: #2533

## Tasks

### Task 1: Add failing test for non-"package" tarball prefix

**Files:**
- `native/vtz/src/pm/tarball.rs` (modified — add test)

**What to implement:**
Add a test that creates a tarball with the first directory component being a non-"package" name (e.g., `node/`) and verifies extraction strips it correctly.

**Acceptance criteria:**
- [ ] Test creates a gzipped tarball with entries like `node/package.json`, `node/index.d.ts`
- [ ] Test asserts files are extracted to `dest/package.json`, `dest/index.d.ts` (prefix stripped)
- [ ] Test fails (RED) because current `strip_package_prefix` only strips `"package"`

---

### Task 2: Fix `strip_package_prefix` to strip any first component

**Files:**
- `native/vtz/src/pm/tarball.rs` (modified)

**What to implement:**
Change `strip_package_prefix` to always strip the first path component (matching `strip_first_component` behavior). All npm tarballs have exactly one root directory — whether it's called `package`, the package name, or anything else. This is the same approach used for GitHub tarballs.

**Acceptance criteria:**
- [ ] `strip_package_prefix` strips the first component unconditionally
- [ ] Tarball with `package/file.txt` → `file.txt` (existing behavior preserved)
- [ ] Tarball with `node/file.txt` → `file.txt` (new behavior)
- [ ] Tarball with `my-lib/file.txt` → `file.txt` (generic case)
- [ ] Single-component paths are preserved (no stripping)
- [ ] All existing tarball tests still pass
