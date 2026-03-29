# Design Doc: Optional Dependencies Support

**Issue:** #2038
**Status:** Approved
**Date:** 2026-03-29

## Sign-offs

- **DX:** Approved (2026-03-29) — `--optional` / `-O` follows npm/pnpm conventions, zero new concepts for developers
- **Product/Scope:** Approved (2026-03-29) — all 5 acceptance criteria covered, single phase is right-sized, no scope creep into platform-specific filtering (os/cpu)
- **Technical:** Approved (2026-03-29) — builds on existing resolver/lockfile infrastructure with minimal structural changes; graceful failure pattern is well-scoped

## API Surface

### `optionalDependencies` in package.json (read path)

```json
{
  "dependencies": {
    "react": "^18.3.0"
  },
  "optionalDependencies": {
    "fsevents": "^2.3.0",
    "@rollup/rollup-darwin-arm64": "^4.0.0"
  }
}
```

Optional dependencies are resolved and installed alongside regular dependencies. The key difference: if an optional dependency fails to resolve from the registry or fails its postinstall script, the install continues with a warning instead of erroring.

### `vertz add --optional` / `-O` (write path)

```bash
# Add a package to optionalDependencies
vertz add --optional fsevents
vertz add -O @rollup/rollup-darwin-arm64

# With version specifier
vertz add -O fsevents@^2.3.0

# With exact pinning
vertz add -O -E fsevents

# In a workspace
vertz add -O -w @myorg/app fsevents
```

**Mutual exclusion:** `--optional` cannot be combined with `--dev` or `--peer`. Only one dependency category per `add` invocation.

### Lockfile format

Optional entries include an `optional true` marker:

```
fsevents@^2.3.0:
  version "2.3.3"
  resolved "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz"
  integrity "sha512-abc"
  optional true
```

This allows `vertz install --frozen` and other lockfile consumers to distinguish optional from required entries.

### Install behavior

```
$ vertz install
Resolving dependencies...
Resolved 47 packages
warn: optional dependency "fsevents@^2.3.0" failed to resolve: No version matches on this platform
warn: optional dependency "@rollup/rollup-linux-x64-gnu" postinstall failed: exit code 1
Downloading 45 packages...
Linking 45 packages (1,203 files)
Done in 1.42s
```

Warnings are emitted for optional dependency failures, but the exit code is 0 (success).

### Install behavior with `--frozen`

In frozen mode, optional dependencies in the lockfile are verified like any other entry. If an optional dep is in `package.json` but missing from the lockfile, the frozen check fails. This is correct: `--frozen` asserts "the lockfile matches package.json exactly," and optional deps are part of that contract. The graceful-failure behavior applies at resolution/install time, not at lockfile verification time.

## Manifesto Alignment

- **Principle 2 (One way to do things):** Optional deps are the standard npm/pnpm mechanism for platform-specific binaries. No custom alternative, no new concepts.
- **Principle 3 (AI agents are first-class):** `vertz add -O <pkg>` is the single obvious command. The flag follows npm/pnpm conventions. LLMs will get this right on the first prompt.
- **Principle 7 (Performance is not optional):** Failed optional deps are skipped early in the resolution phase. No wasted downloads or extraction for packages that can't resolve.

## Non-Goals

- **No platform filtering (os/cpu):** npm uses `os` and `cpu` fields in package metadata to skip incompatible packages. This is a separate concern tracked separately. Optional deps support is about graceful failure, not platform detection.
- **No `optionalPeerDependencies`:** npm's `peerDependenciesMeta` with `optional: true` is out of scope.
- **No retry logic:** If an optional dep fails, we warn and move on. No automatic retry with different versions.
- **No conditional installation:** No way to say "install this optional dep only on macOS." That requires the platform filtering feature.

## Unknowns

None identified. The implementation is a straightforward extension of existing infrastructure:
- `PackageJson` already has `optional_dependencies` field (deserialization works)
- `VersionMetadata` already has `optional_dependencies` field (registry metadata works)
- The resolver, lockfile, and `add` command need targeted changes described below

## Type Flow Map

No generics involved. All changes are to concrete Rust types:

- `LockfileEntry` gains `optional: bool` field
- `AddArgs` gains `optional: bool` CLI flag
- `add()` gains `optional: bool` parameter
- `install()` reads `pkg.optional_dependencies` and passes them to `resolve_all()` with failure tolerance
- `resolve_all()` gains `optional_deps: &BTreeMap<String, String>` parameter
- `graph_to_lockfile()` gains `optional_names: &HashSet<String>` to mark lockfile entries

## E2E Acceptance Test

From the developer perspective, using the public CLI:

