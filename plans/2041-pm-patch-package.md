# feat(pm): patch-package style dependency patching

> "If a dependency limits us, we replace it." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft |
| 2 | 2026-03-29 | Address all review findings. Key changes: (1) use `similar` crate for diff generation, `diffy` for patch application — don't reinvent, (2) copy from `node_modules/` not store — preserves postinstall artifacts, (3) linker marks patched packages for copy-not-hardlink, (4) Phase 1 includes basic `apply_patches()` for standalone value, (5) add `vertz patch list` command, (6) clarify `--frozen` mode applies patches, (7) `add`/`update` transitively apply patches via `install()`, (8) document incremental linking interaction, (9) non-goal #5 rephrased with workaround, (10) version control guidance added, (11) resolved open question: copy from node_modules, not store |
| 3 | 2026-03-29 | Address DX/Product/Technical review findings: (1) rename `patch-commit`→`patch save`, `patch-revert`→`patch discard` — subcommand pattern matching `cache`/`config` conventions, avoids git terminology collision, (2) clarify `patch_commit` does own raw-JSON read-modify-write separate from `write_package_json()`, (3) document `build_manifest()` signature change to accept `patched_packages`, (4) add `ManifestEntry.has_patch` field documentation, (5) document `diffy` wrapper for multi-file patch splitting, (6) specify exact `apply_patches()` insertion point in `install()` flow, (7) hardlink breaking preserves file permissions, (8) better nested-dep error with workaround, (9) note `vertz update` interaction as known gap, (10) clarify `patch discard` re-applies saved patches matching `vertz install` state, (11) workspace root-only `patchedDependencies`, (12) `patchedDependencies` map form documented for custom path flexibility |

