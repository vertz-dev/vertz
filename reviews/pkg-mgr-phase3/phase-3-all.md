# Phase 3: Package Manager Complete Feature Set — Adversarial Review

- **Author:** Implementation agent
- **Reviewer:** Review agent (adversarial)
- **Commits:** ce674e7ad..06b079ca1 (8 commits)
- **Date:** 2026-03-29

## Changes

- `native/vertz-runtime/src/cli.rs` (modified) — UpdateArgs, CacheArgs, InstallArgs --force/--ignore-scripts, AddArgs --peer/-w, RemoveArgs -w
- `native/vertz-runtime/src/main.rs` (modified) — Update, Cache command handlers, workspace flag wiring, --peer/--dev mutual exclusion
- `native/vertz-runtime/src/pm/mod.rs` (modified) — `update()`, `install()` workspace + script + incremental integration, `extract_range_prefix()`
- `native/vertz-runtime/src/pm/cache.rs` (new) — CacheStats, cache_stats(), cache_clean(), format functions
- `native/vertz-runtime/src/pm/config.rs` (new) — RegistryConfig, parse_npmrc(), load_registry_config(), env var interpolation
- `native/vertz-runtime/src/pm/linker.rs` (modified) — LinkManifest, incremental linking, build_manifest(), --force support
- `native/vertz-runtime/src/pm/output.rs` (modified) — PmOutput trait extended with workspace_linked, script_*, package_updated
- `native/vertz-runtime/src/pm/resolver.rs` (modified) — scripts field on ResolvedGraph
- `native/vertz-runtime/src/pm/scripts.rs` (new) — postinstall script execution, timeout, output capture
- `native/vertz-runtime/src/pm/types.rs` (modified) — PackageJson: peer_dependencies, scripts, workspaces fields; write_package_json peerDeps
- `native/vertz-runtime/src/pm/workspace.rs` (new) — workspace discovery, cycle detection, symlink linking, resolve_workspace_dir

## CI Status

- [x] Quality gates passed — `cargo test --lib`: 941 passed, `cargo test --bin vertz-runtime cli::tests`: 95 passed, `cargo clippy -- -D warnings`: clean

## Review Checklist

- [x] Delivers what the ticket asks for (with exceptions noted below)
- [x] TDD compliance — extensive unit tests for all new modules
- [ ] No type gaps or missing edge cases — **several edge cases found**
- [ ] No security issues — **acknowledged risk in postinstall, one issue found**
- [ ] Public API surface matches design doc — **minor deviations**

## Findings

### BLOCKER: Incremental linking removal uses manifest key as path name

**File:** `native/vertz-runtime/src/pm/linker.rs`, line 155

```rust
// In link_incremental():
for (key, old_entry) in &old_manifest.packages {
    if !new_manifest.packages.contains_key(key) {
        let target = target_path(&node_modules, key, &old_entry.nest_path);
        //                                     ^^^
        // BUG: `key` is a manifest key like "zod@3.24.4", not a package name like "zod"
        // target_path() joins node_modules with this string, producing:
        //   node_modules/zod@3.24.4   (WRONG)
        // instead of:
        //   node_modules/zod          (CORRECT)
    }
}
```

`target_path()` expects a package _name_ (e.g., `"zod"` or `"@vertz/ui"`), but the removal loop passes the manifest _key_ (e.g., `"zod@3.24.4"`). This means removed packages are never actually cleaned from `node_modules/` during incremental linking. The directory `node_modules/zod@3.24.4` does not exist (packages are installed as `node_modules/zod`), so the `remove_dir_all` silently does nothing.

**Impact:** After `vertz remove zod`, the next `vertz install` will see the old manifest entry, try to remove `node_modules/zod@3.24.4` (does not exist), silently skip, and leave `node_modules/zod` orphaned. Only a `--force` install would clean it up.

**Fix:** Parse the package name from the manifest key, or store the package name separately in `ManifestEntry`.

---

### BLOCKER: Postinstall timeout does not kill the child process

**File:** `native/vertz-runtime/src/pm/scripts.rs`, lines 73-77, 121-132