```rust
// Scenario 1: optionalDependencies from package.json are resolved and installed
// Given a package.json with:
//   "optionalDependencies": { "zod": "^3.24.0" }
// When: vertz install
// Then: zod is installed in node_modules/
// And: lockfile contains zod@^3.24.0 with "optional true"

// Scenario 2: install continues if an optional dep fails to resolve
// Given a package.json with:
//   "dependencies": { "react": "^18.3.0" },
//   "optionalDependencies": { "nonexistent-pkg-xyz": "^1.0.0" }
// When: vertz install
// Then: react is installed successfully
// And: exit code is 0
// And: stderr contains "warn: optional dependency \"nonexistent-pkg-xyz\" failed"

// Scenario 3: install continues if an optional dep's postinstall fails
// Given an optional dep with a postinstall script that exits with code 1
// When: vertz install
// Then: the package is extracted to node_modules/ (downloaded successfully)
// And: stderr contains a warning about the postinstall failure
// And: exit code is 0
// And: other packages' postinstall scripts still run

// Scenario 4: vertz add --optional / -O adds to optionalDependencies
// Given an empty package.json
// When: vertz add -O zod
// Then: package.json contains "optionalDependencies": { "zod": "^3.24.4" }
// And: zod is installed in node_modules/

// Scenario 5: lockfile distinguishes optional from required deps
// Given a package.json with both dependencies and optionalDependencies
// When: vertz install
// Then: lockfile entries for required deps do NOT have "optional true"
// And: lockfile entries for optional deps DO have "optional true"

// Negative cases:
// @ts-expect-error — --optional and --dev cannot be combined
// vertz add -O -D zod  → error: --optional and --dev cannot be used together

// @ts-expect-error — --optional and --peer cannot be combined
// vertz add -O -P zod  → error: --optional and --peer cannot be used together
```

## Implementation Plan

### Phase 1: Optional Dependencies (single phase)

This builds directly on existing infrastructure. Each change is small and testable in isolation.

#### 1a. `LockfileEntry` gains `optional` field

**File:** `native/vertz-runtime/src/pm/types.rs`

Add `pub optional: bool` to `LockfileEntry`. Default to `false`.

**File:** `native/vertz-runtime/src/pm/lockfile.rs`

- `write_lockfile`: emit `  optional true\n` after integrity when `entry.optional` is true
- `parse_lockfile`: parse `optional true` line, set `current_entry.optional = true`

**Tests:**
- Round-trip: write lockfile with optional entry, read it back, verify `optional == true`
- Non-optional entries do not have `optional` in output
- Existing lockfiles without `optional` parse correctly (backward compat)

#### 1b. `vertz add --optional` / `-O` flag

**File:** `native/vertz-runtime/src/cli.rs`

Add to `AddArgs`:
```rust
/// Add to optionalDependencies
#[arg(short = 'O', long)]
pub optional: bool,
```

**File:** `native/vertz-runtime/src/main.rs`

Add mutual exclusion check for `--optional` with `--dev` and `--peer`. Pass `args.optional` to `pm::add()`.

**File:** `native/vertz-runtime/src/pm/mod.rs` (`add` function)

Add `optional: bool` parameter. When true, insert into `pkg.optional_dependencies` instead of `pkg.dependencies`.

**File:** `native/vertz-runtime/src/pm/types.rs` (`write_package_json`)

Add handling for `optional_dependencies` in the read-modify-write logic (same pattern as `dependencies`, `devDependencies`, `peerDependencies`).

**Tests:**
- CLI: `vertz add -O zod` parses correctly
- CLI: `vertz add --optional zod` parses correctly
- CLI: `vertz add -O -D zod` is a conflict error
- CLI: `vertz add -O -P zod` is a conflict error
- `write_package_json` preserves/updates `optionalDependencies`

#### 1c. Resolver: graceful failure for optional deps

**File:** `native/vertz-runtime/src/pm/resolver.rs`

Add `optional_deps: &BTreeMap<String, String>` parameter to `resolve_all()`. Resolve optional deps in a separate loop after regular and dev deps. For each optional dep, catch resolution errors and emit a warning instead of propagating the error.

```rust
// In resolve_all(), after resolving regular and dev deps:
for (name, range) in optional_deps {
    if let Err(e) = resolve_recursive(name, range, &mut state).await {
        warnings.push(format!(
            "optional dependency \"{}@{}\" failed to resolve: {}",
            name, range, e
        ));
    }
}
```

Return warnings alongside the graph (either as a field on `ResolvedGraph` or as a separate return value).

**Tests:**
- Optional dep that resolves successfully is included in the graph
- Optional dep that fails to resolve does not block installation
- Required dep that fails to resolve still returns an error
- Mix of successful and failed optional deps: successful ones are in the graph, failed ones produce warnings

#### 1d. Install: merge optional deps into resolution and tolerate failures

**File:** `native/vertz-runtime/src/pm/mod.rs` (`install` function)

