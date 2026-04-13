# Phase 1-3: Install Fixes (#2532, #2533, #2534)

- **Author:** implementation agent
- **Reviewer:** adversarial-review agent
- **Commits:** working tree (uncommitted changes against dddb03062)
- **Date:** 2026-04-13

## Changes

- `native/vtz/src/pm/bin.rs` (modified) -- shell script detection for bin stubs
- `native/vtz/src/pm/tarball.rs` (modified) -- unconditional first-component stripping
- `native/vtz/src/pm/platform.rs` (new) -- platform matching module
- `native/vtz/src/pm/resolver.rs` (modified) -- platform filtering + optional dep traversal
- `native/vtz/src/pm/types.rs` (modified) -- os/cpu fields on ResolvedPackage + VersionMetadata
- `native/vtz/src/pm/mod.rs` (modified) -- `pub mod platform;` declaration
- `native/vtz/src/pm/linker.rs` (modified) -- mechanical: `os: None, cpu: None` in test structs
- `native/vtz/src/pm/scripts.rs` (modified) -- mechanical: `os: None, cpu: None` in test structs

## CI Status

- [ ] Quality gates passed (pending -- review is concurrent with CI run)

## Review Checklist

- [x] Delivers what the tickets ask for
- [x] TDD compliance (tests alongside implementation)
- [ ] No type gaps or missing edge cases (see Findings)
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### SHOULD-FIX 1: Bin stub shell detection is too narrow -- only `.sh`

**File:** `native/vtz/src/pm/bin.rs`, line 21

The check `target.ends_with(".sh")` only catches `.sh` files. Real-world npm packages can have bin entries pointing to files with:
- No extension but with a `#!/bin/bash` or `#!/usr/bin/env bash` shebang
- `.bash`, `.zsh`, or `.csh` extensions (rare but valid)
- Files with shebangs for Python, Ruby, Perl, etc. that should NOT be wrapped in `node`

The current approach is pragmatic and solves the immediate bug (the `@vertz/runtime` `.sh` stubs). However, npm itself checks for a Node.js shebang (`#!/usr/bin/env node`) and only wraps in `node` when the file lacks one. The inverse approach -- checking if the target appears to be a JS file (`.js`, `.cjs`, `.mjs`, or extensionless) rather than checking if it's a shell script -- would be more robust.

**Verdict:** Acceptable for now. The `.sh` check fixes the reported bug. A more robust shebang-based or inverse-logic approach could be a follow-up. Not a blocker.

### SHOULD-FIX 2: Lockfile path does not store or restore `os`/`cpu` -- platform filtering silently skipped on cached installs

**File:** `native/vtz/src/pm/resolver.rs`, lines 266-276

When resolving from the lockfile (lines 260-303), the `ResolvedPackage` is constructed with `os: None, cpu: None`:

```rust
let resolved = ResolvedPackage {
    // ...
    os: None,
    cpu: None,
};
```

This means platform filtering (`matches_platform`) is never applied to lockfile-cached packages. The lockfile format (`LockfileEntry` in types.rs) does not have `os`/`cpu` fields either.

**Impact:** On first install (no lockfile), platform-specific packages are correctly filtered. On subsequent installs (lockfile present), ALL platform-specific optional deps will be resolved and installed regardless of platform, because:
1. The optional deps are resolved individually in `mod.rs` lines 228-258
2. Those individual resolutions may hit lockfile entries that have no platform info
3. No platform check is applied on the lockfile path

This is a correctness gap: the first install works correctly but a `vtz install` from a lockfile on a different platform would try to install wrong-platform packages.

