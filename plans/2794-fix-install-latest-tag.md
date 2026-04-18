# Fix: `vtz install` silently drops dependencies with `"latest"` version spec (#2794)

## Problem

`vtz install` silently drops `package.json` entries whose version field is a npm dist-tag like `"latest"`, `"next"`, or `"beta"`.

**Symptoms observed (issue #2794):**
- Dep resolves and downloads fine (the registry fetch + tarball path is correct)
- …but no entry is written to `vertz.lock`
- A later `vtz install --frozen` fails with a misleading `lockfile is out of date`
- Exposed when migrating CI from `bun install --frozen-lockfile` to `vtz install --frozen` (#2793); worked around by pinning `@types/bun` from `"latest"` to `"^1.3.12"` — the `vtz install` bug remained

## Root Cause

Two helpers in `native/vtz/src/pm/resolver.rs` classify a dep's version range using a narrow hardcoded prefix check:

```rust
let is_non_semver = range.starts_with("github:") || range.starts_with("link:");
```

- `resolve_version()` (line 44) correctly handles dist-tags: it checks `dist_tags.get(range_str)` **before** `Range::parse`. So a dep with `"latest"` is resolved and added to the graph. ✓
- But `graph_to_lockfile()` has **two** match sites that fail on dist-tags:
  - Root-dep loop, line 566–571: uses `version_satisfies_range(version, range)`. For `range = "latest"`, `Range::parse("latest")` returns `Err`, the function returns `false`, and the dep is silently skipped. ✗
  - Transitive-dep loop, line 599–622: has a similar `Range::parse` check (no dist-tag handling). A transitive dep declaring `"foo": "latest"` in its `dependencies` hits the same silent-drop path. Rare in practice but has identical failure mode.

A dist-tag is neither a semver range nor a `github:` / `link:` spec, so it slips through.

## Approach

Make dist-tag specs first-class alongside `github:` / `link:` at the two match sites in `graph_to_lockfile`. The `resolve_version` path already resolves dist-tags correctly — this fix only bridges **resolution → lockfile**.

**Invariant:** `resolve_version()` is the single authority for turning a spec into a graph entry. A non-semver spec gets into the graph only via (a) `github:` prefix, (b) `link:` prefix, or (c) `dist_tags.get(range)` returning Some. For cases (a) and (b), `graph_to_lockfile` already matches by name. Case (c) is the gap.

**Minimal change:** introduce a shape-based classifier `is_non_semver_spec` that recognizes dist-tag-shaped strings, apply it at both match sites.

### API Surface (observable behavior)

No new CLI flags. No config changes. Internal behavior change only: the existing user-facing contract (`package.json` → `vtz.lock`) starts honoring dist-tags.

**Before:**
```bash
# packages/docs/package.json:
#   "devDependencies": { "@types/bun": "latest", ... }

vtz install                      # exit 0 — but silently skips @types/bun
grep '@types/bun' vertz.lock     # no output
vtz install --frozen             # error: lockfile is out of date
```

**After:**
```bash
vtz install                      # exit 0
grep '@types/bun' vertz.lock     # @types/bun@latest: { version: "1.3.12", resolved: ..., integrity: ... }
vtz install --frozen             # exit 0
```

The lockfile key is `@types/bun@latest` (the user's original spec) and the entry pins to the concrete version the dist-tag resolved to at install time (`"1.3.12"`). Matches bun / npm / yarn semantics.

### The Classifier

Private helpers in `native/vtz/src/pm/resolver.rs`:

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
/// - Protocol-prefixed specs (`file:`, `workspace:`, `npm:`, `http://`) — these
///   aren't produced by `resolve_version`, so they won't be in the graph.
fn is_non_semver_spec(range_str: &str) -> bool {
    range_str.starts_with("github:")
        || range_str.starts_with("link:")
        || is_dist_tag_shape(range_str)
}

/// Returns true iff `s` looks like a dist-tag name.
///
/// Rules:
/// - Non-empty
/// - First char is ASCII alphabetic (excludes semver like `1.2.3`, `~1.0`)
/// - All chars are ASCII alphanumeric or `-` `_` `.` (excludes `:`/`/`/`@`/spaces/operators)
/// - Does not parse as a semver range (excludes aliases like `x` or `x.x.x` that are
///   technically valid semver wildcards)
fn is_dist_tag_shape(s: &str) -> bool {
    let Some(first) = s.chars().next() else { return false; };
    if !first.is_ascii_alphabetic() { return false; }
    if !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return false;
    }
    Range::parse(s).is_err()
}
```

### The Fix

Apply `is_non_semver_spec` at both match sites in `graph_to_lockfile`:

1. **Root-dep loop** (line 566): replace the hardcoded prefix check with `is_non_semver_spec(range)`. When the spec is non-semver, match by `name + nest_path.is_empty()` only (as today for `github:` / `link:`).
2. **Transitive-dep loop** (line 607 branch): replace the `github:`-only branch with a broader non-semver branch driven by `is_non_semver_spec`. When non-semver, match by name (no `nest_path` restriction for transitives — they can match nested versions).

### Why this is safe

- **Garbage ranges** that coincidentally look dist-tag-shaped (e.g. `"totally-garbage"`): `resolve_version` has no matching dist-tag → returns `None` → resolver aborts with `"No version of 'X' matches range 'Y'"` **before** `graph_to_lockfile` runs. No package in the graph, no entry wired. Same outcome as today.
- **Overrides + garbage range** (reviewer Finding #2): user writes `"foo": "garbage"` plus override `"foo": "1.0.0"`. Resolver uses `effective_range = "1.0.0"`, graph has `foo@1.0.0`. With this fix, `graph_to_lockfile` classifies `"garbage"` as dist-tag-shaped → matches by name → writes `foo@garbage → 1.0.0`. This is an **intentional improvement**: the user explicitly opted into the override for this name; honoring it at lockfile time is more consistent than silently dropping the entry. Today's behavior (drop, then `--frozen` fails) is strictly worse. If the user didn't intend the override, they'd notice a mismatch and fix `package.json` either way.
- **Protocol specs** (`file:`, `workspace:`, `npm:`, `http://`): shape check excludes them (contain `:` / `/`). They never appear in the graph via `resolve_version` anyway, so no regression.
- **Semver ranges** (`^1.2.3`, `*`, `1.x`): shape check excludes them (start with non-alpha, or pass `Range::parse`). Fall through to `version_satisfies_range`. Unchanged behavior. The #2738 regression guard (`test_resolve_version_caret_rejects_lower_minor`, `test_lockfile_entry_satisfies_for_current_range_rejects_stale`) is preserved.
- **Lockfile fast path** (`lockfile_entry_satisfies_range`, line 36) is **not touched**. For a lockfile entry with `range: "latest"` and a pinned version, the fast path will still return false → the resolver re-fetches registry metadata → `resolve_version` resolves "latest" freshly → `graph_to_lockfile` writes the correct entry. The lockfile reuse is slower for dist-tag deps (one extra registry round-trip) but **correct**. Optimizing this is explicitly out of scope (see Non-Goals).

## Non-Goals

- **Lockfile fast-path optimization for dist-tags.** `lockfile_entry_satisfies_range` stays as-is. Dist-tag deps pay one registry round-trip per install. Tracked as a follow-up — the right fix there is either a `--update`/`--refresh` flag (bun-style) or storing the resolved-from-tag info in `LockfileEntry` to allow trust-based reuse. Both are broader surgery than this bug fix warrants.
- **Normalize-at-resolution refactor.** Reviewer suggested carrying a `resolved_from_tag` field on `ResolvedPackage` so `graph_to_lockfile` matches via exact tag rather than shape. Correct but blast radius is large (~50 `ResolvedPackage` construction sites across `resolver.rs`, `linker.rs`, `scripts.rs`, `bin.rs`, `mod.rs`). Filing as a follow-up issue; narrow fix first, refactor later.
- **Rejecting `"latest"` with an error (issue option 2).** Rejected: bun / npm / yarn all resolve dist-tags, including the tree shipped in this very monorepo before the `^1.3.12` workaround.
- **npm: aliases** (`"foo": "npm:react@18.0.0"`) — distinct behavior, not touched.
- **Warnings / lint for `"latest"` as a style anti-pattern** — stylistic, not a correctness fix.

## Manifesto Alignment

- **Principle 4 (One right answer)** — dist-tags have a canonical resolution in the npm ecosystem (pin at install time). Silent drop is wrong; we align with every other package manager.
- **Principle 7 (Fail loud)** — today's silent drop is the worst failure mode. After the fix, success is silent and tag-not-found errors from `resolve_version` as it already does.

## Unknowns

None identified.

## Type Flow Map

N/A — Rust, no generics introduced.

## Follow-up Issues to File Alongside This Fix

1. **Lockfile fast-path for dist-tag entries** — `lockfile_entry_satisfies_range` should trust an entry whose recorded `range` is a dist-tag, to avoid re-fetching metadata on every install. Needs `--update`/`--refresh` flag or schema additions.
2. **Normalize `resolved_from_tag` at resolution time** — store the tag on `ResolvedPackage` so `graph_to_lockfile` match is exact-tag, not shape-based. Cleaner invariants, larger blast radius.

## Acceptance Criteria (BDD)

```rust
describe("Feature: is_non_semver_spec classification") {
  describe("Given a `github:` specifier") {
    it("Then it's non-semver") {}
  }
  describe("Given a `link:` specifier") {
    it("Then it's non-semver") {}
  }
  describe("Given dist-tag-shaped strings") {
    it("Then 'latest' is non-semver") {}
    it("Then 'next' is non-semver") {}
    it("Then 'beta' is non-semver") {}
    it("Then 'canary-build' is non-semver (hyphen in custom tag)") {}
    it("Then 'alpha_1' is non-semver (underscore + digit)") {}
  }
  describe("Given semver ranges") {
    it("Then '1.2.3' is semver (starts with digit)") {}
    it("Then '^1.2.3' is semver (operator prefix)") {}
    it("Then '~1.0.0' is semver") {}
    it("Then '>=1.0.0 <2.0.0' is semver (operator + space)") {}
    it("Then '1.x' is semver (digit prefix)") {}
    it("Then '*' is semver (operator-only)") {}
  }
  describe("Given protocol-prefixed specs that shouldn't reach here") {
    it("Then 'file:./x' is NOT classified as dist-tag (contains ':' and '/')") {}
    it("Then 'workspace:*' is NOT classified as dist-tag (contains ':' and '*')") {}
    it("Then 'npm:react@1.0.0' is NOT classified as dist-tag (contains ':' and '@')") {}
  }
  describe("Given edge cases") {
    it("Then '' (empty) is NOT a dist-tag") {}
    it("Then '1latest' is NOT a dist-tag (starts with digit)") {}
  }
}

describe("Feature: graph_to_lockfile with dist-tag root dep") {
  describe("Given a graph with @types/bun@1.3.12 and package.json dep @types/bun@latest") {
    describe("When graph_to_lockfile is called") {
      it("Then the lockfile contains entry '@types/bun@latest' pinned to 1.3.12") {}
      it("Then the entry resolved URL matches the graph package tarball") {}
      it("Then the entry integrity matches the graph package integrity") {}
    }
  }

  describe("Given dist-tags 'next' and 'beta' on different packages") {
    describe("When graph_to_lockfile is called for deps using each tag") {
      it("Then each tag produces a correctly-keyed lockfile entry") {}
    }
  }

  describe("Given two versions of zod in the graph (3.24.4 at root, 4.0.0 nested) and package.json dep zod@latest") {
    describe("When graph_to_lockfile is called") {
      it("Then it picks the root (nest_path=[]) version, not the nested one") {}
    }
  }
}

describe("Feature: graph_to_lockfile with dist-tag transitive dep") {
  describe("Given package foo depends on bar@latest (in bar's packument dist-tags)") {
    describe("When graph_to_lockfile is called") {
      it("Then the transitive lockfile entry 'bar@latest' is written with the resolved version") {}
    }
  }
}

describe("Feature: regression — semver ranges still work") {
  describe("Given zod@^3.24.0 in the graph and package.json") {
    it("Then graph_to_lockfile writes 'zod@^3.24.0 → 3.24.4' as before") {}
  }
  describe("Given a hoisted esbuild@0.25.12 and package.json declares esbuild@^0.27.3") {
    it("Then graph_to_lockfile does NOT wire the entry (preserves #2738 fix)") {}
  }
}
```

## E2E Acceptance Test

Developer perspective: a `package.json` with a dist-tag dep installs and round-trips through `--frozen`.

```bash
# Setup: package.json with "@types/bun": "latest"
vtz install
grep '@types/bun@latest' vertz.lock   # ← must find a pinned entry
vtz install --frozen                   # ← must exit 0
```

The monorepo's own `packages/docs/package.json` was previously pinned to `"^1.3.12"` in #2793 as a workaround. This fix doesn't require reverting that pin — we add regression tests instead. A follow-up PR can optionally revert the workaround after this merges.

## Implementation Plan

Single phase. All changes live in one Rust file.

### Phase 1 — Fix + tests

Files touched (≤5):
1. `native/vtz/src/pm/resolver.rs` — add `is_non_semver_spec` + `is_dist_tag_shape`, use in root-dep and transitive-dep loops of `graph_to_lockfile`, add tests.
2. `.changeset/fix-install-latest-tag.md` — patch changeset.

### TDD Order

1. **RED — classifier unit tests**: write tests for each row of the BDD acceptance table for `is_non_semver_spec` / `is_dist_tag_shape`. All fail (helpers don't exist).
2. **GREEN**: add both helpers.
3. **RED — root dist-tag → lockfile**: build a `ResolvedGraph` with `@types/bun@1.3.12`, pass deps `{"@types/bun": "latest"}`, assert lockfile has `@types/bun@latest` entry pinned to 1.3.12. Fails with current code.
4. **GREEN**: swap root-loop prefix check for `is_non_semver_spec`.
5. **RED — root dist-tag respects nest_path**: graph with root `zod@3.24.4` and nested `zod@4.0.0`, dep `zod: "latest"`, assert root version is picked. (Should already pass from step 4 — the existing `nest_path.is_empty()` filter is retained. Verifies no regression.)
6. **RED — transitive dist-tag → lockfile**: graph with package `foo@1.0.0` whose `dependencies` declare `"bar": "latest"`, graph also has `bar@2.5.0`. Assert lockfile contains `bar@latest → 2.5.0`. Fails.
7. **GREEN**: apply `is_non_semver_spec` to the transitive branch.
8. **Regression guards (keep + verify)**: `test_resolve_version_caret_rejects_lower_minor`, `test_lockfile_entry_satisfies_for_current_range_rejects_stale`, `test_graph_to_lockfile_rejects_hoisted_version_outside_range`, `test_graph_to_lockfile_transitive_matches_by_semver_range` all still green.
9. **Refactor**: extract docstring, verify no duplication between root and transitive branches.

### Quality Gates

```bash
cd native
cargo test --all
cargo clippy --all-targets -- -D warnings
cargo fmt --all -- --check
```

All must pass before code review.

### Adversarial Review Targets

- Does the fix handle `"latest"` AND other dist-tags (`next`, `beta`, custom)?
- Does it preserve the #2738 regression guard (stale lockfile with wrong semver version must still be rejected)?
- Does it break the `github:` / `link:` paths?
- Does `resolve_version` still short-circuit garbage ranges before they reach `graph_to_lockfile`?
- Transitive dist-tag coverage?
- Shape-check edge cases: empty string, digit prefix, protocol prefix, operator prefix?
- Does `is_dist_tag_shape` correctly reject semver wildcards like `"x"` / `"x.x.x"` (`Range::parse` parses these → returns false → correct)?