1. Read `pkg.optional_dependencies` and merge with workspace optional deps
2. Pass optional deps to `resolve_all()` as the new parameter
3. Print any resolution warnings from the resolver
4. Include optional deps in `all_deps` for lockfile generation, but mark them with `optional: true`
5. For download failures of optional deps: warn and skip (don't add to the fatal `download_errors` list)
6. For postinstall failures of optional deps: warn instead of error

**File:** `native/vertz-runtime/src/pm/resolver.rs` (`graph_to_lockfile`)

Add `optional_names: &HashSet<String>` parameter. When generating lockfile entries, set `entry.optional = true` for packages whose name is in the optional set.

**File:** `native/vertz-runtime/src/pm/workspace.rs` (`merge_workspace_deps`)

Return optional deps as a third element in the tuple, merging optional deps from root and workspace packages.

**File:** `native/vertz-runtime/src/pm/scripts.rs`

No structural change needed. The `run_postinstall_scripts` function already returns `ScriptResult` with success/failure per package. The caller (`install`) will check if a failed script belongs to an optional dep and treat it as a warning.

**Tests:**
- Install with optional deps: all deps installed, lockfile has optional markers
- Install with failing optional dep resolution: install succeeds, required deps installed
- Install with failing optional dep postinstall: install succeeds, warning emitted
- Frozen mode: optional deps in package.json must be in lockfile
- Workspace: optional deps from workspace packages are merged and resolved
- `vertz remove` removes from `optional_dependencies` when the package is there

#### 1e. Output: warnings for optional dep failures

**File:** `native/vertz-runtime/src/pm/output.rs`

Add `optional_warning(&self, message: &str)` to the `PmOutput` trait. Implement in `TextOutput` (prints `warn: {message}` to stderr) and `JsonOutput` (emits NDJSON warning event).

**Tests:**
- TextOutput prints warning to stderr
- JsonOutput emits structured warning

### Acceptance Criteria (BDD)

```rust
describe('Feature: Optional dependencies support', () => {
  describe('Given a package.json with optionalDependencies', () => {
    describe('When running vertz install', () => {
      it('Then resolves and installs optional deps alongside regular deps', () => {})
      it('Then lockfile entries for optional deps have "optional true" marker', () => {})
    })
  })

  describe('Given an optional dep that does not exist in the registry', () => {
    describe('When running vertz install', () => {
      it('Then install completes successfully (exit 0)', () => {})
      it('Then a warning is printed for the failed optional dep', () => {})
      it('Then required deps are still installed', () => {})
    })
  })

  describe('Given an optional dep whose postinstall script fails', () => {
    describe('When running vertz install', () => {
      it('Then install completes successfully (exit 0)', () => {})
      it('Then the optional dep files are still in node_modules (download succeeded)', () => {})
      it('Then a warning is printed about the postinstall failure', () => {})
      it('Then other packages postinstall scripts still run', () => {})
    })
  })

  describe('Given the vertz add command with --optional / -O flag', () => {
    describe('When running vertz add -O <package>', () => {
      it('Then adds the package to optionalDependencies in package.json', () => {})
      it('Then installs the package into node_modules', () => {})
    })
    describe('When running vertz add -O -D <package>', () => {
      it('Then returns an error: --optional and --dev cannot be combined', () => {})
    })
    describe('When running vertz add -O -P <package>', () => {
      it('Then returns an error: --optional and --peer cannot be combined', () => {})
    })
  })

  describe('Given a lockfile with optional and required entries', () => {
    describe('When reading the lockfile', () => {
      it('Then optional entries have optional=true', () => {})
      it('Then required entries have optional=false', () => {})
    })
  })

  describe('Given vertz remove targeting an optional dep', () => {
    describe('When running vertz remove <optional-dep>', () => {
      it('Then removes the package from optionalDependencies', () => {})
    })
  })
})
```

## Files Changed

| File | Change |
|------|--------|
| `native/vertz-runtime/src/pm/types.rs` | `LockfileEntry.optional: bool` field |
| `native/vertz-runtime/src/pm/types.rs` | `write_package_json` handles `optionalDependencies` |
| `native/vertz-runtime/src/pm/lockfile.rs` | Write/parse `optional true` marker |
| `native/vertz-runtime/src/cli.rs` | `AddArgs.optional` flag (`-O`, `--optional`) |
| `native/vertz-runtime/src/main.rs` | Mutual exclusion check, pass `optional` to `pm::add()` |
| `native/vertz-runtime/src/pm/mod.rs` | `add()` gains `optional` param; `install()` resolves optional deps with graceful failure; `remove()` checks `optional_dependencies`; `build_list()` includes optional deps |
| `native/vertz-runtime/src/pm/resolver.rs` | `resolve_all()` gains `optional_deps` param with try-catch; `graph_to_lockfile()` marks optional entries |
| `native/vertz-runtime/src/pm/workspace.rs` | `merge_workspace_deps()` returns optional deps as third value |
| `native/vertz-runtime/src/pm/output.rs` | `optional_warning()` method on `PmOutput` trait |
