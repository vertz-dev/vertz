# Phase 1: install-time version dedup (#2894)

- **Author:** Vinicius (with Claude Opus 4.7)
- **Reviewer:** general-purpose adversarial review
- **Date:** 2026-04-21

## Changes

- `native/vtz/src/pm/resolver.rs` — new `dedup()` function + 4 unit tests
- `native/vtz/src/pm/mod.rs` — call `resolver::dedup(&mut graph, &all_deps)` before `resolver::hoist()`
- `.changeset/fix-install-dedup-2894.md` — patch changeset for `vtz`

## CI Status

- [x] `cargo test --all` — all pm tests pass (605 pm + 16 pm_integration + full workspace)
- [x] `cargo clippy --all-targets -- -D warnings` — clean
- [x] `cargo fmt --all -- --check` — clean
- [x] Live repro verified: `@vertz/agents@0.2.47` + `@vertz/schema@0.2.73` at root → single `node_modules/@vertz/schema@0.2.73`, no nested copy

## Review Checklist

- [x] Delivers what the ticket asks for — single physical copy when a version satisfies every declared range
- [x] TDD compliance — RED state captured (compile error: `dedup` missing), then GREEN
- [x] No type gaps — `BTreeMap<String, String>` inputs, no generic leakage
- [x] No security issues — pure in-memory graph mutation
- [x] No behavior change when versions genuinely differ (test_dedup_keeps_both_when_ranges_are_incompatible)

## Findings

### Adversarial review found one SHOULD-FIX

**Root `optionalDependencies` were not collected** — first revision passed `(resolved_deps, resolved_dev_deps)` to `dedup()`, omitting `resolved_optional_deps`. Result would have been: a root optional pin could be silently dropped in favor of a newer transitive version, then `graph_to_lockfile` would fail to wire the optional range.

**Resolution:** changed `dedup()` signature to take a single `root_deps: &BTreeMap<String, String>`, and in `mod.rs` we pass `all_deps` (the caller-merged map of deps + devDeps + optionalDeps, already assembled above for other purposes). Added `test_dedup_respects_root_optional_dep_pin` to lock this in.

### Non-blocker notes

- **Transitive descendants of dropped versions** may linger in the graph without a live parent path. In practice these are either identical to the surviving version's children (same tarball, installed once) or benign extras. Not fixed here — would warrant an orphan sweep pass, tracked implicitly by the existing hoist algorithm which only touches nest_path.
- **Non-semver specs (`github:`, `link:`, dist-tags)** force a no-op skip per-package — we can't check satisfaction from a range string alone, so leaving the graph as-is is the safe default. Covered by `test_dedup_skips_when_any_range_is_dist_tag`.

## Resolution

Approved. Root-optional gap fixed in the same commit; all 4 dedup tests pass; full Rust suite green.
