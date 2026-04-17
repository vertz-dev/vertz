# Phase 1: Leaf Modules to Typed `PmError`

- **Author:** claude-opus-4-7
- **Reviewer:** claude-reviewer-adversarial
- **Commits:** 38d12bc1e..38d12bc1e
- **Date:** 2026-04-16
- **Parent issue:** #2736

## Changes

- `native/vtz/src/pm/error.rs` (new) — `PmError` enum, `PmResult<T>` alias, `#[from]` impls for `serde_json::Error` and `std::io::Error`
- `native/vtz/src/pm/mod.rs` (modified) — registers `pub mod error;`
- `native/vtz/src/pm/types.rs` (modified) — `read_package_json`, `write_package_json` now return `PmResult`
- `native/vtz/src/pm/lockfile.rs` (modified) — `read_lockfile`, `parse_lockfile` now return `PmResult`
- `native/vtz/src/pm/config.rs` (modified) — `parse_npmrc`, `parse_npmrc_with_env`, `interpolate_env_vars`, `load_registry_config` now return `PmResult`
- `native/vtz/src/pm/vertzrc.rs` (modified) — `load_vertzrc`, `save_vertzrc`, and all `config_*` helpers now return `PmResult`
- `native/vtz/src/pm/bin.rs` (modified) — `write_bin_stub`, `generate_bin_stubs` now return `PmResult`

Scope notes — intentionally not migrated in this phase:
- `pm/mod.rs::install()` and co. still return `Box<dyn std::error::Error>` (downstream phase).
- `pm/pack.rs::read_package_json_raw` and the inline `read_to_string(root_dir.join("package.json")).map_err(|e| format!(...))` block in `pm/mod.rs` still hand-format strings.
- `pm/platform.rs` has no fallible fns; no migration needed.

## CI Status

- [x] Quality gates passed at `38d12bc1e`:
  - `cargo build` ok
  - `cargo test --all` ok
  - `cargo clippy --all-targets -- -D warnings` ok
  - `cargo fmt --all -- --check` ok

## Review Checklist

- [x] Delivers what the ticket asks for (leaf modules migrated, callers unchanged)
- [ ] TDD compliance — no red test was written first (see F3)
- [x] No type gaps in the migrated signatures
- [x] No security issues introduced
- [x] Public API changes match the phase scope (additive `PmError` / `PmResult`; function return types swapped, call sites unaffected)

## Findings

Severity tiers:
- **Blocker** — must fix before merge
- **Should-fix** — fix in this PR or file as a follow-up with justification
- **Nit** — optional polish

### Should-fix

#### SF1. `save_vertzrc`: bare `?` on `lock_exclusive()` silently falls through to `PmError::Io`, dropping the lock path

**File:** `native/vtz/src/pm/vertzrc.rs:139`

```rust
lock_file.lock_exclusive()?;
```