```rust
let result = tokio::time::timeout(
    std::time::Duration::from_secs(SCRIPT_TIMEOUT_SECS),
    run_script(&pkg_dir, script),
).await;

// ...
Err(_) => {
    // Timeout arm — reports error but the child process is still running!
    let error_msg = format!("timed out after {}s", SCRIPT_TIMEOUT_SECS);
    // ...
}
```

When `tokio::time::timeout` fires, the `run_script` future is dropped. However, `tokio::process::Command::spawn()` creates a child process that is NOT automatically killed when the future is dropped. The child process (running `sh -c <script>`) continues executing in the background indefinitely.

This is a real problem for scripts like `prisma generate` that can run for a long time. After 60s, vertz reports timeout and continues, but the `sh` process and its children keep running, consuming CPU/memory, and potentially writing to the package directory while vertz proceeds.

**Fix:** Store the `Child` handle separately, and on timeout, explicitly call `child.kill().await` before reporting the error. Consider also killing the process group (`kill(-pid, SIGKILL)`) since `sh -c` spawns its own children.

---

### SHOULD-FIX: Packages with postinstall scripts are always hardlinked, not copied

**File:** `native/vertz-runtime/src/pm/linker.rs`

The design doc explicitly states:

> "Packages that have `postinstall` scripts are **copied** from the global store instead of hardlinked. This prevents scripts from corrupting the global store when they write files to their own directory."

The `ManifestEntry` has a `has_scripts` field, and `build_manifest()` correctly sets it. However, `link_directory_recursive()` always uses hardlinks (with copy fallback only on cross-filesystem errors). The `has_scripts` flag is stored in the manifest but never consulted during linking.

**Impact:** If `esbuild`'s postinstall downloads platform binaries into its package directory, those writes go through the hardlink and corrupt the global store. The next project that hardlinks esbuild from the same store gets corrupted files.

**Fix:** In `link_packages_incremental()` and `link_packages()`, check `has_scripts` for each package. If true, use `copy_directory_recursive()` instead of `link_directory_recursive()`.

---

### SHOULD-FIX: `--frozen` check runs before workspace discovery

**File:** `native/vertz-runtime/src/pm/mod.rs`, lines 61-83

```rust
// Line 62: Frozen check runs here (only root package.json)
if frozen {
    verify_frozen(&pkg, &existing_lockfile)?;
}

// Lines 66-83: Workspace discovery happens AFTER frozen check
let workspaces = if let Some(ref patterns) = pkg.workspaces { ... };
let (resolved_deps, resolved_dev_deps) = if !workspaces.is_empty() {
    workspace::merge_workspace_deps(&pkg, &workspaces)
} else { ... };
```

The design doc says: "`vertz install --frozen` validates the root lockfile covers all workspace dependencies." But `verify_frozen` only checks root `package.json` deps. If workspace `packages/api` adds a new dependency, `--frozen` won't catch it.

**Fix:** Move `verify_frozen` call to after workspace deps are merged, and pass the merged deps instead of just `&pkg`.

---

### SHOULD-FIX: Workspace `link:` protocol entries not written to lockfile

**File:** `native/vertz-runtime/src/pm/mod.rs`

The design doc specifies:

> "Workspace package dependencies are listed in the lockfile with a `link:` protocol instead of a registry URL:
> ```
> @myorg/shared@link:packages/shared:
>   version "0.1.0"
>   resolved "link:packages/shared"
> ```"

No `link:` entries are written to the lockfile. Workspace packages are symlinked into `node_modules/` but the lockfile has no record of them. This means:
1. `vertz why @myorg/shared` won't find workspace packages
2. `vertz list` won't show workspace packages
3. `--frozen` can't validate workspace package presence

---

### SHOULD-FIX: `pm::add()` does not validate `peer && dev` mutual exclusion

**File:** `native/vertz-runtime/src/pm/mod.rs`, `add()` function

The `--peer` and `--dev` mutual exclusion is only enforced in `main.rs` (line 117-120), not in the `pm::add()` library function. If a caller invokes `pm::add()` with both `peer=true` and `dev=true`, the package silently goes to `peerDependencies` (because `peer` is checked first in the if-chain).

**Fix:** Add a guard at the top of `pm::add()`:
```rust
if peer && dev {
    return Err("error: --peer and --dev cannot be used together".into());
}
```

