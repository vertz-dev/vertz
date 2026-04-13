# Phase 3: Fix platform-specific optional dependencies not installed (#2534)

## Context

`vtz install` does not install platform-specific optional dependencies. Packages like `lightningcss` and `@typescript/native-preview` declare platform-specific binaries as `optionalDependencies` (e.g., `lightningcss-darwin-arm64`). These sub-packages have `os` and `cpu` fields in their registry metadata that indicate which platforms they're for. Currently:

1. The `os` and `cpu` fields are parsed into `VersionMetadata` but never checked
2. `resolve_one_task` only queues transitive `dependencies`, not `optional_dependencies`

This means platform-specific native binaries are never downloaded.

Tracking issue: #2559 | Bug: #2534

## Tasks

### Task 1: Add platform detection utility and tests

**Files:**
- `native/vtz/src/pm/platform.rs` (new)
- `native/vtz/src/pm/mod.rs` (modified — add `pub mod platform;`)

**What to implement:**
Create a `platform.rs` module with:
- `current_os() -> &'static str` — returns the npm-compatible OS name (`darwin`, `linux`, `win32`)
- `current_cpu() -> &'static str` — returns the npm-compatible CPU arch (`arm64`, `x64`, `ia32`)
- `matches_platform(os: &Option<Vec<String>>, cpu: &Option<Vec<String>>) -> bool` — checks if the current platform matches the package's constraints. `None` means "all platforms". Supports `!` negation prefix (e.g., `!win32` means "not Windows").

**Acceptance criteria:**
- [ ] `current_os()` returns correct value for macOS/Linux/Windows
- [ ] `current_cpu()` returns correct value for arm64/x64
- [ ] `matches_platform(None, None)` returns `true`
- [ ] `matches_platform(Some(["darwin"]), Some(["arm64"]))` returns `true` on macOS ARM
- [ ] `matches_platform(Some(["linux"]), None)` returns `false` on macOS
- [ ] Negation: `matches_platform(Some(["!win32"]), None)` returns `true` on macOS

---

### Task 2: Wire platform filtering into resolver

**Files:**
- `native/vtz/src/pm/resolver.rs` (modified)
- `native/vtz/src/pm/types.rs` (modified — add `os`/`cpu` to `ResolvedPackage`)

**What to implement:**
1. Add `os: Option<Vec<String>>` and `cpu: Option<Vec<String>>` to `ResolvedPackage`
2. In `resolve_one_task`, after resolving a package's version, also queue its `optional_dependencies` as new tasks
3. Before inserting an optional dependency into the graph, check `matches_platform()`. Skip silently if it doesn't match.
4. Mark optional dep tasks so resolution failures are warnings, not errors.

**Acceptance criteria:**
- [ ] Resolver queues transitive `optional_dependencies`
- [ ] Platform-incompatible optional deps are skipped
- [ ] Platform-compatible optional deps are resolved and added to graph
- [ ] Resolution failure for optional deps produces a warning, not an error
- [ ] Existing resolver tests still pass

---

### Task 3: Wire platform filtering into lockfile and linker

**Files:**
- `native/vtz/src/pm/lockfile.rs` (modified — persist `os`/`cpu`)
- `native/vtz/src/pm/linker.rs` (modified — skip incompatible packages)

**What to implement:**
1. Persist `os` and `cpu` in lockfile entries so frozen installs can filter without registry fetches
2. During linking, skip packages that don't match the current platform (they may be in the lockfile from a different platform)

**Acceptance criteria:**
- [ ] Lockfile entries include `os` and `cpu` fields when present
- [ ] `vtz install --frozen` on a different platform skips incompatible packages
- [ ] `lightningcss-darwin-arm64` is installed on macOS ARM after fix