When lock acquisition fails (contention, EINTR, filesystem that doesn't support flock, etc.), this falls through `#[from] std::io::Error` and produces `PmError::Io("io error: ...")`. The `.open(&lock_path)` immediately above uses the typed `PmError::WriteFile { path: lock_path.clone(), ... }` and is consistent; then the very next line discards that pattern.

From a CLI UX standpoint this is a real regression vs. "behavior preserving": the old `Box<dyn Error>` printed roughly the same terse io message, but in the new world the structured variant sets a precedent that the user sees a path on file-related errors. A user hitting a stuck lock now gets `io error: Resource temporarily unavailable` with no hint that `.vertzrc.lock` is the culprit.

**Suggestion:** Either add a `LockFile { path, source }` variant, or at minimum reuse `WriteFile` for consistency with the line above:

```rust
lock_file
    .lock_exclusive()
    .map_err(|source| PmError::WriteFile { path: lock_path.clone(), source })?;
```

Same critique applies, to a lesser degree, to `serde_json::to_string_pretty(config)?` on line 127 (no path context; user sees `serde_json error: ...`). Since this serializes in-memory data it's almost never user-actionable, so a nit.

---

#### SF2. `config_init_trust_scripts`: bare `?` on `read_dir` and nested iteration lose the `node_modules/...` path

**File:** `native/vtz/src/pm/vertzrc.rs:239, 240, 249, 250`

```rust
for entry in std::fs::read_dir(&nm_dir)? {       // line 239
    let entry = entry?;                          // line 240
    ...
        for sub in std::fs::read_dir(&scope_dir)? { // line 249
            let sub = sub?;                          // line 250
```

If `read_dir` on `node_modules/` or on a scope subdir fails (permissions, race with another install, etc.), the user gets a bare `io error: ...`. The function already does `return Err(PmError::NoNodeModules)` for the existence check — but after that, any subsequent filesystem issue collapses into the generic `Io` variant. Given that this function's job is to walk `node_modules/`, the path context matters.

**Suggestion:** Wrap these in `PmError::ReadFile` using `nm_dir` (and `scope_dir`) as the path. The `#[from] std::io::Error` fallthrough should be treated as a compatibility shim for phase 1, not a destination — flag this for phase 2.

---

#### SF3. Missing RED test — migration proceeded without a failing test first

The project rule (`.claude/rules/tdd.md`): "Never write implementation code without a failing test." This migration added production code (new `PmError` variants, new `map_err` wiring) without first demonstrating a failing test that the typed error enables.

The author's defense is presumably "this is a pure type refactor," but that's not quite true — several tests changed from substring assertions on error messages to `matches!(Err(PmError::ReadFile { .. }))` patterns (e.g., `test_read_package_json_not_found` in `types.rs:722`). Those are new behaviors (matching on a variant) that deserved to be RED-first.

**Suggestion:** Acceptable as-is for phase 1 if explicitly documented as a process deviation in the phase 1 commit/PR message. Otherwise, add at least one RED cycle for a variant that the old code couldn't express — e.g., a test that reads a non-existent `package.json` and asserts the error carries the exact failing path:

```rust
#[test]
fn read_package_json_error_includes_path() {
    let dir = tempfile::tempdir().unwrap();
    let err = read_package_json(dir.path()).unwrap_err();
    let PmError::ReadFile { path, .. } = err else { panic!("wrong variant") };
    assert_eq!(path, dir.path().join("package.json"));
}
```

This guards against future refactors that replace the explicit `.map_err(…ReadFile)` with a bare `?` (which silently collapses to `PmError::Io` via the `#[from]` fallthrough — see SF1/SF2).

---

#### SF4. Dead variant: `PmError::InvalidLockfile` is never constructed anywhere

**File:** `native/vtz/src/pm/error.rs:32-33`

```rust
#[error("invalid lockfile at {path}: {reason}")]
InvalidLockfile { path: PathBuf, reason: String },
```

Grep confirms zero constructors in the tree. `parse_lockfile` never produces it (it swallows parse errors by silently ignoring malformed lines — see `lockfile.rs:138-291`, which uses `if let Some((name, range)) = parse_spec_key(spec)` and falls through with no error on mismatches). `read_lockfile` uses `PmError::ReadFile` for io and nothing else.

**Suggestion:** Either delete it (YAGNI — add it back when `parse_lockfile` learns to fail), or wire it into `parse_lockfile` for one real case and test it. Shipping an unused public variant adds type-surface noise. If it's a forward-declaration for phase 2, at minimum add a `// reserved for phase 2: strict lockfile parsing` comment so the next reader doesn't remove it.

---

#### SF5. Untested variants: `PmError::WriteFile` and `PmError::PackageJsonNotObject` have no tests asserting the variant

**Files:**
- `native/vtz/src/pm/types.rs` — `PackageJsonNotObject` is constructed at line 234 but no test covers the path. Trivial case: `package.json` containing a top-level JSON array `[]` or a literal `"string"`.
- `native/vtz/src/pm/vertzrc.rs` / `types.rs` / `bin.rs` — `WriteFile` is constructed in 7 places; no test anywhere asserts `matches!(..., PmError::WriteFile { .. })`.

Symmetrically, `InvalidVertzrc`, `InvalidNpmrc`, `UndefinedEnvVar` only have **substring-on-Display** tests (e.g., `config.rs:263` `err.contains("undefined environment variable")`), not variant-structure tests. Those tests cannot distinguish "the right variant was produced with the right payload" from "some error happened to stringify to this substring."

**Suggestion:** Add targeted `matches!` tests for the new variants, mirroring `types.rs:725`:

```rust
#[test]
fn write_package_json_non_object_returns_typed_variant() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("package.json"), r#""not-an-object""#).unwrap();
    let pkg = PackageJson { /* ... */ };
    let err = write_package_json(dir.path(), &pkg).unwrap_err();
    assert!(matches!(err, PmError::PackageJsonNotObject { .. }));
}
```

Same for `InvalidVertzrc`, `InvalidNpmrc` (unclosed `${`), `UndefinedEnvVar`. Without these, the whole point of the migration (structured variants the caller can inspect) is unverified.

---

#### SF6. `bin.rs::generate_bin_stubs` uses `PmError::WriteFile` for `create_dir_all` — path is correct but variant is semantically stretched

**File:** `native/vtz/src/pm/bin.rs:14, 60`

```rust
std::fs::create_dir_all(parent).map_err(|source| PmError::WriteFile { path: parent.to_path_buf(), source })?;
// ...
std::fs::create_dir_all(&bin_dir).map_err(|source| PmError::WriteFile { path: bin_dir.clone(), source })?;
```

Directory creation is not quite "writing a file" — the user-visible message becomes `failed to write /path/.bin: Permission denied`, which is misleading (nothing was being written). A `CreateDir` variant would be more precise and matches how rust-side errors conventionally separate dir ops from file ops.

**Suggestion:** Add a `PmError::CreateDir { path, source }` variant, or (pragmatic) rename `WriteFile`'s `#[error]` to `"failed to write to {path}: {source}"` so both files and directories read naturally. Given phase 1's minimal-change intent, the rename is probably preferable to a new variant.

### Nits

#### N1. `types.rs::write_package_json`: `?` on `update_map(...)?` and `to_string_pretty(...)?` fall through `#[from] Serde`

**File:** `native/vtz/src/pm/types.rs:262-308, 310`

These all produce `PmError::Serde` without a path. Given that this function already owns a `path: PathBuf`, it'd be more informative to wrap them with the same `InvalidPackageJson { path, source }` variant. That said, these serialization errors are unreachable in practice for in-memory `BTreeMap<String,String>` serialization, so low priority.

#### N2. `save_vertzrc`: `to_string_pretty(config)?` — same `Serde` fallthrough as above, path context lost

**File:** `native/vtz/src/pm/vertzrc.rs:127`

Same comment as N1. Unreachable in practice (serializing `VertzConfig` won't fail), so this is purely about consistency.

#### N3. `PmError::Serde` and `PmError::Io` Display text is terse

**File:** `native/vtz/src/pm/error.rs:51, 54`

```rust
#[error("serde_json error: {0}")]
#[error("io error: {0}")]
```

A user hitting these via one of the `#[from]` fallthroughs sees `io error: No such file or directory` with no hint of which file or which operation. Even a `"i/o error (no path context): {0}"` would be a stronger signal to the next developer that these variants are a phase-1 compatibility seam, not a destination.

#### N4. `PackageJsonNotObject` is a distinct variant but `write_package_json` also uses it for read-side parse in practice

**File:** `native/vtz/src/pm/types.rs:232-234`

`write_package_json` does `read → parse → as_object_mut`. If the file was tampered between read and write, this fires. Fine, but consider renaming to `PackageJsonShape` or similar to avoid coupling the name to one of two call sites.

#### N5. No `#[non_exhaustive]` on `PmError`

**File:** `native/vtz/src/pm/error.rs:7`

Since this is a public enum that's about to grow (phases 2+ will add `TarballChecksum`, `RegistryFetch`, etc.), annotating with `#[non_exhaustive]` now prevents downstream match-completeness breakage later. The crate is `vtz` (private internal runtime), so the practical risk is low — noting for consistency with other public error enums in the tree.

#### N6. `mod.rs` reorders `pub mod error` but doesn't alphabetize

**File:** `native/vtz/src/pm/mod.rs:1-20`

The module list is alphabetized except `error` was inserted in its alphabetical position — OK, that is alphabetical. No-op; scratch this.

## Resolution

All should-fix items addressed in fix commit on top of `38d12bc1e`. Quality gates re-ran green (`cargo test --all`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`).

### Summary of decisions

- **SF1** (`lock_exclusive` path): fixed — `lock_exclusive()` now wrapped with `PmError::WriteFile { path: lock_path.clone(), source }`, consistent with the adjacent `.open(&lock_path)` call.
- **SF2** (`read_dir` path): fixed — `config_init_trust_scripts` now wraps both the top-level `read_dir(&nm_dir)` and the per-entry iteration, plus the scope-directory `read_dir(&scope_dir)` and its iteration, in `PmError::ReadFile`. Path context preserved on every filesystem edge.
- **SF3** (missing RED test): addressed by proxy — the new variant-structure tests added per SF5 serve as RED-capable guards. A future refactor that silently collapses a `.map_err(…Typed)` to a bare `?` (falling through `#[from] std::io::Error`) will now flip `matches!(err, PmError::ReadFile { .. })` to false, making the regression detectable. Documenting this explicitly here as a process deviation justification: the initial migration was a pure type-rename with no net new branch logic; tests were updated in tandem, and the new variant tests now lock behavior going forward.
- **SF4** (`InvalidLockfile` unused): fixed — deleted. YAGNI per project policy. Can re-add when `parse_lockfile` learns to fail in phase 2.
- **SF5** (untested variants): fixed — added:
  - `test_read_package_json_invalid_json_returns_typed_variant` (types.rs) → `InvalidPackageJson`
  - `test_write_package_json_non_object_returns_typed_variant` (types.rs) → `PackageJsonNotObject`
  - `test_write_package_json_missing_source_returns_read_variant` (types.rs) → `ReadFile` (read-modify-write path)
  - `test_parse_npmrc_undefined_env_var` upgraded from substring to `matches!` on `UndefinedEnvVar`
  - `test_parse_npmrc_malformed_interpolation_returns_typed_variant` (config.rs) → `InvalidNpmrc`
  - `test_load_vertzrc_invalid_json_returns_typed_variant` (vertzrc.rs) → `InvalidVertzrc`
  - `test_generate_bin_stubs_bin_dir_creation_failure_returns_write_variant` (bin.rs) → `WriteFile`
- **SF6** (`WriteFile` for dirs): fixed — `PmError::WriteFile`'s Display renamed to `"failed to write to {path}: {source}"`, which reads naturally for both file writes and directory creation. No new variant added (phase 1 minimal-change intent).
- **Nits**: deferred to phase 2+ (N3/N5 are explicit phase-1 compatibility-seam concerns; N1/N2/N4 are unreachable-in-practice polish).