**Issue:** #2041
**Deferred from:** `plans/vertz-package-manager-phase3.md` (Non-Goal #7)

---

## The Problem

Developers frequently need to fix bugs or make local modifications to third-party dependencies. Today, the options are:

1. **Fork the package** — heavyweight, hard to maintain, version drift
2. **Wait for the upstream fix** — blocks development
3. **Use `patch-package` (npm)** — requires a separate tool, not integrated with the PM

Vertz should natively support patching dependencies as a first-class workflow, consistent with the "No ceilings" principle.

---

## API Surface

### Command Structure

`vertz patch` is a command group with subcommands, following the same pattern as `vertz cache` and `vertz config`:

```
vertz patch <package>           # Prepare for editing (default action)
vertz patch save <package>      # Save the diff as a patch file
vertz patch discard <package>   # Discard in-progress changes
vertz patch list                # Show active and saved patches
```

**Why not `patch-commit` / `patch-revert`?** Hyphenated top-level commands break the existing subcommand grouping convention (`cache clean`, `config set`). "commit" and "revert" also collide with git terminology — `vertz patch-commit express` reads like "commit the express patch to git." "save" and "discard" are unambiguous.

### `vertz patch <package>` — Prepare a package for editing

```bash
vertz patch express              # Prepare express for editing
vertz patch express@4.21.2       # Explicit version (for disambiguation)
```

**Semantics:**
1. Finds the package in `node_modules/` (resolved from lockfile)
2. Saves the current `node_modules/<package>/` contents as a read-only backup at `node_modules/.vertz-patches/<package-name>/` (full copy, preserving postinstall artifacts)
3. If the package was hardlinked from the store, breaks the hardlinks by copying file contents in-place — preserving file permissions (mode bits) — so edits don't corrupt the global store
4. Prints instructions for the developer

**Output:**
```
Prepared express@4.21.2 for patching.

Edit files in node_modules/express/ then run:
  vertz patch save express
```

**Error cases:**
- Package not found in `node_modules/`: `error: "foo" is not installed. Run "vertz install" first.`
- Package already being patched (backup exists): `error: "express" is already being patched. Run "vertz patch save express" or "vertz patch discard express" first.`
- Non-hoisted (nested) dependency: `error: "@scope/nested" is a transitive dependency (installed under "parent-pkg"). Only direct dependencies can be patched. To patch it, add it as a direct dependency: vertz add @scope/nested`

### `vertz patch save <package>` — Save the patch

```bash
vertz patch save express         # Save diff as a patch file
```

**Semantics:**
1. Diffs the modified `node_modules/<package>/` against the backup at `node_modules/.vertz-patches/<package-name>/`
2. Generates a unified diff patch file at `patches/<package-name>@<version>.patch` (creates `patches/` directory if it doesn't exist)
3. Records the patch in `package.json` under `"vertz": { "patchedDependencies": { "<name>@<version>": "patches/<name>@<version>.patch" } }`
4. Cleans up the backup directory at `node_modules/.vertz-patches/<package-name>/`

**package.json write:** `patch save` performs its own `serde_json::Value` read-modify-write to set `vertz.patchedDependencies`, independent of `write_package_json()`. Do NOT add a `vertz` field to the `PackageJson` struct — the existing struct only manages `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies`.

**Output:**
```
Patch saved: patches/express@4.21.2.patch (3 files changed) ✓
Updated package.json with patch reference.
```

**Patch file format:** Standard unified diff (human-readable, git-compatible):
```diff
diff --git a/lib/router/index.js b/lib/router/index.js
--- a/lib/router/index.js
+++ b/lib/router/index.js
@@ -160,7 +160,7 @@
-  var layer = new Layer(path, {
+  var layer = new Layer(path || '/', {
```

**Error cases:**
- No backup found (patch not started): `error: "express" is not being patched. Run "vertz patch express" first.`
- No changes detected: `warning: no changes detected in "express". Skipping patch creation.`

### `vertz patch discard <package>` — Discard in-progress patch

```bash
vertz patch discard express      # Discard changes, restore original
```

**Semantics:**
1. Restores `node_modules/<package>/` from the backup at `node_modules/.vertz-patches/<package-name>/`
2. Removes the backup directory
3. If a saved patch exists for this version, re-applies it — restoring the package to the same state that `vertz install` would produce

This means `discard` does NOT revert to the unpatched original — it reverts to the *installed* state, which includes any previously saved patch. This is intentional: after `discard`, the package is in the exact same state as after a fresh `vertz install`.

**Output:**
```
Discarded in-progress changes for express@4.21.2.
```

If a saved patch was re-applied:
```
Discarded in-progress changes for express@4.21.2.
Re-applied saved patch: patches/express@4.21.2.patch ✓
```

**Error cases:**
- No backup found: `error: "express" is not being patched. Nothing to discard.`
- Backup was removed by a fresh `vertz install`: `error: "express" patch backup not found — it may have been removed by a fresh install. No action needed.`

### `vertz patch list` — Show patch status

```bash
vertz patch list                 # Show active and saved patches
```

**Output:**
```
Active patches (in progress):
  express@4.21.2 (editing)

Saved patches:
  express@4.21.2 → patches/express@4.21.2.patch
  @types/node@22.0.0 → patches/@types+node@22.0.0.patch
```

If no patches exist:
```
No patches found.
```

### `vertz install` — Auto-applies saved patches

After linking is complete, `vertz install` reads `package.json`'s `vertz.patchedDependencies` and applies each patch file. This also applies transitively when `vertz add` or `vertz update` trigger an install.

**Insertion point:** `apply_patches()` runs after linking and workspace symlinking but **before** bin stubs and postinstall scripts. Patched files may be prerequisites for postinstall scripts.

```
$ vertz install
Resolving... done
Downloading 142 packages... done
Linking 142 packages (127 cached)
Applying 1 patch:
  patches/express@4.21.2.patch ✓
Done in 1.2s
```

**`--frozen` mode:** Patches are applied in `--frozen` mode. Patches don't modify the lockfile — they modify `node_modules/` after linking, which is the same as what linking itself does.

**Error on patch failure:**
```
error: failed to apply patch patches/express@4.21.2.patch
  The patch was created for express@4.21.2 but express@4.22.0 is installed.

  To recreate the patch for the new version:
    1. vertz patch express
    2. Review and re-apply your changes to node_modules/express/
    3. vertz patch save express

  Old patch preserved at: patches/express@4.21.2.patch
```

The old patch file is NOT deleted on version mismatch — it serves as a reference for what changes need to be re-applied.

**Known gap (`vertz update` interaction):** When `vertz update` upgrades a patched package, the patch fails during the subsequent install with a version mismatch error. A future enhancement could warn the user *before* updating: `warning: "express" has a patch (patches/express@4.21.2.patch). Updating to 4.22.0 will invalidate the patch. Continue? [y/N]`. Tracked as a follow-up, not in scope for this feature.

### `--json` support

All patch commands support `--json` for NDJSON output:

```bash
vertz patch express --json
# {"event":"patch_prepared","package":"express","version":"4.21.2"}

vertz patch save express --json
# {"event":"patch_saved","package":"express","version":"4.21.2","path":"patches/express@4.21.2.patch","files_changed":3}

vertz patch discard express --json
# {"event":"patch_discarded","package":"express","version":"4.21.2"}

vertz patch list --json
# {"event":"patch_active","package":"express","version":"4.21.2"}
# {"event":"patch_saved","package":"@types/node","version":"22.0.0","path":"patches/@types+node@22.0.0.patch"}
```

---

## Manifesto Alignment

| Principle | How this feature aligns |
|---|---|
| **No ceilings** | Developers aren't blocked by upstream bugs. They patch and move on. |
| **One way to do things** | Single built-in mechanism for dependency patching — no external `patch-package` tool. |
| **If it builds, it works** | Patch files are version-locked. Version mismatch is a hard error, not a silent failure. |
| **AI agents are first-class users** | `--json` output. `patch list` for state inspection. Deterministic workflow (patch → edit → commit). LLM can drive the entire flow. |
| **Explicit over implicit** | Patches are visible in `patches/` dir (version-controlled) and tracked in `package.json`. Nothing hidden. |

**Tradeoffs:**
- We store the backup in `node_modules/.vertz-patches/` (implicitly gitignored via `node_modules/`) rather than a temp directory — simpler discovery, survives terminal restarts.
- Patch files use unified diff rather than a custom format — human-readable, compatible with `git apply`, inspectable in code review.
- We copy the backup from `node_modules/` (not the global store) — preserves postinstall artifacts like platform-specific binaries.

**What was rejected:**
- **`postinstall` hook for patch application** — too implicit, not inspectable, would run at wrong time during incremental installs. Explicit step in the install flow is clearer.
- **`pnpm`-style `patchedDependencies` at top-level package.json** — we scope it under `"vertz": {}` to avoid polluting the package.json namespace and conflicting with other tools.
- **Storing original as a full copy alongside the patched version** — wasteful. Unified diff is compact, human-readable, and version-controlled.
- **Copying from global store during `vertz patch`** — the store has raw tarball contents without postinstall artifacts. `node_modules/` is the correct "before" state.
- **Custom diff/patch algorithms** — use established Rust crates (`similar` for diffing, `diffy` for patch application).

---

## Non-Goals

1. **Patching workspace packages** — workspace packages are source code; edit them directly.
2. **Automatic patch migration across versions** — when a dependency version changes, patches must be manually recreated. Fuzzy matching creates silent drift.
3. **Binary file patching** — only text file diffs are supported. Binary changes require a fork.
4. **Patch conflict resolution** — if a patch can't apply cleanly, it's a hard error. No interactive merge.
5. **Nested dependency patching** — deferred to a future version. When a developer tries to patch a nested dep, the error message guides them: `error: "@scope/nested" is a transitive dependency (installed under "parent-pkg"). Only direct dependencies can be patched. To patch it, add it as a direct dependency: vertz add @scope/nested`. This brings the package to the top level where it can be patched.
6. **`vertz patch remove`** — removing a saved patch (deleting file + cleaning package.json) is deferred. Developers can manually delete the patch file and remove the `vertz.patchedDependencies` entry. A convenience command can be added as a follow-up.

---

## Unknowns

1. **Hardlink detection and breaking** — packages without postinstall scripts are hardlinked from the store. `vertz patch` must break these hardlinks before editing, otherwise edits corrupt the global store. **Resolution:** During `vertz patch`, detect if files are hardlinked (nlink > 1 via `std::fs::metadata`) and break them by reading content + writing to a new file at the same path, preserving file permissions (mode bits). This is critical for packages with executable scripts or `.node` native addons. The backup is taken from `node_modules/` before breaking hardlinks.

2. **Scoped package naming in patch files** — `@scope/package` contains `/` which needs escaping in filenames. **Resolution:** Use `@scope+package@version.patch` (replace `/` with `+`), matching pnpm's convention.

---

## Version Control Guidance

- `patches/` directory — **committed to git**. This is the entire point: patches persist across installs and are shared across the team.
- `node_modules/.vertz-patches/` — **not committed** (implicitly gitignored since it's inside `node_modules/`). This is ephemeral working state during patch creation.

---

## Type Flow Map

N/A — This is a Rust CLI feature. No TypeScript generics involved. The only TypeScript-adjacent concern is the `package.json` schema extension, which is a plain JSON object (no generics).

---

## E2E Acceptance Test

### Scenario 1: Full patch workflow

```bash
# Setup: project with express@4.21.2 installed
cd /tmp/test-project
echo '{"dependencies":{"express":"^4.21.0"}}' > package.json
vertz install

# Step 1: Prepare for patching
vertz patch express
# → "Prepared express@4.21.2 for patching."
# → "Edit files in node_modules/express/ then run:"
# → "  vertz patch save express"

# Step 2: Make changes
echo '// patched' >> node_modules/express/lib/router/index.js

# Step 3: Save patch
vertz patch save express
# → "Patch saved: patches/express@4.21.2.patch (1 file changed) ✓"
# → "Updated package.json with patch reference."

# Verify patch file exists and is valid unified diff
head -1 patches/express@4.21.2.patch
# → "diff --git a/lib/router/index.js b/lib/router/index.js"

# Verify package.json has vertz.patchedDependencies
python3 -c "import json; d=json.load(open('package.json')); assert d['vertz']['patchedDependencies']['express@4.21.2'] == 'patches/express@4.21.2.patch'"

# Step 4: Fresh install applies patch
rm -rf node_modules
vertz install
# → output includes "Applying 1 patch:"
# → "  patches/express@4.21.2.patch ✓"

# Verify patch was applied
tail -1 node_modules/express/lib/router/index.js
# → "// patched"
```

### Scenario 2: Version mismatch error

```bash
# After updating express to 4.22.0, the old patch should fail
vertz update express --latest
vertz install
# → "error: failed to apply patch patches/express@4.21.2.patch"
# → "The patch was created for express@4.21.2 but express@4.22.0 is installed."
# → Old patch preserved at patches/express@4.21.2.patch for reference
```

### Scenario 3: Scoped package

```bash
vertz patch @types/node
vertz patch save @types/node
# → "Patch saved: patches/@types+node@22.0.0.patch"
```

### Scenario 4: Patch list

```bash
vertz patch list
# → shows saved patches from package.json
```

### Scenario 5: Discard in-progress patch

```bash
vertz patch express
echo '// bad change' >> node_modules/express/lib/router/index.js
vertz patch discard express
# → "Discarded in-progress changes for express@4.21.2."
# If a saved patch existed, it would be re-applied
```

---

## Implementation Plan

### Phase 1: Core Workflow — `patch`, `patch save`, `apply_patches`

**Goal:** Developer can prepare a package for editing, save a patch file, and apply saved patches. A complete end-to-end workflow.

**Dependencies:** `similar` crate (for diff generation), `diffy` crate (for patch application)

**Acceptance Criteria:**

```rust
#[cfg(test)]
mod tests {
    // --- vertz patch ---

    // Given an installed package in node_modules (with hardlinked files)
    // When `patch("express")` is called
    // Then a backup copy exists at node_modules/.vertz-patches/express/
    // And node_modules/express/ files are writable (hardlinks broken)
    // And file permissions are preserved after hardlink breaking

    // Given a package not in node_modules
    // When `patch("nonexistent")` is called
    // Then it returns an error "not installed"

    // Given a package already being patched (backup exists)
    // When `patch("express")` is called again
    // Then it returns an error "already being patched"

    // Given a non-hoisted (nested) dependency
    // When `patch("nested-dep")` is called
    // Then it returns an error with guidance to add as direct dependency

    // --- vertz patch save ---

    // Given a package being patched with modifications
    // When `patch_save("express")` is called
    // Then a unified diff is written to patches/express@4.21.2.patch
    // And package.json has vertz.patchedDependencies entry (via raw serde_json::Value manipulation)
    // And the backup directory is cleaned up

    // Given a package being patched with no changes
    // When `patch_save("express")` is called
    // Then it prints a warning "no changes detected"
    // And no patch file is created

    // Given no backup exists (patch not started)
    // When `patch_save("express")` is called
    // Then it returns an error "not being patched"

    // Given a scoped package @types/node being patched
    // When `patch_save("@types/node")` is called
    // Then the patch file is named patches/@types+node@version.patch

    // Given patches/ directory doesn't exist
    // When `patch_save()` writes a patch
    // Then it creates the patches/ directory automatically

    // --- apply_patches ---

    // Given patches/express@4.21.2.patch exists
    // And package.json has patchedDependencies entry
    // And express@4.21.2 is installed in node_modules
    // When apply_patches() is called
    // Then the patch is applied to node_modules/express/

    // Given a patch for express@4.21.2
    // And express@4.22.0 is installed
    // When apply_patches() is called
    // Then it returns an error with version mismatch message
    // And the old patch file is preserved (not deleted)

    // Given a patch that modifies a file that doesn't exist
    // When apply_patches() is called
    // Then it returns an error (hard failure, no fuzzy matching)

    // --- package.json read-modify-write ---

    // Given package.json with existing fields
    // When patchedDependencies is added under vertz key
    // Then all existing fields are preserved (no data loss)
    // And the write uses raw serde_json::Value, NOT write_package_json()
}
```

**Files to create/modify:**
- `native/vertz-runtime/src/pm/patch.rs` — new module with `patch()`, `patch_save()`, `apply_patches()` functions
- `native/vertz-runtime/src/pm/mod.rs` — add `pub mod patch;`, re-exports, call `apply_patches()` after linking in `install()`
- `native/vertz-runtime/src/cli.rs` — add `Patch` subcommand enum with `Save` variant (and bare `Patch` as default)
- `native/vertz-runtime/src/main.rs` — add dispatch for new commands
- `native/vertz-runtime/Cargo.toml` — add `similar` and `diffy` dependencies

**Linker interaction:**
- Add `has_patch: bool` field to `ManifestEntry`. This is critical for incremental linking correctness: when a patch is added to a previously-hardlinked package, the `ManifestEntry` changes (`has_patch: false` → `true`), triggering a relink that copies instead of hardlinks. Without this, the incremental linker would skip the package, leaving it hardlinked, and `apply_patches()` would corrupt the global store.
- Extend `build_manifest()` signature to accept `patched_packages: &HashSet<String>` — the set of package names from `vertz.patchedDependencies`. This signature change propagates to `link_packages()` and `link_packages_incremental()`.
- The `install()` function reads `vertz.patchedDependencies` from package.json and passes the set to `build_manifest()`.
- Update the copy-vs-hardlink condition: `if new_entry.has_scripts || new_entry.has_patch { copy } else { hardlink }`.
- **`apply_patches()` insertion point:** In `install()`, call `apply_patches()` after linking and workspace symlinking but **before** bin stubs and postinstall scripts (after line ~251, before line ~262 in current `mod.rs`). Patched files may be prerequisites for postinstall scripts.
- After any linking pass (full or forced), re-apply all patches. For incremental skips where the patched package is unchanged, the copy in node_modules is already patched.

### Phase 2: `patch discard` + `patch list` + JSON output

**Goal:** Complete the command surface with discard, list, and structured output.

**Acceptance Criteria:**

```rust
#[cfg(test)]
mod tests {
    // --- vertz patch discard ---

    // Given a package being patched (backup exists)
    // When `patch_discard("express")` is called
    // Then node_modules/express/ is restored from backup
    // And the backup directory is removed

    // Given no backup exists
    // When `patch_discard("express")` is called
    // Then it returns an error "not being patched"

    // Given a saved patch exists and a package is being patched
    // When `patch_discard("express")` is called
    // Then the original is restored AND the saved patch is re-applied
    // (restoring to the same state as `vertz install`)

    // --- vertz patch list ---

    // Given packages being patched and saved patches in package.json
    // When `patch_list()` is called
    // Then it shows both active and saved patches

    // Given no patches (no backups, no patchedDependencies)
    // When `patch_list()` is called
    // Then it shows "No patches found."

    // --- JSON output ---

    // Given --json flag on vertz patch
    // Then output is NDJSON: {"event":"patch_prepared","package":"...","version":"..."}

    // Given --json flag on vertz patch save
    // Then output is NDJSON: {"event":"patch_saved",...}

    // Given --json flag on vertz patch discard
    // Then output is NDJSON: {"event":"patch_discarded",...}

    // Given --json flag on vertz patch list
    // Then output is NDJSON per patch entry
}
```

**Files to modify:**
- `native/vertz-runtime/src/pm/patch.rs` — add `patch_discard()`, `patch_list()`, JSON output support
- `native/vertz-runtime/src/cli.rs` — add `Discard` and `List` variants to the `Patch` subcommand enum
- `native/vertz-runtime/src/main.rs` — add dispatch for new subcommands

---

## Diff Generation and Patch Application

### Diff Generation (using `similar` crate)

The diff is generated by walking both directory trees (backup and modified) and comparing file contents:

1. Walk the backup directory recursively to get all file paths (skip `node_modules/` subdirectories within the package)
2. Walk the modified directory recursively to get all file paths
3. For each file in both sets:
   - If only in backup → file was deleted (emit `--- a/path` / `+++ /dev/null`)
   - If only in modified → file was added (emit `--- /dev/null` / `+++ b/path`)
   - If in both → compare contents using `similar::TextDiff`. If different, emit unified diff hunks
4. Binary files (detected by null bytes in first 8KB, or known binary extensions: `.wasm`, `.node`, `.exe`, `.dll`, `.so`, `.dylib`) are skipped with a comment

The diff format follows the unified diff standard (`diff --git a/path b/path`) so it's compatible with `git apply`, `patch -p1`, and code review tools.

### Patch Application (using `diffy` crate)

1. Read `package.json` → `vertz.patchedDependencies`
2. For each entry `name@version → path`:
   a. Verify the installed version matches (from `node_modules/<pkg>/package.json`)
   b. **Split the multi-file patch into per-file patches.** The patch file contains multiple `diff --git a/path b/path` sections. A thin parser splits on `diff --git` boundaries and extracts file paths from `---`/`+++` headers. `diffy::Patch::from_str()` operates on single-file patches, so this splitting step is required.
   c. For each per-file patch, apply hunks to the target file using `diffy` (exact context match — no fuzz factor)
   d. If any hunk fails to apply, abort with error
3. Before applying, ensure the package is a copy (not hardlinked) — the linker handles this for known patched packages. For safety, verify and break hardlinks before writing.

**Note on `diffy`:** If `diffy` proves insufficient for the `diff --git` header format (it expects standard `---`/`+++` headers), strip the `diff --git` lines before parsing. Alternatively, evaluate whether `similar` alone is sufficient for exact-match patch application, avoiding the extra dependency.

### Incremental Linking Interaction

- **Full relink / forced relink:** All packages are linked fresh from store. Patches are re-applied after linking completes.
- **Incremental relink (patched package unchanged):** The linker skips the package (cached). The existing copy in `node_modules/` already has the patch applied from the previous install. No re-application needed.
- **Incremental relink (patched package version changed):** The linker re-links the package. The patch is re-applied (or fails with version mismatch).

---

## package.json Schema Extension

```json
{
  "dependencies": {
    "express": "^4.21.0"
  },
  "vertz": {
    "patchedDependencies": {
      "express@4.21.2": "patches/express@4.21.2.patch"
    }
  }
}
```

The `vertz.patchedDependencies` key maps `<name>@<version>` to the relative path of the patch file. The map form (not an array) supports custom patch paths — developers can reorganize patch files (e.g., `patches/deps/express@4.21.2.patch`) and update the value. This is scoped under `"vertz"` to avoid conflicts with other tools.

**Read-modify-write:** The `patch save` command performs its own `serde_json::Value` read-modify-write, independent of `write_package_json()`. The existing `write_package_json()` only manages `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies` and does NOT know about the `vertz` key. `patch save` reads the raw JSON, navigates to (or creates) `vertz.patchedDependencies`, sets the entry, and writes back. This preserves all other fields in package.json.

**Workspace note:** In a workspace monorepo, `patchedDependencies` lives only in the **root** `package.json`, since all workspace packages share the same `node_modules/`. Developers must run `vertz patch` from the workspace root.

---

## Open Questions (Resolved)

1. ~~Should `vertz patch` copy from the global store or from `node_modules/`?~~
   **Resolved:** Copy from `node_modules/`. The store has raw tarball contents without postinstall artifacts (e.g., `esbuild`'s platform binaries). `node_modules/` is the correct "before" state that includes postinstall modifications.

2. ~~Should we support `vertz patch remove`?~~
   **Resolved:** Deferred to Non-Goal #6. Manual deletion is sufficient for v1. Can be added as a convenience command later.