---

### SHOULD-FIX: `std::env::set_var` / `remove_var` in tests is unsound in Rust 1.82+

**File:** `native/vertz-runtime/src/pm/config.rs`, tests

Multiple tests call `std::env::set_var()` and `std::env::remove_var()`, which are now `unsafe` in Rust 1.82+ due to data races when tests run in parallel. Examples:
- `test_parse_npmrc_env_var_interpolation` sets `TEST_NPM_TOKEN_3G`
- `test_load_registry_config_no_npmrc` sets `HOME`
- `test_parse_npmrc_multiple_env_vars` sets `TEST_HOST_3G` and `TEST_TOKEN_3G`

While these tests use unique env var names (suffixed `_3G`) to reduce collision risk, setting `HOME` in `test_load_registry_config_no_npmrc` is particularly risky as it affects all concurrent tests that read `HOME`.

**Fix:** Use `temp_env` crate or wrap with `unsafe {}` blocks and add `#[serial_test::serial]` to prevent parallel execution, or restructure the code to accept `HOME` as a parameter.

---

### NITS: Minor deviations from design doc

1. **JSON event name mismatch:** The design doc specifies `{"event":"update",...}` for update events, but the implementation emits `{"event":"updated",...}`. The naming should be consistent with the doc or the doc should be updated.

2. **Missing `updated` count in done event:** The design doc specifies `{"event":"done","updated":2,"elapsed_ms":1234}` for `vertz update --json`, but the implementation's done event is `{"event":"done","elapsed_ms":...}` without the `updated` field.

3. **`vertz update` non-dry-run text output:** When `vertz update` (non-dry-run, non-json) finds packages to update, the output only comes from `output.package_updated()` calls during the update phase, then `install()` is called which produces its own output. There's no summary header like `"Updated 3 packages:"` as shown in the design doc.

4. **`vertz update` up-to-date message:** When `vertz update` finds nothing to update in non-dry-run mode, the design doc says to print `"All packages are up to date."` but the implementation only calls `output.done()` which prints `"Done in 0.1s"`. The "All packages are up to date" message is only shown for `--dry-run` mode (in `main.rs`).

---

### POSITIVE: Things done well

1. **TDD compliance is strong.** Every module has comprehensive unit tests. Cache, config, workspace, scripts, linker, types, and CLI all have good test coverage with edge cases.

2. **`extract_range_prefix` is correct and well-tested.** Handles `^`, `~`, `>=`, `<=`, `>`, `<`, and bare versions. This is critical for `--latest` preserving range operators.

3. **Workspace cycle detection is correct.** Uses proper DFS with `in_stack` tracking (not just `visited`) to detect back-edges. Correctly allows circular devDependencies while rejecting circular production dependencies.

4. **Workspace discovery correctly validates** no-name packages, duplicate names, skips non-directories, and provides helpful error messages with available workspace names.

5. **Incremental linking logic for the happy path is well-tested.** No-changes, new-package-added, corrupted-manifest-fallback, and force-flag scenarios all have tests.

6. **`.npmrc` parsing is thorough.** Comments, whitespace, env var interpolation, malformed `${}`, multiple env vars in one line, scoped registries, auth token prefix matching -- all covered.

7. **Postinstall script handling is clean.** Sequential execution, timeout, missing directory, non-zero exit code -- all tested. The `PmOutput` trait cleanly abstracts human vs JSON output.

8. **Error messages are consistently good.** "workspace not found" lists available workspaces, "no lockfile" suggests `vertz install`, "not a direct dependency" names the package.

## Resolution

**Two blockers must be fixed before merge:**

1. **Incremental linking removal bug** — Parse package name from manifest key before passing to `target_path()`.
2. **Postinstall timeout does not kill child process** — Store child handle, explicitly kill on timeout.

**Five should-fix items recommended before merge:**

3. Packages with postinstall scripts should be copied, not hardlinked.
4. `--frozen` check should run after workspace dep merging.
5. Workspace `link:` entries should be written to the lockfile.
6. `pm::add()` should validate `peer && dev` mutual exclusion at the library level.
7. `std::env::set_var` calls in tests need safety treatment.

**Nits** can be addressed in a follow-up.