**Severity:** Should-fix. For a monorepo where the lockfile is committed and developers use different OS/arch, this will cause wrong packages to be downloaded and linked. However, since the optional deps resolution in `mod.rs` gracefully handles failures (line 251: `Err(e) => output.warning(...)`) and tarballs for wrong platforms may still extract fine (they just won't run), this is unlikely to cause hard failures. Still, it wastes bandwidth and disk space.

**Suggested fix:** Either:
1. Add `os` and `cpu` fields to `LockfileEntry` and the lockfile serialization format, OR
2. Apply `platform::matches_platform()` in the lockfile path too (would require fetching os/cpu from somewhere -- potentially a second metadata lookup, which defeats the purpose)

Option 1 is cleaner.

### SHOULD-FIX 3: Lockfile path does not queue transitive optional dependencies

**File:** `native/vtz/src/pm/resolver.rs`, lines 290-302

The lockfile resolution path queues only `entry.dependencies` as child tasks (line 292-299). It does NOT queue `optional_dependencies` because `LockfileEntry` doesn't have that field. This means transitive optional dependencies resolved via lockfile won't have their own transitive optional deps resolved.

**Impact:** Same class of issue as Finding 2 -- only affects lockfile-cached resolution. On first install, the registry path correctly queues both `dependencies` and `optional_dependencies`. On lockfile-cached subsequent installs, nested optional deps may be missed.

**Severity:** Low. This only matters for packages that have optional dependencies that themselves have optional dependencies -- an uncommon pattern. And the top-level optional deps are resolved separately in `mod.rs` lines 228-258.

### INFO 1: `strip_package_prefix` is now identical to `strip_first_component` -- consider deduplication

**File:** `native/vtz/src/pm/tarball.rs`, lines 487-507

After the change, `strip_package_prefix()` and `strip_first_component()` have identical implementations:

```rust
fn strip_first_component(path: &Path) -> PathBuf {
    let components: Vec<_> = path.components().collect();
    if components.len() > 1 {
        components[1..].iter().collect()
    } else {
        path.to_path_buf()
    }
}

fn strip_package_prefix(path: &Path) -> PathBuf {
    let components: Vec<_> = path.components().collect();
    if components.len() > 1 {
        components[1..].iter().collect()
    } else {
        path.to_path_buf()
    }
}
```

Consider removing `strip_package_prefix` and using `strip_first_component` in both `extract_tarball` and `extract_github_tarball`. The doc comment on `strip_package_prefix` already explains it's doing the same thing as the GitHub variant.

**Severity:** Nit. Code duplication, no functional impact.

### INFO 2: `strip_package_prefix` unconditional stripping -- safe but worth documenting the assumption

**File:** `native/vtz/src/pm/tarball.rs`, line 500

The change relies on the invariant that ALL npm tarballs have exactly one root directory. This is true for packages published via `npm publish` (which always creates a `package/` root) but could theoretically differ for:
- Manually crafted tarballs served by a private registry
- Tarballs from `npm pack` with unusual configurations

The comment on line 497-499 already documents this assumption, which is good. The behavior matches how GitHub tarballs are handled, so there's precedent.

**Severity:** Info only. The assumption is correct for the npm registry.

### APPROVED: Platform matching logic is correct

**File:** `native/vtz/src/pm/platform.rs`

The `matches_field` logic correctly handles:
- `None` (no constraint) -> matches all
- Empty vec -> matches all
- Positive-only values -> at least one must match
- Negation-only values -> none must match current
- Mixed positive + negation -> positive must match AND negation must not exclude
- Edge case: `["darwin", "!darwin"]` -> correctly returns false (positive matches but negation excludes)

The `current_os()` and `current_cpu()` mappings use `cfg!()` which is evaluated at compile time, so these are constants -- no runtime overhead. The mappings correctly translate Rust target triples to npm-compatible names.

Test coverage is thorough for the platform module.

### APPROVED: Resolver optional dep queuing is correct

**File:** `native/vtz/src/pm/resolver.rs`, lines 381-390

The pattern of queuing optional deps alongside regular deps is correct. Platform filtering happens when the optional dep is itself resolved (line 337), so wrong-platform packages are filtered at resolution time, not at queue time. This is the right approach because it allows the platform check to use the resolved version's `os`/`cpu` fields rather than the parent's declaration.

### APPROVED: Error handling for optional deps is graceful

**File:** `native/vtz/src/pm/mod.rs`, lines 226-258

Optional dependencies are resolved in a try-catch pattern -- failures emit warnings, not errors. This is correct npm behavior: optional deps should never fail an install.

### APPROVED: Bin stub fix is correct and well-tested

**File:** `native/vtz/src/pm/bin.rs`

The three new tests cover `.sh`, `.js`, and extensionless targets. The fix correctly avoids wrapping `.sh` targets in `exec node`. The existing test infrastructure is reused well.

## Resolution

### Blockers: None

### Should-fix items:

1. **Bin stub shell detection** -- Acceptable as-is for the immediate fix. File a follow-up issue to explore shebang-based detection or inverse logic (check for JS extensions rather than shell extensions).

2. **Lockfile os/cpu gap** -- Should be tracked as a follow-up issue. The lockfile format needs `os` and `cpu` fields to enable correct platform filtering on cached installs. Not a blocker because: (a) first installs work correctly, (b) optional dep failures are warnings not errors, (c) most teams share OS within a project.

3. **Lockfile transitive optional deps** -- Low severity. Can be addressed alongside Finding 2 when lockfile format is updated.

### Nits:

4. **Deduplicate `strip_package_prefix`/`strip_first_component`** -- Trivial cleanup, can be done now or later.

### Verdict: **Approved with noted follow-ups**

The three bugs are correctly fixed. The platform module is well-designed and thoroughly tested. The should-fix items are real gaps but affect only the lockfile-cached path (subsequent installs), not fresh installs, and failures are gracefully handled. They should be tracked as issues but do not block this PR.
