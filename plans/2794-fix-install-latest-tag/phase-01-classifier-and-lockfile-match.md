# Phase 1: Dist-tag classifier + lockfile match

## Context

Fixes GitHub #2794. `vtz install` silently drops `package.json` deps with version spec like `"latest"` (npm dist-tag). The package resolves and installs, but no entry is written to `vertz.lock`; a subsequent `vtz install --frozen` fails with `lockfile is out of date`.

Root cause: `graph_to_lockfile()` in `native/vtz/src/pm/resolver.rs` classifies non-semver specs via a hardcoded `github:`/`link:` prefix check. Dist-tags slip through — `Range::parse("latest")` fails and the dep is silently skipped. Fix lives in two match sites (root-dep loop + transitive-dep loop) inside that one function. See design doc: `plans/2794-fix-install-latest-tag.md`.

## Tasks

### Task 1: Add `is_non_semver_spec` / `is_dist_tag_shape` classifier + unit tests

**Files:** (2)
- `native/vtz/src/pm/resolver.rs` (modified)
- `.changeset/fix-install-latest-tag.md` (new)

**What to implement:**

Private helpers inside `resolver.rs`:

```rust
/// Returns true iff `range_str` is a non-semver dependency specifier that
/// `graph_to_lockfile` must match by name alone (no semver range check).
///
/// Includes:
/// - `github:owner/repo[#ref]` — pinned by commit SHA
/// - `link:path` — workspace link
/// - Dist-tag-shaped strings — `latest`, `next`, `beta`, and custom tags
///
/// Deliberately excludes:
/// - Semver ranges (`^1.2.3`, `~1.0.0`, `>=1.0.0 <2.0.0`, `*`, `1.2.3`, `1.x`)
/// - Protocol-prefixed specs (`file:`, `workspace:`, `npm:`, `http://`)
fn is_non_semver_spec(range_str: &str) -> bool {
    range_str.starts_with("github:")
        || range_str.starts_with("link:")
        || is_dist_tag_shape(range_str)
}

/// Returns true iff `s` looks like a dist-tag name.
///
/// Rules:
/// - Non-empty
/// - First char is ASCII alphabetic (excludes `1.2.3`, `~1.0`)
/// - All chars are ASCII alphanumeric or `-` `_` `.` (excludes `:`/`/`/`@`/spaces/operators)
/// - Does not parse as a semver range (rejects `x` / `x.x.x` semver wildcards)
fn is_dist_tag_shape(s: &str) -> bool {
    let Some(first) = s.chars().next() else { return false; };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    if !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return false;
    }
    Range::parse(s).is_err()
}
```

TDD order:

1. **RED — classifier tests** in `#[cfg(test)] mod tests` at the bottom of `resolver.rs`. Write *one* failing test first for `is_non_semver_spec("latest") == true`. Confirm red (helper doesn't exist → won't compile).
2. **GREEN**: add the two helpers with just enough to pass.
3. **RED + GREEN + REFACTOR** for the remaining classifier cases — one test at a time:
   - `is_non_semver_spec("github:owner/repo") == true`
   - `is_non_semver_spec("link:../ws") == true`
   - `is_non_semver_spec("next") == true`
   - `is_non_semver_spec("beta") == true`
   - `is_non_semver_spec("canary-build") == true`
   - `is_non_semver_spec("alpha_1") == true`
   - `is_non_semver_spec("^1.2.3") == false`
   - `is_non_semver_spec("~1.0.0") == false`
   - `is_non_semver_spec("1.2.3") == false`
   - `is_non_semver_spec(">=1.0.0 <2.0.0") == false`
   - `is_non_semver_spec("1.x") == false`
   - `is_non_semver_spec("*") == false`
   - `is_non_semver_spec("") == false`
   - `is_non_semver_spec("1latest") == false` (digit prefix)
   - `is_non_semver_spec("file:./x") == false` (contains `:` and `/`)
   - `is_non_semver_spec("workspace:*") == false`
   - `is_non_semver_spec("npm:react@1.0.0") == false`
4. **Changeset**: create `.changeset/fix-install-latest-tag.md` with content:
   ```markdown
   ---
   '@vertz/vtz': patch
   ---

   fix(pm): `vtz install` now resolves npm dist-tag specs (`"latest"`, `"next"`, etc.) and writes them to `vertz.lock` instead of silently dropping the entry (#2794).
   ```

**Acceptance criteria:**
- [ ] `cargo test -p vtz is_non_semver_spec` passes all classifier cases
- [ ] `cargo test -p vtz is_dist_tag_shape` passes all shape cases
- [ ] Clippy clean (`cargo clippy --all-targets -- -D warnings` from `native/`)
- [ ] `cargo fmt --all -- --check` clean

---

### Task 2: Use classifier in `graph_to_lockfile` root-dep loop + tests

**Files:** (1 — same `resolver.rs` as Task 1; counts toward the phase file budget but doesn't exceed 5-file-per-task rule)
- `native/vtz/src/pm/resolver.rs` (modified)

**What to implement:**

TDD order:

1. **RED — root dist-tag integration test**:
   ```rust
   #[test]
   fn test_graph_to_lockfile_dist_tag_root_dep() {
       let mut graph = ResolvedGraph::default();
       graph.packages.insert(
           "@types/bun@1.3.12".to_string(),
           ResolvedPackage {
               name: "@types/bun".to_string(),
               version: "1.3.12".to_string(),
               tarball_url: "https://registry.npmjs.org/@types/bun/-/bun-1.3.12.tgz".to_string(),
               integrity: "sha512-abc".to_string(),
               dependencies: BTreeMap::new(),
               optional_dependencies: BTreeMap::new(),
               bin: BTreeMap::new(),
               nest_path: vec![],
               os: None,
               cpu: None,
           },
       );

       let mut deps = BTreeMap::new();
       deps.insert("@types/bun".to_string(), "latest".to_string());

       let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
       assert_eq!(lockfile.entries.len(), 1, "dist-tag dep must produce a lockfile entry");

       let entry = &lockfile.entries["@types/bun@latest"];
       assert_eq!(entry.version, "1.3.12");
       assert_eq!(entry.resolved, "https://registry.npmjs.org/@types/bun/-/bun-1.3.12.tgz");
       assert_eq!(entry.integrity, "sha512-abc");
   }
   ```
   Run: fails (current code silently drops).
2. **GREEN**: in `graph_to_lockfile()` line 566, replace:
   ```rust
   let is_non_semver = range.starts_with("github:") || range.starts_with("link:");
   ```
   with:
   ```rust
   let is_non_semver = is_non_semver_spec(range);
   ```
   The existing `nest_path.is_empty()` filter is preserved.
3. **RED — nest_path filter for dist-tags**:
   ```rust
   #[test]
   fn test_graph_to_lockfile_dist_tag_respects_nest_path() {
       let mut graph = ResolvedGraph::default();
       // Root-level zod 3.24.4
       graph.packages.insert("zod@3.24.4".to_string(), ResolvedPackage {
           name: "zod".to_string(),
           version: "3.24.4".to_string(),
           nest_path: vec![],
           tarball_url: "root-url".to_string(),
           integrity: "root-integrity".to_string(),
           dependencies: BTreeMap::new(),
           optional_dependencies: BTreeMap::new(),
           bin: BTreeMap::new(),
           os: None, cpu: None,
       });
       // Nested zod 4.0.0
       graph.packages.insert("zod@4.0.0".to_string(), ResolvedPackage {
           name: "zod".to_string(),
           version: "4.0.0".to_string(),
           nest_path: vec!["some-parent".to_string()],
           tarball_url: "nested-url".to_string(),
           integrity: "nested-integrity".to_string(),
           dependencies: BTreeMap::new(),
           optional_dependencies: BTreeMap::new(),
           bin: BTreeMap::new(),
           os: None, cpu: None,
       });

       let mut deps = BTreeMap::new();
       deps.insert("zod".to_string(), "latest".to_string());

       let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
       let entry = &lockfile.entries["zod@latest"];
       assert_eq!(entry.version, "3.24.4", "must pick root (nest_path=[]), not nested");
       assert_eq!(entry.resolved, "root-url");
   }
   ```
   Should pass after Task 2's GREEN (existing `nest_path.is_empty()` filter).
4. **REGRESSION**: re-run `test_graph_to_lockfile_rejects_hoisted_version_outside_range` — must still pass (semver range check unchanged).

**Acceptance criteria:**
- [ ] `test_graph_to_lockfile_dist_tag_root_dep` passes
- [ ] `test_graph_to_lockfile_dist_tag_respects_nest_path` passes
- [ ] Existing `test_graph_to_lockfile`, `test_graph_to_lockfile_rejects_hoisted_version_outside_range`, `test_lockfile_entry_satisfies_for_current_range_rejects_stale` still pass
- [ ] Clippy clean, format clean

---

### Task 3: Use classifier in `graph_to_lockfile` transitive-dep loop + tests

**Files:** (1 — same file)
- `native/vtz/src/pm/resolver.rs` (modified)

**What to implement:**

TDD order:

1. **RED — transitive dist-tag test**:
   ```rust
   #[test]
   fn test_graph_to_lockfile_dist_tag_transitive_dep() {
       let mut graph = ResolvedGraph::default();

       // foo@1.0.0 depends on bar@latest
       let mut foo_deps = BTreeMap::new();
       foo_deps.insert("bar".to_string(), "latest".to_string());
       graph.packages.insert("foo@1.0.0".to_string(), ResolvedPackage {
           name: "foo".to_string(),
           version: "1.0.0".to_string(),
           tarball_url: "foo-url".to_string(),
           integrity: "foo-integrity".to_string(),
           dependencies: foo_deps,
           optional_dependencies: BTreeMap::new(),
           bin: BTreeMap::new(),
           nest_path: vec![],
           os: None, cpu: None,
       });

       // bar@2.5.0 resolved from the `latest` tag
       graph.packages.insert("bar@2.5.0".to_string(), ResolvedPackage {
           name: "bar".to_string(),
           version: "2.5.0".to_string(),
           tarball_url: "bar-url".to_string(),
           integrity: "bar-integrity".to_string(),
           dependencies: BTreeMap::new(),
           optional_dependencies: BTreeMap::new(),
           bin: BTreeMap::new(),
           nest_path: vec![],
           os: None, cpu: None,
       });

       let mut deps = BTreeMap::new();
       deps.insert("foo".to_string(), "^1.0.0".to_string());

       let lockfile = graph_to_lockfile(&graph, &deps, &[], &HashSet::new());
       let entry = lockfile.entries.get("bar@latest")
           .expect("transitive dist-tag dep must be in lockfile");
       assert_eq!(entry.version, "2.5.0");
       assert_eq!(entry.resolved, "bar-url");
   }
   ```
   Run: fails (current transitive branch at lines 599–622 only handles `github:`).
2. **GREEN**: in the transitive branch of `graph_to_lockfile`, replace:
   ```rust
   let dep_pkg = if dep_range.starts_with("github:") {
       graph.packages.values().find(|p| p.name == *dep_name)
   } else {
       graph.packages.values().find(|p| {
           p.name == *dep_name
               && Range::parse(dep_range)
                   .ok()
                   .and_then(|r| Version::parse(&p.version).ok().map(|v| r.satisfies(&v)))
                   .unwrap_or(false)
       })
   };
   ```
   with:
   ```rust
   let dep_pkg = if is_non_semver_spec(dep_range) {
       // github:, link:, or dist-tag — match by name only.
       graph.packages.values().find(|p| p.name == *dep_name)
   } else {
       graph.packages.values().find(|p| {
           p.name == *dep_name
               && Range::parse(dep_range)
                   .ok()
                   .and_then(|r| Version::parse(&p.version).ok().map(|v| r.satisfies(&v)))
                   .unwrap_or(false)
       })
   };
   ```
3. **REGRESSION**: re-run `test_graph_to_lockfile_transitive_matches_by_semver_range`, `test_graph_to_lockfile_github_transitive_dep`, `test_graph_to_lockfile_with_transitive` — all must still pass.

**Acceptance criteria:**
- [ ] `test_graph_to_lockfile_dist_tag_transitive_dep` passes
- [ ] All transitive-related existing tests still pass
- [ ] Clippy clean, format clean
- [ ] `cd native && cargo test --all` passes entire crate suite
- [ ] E2E sanity check: inspect the diff — `graph_to_lockfile` now uses `is_non_semver_spec` at both match sites; no other logic changed

---

## Quality Gates (before review)

From `native/`:

```bash
cargo test --all
cargo clippy --all-targets -- -D warnings
cargo fmt --all -- --check
```

All three must be green.

## Adversarial Review Scope

The review file lands at `reviews/2794-fix-install-latest-tag/phase-01-classifier-and-lockfile-match.md` and must check:

- [ ] All classifier cases covered (dist-tag, semver, protocols, edge)
- [ ] Both match sites in `graph_to_lockfile` use the classifier (no lingering `range.starts_with("github:")` checks in graph_to_lockfile)
- [ ] `resolve_version` path unchanged — dist-tag resolution at resolution time still correct
- [ ] `lockfile_entry_satisfies_range` deliberately untouched (documented as follow-up, verify in the design doc)
- [ ] #2738 regression guards still green
- [ ] Transitive test genuinely exercises the transitive branch (not piggybacking on the root path)
- [ ] Changeset is `patch`
- [ ] No scope creep — only `resolver.rs` and the changeset touched
